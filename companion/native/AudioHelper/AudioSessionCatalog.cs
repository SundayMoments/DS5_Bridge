using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

sealed record AudioSessionInfo(
    int ProcessId,
    string DisplayName,
    string? ExecutableName,
    string? ProcessPath,
    string? IconPath,
    string? IconDataUrl,
    string? SessionIdentifier,
    string? SessionInstanceIdentifier,
    string State,
    string EndpointName,
    bool IsSelected);

static class AudioSessionCatalog
{
    private const int ProcessQueryLimitedInformation = 0x1000;

    public static AudioSessionInfo? ResolveAppSession(int? processId, string? processPath, string? executableName)
    {
        if (processId is > 0)
        {
            var liveProcess = TryGetProcessInfo(processId.Value, includeFileDescription: true);
            if (liveProcess is not null && ProcessInfoMatches(liveProcess, processPath, executableName))
            {
                return new AudioSessionInfo(
                    processId.Value,
                    FirstNonBlank(liveProcess.PackageDisplayName, liveProcess.DisplayName),
                    liveProcess.ExecutableName,
                    liveProcess.ProcessPath,
                    liveProcess.PackageIconPath,
                    ProcessIconDataUrlResolver.TryResolve(liveProcess.ProcessPath, liveProcess.PackageIconPath),
                    null,
                    null,
                    "running",
                    "Process",
                    true);
            }
        }

        using var enumerator = new MMDeviceEnumerator();
        var sessionMatch = List(enumerator, null, processPath, executableName)
            .Where(session => SessionMatches(session, null, processPath, executableName))
            .OrderByDescending(session => session.State.Equals("active", StringComparison.OrdinalIgnoreCase))
            .ThenBy(session => session.DisplayName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
        if (sessionMatch is not null)
        {
            return sessionMatch;
        }

        return FindRunningProcess(processPath, executableName);
    }

    public static IReadOnlyList<AudioSessionInfo> List(
        MMDeviceEnumerator enumerator,
        int? selectedProcessId,
        string? selectedPath,
        string? selectedExecutableName)
    {
        var sessions = new Dictionary<string, AudioSessionInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var endpoint in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            SessionCollection? collection = null;
            try
            {
                collection = endpoint.AudioSessionManager.Sessions;
                for (var index = 0; index < collection.Count; index++)
                {
                    var session = collection[index];
                    var processId = unchecked((int)session.GetProcessID);
                    if (processId <= 0 || session.IsSystemSoundsSession)
                    {
                        continue;
                    }

                    var process = TryGetProcessInfo(
                        processId,
                        includeFileDescription: string.IsNullOrWhiteSpace(session.DisplayName));
                    var executableName = process?.ExecutableName;
                    var processPath = process?.ProcessPath;
                    var displayName = FirstNonBlank(
                        process?.PackageDisplayName,
                        session.DisplayName,
                        process?.DisplayName,
                        executableName,
                        $"Process {processId}");
                    var iconPath = FirstOptionalNonBlank(
                        process?.PackageIconPath,
                        session.IconPath);
                    var iconDataUrl = ProcessIconDataUrlResolver.TryResolve(processPath, iconPath);
                    var info = new AudioSessionInfo(
                        processId,
                        displayName,
                        executableName,
                        processPath,
                        iconPath,
                        iconDataUrl,
                        EmptyToNull(session.GetSessionIdentifier),
                        EmptyToNull(session.GetSessionInstanceIdentifier),
                        SessionStateName(session.State),
                        endpoint.FriendlyName,
                        false);
                    info = info with
                    {
                        IsSelected = SessionMatches(info, selectedProcessId, selectedPath, selectedExecutableName)
                    };

                    var key = SessionStableKey(info);
                    if (!sessions.TryGetValue(key, out var existing)
                        || SessionRank(info) > SessionRank(existing))
                    {
                        sessions[key] = info;
                    }
                }
            }
            catch (Exception error)
            {
                if (AudioConstants.DiagnosticsEnabled)
                {
                    Console.Error.WriteLine(
                        $"status: audio-session-list-unavailable endpoint='{EscapeStatusValue(endpoint.FriendlyName)}' error='{EscapeStatusValue(error.Message)}'");
                }
            }
        }

        return sessions.Values
            .OrderByDescending(session => session.IsSelected)
            .ThenByDescending(session => session.State.Equals("active", StringComparison.OrdinalIgnoreCase))
            .ThenBy(session => session.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(session => session.ProcessId)
            .ToArray();
    }

    private static int SessionRank(AudioSessionInfo session)
    {
        var rank = 0;
        if (session.State.Equals("active", StringComparison.OrdinalIgnoreCase)) rank += 4;
        if (!string.IsNullOrWhiteSpace(session.ProcessPath)) rank += 2;
        if (!string.IsNullOrWhiteSpace(session.IconPath)) rank += 1;
        return rank;
    }

    private static bool SessionMatches(
        AudioSessionInfo session,
        int? selectedProcessId,
        string? selectedPath,
        string? selectedExecutableName)
    {
        if (selectedProcessId is > 0 && session.ProcessId == selectedProcessId.Value)
        {
            return true;
        }
        if (!string.IsNullOrWhiteSpace(selectedPath)
            && !string.IsNullOrWhiteSpace(session.ProcessPath)
            && string.Equals(session.ProcessPath, selectedPath, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        if (!string.IsNullOrWhiteSpace(selectedExecutableName)
            && !string.IsNullOrWhiteSpace(session.ExecutableName)
            && string.Equals(session.ExecutableName, selectedExecutableName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return false;
    }

    private static AudioSessionInfo? FindRunningProcess(string? processPath, string? executableName)
    {
        if (string.IsNullOrWhiteSpace(processPath) && string.IsNullOrWhiteSpace(executableName))
        {
            return null;
        }

        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                var info = TryGetProcessInfo(process.Id, includeFileDescription: true);
                if (info is null || !ProcessInfoMatches(info, processPath, executableName))
                {
                    continue;
                }
                return new AudioSessionInfo(
                    process.Id,
                    FirstNonBlank(info.PackageDisplayName, info.DisplayName),
                    info.ExecutableName,
                    info.ProcessPath,
                    info.PackageIconPath,
                    ProcessIconDataUrlResolver.TryResolve(info.ProcessPath, info.PackageIconPath),
                    null,
                    null,
                    "running",
                    "Process",
                    true);
            }
        }

        return null;
    }

    private static bool ProcessInfoMatches(ProcessInfo info, string? processPath, string? executableName)
    {
        if (!string.IsNullOrWhiteSpace(processPath)
            && !string.IsNullOrWhiteSpace(info.ProcessPath)
            && !string.Equals(info.ProcessPath, processPath, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        if (!string.IsNullOrWhiteSpace(executableName)
            && !string.IsNullOrWhiteSpace(info.ExecutableName)
            && !string.Equals(info.ExecutableName, executableName, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        return true;
    }

    private static string SessionStableKey(AudioSessionInfo session)
    {
        if (!string.IsNullOrWhiteSpace(session.ProcessPath))
        {
            return $"path:{session.ProcessPath}";
        }
        if (!string.IsNullOrWhiteSpace(session.ExecutableName))
        {
            return $"exe:{session.ExecutableName}";
        }
        return $"pid:{session.ProcessId}";
    }

    private static ProcessInfo? TryGetProcessInfo(int processId, bool includeFileDescription)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            var processPath = TryGetProcessPath(process);
            var executableName = !string.IsNullOrWhiteSpace(processPath)
                ? Path.GetFileName(processPath)
                : TryGetProcessName(process);
            var packageMetadata = PackageAppMetadataResolver.TryResolve(process, processPath, executableName);
            var displayName = FirstNonBlank(
                includeFileDescription ? TryGetFileDescription(processPath) : null,
                TryGetMainWindowTitle(process),
                Path.GetFileNameWithoutExtension(executableName),
                process.ProcessName,
                $"Process {processId}");
            return new ProcessInfo(
                displayName,
                executableName,
                processPath,
                packageMetadata?.DisplayName,
                packageMetadata?.IconPath);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetProcessPath(Process process)
    {
        try
        {
            var mainModulePath = EmptyToNull(process.MainModule?.FileName);
            if (!string.IsNullOrWhiteSpace(mainModulePath))
            {
                return mainModulePath;
            }
        }
        catch
        {
        }

        return TryQueryFullProcessImageName(process.Id);
    }

    private static string? TryGetProcessName(Process process)
    {
        try
        {
            return EmptyToNull(process.ProcessName);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetMainWindowTitle(Process process)
    {
        try
        {
            return EmptyToNull(process.MainWindowTitle);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetFileDescription(string? processPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(processPath))
            {
                return null;
            }
            return EmptyToNull(FileVersionInfo.GetVersionInfo(processPath).FileDescription);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryQueryFullProcessImageName(int processId)
    {
        var processHandle = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (processHandle == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            var capacity = 32768;
            var builder = new StringBuilder(capacity);
            return QueryFullProcessImageName(processHandle, 0, builder, ref capacity)
                ? EmptyToNull(builder.ToString())
                : null;
        }
        catch
        {
            return null;
        }
        finally
        {
            _ = CloseHandle(processHandle);
        }
    }

    private static string SessionStateName(AudioSessionState state)
    {
        return state switch
        {
            AudioSessionState.AudioSessionStateActive => "active",
            AudioSessionState.AudioSessionStateInactive => "inactive",
            AudioSessionState.AudioSessionStateExpired => "expired",
            _ => state.ToString()
        };
    }

    private static string FirstNonBlank(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return "Unknown";
    }

    private static string? FirstOptionalNonBlank(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return null;
    }

    private static string? EmptyToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string EscapeStatusValue(string value)
    {
        return value.Replace("\\", "\\\\").Replace("'", "\\'");
    }

    private sealed record ProcessInfo(
        string DisplayName,
        string? ExecutableName,
        string? ProcessPath,
        string? PackageDisplayName,
        string? PackageIconPath);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(
        IntPtr hProcess,
        int dwFlags,
        StringBuilder lpExeName,
        ref int lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);
}
