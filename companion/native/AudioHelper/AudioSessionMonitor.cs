using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

sealed class AudioSessionMonitor : IDisposable
{
    private const int SnapshotDebounceMilliseconds = 200;
    private const int ReconcileIntervalMilliseconds = 60000;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly object sync = new();
    private readonly object outputSync = new();
    private readonly MMDeviceEnumerator enumerator = new();
    private readonly ManualResetEventSlim stopped = new(false);
    private readonly Timer emitTimer;
    private readonly Timer reconcileTimer;
    private readonly List<AudioSessionEndpointWatcher> endpointWatchers = [];
    private AudioSessionEndpointNotificationClient? endpointNotificationClient;
    private string lastSnapshotJson = "";
    private bool disposed;

    public AudioSessionMonitor()
    {
        emitTimer = new Timer(_ => EmitSnapshot(false), null, Timeout.Infinite, Timeout.Infinite);
        reconcileTimer = new Timer(_ => Reconcile(), null, Timeout.Infinite, Timeout.Infinite);
    }

    public Task RunAsync()
    {
        Console.Error.WriteLine("status: audio-session-monitor-started");
        Console.CancelKeyPress += HandleCancelKeyPress;

        try
        {
            var inputThread = new Thread(ReadControlLoop)
            {
                IsBackground = true,
                Name = "AudioSessionMonitorControl"
            };
            inputThread.Start();

            RegisterEndpointNotifications();
            RebuildEndpointWatchers();
            EmitSnapshot(true);
            reconcileTimer.Change(ReconcileIntervalMilliseconds, ReconcileIntervalMilliseconds);

            stopped.Wait();
            return Task.CompletedTask;
        }
        finally
        {
            Console.CancelKeyPress -= HandleCancelKeyPress;
            Console.Error.WriteLine("status: audio-session-monitor-stopped");
        }
    }

    public void Stop()
    {
        stopped.Set();
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }
        disposed = true;
        Stop();
        reconcileTimer.Dispose();
        emitTimer.Dispose();
        UnregisterEndpointNotifications();
        ClearEndpointWatchers();
        enumerator.Dispose();
        stopped.Dispose();
    }

    private void HandleCancelKeyPress(object? sender, ConsoleCancelEventArgs args)
    {
        args.Cancel = true;
        Stop();
    }

    private void ReadControlLoop()
    {
        try
        {
            string? line;
            while (!stopped.IsSet && (line = Console.In.ReadLine()) is not null)
            {
                if (line.Equals("refresh", StringComparison.OrdinalIgnoreCase))
                {
                    RebuildEndpointWatchers();
                    ScheduleSnapshot();
                }
                else if (line.Equals("stop", StringComparison.OrdinalIgnoreCase))
                {
                    Stop();
                    return;
                }
            }
        }
        catch
        {
        }

        Stop();
    }

    private void RegisterEndpointNotifications()
    {
        endpointNotificationClient = new AudioSessionEndpointNotificationClient(HandleEndpointTopologyChanged);
        enumerator.RegisterEndpointNotificationCallback(endpointNotificationClient);
    }

    private void UnregisterEndpointNotifications()
    {
        var client = endpointNotificationClient;
        endpointNotificationClient = null;
        if (client is null)
        {
            return;
        }

        try
        {
            enumerator.UnregisterEndpointNotificationCallback(client);
        }
        catch
        {
        }
    }

    private void HandleEndpointTopologyChanged()
    {
        ThreadPool.QueueUserWorkItem(_ =>
        {
            RebuildEndpointWatchers();
            ScheduleSnapshot();
        });
    }

    private void Reconcile()
    {
        if (stopped.IsSet)
        {
            return;
        }

        RebuildEndpointWatchers();
        ScheduleSnapshot();
    }

    private void RebuildEndpointWatchers()
    {
        if (stopped.IsSet || disposed)
        {
            return;
        }

        List<AudioSessionEndpointWatcher> nextWatchers = [];
        try
        {
            foreach (var endpoint in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            {
                try
                {
                    nextWatchers.Add(new AudioSessionEndpointWatcher(endpoint, ScheduleSnapshot));
                }
                catch (Exception error)
                {
                    var endpointName = endpoint.FriendlyName;
                    endpoint.Dispose();
                    if (AudioConstants.DiagnosticsEnabled)
                    {
                        Console.Error.WriteLine(
                            $"status: audio-session-monitor-endpoint-unavailable endpoint='{EscapeStatusValue(endpointName)}' error='{EscapeStatusValue(error.Message)}'");
                    }
                }
            }
        }
        catch (Exception error)
        {
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine(
                    $"status: audio-session-monitor-enumeration-unavailable error='{EscapeStatusValue(error.Message)}'");
            }
        }

        lock (sync)
        {
            if (stopped.IsSet || disposed)
            {
                foreach (var watcher in nextWatchers)
                {
                    watcher.Dispose();
                }
                return;
            }
            ClearEndpointWatchersLocked();
            endpointWatchers.AddRange(nextWatchers);
        }
    }

    private void ClearEndpointWatchers()
    {
        lock (sync)
        {
            ClearEndpointWatchersLocked();
        }
    }

    private void ClearEndpointWatchersLocked()
    {
        foreach (var watcher in endpointWatchers)
        {
            watcher.Dispose();
        }
        endpointWatchers.Clear();
    }

    private void ScheduleSnapshot()
    {
        if (stopped.IsSet || disposed)
        {
            return;
        }

        try
        {
            emitTimer.Change(SnapshotDebounceMilliseconds, Timeout.Infinite);
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private void EmitSnapshot(bool force)
    {
        if (stopped.IsSet || disposed)
        {
            return;
        }

        try
        {
            var sessions = AudioSessionCatalog.List(enumerator, null, null, null);
            var payload = JsonSerializer.Serialize(new AudioSessionMonitorMessage("snapshot", sessions), JsonOptions);
            lock (outputSync)
            {
                if (!force && payload == lastSnapshotJson)
                {
                    return;
                }
                lastSnapshotJson = payload;
                Console.Out.WriteLine(payload);
                Console.Out.Flush();
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(
                $"status: audio-session-monitor-snapshot-unavailable error='{EscapeStatusValue(error.Message)}'");
        }
    }

    private static string EscapeStatusValue(string value)
    {
        return value.Replace("\\", "\\\\").Replace("'", "\\'");
    }

    private sealed record AudioSessionMonitorMessage(string Type, IReadOnlyList<AudioSessionInfo> Sessions);
}

sealed class AudioSessionEndpointNotificationClient : IMMNotificationClient
{
    private readonly Action onChanged;

    public AudioSessionEndpointNotificationClient(Action onChanged)
    {
        this.onChanged = onChanged;
    }

    public void OnDeviceStateChanged(string deviceId, DeviceState newState)
    {
        onChanged();
    }

    public void OnDeviceAdded(string pwstrDeviceId)
    {
        onChanged();
    }

    public void OnDeviceRemoved(string deviceId)
    {
        onChanged();
    }

    public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId)
    {
        if (flow == DataFlow.Render)
        {
            onChanged();
        }
    }

    public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key)
    {
        onChanged();
    }
}

