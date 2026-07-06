using System.Diagnostics;
using System.Text.Json;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using NAudio.CoreAudioApi;
using Windows.Media.Control;
using Windows.Storage.Streams;

static class WindowsMediaSessionCli
{
    private const int ThumbnailMaxBytes = 4 * 1024 * 1024;
    private const int ThumbnailMaxDimension = 512;
    private const int MediaCommandSettleDelayMs = 220;
    private const int PlaybackToggleSettleTimeoutMs = 800;
    private const int PlaybackTogglePollMs = 50;
    private static readonly string[] PreferredMusicSessionTokens =
    [
        "spotify",
        "applemusic",
        "apple music",
        "itunes",
        "music.ui",
        "tidal",
        "amazonmusic",
        "amazon music",
        "deezer",
        "qobuz",
        "soundcloud",
        "foobar2000",
        "winamp",
        "dopamine",
        "aimp",
        "musicbee",
        "zune",
        "mediaplayer"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static async Task RunAsync(
        string command,
        int? volumePercent,
        long? commandStartedUnixMs,
        bool skipThumbnail)
    {
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            if (command.Equals("set-volume", StringComparison.OrdinalIgnoreCase))
            {
                SetDefaultRenderVolume(volumePercent ?? 0);
                await WriteStatusAsync(manager, skipThumbnail: skipThumbnail);
                return;
            }

            var session = SelectMusicSession(manager);
            var needsSettleDelay = false;
            double? positionOverrideMs = null;
            if (session is not null)
            {
                var previousPlaybackStatus = TryGetPlaybackStatus(session);
                switch (command.ToLowerInvariant())
                {
                    case "play-pause":
                        if (previousPlaybackStatus is not null)
                        {
                            positionOverrideMs = TryGetDisplayPositionMs(
                                session,
                                commandStartedUnixMs ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                        }
                        _ = await session.TryTogglePlayPauseAsync();
                        await WaitForPlaybackStatusChangeAsync(session, previousPlaybackStatus);
                        break;
                    case "previous":
                        _ = await session.TrySkipPreviousAsync();
                        needsSettleDelay = true;
                        break;
                    case "next":
                        _ = await session.TrySkipNextAsync();
                        needsSettleDelay = true;
                        break;
                    case "status":
                        break;
                    default:
                        throw new InvalidOperationException($"Unknown media command '{command}'.");
                }
            }

            if (needsSettleDelay)
            {
                await Task.Delay(MediaCommandSettleDelayMs);
            }
            await WriteStatusAsync(manager, positionOverrideMs, commandStartedUnixMs, skipThumbnail);
        }
        catch (Exception error)
        {
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                available = false,
                error = $"{error.GetType().Name}: {error.Message}",
                volumePercent = TryGetDefaultRenderVolume()
            }, JsonOptions));
        }
    }

    public static async Task DebugClockAsync(int seconds, int intervalMs)
    {
        seconds = Math.Clamp(seconds, 1, 300);
        intervalMs = Math.Clamp(intervalMs, 50, 5000);
        try
        {
            var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var startedUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                type = "media-clock-debug-start",
                startedUnixMs,
                durationSeconds = seconds,
                intervalMs,
                sessions = manager.GetSessions().Select(DescribeSession).ToArray()
            }, JsonOptions));

            var stopwatch = Stopwatch.StartNew();
            double? previousComputedPositionMs = null;
            double? previousRawTimelinePositionMs = null;
            double? previousLastUpdatedProjectedPositionMs = null;
            long? previousSampleUnixMs = null;
            double previousPlaybackRate = 0;
            string? previousTrackKey = null;

            for (var index = 0; ; index++)
            {
                var targetElapsedMs = index * intervalMs;
                if (targetElapsedMs > seconds * 1000)
                {
                    break;
                }

                var delayMs = targetElapsedMs - stopwatch.ElapsedMilliseconds;
                if (delayMs > 0)
                {
                    await Task.Delay((int)delayMs);
                }

                var sampleStartedUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                try
                {
                    var session = SelectMusicSession(manager);
                    if (session is null)
                    {
                        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
                        {
                            type = "media-clock-debug-sample",
                            index,
                            elapsedMs = stopwatch.ElapsedMilliseconds,
                            sampleStartedUnixMs,
                            sampleUnixMs = sampleStartedUnixMs,
                            available = false,
                            sessions = manager.GetSessions().Select(DescribeSession).ToArray()
                        }, JsonOptions));
                        previousComputedPositionMs = null;
                        previousRawTimelinePositionMs = null;
                        previousLastUpdatedProjectedPositionMs = null;
                        previousSampleUnixMs = null;
                        previousPlaybackRate = 0;
                        previousTrackKey = null;
                        continue;
                    }

                    var mediaProperties = await session.TryGetMediaPropertiesAsync();
                    var playbackInfo = session.GetPlaybackInfo();
                    var timeline = session.GetTimelineProperties();
                    var sampleUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var startMs = Math.Max(0, timeline.StartTime.TotalMilliseconds);
                    var endMs = Math.Max(startMs, timeline.EndTime.TotalMilliseconds);
                    var durationMs = Math.Max(0, endMs - startMs);
                    var rawTimelinePositionMs = Math.Max(0, timeline.Position.TotalMilliseconds - startMs);
                    rawTimelinePositionMs = durationMs > 0
                        ? Math.Min(durationMs, rawTimelinePositionMs)
                        : rawTimelinePositionMs;
                    var lastUpdatedUnixMs = timeline.LastUpdatedTime.ToUnixTimeMilliseconds();
                    var playbackRate = playbackInfo.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
                        ? playbackInfo.PlaybackRate ?? 1.0
                        : 0;
                    var lastUpdatedProjectedPositionMs = rawTimelinePositionMs;
                    if (playbackRate != 0)
                    {
                        lastUpdatedProjectedPositionMs += Math.Max(0, sampleUnixMs - lastUpdatedUnixMs) * playbackRate;
                    }
                    lastUpdatedProjectedPositionMs = durationMs > 0
                        ? Math.Min(durationMs, lastUpdatedProjectedPositionMs)
                        : lastUpdatedProjectedPositionMs;
                    var computedPositionMs = rawTimelinePositionMs;

                    var trackKey = $"{session.SourceAppUserModelId ?? ""}\u0000{mediaProperties.Title ?? ""}\u0000{mediaProperties.Artist ?? ""}\u0000{durationMs}";
                    if (!string.Equals(trackKey, previousTrackKey, StringComparison.Ordinal))
                    {
                        previousComputedPositionMs = null;
                        previousRawTimelinePositionMs = null;
                        previousLastUpdatedProjectedPositionMs = null;
                        previousSampleUnixMs = null;
                        previousPlaybackRate = 0;
                    }

                    var sampleDeltaMs = previousSampleUnixMs is null
                        ? (long?)null
                        : sampleUnixMs - previousSampleUnixMs.Value;
                    var rawTimelineDeltaMs = previousRawTimelinePositionMs is null
                        ? (double?)null
                        : rawTimelinePositionMs - previousRawTimelinePositionMs.Value;
                    var computedDeltaMs = previousComputedPositionMs is null
                        ? (double?)null
                        : computedPositionMs - previousComputedPositionMs.Value;
                    var lastUpdatedProjectedDeltaMs = previousLastUpdatedProjectedPositionMs is null
                        ? (double?)null
                        : lastUpdatedProjectedPositionMs - previousLastUpdatedProjectedPositionMs.Value;
                    var expectedDeltaMs = sampleDeltaMs is null
                        ? (double?)null
                        : previousPlaybackRate * sampleDeltaMs.Value;
                    var driftMs = computedDeltaMs is null || expectedDeltaMs is null
                        ? (double?)null
                        : computedDeltaMs.Value - expectedDeltaMs.Value;
                    var lastUpdatedProjectedDriftMs = lastUpdatedProjectedDeltaMs is null || expectedDeltaMs is null
                        ? (double?)null
                        : lastUpdatedProjectedDeltaMs.Value - expectedDeltaMs.Value;

                    await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
                    {
                        type = "media-clock-debug-sample",
                        index,
                        elapsedMs = stopwatch.ElapsedMilliseconds,
                        sampleStartedUnixMs,
                        sampleUnixMs,
                        captureDurationMs = sampleUnixMs - sampleStartedUnixMs,
                        available = true,
                        sourceAppUserModelId = session.SourceAppUserModelId ?? "",
                        title = mediaProperties.Title ?? "",
                        artist = mediaProperties.Artist ?? "",
                        playbackStatus = PlaybackStatusName(playbackInfo.PlaybackStatus),
                        playbackRate,
                        startMs = RoundDebug(startMs),
                        durationMs = RoundDebug(durationMs),
                        rawTimelinePositionMs = RoundDebug(rawTimelinePositionMs),
                        computedPositionMs = RoundDebug(computedPositionMs),
                        lastUpdatedProjectedPositionMs = RoundDebug(lastUpdatedProjectedPositionMs),
                        displaySecond = (int)Math.Floor(computedPositionMs / 1000),
                        lastUpdatedUnixMs,
                        lastUpdatedAgeMs = sampleUnixMs - lastUpdatedUnixMs,
                        sampleDeltaMs,
                        rawTimelineDeltaMs = RoundDebug(rawTimelineDeltaMs),
                        computedDeltaMs = RoundDebug(computedDeltaMs),
                        lastUpdatedProjectedDeltaMs = RoundDebug(lastUpdatedProjectedDeltaMs),
                        expectedDeltaMs = RoundDebug(expectedDeltaMs),
                        driftMs = RoundDebug(driftMs),
                        lastUpdatedProjectedDriftMs = RoundDebug(lastUpdatedProjectedDriftMs),
                        sessions = manager.GetSessions().Select(DescribeSession).ToArray()
                    }, JsonOptions));

                    previousComputedPositionMs = computedPositionMs;
                    previousRawTimelinePositionMs = rawTimelinePositionMs;
                    previousLastUpdatedProjectedPositionMs = lastUpdatedProjectedPositionMs;
                    previousSampleUnixMs = sampleUnixMs;
                    previousPlaybackRate = playbackRate;
                    previousTrackKey = trackKey;
                }
                catch (Exception error)
                {
                    await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
                    {
                        type = "media-clock-debug-sample-error",
                        index,
                        elapsedMs = stopwatch.ElapsedMilliseconds,
                        sampleStartedUnixMs,
                        sampleUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        error = $"{error.GetType().Name}: {error.Message}"
                    }, JsonOptions));
                    previousComputedPositionMs = null;
                    previousRawTimelinePositionMs = null;
                    previousLastUpdatedProjectedPositionMs = null;
                    previousSampleUnixMs = null;
                    previousPlaybackRate = 0;
                    previousTrackKey = null;
                }
            }

            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                type = "media-clock-debug-end",
                sampleCount = (int)Math.Floor((seconds * 1000) / (double)intervalMs) + 1,
                endedUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            }, JsonOptions));
        }
        catch (Exception error)
        {
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                type = "media-clock-debug-error",
                error = $"{error.GetType().Name}: {error.Message}"
            }, JsonOptions));
        }
    }

    private static async Task WriteStatusAsync(
        GlobalSystemMediaTransportControlsSessionManager? manager = null,
        double? positionOverrideMs = null,
        long? positionOverrideAnchorUnixMs = null,
        bool skipThumbnail = false)
    {
        manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        var session = SelectMusicSession(manager);
        if (session is null)
        {
            var nowUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                available = false,
                title = "",
                artist = "",
                thumbnailDataUrl = (string?)null,
                playbackStatus = "none",
                positionMs = 0,
                positionAnchorUnixMs = nowUnixMs,
                durationMs = 0,
                startMs = 0,
                endMs = 0,
                lastUpdatedUnixMs = nowUnixMs,
                receivedUnixMs = nowUnixMs,
                playbackRate = (double?)null,
                volumePercent = TryGetDefaultRenderVolume()
            }, JsonOptions));
            return;
        }

        var mediaProperties = await session.TryGetMediaPropertiesAsync();
        var playbackInfo = session.GetPlaybackInfo();
        var timeline = session.GetTimelineProperties();
        var startMs = Math.Max(0, timeline.StartTime.TotalMilliseconds);
        var endMs = Math.Max(startMs, timeline.EndTime.TotalMilliseconds);
        var durationMs = Math.Max(0, endMs - startMs);
        var timelinePositionMs = Math.Max(0, timeline.Position.TotalMilliseconds - startMs);
        timelinePositionMs = durationMs > 0 ? Math.Min(durationMs, timelinePositionMs) : timelinePositionMs;
        var thumbnailDataUrl = skipThumbnail
            ? null
            : await ReadThumbnailDataUrlAsync(mediaProperties.Thumbnail);
        var receivedUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var lastUpdatedUnixMs = timeline.LastUpdatedTime.ToUnixTimeMilliseconds();
        var playbackRate = playbackInfo.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
            ? playbackInfo.PlaybackRate ?? 1.0
            : 0;
        var positionMs = timelinePositionMs;
        if (positionOverrideMs is not null)
        {
            positionMs = positionOverrideMs.Value;
        }
        positionMs = durationMs > 0 ? Math.Min(durationMs, positionMs) : positionMs;
        var positionAnchorUnixMs = positionOverrideMs is not null && positionOverrideAnchorUnixMs is not null
            ? Math.Max(0, positionOverrideAnchorUnixMs.Value)
            : receivedUnixMs;

        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
        {
            available = true,
            title = mediaProperties.Title ?? "",
            artist = mediaProperties.Artist ?? "",
            thumbnailDataUrl,
            playbackStatus = PlaybackStatusName(playbackInfo.PlaybackStatus),
            positionMs = (int)Math.Round(positionMs),
            positionAnchorUnixMs,
            durationMs = (int)Math.Round(durationMs),
            startMs = 0,
            endMs = (int)Math.Round(durationMs),
            lastUpdatedUnixMs,
            receivedUnixMs,
            playbackRate,
            volumePercent = TryGetDefaultRenderVolume()
        }, JsonOptions));
    }

    private static async Task<string?> ReadThumbnailDataUrlAsync(IRandomAccessStreamReference? thumbnail)
    {
        if (thumbnail is null)
        {
            return null;
        }

        try
        {
            using var stream = await thumbnail.OpenReadAsync();
            var length = Math.Min((ulong)ThumbnailMaxBytes, stream.Size);
            using var reader = new DataReader(stream.GetInputStreamAt(0));
            var loaded = await reader.LoadAsync((uint)length);
            var bytes = new byte[loaded];
            reader.ReadBytes(bytes);
            reader.DetachStream();
            return ResizeThumbnailDataUrl(bytes);
        }
        catch
        {
            return null;
        }
    }

    private static GlobalSystemMediaTransportControlsSession? SelectMusicSession(
        GlobalSystemMediaTransportControlsSessionManager manager)
    {
        return manager.GetSessions()
            .Where(IsPreferredMusicSession)
            .OrderByDescending(SessionScore)
            .FirstOrDefault();
    }

    private static bool IsPreferredMusicSession(GlobalSystemMediaTransportControlsSession session)
    {
        var sourceAppUserModelId = session.SourceAppUserModelId ?? "";
        return PreferredMusicSessionTokens.Any(token => (
            sourceAppUserModelId.Contains(token, StringComparison.OrdinalIgnoreCase)
        ));
    }

    private static int SessionScore(GlobalSystemMediaTransportControlsSession session)
    {
        var score = 0;
        var playbackStatus = TryGetPlaybackStatus(session);
        if (playbackStatus is not null)
        {
            score += playbackStatus switch
            {
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => 100,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => 60,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => 20,
                _ => 0
            };
        }

        var sourceAppUserModelId = session.SourceAppUserModelId ?? "";
        if (sourceAppUserModelId.Contains("spotify", StringComparison.OrdinalIgnoreCase)
            || sourceAppUserModelId.Contains("apple", StringComparison.OrdinalIgnoreCase))
        {
            score += 10;
        }

        return score;
    }

    private static object DescribeSession(GlobalSystemMediaTransportControlsSession session)
    {
        var playbackStatus = TryGetPlaybackStatus(session);
        return new
        {
            sourceAppUserModelId = session.SourceAppUserModelId ?? "",
            playbackStatus = playbackStatus is null ? "unknown" : PlaybackStatusName(playbackStatus.Value),
            preferred = IsPreferredMusicSession(session),
            score = SessionScore(session)
        };
    }

    private static double RoundDebug(double value)
    {
        return Math.Round(value, 3);
    }

    private static double? RoundDebug(double? value)
    {
        return value is null ? null : Math.Round(value.Value, 3);
    }

    private static double? TryGetDisplayPositionMs(
        GlobalSystemMediaTransportControlsSession session,
        long asOfUnixMs)
    {
        try
        {
            var timeline = session.GetTimelineProperties();
            var startMs = Math.Max(0, timeline.StartTime.TotalMilliseconds);
            var endMs = Math.Max(startMs, timeline.EndTime.TotalMilliseconds);
            var durationMs = Math.Max(0, endMs - startMs);
            var positionMs = Math.Max(0, timeline.Position.TotalMilliseconds - startMs);
            positionMs = durationMs > 0 ? Math.Min(durationMs, positionMs) : positionMs;
            _ = asOfUnixMs;
            return durationMs > 0 ? Math.Min(durationMs, positionMs) : positionMs;
        }
        catch
        {
            return null;
        }
    }

    private static int DisplayPositionMs(double positionMs, double durationMs)
    {
        var clampedPositionMs = durationMs > 0
            ? Math.Min(durationMs, Math.Max(0, positionMs))
            : Math.Max(0, positionMs);
        return (int)(Math.Floor(clampedPositionMs / 1000) * 1000);
    }

    private static GlobalSystemMediaTransportControlsSessionPlaybackStatus? TryGetPlaybackStatus(
        GlobalSystemMediaTransportControlsSession session)
    {
        try
        {
            return session.GetPlaybackInfo().PlaybackStatus;
        }
        catch
        {
            return null;
        }
    }

    private static async Task WaitForPlaybackStatusChangeAsync(
        GlobalSystemMediaTransportControlsSession session,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus? previousPlaybackStatus)
    {
        if (previousPlaybackStatus is null)
        {
            await Task.Delay(MediaCommandSettleDelayMs);
            return;
        }

        var deadline = DateTimeOffset.UtcNow.AddMilliseconds(PlaybackToggleSettleTimeoutMs);
        while (DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(PlaybackTogglePollMs);
            var playbackStatus = TryGetPlaybackStatus(session);
            if (playbackStatus is not null && playbackStatus != previousPlaybackStatus)
            {
                return;
            }
        }
    }

    private static string ResizeThumbnailDataUrl(byte[] bytes)
    {
        using var input = new MemoryStream(bytes);
        using var source = Image.FromStream(input, useEmbeddedColorManagement: false, validateImageData: false);
        var scale = Math.Min(1.0, Math.Min(
            ThumbnailMaxDimension / (double)Math.Max(1, source.Width),
            ThumbnailMaxDimension / (double)Math.Max(1, source.Height)));
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));

        using var resized = new Bitmap(width, height);
        using (var graphics = Graphics.FromImage(resized))
        {
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.SmoothingMode = SmoothingMode.HighQuality;
            graphics.DrawImage(source, 0, 0, width, height);
        }

        using var output = new MemoryStream();
        resized.Save(output, ImageFormat.Png);
        return $"data:image/png;base64,{Convert.ToBase64String(output.ToArray())}";
    }

    private static string PlaybackStatusName(GlobalSystemMediaTransportControlsSessionPlaybackStatus status)
    {
        return status switch
        {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => "playing",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => "paused",
            GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => "stopped",
            _ => "none"
        };
    }

    private static int TryGetDefaultRenderVolume()
    {
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            return (int)Math.Round(device.AudioEndpointVolume.MasterVolumeLevelScalar * 100);
        }
        catch
        {
            return 0;
        }
    }

    private static void SetDefaultRenderVolume(int volumePercent)
    {
        using var enumerator = new MMDeviceEnumerator();
        using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        device.AudioEndpointVolume.MasterVolumeLevelScalar = Math.Clamp(volumePercent, 0, 100) / 100f;
    }
}