sealed class AudioSessionEndpointWatcher : IDisposable
{
    private readonly object sync = new();
    private readonly MMDevice endpoint;
    private readonly AudioSessionManager sessionManager;
    private readonly Action onChanged;
    private readonly List<AudioSessionEventWatcher> sessionWatchers = [];
    private readonly HashSet<string> sessionKeys = new(StringComparer.OrdinalIgnoreCase);
    private bool disposed;

    public AudioSessionEndpointWatcher(MMDevice endpoint, Action onChanged)
    {
        this.endpoint = endpoint;
        this.onChanged = onChanged;
        sessionManager = endpoint.AudioSessionManager;
        sessionManager.OnSessionCreated += HandleSessionCreated;
        RegisterExistingSessions();
    }

    public void Dispose()
    {
        lock (sync)
        {
            if (disposed)
            {
                return;
            }
            disposed = true;
        }

        try
        {
            sessionManager.OnSessionCreated -= HandleSessionCreated;
        }
        catch
        {
        }

        lock (sync)
        {
            foreach (var watcher in sessionWatchers)
            {
                watcher.Dispose();
            }
            sessionWatchers.Clear();
            sessionKeys.Clear();
        }

        sessionManager.Dispose();
        endpoint.Dispose();
    }

    private void RegisterExistingSessions()
    {
        var sessions = sessionManager.Sessions;
        for (var index = 0; index < sessions.Count; index++)
        {
            RegisterSession(sessions[index]);
        }
    }

    private void HandleSessionCreated(object sender, IAudioSessionControl sessionControl)
    {
        try
        {
            RegisterSession(new AudioSessionControl(sessionControl));
            onChanged();
        }
        catch
        {
        }
    }

    private void RegisterSession(AudioSessionControl session)
    {
        try
        {
            if (session.IsSystemSoundsSession || unchecked((int)session.GetProcessID) <= 0)
            {
                session.Dispose();
                return;
            }

            var key = AudioSessionKey(session);
            lock (sync)
            {
                if (disposed || !sessionKeys.Add(key))
                {
                    session.Dispose();
                    return;
                }
                sessionWatchers.Add(new AudioSessionEventWatcher(session, onChanged));
            }
        }
        catch
        {
            session.Dispose();
        }
    }

    private static string AudioSessionKey(AudioSessionControl session)
    {
        try
        {
            var instance = EmptyToNull(session.GetSessionInstanceIdentifier);
            if (instance is not null)
            {
                return $"instance:{instance}";
            }
        }
        catch
        {
        }

        try
        {
            var identifier = EmptyToNull(session.GetSessionIdentifier);
            if (identifier is not null)
            {
                return $"identifier:{identifier}";
            }
        }
        catch
        {
        }

        return $"pid:{session.GetProcessID}";
    }

    private static string? EmptyToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}

sealed class AudioSessionEventWatcher : IAudioSessionEventsHandler, IDisposable
{
    private readonly AudioSessionControl session;
    private readonly Action onChanged;

    public AudioSessionEventWatcher(AudioSessionControl session, Action onChanged)
    {
        this.session = session;
        this.onChanged = onChanged;
        session.RegisterEventClient(this);
    }

    public void Dispose()
    {
        try
        {
            session.UnRegisterEventClient(this);
        }
        catch
        {
        }
        session.Dispose();
    }

    public void OnVolumeChanged(float volume, bool isMuted)
    {
    }

    public void OnDisplayNameChanged(string displayName)
    {
        onChanged();
    }

    public void OnIconPathChanged(string iconPath)
    {
        onChanged();
    }

    public void OnChannelVolumeChanged(uint channelCount, IntPtr newVolumes, uint changedChannel)
    {
    }

    public void OnGroupingParamChanged(ref Guid groupingId)
    {
    }

    public void OnStateChanged(AudioSessionState state)
    {
        onChanged();
    }

    public void OnSessionDisconnected(AudioSessionDisconnectReason disconnectReason)
    {
        onChanged();
    }
}
