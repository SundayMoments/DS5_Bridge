using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Concentus.Enums;
using Concentus.Structs;
using HidSharp;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wave;

var options = HelperOptions.Parse(args);
if (options.MediaDebugClock)
{
    await WindowsMediaSessionCli.DebugClockAsync(options.MediaDebugSeconds, options.MediaDebugIntervalMs);
    return;
}
if (options.MediaSessionCommand is not null)
{
    await WindowsMediaSessionCli.RunAsync(
        options.MediaSessionCommand,
        options.MediaVolumePercent,
        options.MediaCommandStartedUnixMs,
        options.MediaSkipThumbnail);
    return;
}
if (!string.IsNullOrWhiteSpace(options.ResolveIconDataUrlPath))
{
    Console.Out.WriteLine(ProcessIconDataUrlResolver.TryResolve(options.ResolveIconDataUrlPath) ?? string.Empty);
    Console.Out.Flush();
    return;
}
if (options.CompanionTransportServer)
{
    Environment.ExitCode = await CompanionTransportServer.RunAsync();
    return;
}
if (options.PlayTestTone)
{
    AudioHelperTestTone.Play(options);
    return;
}
if (options.PlayTestHaptics)
{
    AudioHelperTestHaptics.Play(options);
    return;
}
if (options.MonitorAudioSessions)
{
    using var monitor = new AudioSessionMonitor();
    await monitor.RunAsync();
    return;
}
if (options.ListDevices)
{
    EndpointManager.ListDevices();
    return;
}
if (options.DefaultRenderStatus)
{
    EndpointManager.PrintDefaultRenderEndpointStatus();
    return;
}
if (options.SetDefaultRenderBridge)
{
    EndpointManager.SetDefaultRenderBridgeEndpoint(options.BridgePersona);
    return;
}

using var helper = new AudioHelper(options);
await helper.RunAsync();

static class AudioConstants
{
    public const int TargetSampleRate = 48000;
    public const int PicoInputBlockFrames = 512;
    public const int OpusFrameSamples = 480;
    public const int OpusPacketBytes = 200;
    public const int CompactFrameBytes = 264;
    public const int HapticBuckets = 32;
    public const float HapticsGateThreshold = 0.003f;
    public const float HapticsEnvelopeAttack = 0.40f;
    public const float HapticsEnvelopeRelease = 0.025f;
    public const float HapticsGateOpenRate = 0.035f;
    public const float HapticsGateCloseRate = 0.004f;
    public const float HapticsOutputRampStep = 0.004f;
    public const int WasapiBufferMilliseconds = 10;
    public const int MaxQueuedReports = 12;
    public const int MaxBufferedReports = 6;
    public const int DefaultFrameDumpFrameLimit = 18000;
    public const byte LegacyAudioStreamReportId = 0x07;
    public const byte FastFrameFragmentType = 0x08;
    public const int FastPayloadBytes = 57;
    public const int HidReportBytes = 64;
    public const int HidWriteTimeoutMilliseconds = 12;
    public const int HidTimeoutLogIntervalMilliseconds = 1000;
    public const int CaptureCallbackGapWarningUs = 20000;
    public const int CaptureCallbackGapSoftWarningUs = 12000;
    public const int CaptureCallbackGapMediumWarningUs = 16000;
    public const int WriterScheduleLateSoftWarningUs = 2000;
    public const int WriterScheduleLateMediumWarningUs = 4000;
    public const int WriterScheduleLateWarningUs = 8000;
    public const int HidWriteSoftWarningUs = 2000;
    public const int HidWriteMediumWarningUs = 4000;
    public const int HidWriteLateWarningUs = 8000;
    public const int DiagnosticsIntervalMilliseconds = 2000;
    public const int HelperEventLogIntervalMilliseconds = 1000;
    public const int WriterPrebufferReports = 3;
    public const int WriterTakeTimeoutMilliseconds = 2;
    public const int RawPcmCaptureBufferMilliseconds = 10;
    public const int ProcessLoopbackBufferMilliseconds = 10;
    public const int ProcessLoopbackActivationTimeoutMilliseconds = 5000;
    public const int MaxQueuedPcmChunks = 32;
    public const int BulkPcmMaxGapFillPackets = 6;
    public static readonly bool DiagnosticsEnabled =
        Environment.GetEnvironmentVariable("DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS") == "1";
    public const int MicKeepaliveBufferMilliseconds = 10;
    public const float SpeakerGainRampStepPermille = 1000f / (TargetSampleRate * 0.02f);
    public static readonly long FrameIntervalTicks = Stopwatch.Frequency * PicoInputBlockFrames / TargetSampleRate;
    public const int AudclntDeviceInvalidated = unchecked((int)0x88890004);
    public const int AudclntUnsupportedFormat = unchecked((int)0x88890008);
    public const int AudclntDeviceInUse = unchecked((int)0x8889000A);
}

static class AudioHelperTestTone
{
    public static void Play(HelperOptions options)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = !string.IsNullOrWhiteSpace(options.BridgePersona)
            ? EndpointManager.SelectRenderBridgeEndpointForPersona(enumerator, options.BridgePersona)
            : EndpointManager.SelectRenderEndpoint(enumerator, options.DeviceName);
        using var output = new WasapiOut(device, AudioClientShareMode.Shared, false, 120);
        using var fileReader = OpenTestAudioFile(options.TestAudioPath);
        using var playbackStopped = new ManualResetEventSlim(false);
        fileReader.Volume = Math.Clamp(options.SpeakerVolumePercent, 0, 100) / 100.0f;
        output.PlaybackStopped += (_, _) => playbackStopped.Set();
        output.Init(fileReader);
        output.Play();
        if (!playbackStopped.Wait(TimeSpan.FromSeconds(8)))
        {
            output.Stop();
            playbackStopped.Wait(TimeSpan.FromMilliseconds(500));
        }
        Console.Error.WriteLine($"status: test-tone-played '{device.FriendlyName}'");
    }

    private static AudioFileReader OpenTestAudioFile(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("Test audio path was not provided.");
        }
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Test audio file was not found.", path);
        }
        return new AudioFileReader(path);
    }
}

static class AudioHelperTestHaptics
{
    private const int PacketCount = 36;
    private const int PrerollPacketCount = 3;
    private const int NeutralPacketCount = 5;
    private const int BaseAmplitude = 72;
    private const int MaxGainPercent = 200;

    public static void Play(HelperOptions options)
    {
        if (TryPlayViaBridgeFrames(options.HapticsGainPercent))
        {
            return;
        }

        PlayViaRenderEndpoint(options);
    }

    private static bool TryPlayViaBridgeFrames(int hapticsGainPercent)
    {
        using var transport = WinUsbBridgeTransport.TryOpen();
        if (transport is null)
        {
            return false;
        }

        var frames = BuildTestFrames(hapticsGainPercent);
        var hidReport = new byte[AudioConstants.HidReportBytes];
        var stopwatch = Stopwatch.StartNew();
        var nextWriteTicks = stopwatch.ElapsedTicks;
        ushort sequence = 0;

        foreach (var frame in frames)
        {
            WaitUntil(stopwatch, nextWriteTicks);
            try
            {
                var written = LegacyFramePacketizer.WriteFastHidFragments(
                    frame,
                    sequence++,
                    hidReport,
                    report =>
                    {
                        transport.WriteReport(report);
                        return true;
                    },
                    out _);
                if (!written)
                {
                    return false;
                }
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(
                    $"status: test-haptics-winusb-failed error='{error.GetType().Name}: {error.Message}'");
                return false;
            }
            nextWriteTicks += AudioConstants.FrameIntervalTicks;
        }

        Console.Error.WriteLine("status: test-haptics-played transport=winusb");
        return true;
    }

    private static void PlayViaRenderEndpoint(HelperOptions options)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = !string.IsNullOrWhiteSpace(options.BridgePersona)
            ? EndpointManager.SelectRenderBridgeEndpointForPersona(enumerator, options.BridgePersona)
            : EndpointManager.SelectRenderEndpoint(enumerator, options.DeviceName);
        var format = device.AudioClient.MixFormat;
        if (format.Channels < 4)
        {
            throw new InvalidOperationException(
                $"Test haptics requires a 4-channel bridge audio endpoint; '{device.FriendlyName}' exposes {format.Channels} channel(s).");
        }

        var pcm = BuildTestPcm(format, options.HapticsGainPercent);
        var waveProvider = new BufferedWaveProvider(format)
        {
            BufferDuration = TimeSpan.FromSeconds(1),
            DiscardOnBufferOverflow = false,
            ReadFully = true
        };
        using var output = new WasapiOut(device, AudioClientShareMode.Shared, false, 80);
        waveProvider.AddSamples(pcm, 0, pcm.Length);
        output.Init(waveProvider);
        output.Play();
        var frameCount = pcm.Length / Math.Max(1, format.BlockAlign);
        Thread.Sleep(TimeSpan.FromSeconds(frameCount / (double)format.SampleRate) + TimeSpan.FromMilliseconds(120));
        output.Stop();
        Console.Error.WriteLine($"status: test-haptics-played '{device.FriendlyName}'");
    }

    internal static byte[][] BuildTestFrames(int gainPercent)
    {
        var packetTotal = PrerollPacketCount + PacketCount + NeutralPacketCount;
        var frames = new byte[packetTotal][];
        for (var index = 0; index < frames.Length; index++)
        {
            frames[index] = new byte[AudioConstants.CompactFrameBytes];
        }

        var gain = Math.Clamp(gainPercent, 0, MaxGainPercent);
        for (var packet = 0; packet < PacketCount; packet++)
        {
            var amplitude = TestAmplitude(BaseAmplitude, gain, TestEnvelopePercent(packet, PacketCount));
            if (amplitude <= 0)
            {
                continue;
            }

            var packetsRemaining = PacketCount - packet;
            var positivePhase = (packetsRemaining & 1) != 0;
            var left = positivePhase ? amplitude : -amplitude;
            var right = positivePhase ? -amplitude : amplitude;
            var frame = frames[PrerollPacketCount + packet];

            for (var index = 0; index < AudioConstants.HapticBuckets * 2; index += 2)
            {
                frame[index] = unchecked((byte)(sbyte)left);
                frame[index + 1] = unchecked((byte)(sbyte)right);
            }
        }

        return frames;
    }

    internal static byte[] BuildTestPcm(WaveFormat format, int gainPercent)
    {
        var framesPerPacket = Math.Max(
            1,
            (int)Math.Round(format.SampleRate * AudioConstants.PicoInputBlockFrames / (double)AudioConstants.TargetSampleRate)
        );
        var packetTotal = PrerollPacketCount + PacketCount + NeutralPacketCount;
        var buffer = new byte[packetTotal * framesPerPacket * format.BlockAlign];
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var gain = Math.Clamp(gainPercent, 0, MaxGainPercent);

        for (var packet = 0; packet < PacketCount; packet++)
        {
            var amplitude = TestAmplitude(BaseAmplitude, gain, TestEnvelopePercent(packet, PacketCount)) / 127.0f;
            if (amplitude <= 0)
            {
                continue;
            }
            var packetsRemaining = PacketCount - packet;
            var positivePhase = (packetsRemaining & 1) != 0;
            var left = positivePhase ? amplitude : -amplitude;
            var right = positivePhase ? -amplitude : amplitude;
            var packetFrameStart = (PrerollPacketCount + packet) * framesPerPacket;

            for (var frame = 0; frame < framesPerPacket; frame++)
            {
                var offset = (packetFrameStart + frame) * format.BlockAlign;
                WriteSample(buffer, offset + bytesPerSample * 2, format, left);
                WriteSample(buffer, offset + bytesPerSample * 3, format, right);
            }
        }

        return buffer;
    }

    private static int TestEnvelopePercent(int packetIndex, int packetCount)
    {
        _ = packetIndex;
        return packetCount == 0 ? 0 : 100;
    }

    private static int TestAmplitude(int baseAmplitude, int gainPercent, int envelopePercent)
    {
        var scaled = baseAmplitude * Math.Clamp(gainPercent, 0, MaxGainPercent) * envelopePercent;
        return Math.Min(127, scaled / 10000);
    }

    private static void WriteSample(byte[] buffer, int offset, WaveFormat format, float sample)
    {
        if (offset < 0 || offset >= buffer.Length)
        {
            return;
        }

        sample = Math.Clamp(sample, -1.0f, 1.0f);
        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
        {
            _ = BitConverter.TryWriteBytes(buffer.AsSpan(offset, Math.Min(4, buffer.Length - offset)), sample);
            return;
        }

        switch (format.BitsPerSample)
        {
            case 16 when offset + 1 < buffer.Length:
                BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(offset, 2), FloatToInt16(sample));
                break;
            case 24 when offset + 2 < buffer.Length:
                WriteInt24(buffer, offset, (int)Math.Round(sample * 8388607.0f));
                break;
            case 32 when offset + 3 < buffer.Length && format.Encoding == WaveFormatEncoding.Pcm:
                BinaryPrimitives.WriteInt32LittleEndian(
                    buffer.AsSpan(offset, 4),
                    (int)Math.Round(sample * 2147483647.0f)
                );
                break;
            case 32 when offset + 3 < buffer.Length:
                _ = BitConverter.TryWriteBytes(buffer.AsSpan(offset, 4), sample);
                break;
        }
    }

    private static void WriteInt24(byte[] buffer, int offset, int value)
    {
        value = Math.Clamp(value, -8388608, 8388607);
        buffer[offset] = (byte)(value & 0xff);
        buffer[offset + 1] = (byte)((value >> 8) & 0xff);
        buffer[offset + 2] = (byte)((value >> 16) & 0xff);
    }

    private static short FloatToInt16(float sample)
    {
        return (short)Math.Round(Math.Clamp(sample, -1, 1) * short.MaxValue);
    }

    private static void WaitUntil(Stopwatch stopwatch, long targetTicks)
    {
        while (true)
        {
            var remainingTicks = targetTicks - stopwatch.ElapsedTicks;
            if (remainingTicks <= 0)
            {
                return;
            }

            var remainingMs = remainingTicks * 1000 / Stopwatch.Frequency;
            if (remainingMs > 2)
            {
                Thread.Sleep(1);
            }
            else
            {
                Thread.Yield();
            }
        }
    }
}

sealed class AudioHelper : IDisposable
{
    private readonly HelperOptions options;
    private readonly OpusEncoder encoder;
    private readonly object sync = new();
    private readonly byte[] opusScratch = new byte[1275];
    private readonly short[] speakerPcm = new short[AudioConstants.OpusFrameSamples * 2];
    private readonly float[] speakerBlock = new float[AudioConstants.PicoInputBlockFrames * 2];
    private readonly float[] hapticLeftBlock = new float[AudioConstants.PicoInputBlockFrames];
    private readonly float[] hapticRightBlock = new float[AudioConstants.PicoInputBlockFrames];
    private readonly byte[] writePrefix = new byte[2];
    private readonly byte[] hidReport = new byte[AudioConstants.HidReportBytes];
    private readonly byte[] report = new byte[AudioConstants.CompactFrameBytes];
    private readonly BlockingCollection<PcmCaptureChunk> pcmQueue = new(AudioConstants.MaxQueuedPcmChunks);
    private readonly BlockingCollection<byte[]> reportQueue = new(AudioConstants.MaxQueuedReports);
    private readonly FrameDumpWriter? frameDump;
    private readonly ManualResetEventSlim stopped = new(false);
    private readonly Task writerTask;
    private readonly Task? diagnosticsTask;
    private WaveFileWriter? rawCaptureDump;
    private long rawCaptureDumpFrameLimit;
    private long rawCaptureDumpFramesWritten;
    private bool rawCaptureDumpLimitLogged;
    private MMDeviceEnumerator? enumerator;
    private IMMNotificationClient? endpointNotificationClient;
    private WasapiCapture? capture;
    private WasapiOut? hapticsMirrorOutput;
    private BufferedWaveProvider? hapticsMirrorBuffer;
    private WaveFormat? hapticsMirrorFormat;
    private byte[] hapticsMirrorScratch = Array.Empty<byte>();
    private int hapticsMirrorScratchLength;
    private WasapiCapture? micCapture;
    private AudioClient? directCaptureAudioClient;
    private AudioCaptureClient? directCaptureClient;
    private EventWaitHandle? directCaptureEvent;
    private WinUsbPcmTransport? bulkPcmTransport;
    private Task? directCaptureTask;
    private Task? bulkPcmTask;
    private Task? pcmEncoderTask;
    private Task? appSessionMonitorTask;
    private WinUsbBridgeTransport? bridgeTransport;
    private HidStream? hidStream;
    private int picoBlockFrameIndex;
    private bool picoBlockHasHaptics;
    private double resampleCredit;
    private long capturedFrames;
    private long encodedReports;
    private long writtenReports;
    private long writtenFragments;
    private long droppedReports;
    private long writeLateEvents;
    private long maxWriteLateUs;
    private long lastCaptureCallbackTicks;
    private long captureCallbackGapOver12msEvents;
    private long captureCallbackGapOver16msEvents;
    private long captureCallbackGapEvents;
    private long captureCallbackGapMaxUs;
    private long captureWakeCount;
    private long capturePacketsDrained;
    private long captureMaxPacketsPerWake;
    private long captureFramesDrained;
    private long captureDiscontinuityPackets;
    private long captureSilentPackets;
    private long pcmQueuedChunks;
    private long pcmDroppedChunks;
    private long pcmQueueMaxChunks;
    private long writerScheduleLateOver2msEvents;
    private long writerScheduleLateOver4msEvents;
    private long writerScheduleLateEvents;
    private long writerScheduleLateMaxUs;
    private long hidWriteOver2msEvents;
    private long hidWriteOver4msEvents;
    private long hidWriteLateEvents;
    private long hidWriteLateMaxUs;
    private long hidWriteTimeouts;
    private long lastHidTimeoutLogTicks;
    private long lastHelperEventLogTicks;
    private ushort frameSequence;
    private int peakSamplePermille;
    private long capturedCallbacks;
    private long micCallbacks;
    private long micCapturedFrames;
    private int micPeakPermille;
    private bool bulkPcmSequenceValid;
    private ushort bulkPcmExpectedSequence;
    private byte[]? bulkPcmLastPayload;
    private long bulkPcmSequenceGaps;
    private long bulkPcmGapFillPackets;
    private long bulkPcmReadCalls;
    private long bulkPcmReadBytes;
    private long bulkPcmParsedPackets;
    private int targetSpeakerGainPermille;
    private float currentSpeakerGainPermille;
    private int hapticsGainPercent;
    private int hapticsBassFocus;
    private int hapticsResponse;
    private int hapticsAttack;
    private int hapticsRelease;
    private float hapticsFilterLeft;
    private float hapticsFilterRight;
    private float hapticsEnvelopeLeft;
    private float hapticsEnvelopeRight;
    private float hapticsGate;
    private float hapticsOutputRamp;
    private bool timerResolutionRaised;
    private bool disposed;

    private bool HapticsFrameOutput => options.HapticsOnly && options.StdoutOnly;
    private int WriterPrebufferReports => HapticsFrameOutput ? 1 : AudioConstants.WriterPrebufferReports;

    public AudioHelper(HelperOptions options)
    {
        this.options = options;
        targetSpeakerGainPermille = VolumePercentToPermille(options.SpeakerVolumePercent);
        currentSpeakerGainPermille = 0f;
        hapticsGainPercent = Math.Clamp(options.HapticsGainPercent, 0, 200);
        hapticsBassFocus = options.HapticsBassFocus;
        hapticsResponse = options.HapticsResponse;
        hapticsAttack = options.HapticsAttack;
        hapticsRelease = options.HapticsRelease;
        RaiseSchedulingPriority();
        timerResolutionRaised = TryBeginTimerResolution(1);
        encoder = new OpusEncoder(AudioConstants.TargetSampleRate, 2, OpusApplication.OPUS_APPLICATION_AUDIO)
        {
            Bitrate = 160000,
            Complexity = 0,
            UseVBR = false
        };
        frameDump = FrameDumpWriter.TryCreate(options.FrameDumpPath, options.FrameDumpFrameLimit);
        writerTask = Task.Run(WriteReports);
        diagnosticsTask = AudioConstants.DiagnosticsEnabled ? Task.Run(WriteDiagnostics) : null;
    }

    public async Task RunAsync()
    {
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            Stop();
        };

        _ = Task.Run(() =>
        {
            try
            {
                string? line;
                while ((line = Console.In.ReadLine()) is not null)
                {
                    ProcessControlLine(line);
                }
            }
            catch (IOException)
            {
            }
            Stop();
        });

        Start();
        await Task.Run(() => stopped.Wait());
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }
        disposed = true;
        Stop();
        if (timerResolutionRaised)
        {
            TryEndTimerResolution(1);
            timerResolutionRaised = false;
        }
        pcmQueue.CompleteAdding();
        try
        {
            directCaptureTask?.Wait(TimeSpan.FromSeconds(1));
            bulkPcmTask?.Wait(TimeSpan.FromSeconds(1));
            appSessionMonitorTask?.Wait(TimeSpan.FromSeconds(1));
            pcmEncoderTask?.Wait(TimeSpan.FromSeconds(1));
        }
        catch (AggregateException)
        {
        }
        capture?.Dispose();
        hapticsMirrorOutput?.Dispose();
        micCapture?.Dispose();
        directCaptureClient?.Dispose();
        directCaptureAudioClient?.Dispose();
        directCaptureEvent?.Dispose();
        hidStream?.Dispose();
        frameDump?.Dispose();
        rawCaptureDump?.Dispose();
        bulkPcmTransport?.Dispose();
        bridgeTransport?.Dispose();
        enumerator?.Dispose();
        reportQueue.CompleteAdding();
        try
        {
            writerTask.Wait(TimeSpan.FromSeconds(1));
            diagnosticsTask?.Wait(TimeSpan.FromSeconds(1));
        }
        catch (AggregateException)
        {
        }
        reportQueue.Dispose();
        pcmQueue.Dispose();
        stopped.Dispose();
    }

    private void Start()
    {
        enumerator = new MMDeviceEnumerator();
        if (options.MicKeepaliveOnly)
        {
            StartMicKeepalive(enumerator);
            return;
        }

        if (!options.HapticsOnly)
        {
            TryOpenCompanionOutput();
        }
        string deviceName = options.DeviceName ?? options.SourceArgument;
        try
        {
            if (options.Source == AudioHelperSource.UsbBulkPcm)
            {
                StartBulkPcmCapture();
                Console.Error.WriteLine("status: recording-started");
                return;
            }

            if (options.HapticsOnly)
            {
                if (options.AppProcessId is not null
                    || !string.IsNullOrWhiteSpace(options.AppProcessPath)
                    || !string.IsNullOrWhiteSpace(options.AppExecutableName))
                {
                    StartAppAudioHapticsMirror(enumerator);
                }
                else
                {
                    StartSystemAudioHapticsMirror(enumerator);
                }
                return;
            }

            var device = options.Source == AudioHelperSource.RawPcmCapture
                ? EndpointManager.SelectRawPcmCaptureEndpoint(enumerator, options.DeviceName)
                : EndpointManager.SelectRenderEndpoint(enumerator, options.DeviceName);
            deviceName = device.FriendlyName;
            if (options.Source == AudioHelperSource.RawPcmCapture)
            {
                StartDirectRawPcmCapture(device);
                Console.Error.WriteLine("status: recording-started");
                return;
            }

            capture = new WasapiLoopbackCapture(device);
            SetWasapiBufferMilliseconds(capture, AudioConstants.WasapiBufferMilliseconds);
            capture.DataAvailable += OnDataAvailable;
            capture.RecordingStopped += (_, eventArgs) =>
            {
                WriteWasapiStopFailure(eventArgs.Exception);
                stopped.Set();
            };

            Console.Error.WriteLine(
                $"status: audio-capture-format source={options.SourceArgument} device='{deviceName}' sampleRate={capture.WaveFormat.SampleRate} channels={capture.WaveFormat.Channels} bits={capture.WaveFormat.BitsPerSample} encoding={capture.WaveFormat.Encoding}");
            StartRawCaptureDump(capture.WaveFormat);
            capture.StartRecording();
        }
        catch (COMException error) when (WriteWasapiStartFailure(error, deviceName))
        {
            stopped.Set();
            return;
        }
        catch (BulkPcmUnavailableException error)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=bulk-pcm-unavailable error='{EscapeStatusValue(error.Message)}'");
            stopped.Set();
            return;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=helper-exit error='{EscapeStatusValue(error.GetType().Name + ": " + error.Message)}' device='{EscapeStatusValue(deviceName)}'");
            stopped.Set();
            return;
        }
        Console.Error.WriteLine("status: recording-started");
    }

    private void Stop()
    {
        UnregisterEndpointNotifications();
        stopped.Set();
        try
        {
            directCaptureAudioClient?.Stop();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: direct capture stop failed: {error.Message}");
        }
        try
        {
            directCaptureEvent?.Set();
        }
        catch
        {
        }
        try
        {
            pcmQueue.CompleteAdding();
        }
        catch
        {
        }
        try
        {
            micCapture?.StopRecording();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: mic keepalive stop failed: {error.Message}");
        }
        try
        {
            hapticsMirrorOutput?.Stop();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: haptics mirror stop failed: {error.Message}");
        }
        try
        {
            capture?.StopRecording();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: stop failed: {error.Message}");
        }
    }

    private void StartMicKeepalive(MMDeviceEnumerator enumerator)
    {
        var device = EndpointManager.SelectMicCaptureEndpoint(enumerator, options.MicDeviceName ?? options.DeviceName);
        micCapture = new WasapiCapture(device, false, AudioConstants.MicKeepaliveBufferMilliseconds);
        micCapture.DataAvailable += OnMicDataAvailable;
        micCapture.RecordingStopped += (_, eventArgs) =>
        {
            if (eventArgs.Exception is not null)
            {
                Console.Error.WriteLine($"error: mic keepalive stopped: {eventArgs.Exception.Message}");
            }
            stopped.Set();
        };

        if (AudioConstants.DiagnosticsEnabled)
        {
            Console.Error.WriteLine(
                $"status: mic keepalive opening '{device.FriendlyName}' {micCapture.WaveFormat.SampleRate}Hz {micCapture.WaveFormat.Channels}ch {micCapture.WaveFormat.BitsPerSample}bit {micCapture.WaveFormat.Encoding}");
        }
        micCapture.StartRecording();
        if (AudioConstants.DiagnosticsEnabled)
        {
            Console.Error.WriteLine("status: mic keepalive started");
        }
    }

    private bool TryOpenCompanionOutput()
    {
        if (options.StdoutOnly)
        {
            return false;
        }
        if (bridgeTransport is not null || hidStream is not null)
        {
            return true;
        }
        bridgeTransport = WinUsbBridgeTransport.TryOpen();
        if (bridgeTransport is not null)
        {
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine($"status: WinUSB bridge direct output active path='{bridgeTransport.DevicePath}'");
            }
            return true;
        }
        hidStream = PicoTransport.TryOpenDirectHid(options.HidPath);
        return hidStream is not null;
    }

    private void StartSystemAudioHapticsMirror(MMDeviceEnumerator enumerator)
    {
        var sourceDevice = EndpointManager.SelectDefaultRenderEndpoint(enumerator);
        var sourceName = sourceDevice.FriendlyName;
        var targetDevice = HapticsFrameOutput ? null : SelectHapticsMirrorTargetEndpoint(enumerator);
        var targetName = HapticsMirrorTargetName(targetDevice);

        if (
            !HapticsFrameOutput
            && (
                (targetDevice is not null
                    && string.Equals(sourceDevice.ID, targetDevice.ID, StringComparison.OrdinalIgnoreCase))
                || EndpointManager.IsKnownBridgeEndpoint(sourceDevice)
            )
        )
        {
            Console.Error.WriteLine(
                $"status: system-haptics-bypassed reason=source-is-bridge device='{EscapeStatusValue(sourceName)}'");
            stopped.Set();
            return;
        }

        var targetFormat = TryStartHapticsMirrorOutput(targetDevice, targetName);
        if (targetFormat is null)
        {
            return;
        }

        RegisterDefaultRenderNotification(enumerator);

        directCaptureAudioClient = sourceDevice.AudioClient;
        var captureFormat = directCaptureAudioClient.MixFormat;
        var bufferDuration = AudioConstants.WasapiBufferMilliseconds * 10000L;
        directCaptureAudioClient.Initialize(
            AudioClientShareMode.Shared,
            AudioClientStreamFlags.Loopback | AudioClientStreamFlags.EventCallback,
            bufferDuration,
            0,
            captureFormat,
            Guid.Empty
        );
        directCaptureEvent = new EventWaitHandle(false, EventResetMode.AutoReset);
        directCaptureAudioClient.SetEventHandle(directCaptureEvent.SafeWaitHandle.DangerousGetHandle());
        directCaptureClient = directCaptureAudioClient.AudioCaptureClient;
        Console.Error.WriteLine(
            $"status: audio-capture-format source=system-haptics-mirror device='{EscapeStatusValue(sourceName)}' target='{EscapeStatusValue(targetName)}' sampleRate={captureFormat.SampleRate} channels={captureFormat.Channels} bits={captureFormat.BitsPerSample} encoding={captureFormat.Encoding} targetRate={targetFormat.SampleRate} targetChannels={targetFormat.Channels} targetBits={targetFormat.BitsPerSample} targetEncoding={targetFormat.Encoding} bufferMs={AudioConstants.WasapiBufferMilliseconds} engineBufferFrames={directCaptureAudioClient.BufferSize}");
        StartRawCaptureDump(captureFormat);

        pcmEncoderTask = Task.Run(ProcessQueuedPcm);
        directCaptureTask = Task.Run(() => RunDirectRawPcmCapture(captureFormat));
        directCaptureAudioClient.Start();
        Console.Error.WriteLine("status: recording-started");
    }

    private void StartAppAudioHapticsMirror(MMDeviceEnumerator enumerator)
    {
        var selectedSession = AudioSessionCatalog.ResolveAppSession(
            options.AppProcessId,
            options.AppProcessPath,
            options.AppExecutableName);
        if (selectedSession is null)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=app-session-unavailable processId={options.AppProcessId?.ToString() ?? "none"} processPath='{EscapeStatusValue(options.AppProcessPath ?? "")}' executable='{EscapeStatusValue(options.AppExecutableName ?? "")}'");
            stopped.Set();
            return;
        }

        var targetDevice = HapticsFrameOutput ? null : SelectHapticsMirrorTargetEndpoint(enumerator);
        var targetName = HapticsMirrorTargetName(targetDevice);
        var targetFormat = TryStartHapticsMirrorOutput(targetDevice, targetName);
        if (targetFormat is null)
        {
            return;
        }

        var captureFormat = new WaveFormat(44100, 16, 2);
        try
        {
            directCaptureAudioClient = ProcessLoopbackAudioClient.Activate(
                selectedSession.ProcessId,
                includeProcessTree: true,
                TimeSpan.FromMilliseconds(AudioConstants.ProcessLoopbackActivationTimeoutMilliseconds));
            var bufferDuration = AudioConstants.ProcessLoopbackBufferMilliseconds * 10000L;
            directCaptureAudioClient.Initialize(
                AudioClientShareMode.Shared,
                AudioClientStreamFlags.Loopback | AudioClientStreamFlags.EventCallback,
                bufferDuration,
                0,
                captureFormat,
                Guid.Empty
            );
            directCaptureEvent = new EventWaitHandle(false, EventResetMode.AutoReset);
            directCaptureAudioClient.SetEventHandle(directCaptureEvent.SafeWaitHandle.DangerousGetHandle());
            directCaptureClient = directCaptureAudioClient.AudioCaptureClient;

            Console.Error.WriteLine(
                $"status: audio-capture-format source=app-session device='{EscapeStatusValue(selectedSession.DisplayName)}' processId={selectedSession.ProcessId} processPath='{EscapeStatusValue(selectedSession.ProcessPath ?? "")}' target='{EscapeStatusValue(targetName)}' sampleRate={captureFormat.SampleRate} channels={captureFormat.Channels} bits={captureFormat.BitsPerSample} encoding={captureFormat.Encoding} targetRate={targetFormat.SampleRate} targetChannels={targetFormat.Channels} targetBits={targetFormat.BitsPerSample} targetEncoding={targetFormat.Encoding} bufferMs={AudioConstants.ProcessLoopbackBufferMilliseconds} engineBufferFrames={directCaptureAudioClient.BufferSize}");
            StartRawCaptureDump(captureFormat);

            pcmEncoderTask = Task.Run(ProcessQueuedPcm);
            directCaptureTask = Task.Run(() => RunDirectRawPcmCapture(captureFormat));
            appSessionMonitorTask = Task.Run(() => MonitorAppSessionProcess(selectedSession.ProcessId));
            directCaptureAudioClient.Start();
            Console.Error.WriteLine("status: recording-started");
        }
        catch (COMException error)
        {
            if (!WriteWasapiStartFailure(error, selectedSession.DisplayName))
            {
                Console.Error.WriteLine(
                    $"status: capture-unavailable reason=app-loopback-unavailable hr={FormatHResult(error.HResult)} processId={selectedSession.ProcessId} device='{EscapeStatusValue(selectedSession.DisplayName)}'");
            }
            stopped.Set();
        }
        catch (TimeoutException error)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=app-loopback-timeout processId={selectedSession.ProcessId} error='{EscapeStatusValue(error.Message)}'");
            stopped.Set();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=app-loopback-unavailable processId={selectedSession.ProcessId} error='{EscapeStatusValue(error.Message)}'");
            stopped.Set();
        }
    }

    private MMDevice SelectHapticsMirrorTargetEndpoint(MMDeviceEnumerator enumerator)
    {
        return !string.IsNullOrWhiteSpace(options.BridgePersona)
            ? EndpointManager.SelectRenderBridgeEndpointForPersona(enumerator, options.BridgePersona)
            : EndpointManager.SelectRenderEndpoint(enumerator, options.DeviceName ?? "DS5 Bridge");
    }

    private string HapticsMirrorTargetName(MMDevice? targetDevice)
    {
        if (targetDevice is not null)
        {
            return targetDevice.FriendlyName;
        }

        return !string.IsNullOrWhiteSpace(options.BridgePersona)
            ? $"persona {options.BridgePersona}"
            : options.DeviceName ?? "frame haptics";
    }

    private WaveFormat? TryStartHapticsMirrorOutput(MMDevice? targetDevice, string targetName)
    {
        if (HapticsFrameOutput)
        {
            hapticsMirrorFormat = null;
            hapticsMirrorScratch = Array.Empty<byte>();
            hapticsMirrorScratchLength = 0;
            hapticsMirrorBuffer = null;
            hapticsMirrorOutput = null;
            Console.Error.WriteLine(
                $"status: haptics-frame-output target='{EscapeStatusValue(targetName)}'");
            return new WaveFormat(AudioConstants.TargetSampleRate, 16, 4);
        }
        if (targetDevice is null)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=target-unavailable device='{EscapeStatusValue(targetName)}'");
            stopped.Set();
            return null;
        }

        var targetFormat = targetDevice.AudioClient.MixFormat;
        if (targetFormat.Channels < 4)
        {
            Console.Error.WriteLine(
                $"status: capture-unavailable reason=unsupported-format device='{EscapeStatusValue(targetName)}' targetChannels={targetFormat.Channels}");
            stopped.Set();
            return null;
        }

        hapticsMirrorFormat = targetFormat;
        hapticsMirrorScratch = new byte[Math.Max(targetFormat.BlockAlign, targetFormat.BlockAlign * AudioConstants.PicoInputBlockFrames)];
        hapticsMirrorScratchLength = 0;
        hapticsMirrorBuffer = new BufferedWaveProvider(targetFormat)
        {
            BufferDuration = TimeSpan.FromMilliseconds(80),
            DiscardOnBufferOverflow = true,
            ReadFully = true
        };
        hapticsMirrorOutput = new WasapiOut(targetDevice, AudioClientShareMode.Shared, false, 20);
        hapticsMirrorOutput.Init(hapticsMirrorBuffer);
        hapticsMirrorOutput.Play();
        return targetFormat;
    }

    private void MonitorAppSessionProcess(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            process.WaitForExit();
            if (!stopped.IsSet)
            {
                Console.Error.WriteLine($"status: route-changed reason=app-session-exited processId={processId}");
                Stop();
            }
        }
        catch (ArgumentException)
        {
            if (!stopped.IsSet)
            {
                Console.Error.WriteLine($"status: route-changed reason=app-session-exited processId={processId}");
                Stop();
            }
        }
        catch (Exception error)
        {
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine(
                    $"status: app-session-monitor-unavailable processId={processId} error='{EscapeStatusValue(error.Message)}'");
            }
        }
    }

    private void RegisterDefaultRenderNotification(MMDeviceEnumerator enumerator)
    {
        UnregisterEndpointNotifications();
        endpointNotificationClient = new DefaultRenderNotificationClient(() =>
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                Console.Error.WriteLine("status: route-changed reason=default-render-changed");
                Stop();
            });
        });
        enumerator.RegisterEndpointNotificationCallback(endpointNotificationClient);
    }

    private void UnregisterEndpointNotifications()
    {
        var client = endpointNotificationClient;
        endpointNotificationClient = null;
        if (client is null || enumerator is null)
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

    private static void SetWasapiBufferMilliseconds(WasapiCapture capture, int milliseconds)
    {
        var field = typeof(WasapiCapture).GetField("audioBufferMillisecondsLength", BindingFlags.Instance | BindingFlags.NonPublic);
        field?.SetValue(capture, milliseconds);
    }

    private void StartDirectRawPcmCapture(MMDevice device)
    {
        directCaptureAudioClient = device.AudioClient;
        var format = directCaptureAudioClient.MixFormat;
        var bufferDuration = AudioConstants.RawPcmCaptureBufferMilliseconds * 10000L;
        directCaptureAudioClient.Initialize(
            AudioClientShareMode.Shared,
            AudioClientStreamFlags.EventCallback,
            bufferDuration,
            0,
            format,
            Guid.Empty
        );

        directCaptureEvent = new EventWaitHandle(false, EventResetMode.AutoReset);
        directCaptureAudioClient.SetEventHandle(directCaptureEvent.SafeWaitHandle.DangerousGetHandle());
        directCaptureClient = directCaptureAudioClient.AudioCaptureClient;

        Console.Error.WriteLine(
            $"status: audio-capture-format source={options.SourceArgument} device='{device.FriendlyName}' sampleRate={format.SampleRate} channels={format.Channels} bits={format.BitsPerSample} encoding={format.Encoding} bufferMs={AudioConstants.RawPcmCaptureBufferMilliseconds} engineBufferFrames={directCaptureAudioClient.BufferSize}");
        StartRawCaptureDump(format);

        pcmEncoderTask = Task.Run(ProcessQueuedPcm);
        directCaptureTask = Task.Run(() => RunDirectRawPcmCapture(format));
        directCaptureAudioClient.Start();
    }

    private void StartBulkPcmCapture()
    {
        var format = new WaveFormat(
            WinUsbPcmTransport.SampleRate,
            WinUsbPcmTransport.BytesPerSample * 8,
            WinUsbPcmTransport.Channels);
        bulkPcmTransport = WinUsbPcmTransport.Open();
        Console.Error.WriteLine(
            $"status: audio-capture-format source={options.SourceArgument} device='{WinUsbPcmTransport.FriendlyName}' sampleRate={format.SampleRate} channels={format.Channels} bits={format.BitsPerSample} encoding={format.Encoding} transport={bulkPcmTransport.TransportName} {bulkPcmTransport.TransportDetails}");
        StartRawCaptureDump(format);

        pcmEncoderTask = Task.Run(ProcessQueuedPcm);
        bulkPcmTask = Task.Run(() => RunBulkPcmCapture(format));
    }

    private void RunBulkPcmCapture(WaveFormat format)
    {
        try
        {
            TrySetThreadPriority(ThreadPriority.Highest);
            using var mmcss = MmcssRegistration.TryRegister("Pro Audio", "capture", MmcssThreadPriority.High);
            var transport = bulkPcmTransport ?? throw new InvalidOperationException("Bulk PCM transport was not initialized.");
            var parser = new BulkPcmFrameParser();
            var readBuffer = new byte[WinUsbPcmTransport.ReadBufferBytes];
            while (!stopped.IsSet)
            {
                List<BulkPcmFrame> receivedFrames;
                var bytesRead = 0;
                if (transport.IsIsochronous)
                {
                    receivedFrames = transport.ReadIsoFrames();
                    foreach (var frame in receivedFrames)
                    {
                        bytesRead += frame.Payload.Length;
                    }
                }
                else
                {
                    bytesRead = transport.Read(readBuffer);
                    if (bytesRead <= 0)
                    {
                        continue;
                    }
                    receivedFrames = parser.Push(readBuffer, bytesRead);
                }
                if (receivedFrames.Count == 0)
                {
                    continue;
                }

                Interlocked.Increment(ref bulkPcmReadCalls);
                Interlocked.Add(ref bulkPcmReadBytes, bytesRead);

                var packets = 0;
                var frames = 0;
                var bytes = 0;
                foreach (var frame in receivedFrames)
                {
                    var insertedPackets = EnqueueBulkPcmFrame(frame, format);
                    packets += 1 + insertedPackets;
                    frames += frame.Frames * (1 + insertedPackets);
                    bytes += frame.Payload.Length * (1 + insertedPackets);
                }
                NoteCaptureWake(packets, frames, bytes);
            }
        }
        catch (Exception error) when (stopped.IsSet && (error is ObjectDisposedException || error is IOException))
        {
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: bulk PCM capture stopped: {error.GetType().Name}: {error.Message}");
            stopped.Set();
        }
    }

    private int EnqueueBulkPcmFrame(BulkPcmFrame frame, WaveFormat format)
    {
        var insertedPackets = 0;
        if (bulkPcmSequenceValid && frame.Sequence != bulkPcmExpectedSequence)
        {
            var missingPackets = unchecked((ushort)(frame.Sequence - bulkPcmExpectedSequence));
            Interlocked.Increment(ref bulkPcmSequenceGaps);
            Interlocked.Increment(ref captureDiscontinuityPackets);
            LogHelperEvent("bulk-pcm-gap", $"expected={bulkPcmExpectedSequence} actual={frame.Sequence} missing={missingPackets}");
            if (missingPackets <= AudioConstants.BulkPcmMaxGapFillPackets)
            {
                var fillPayload = new byte[frame.Payload.Length];
                for (var index = 0; index < missingPackets; index++)
                {
                    EnqueuePcmChunk(new PcmCaptureChunk(
                        ClonePayload(fillPayload, frame.Payload.Length),
                        frame.Payload.Length,
                        format,
                        frame.Frames,
                        AudioClientBufferFlags.Silent));
                    insertedPackets++;
                }
                Interlocked.Add(ref bulkPcmGapFillPackets, insertedPackets);
            }
        }

        bulkPcmSequenceValid = true;
        bulkPcmExpectedSequence = unchecked((ushort)(frame.Sequence + 1));
        bulkPcmLastPayload = ClonePayload(frame.Payload, frame.Payload.Length);
        Interlocked.Increment(ref bulkPcmParsedPackets);
        if (frame.Silent)
        {
            Interlocked.Increment(ref captureSilentPackets);
        }
        EnqueuePcmChunk(new PcmCaptureChunk(
            frame.Payload,
            frame.Payload.Length,
            format,
            frame.Frames,
            frame.Silent ? AudioClientBufferFlags.Silent : AudioClientBufferFlags.None));
        return insertedPackets;
    }

    private static byte[] ClonePayload(byte[] payload, int byteCount)
    {
        var clone = new byte[byteCount];
        Buffer.BlockCopy(payload, 0, clone, 0, Math.Min(payload.Length, byteCount));
        return clone;
    }

    private void RunDirectRawPcmCapture(WaveFormat format)
    {
        try
        {
            TrySetThreadPriority(ThreadPriority.Highest);
            using var mmcss = MmcssRegistration.TryRegister("Pro Audio", "capture", MmcssThreadPriority.High);
            var captureClient = directCaptureClient;
            var wakeEvent = directCaptureEvent;
            if (captureClient is null || wakeEvent is null)
            {
                throw new InvalidOperationException("Raw PCM capture was not initialized.");
            }

            var waitHandles = new WaitHandle[] { stopped.WaitHandle, wakeEvent };
            while (!stopped.IsSet)
            {
                var signaled = WaitHandle.WaitAny(waitHandles, 1000);
                if (signaled == 0)
                {
                    break;
                }
                if (signaled == WaitHandle.WaitTimeout)
                {
                    continue;
                }

                DrainDirectRawPcmPackets(captureClient, format);
            }
        }
        catch (COMException error)
        {
            WriteWasapiStopFailure(error);
            stopped.Set();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: direct raw PCM capture stopped: {error.GetType().Name}: {error.Message}");
            stopped.Set();
        }
    }

    private void DrainDirectRawPcmPackets(AudioCaptureClient captureClient, WaveFormat format)
    {
        var packets = 0;
        var frames = 0;
        var bytes = 0;
        while (!stopped.IsSet)
        {
            var nextPacketFrames = captureClient.GetNextPacketSize();
            if (nextPacketFrames <= 0)
            {
                break;
            }

            var buffer = captureClient.GetBuffer(
                out var framesAvailable,
                out var flags,
                out _,
                out _
            );
            try
            {
                if (framesAvailable <= 0)
                {
                    continue;
                }

                var byteCount = checked(framesAvailable * format.BlockAlign);
                var chunkBuffer = new byte[byteCount];
                if ((flags & AudioClientBufferFlags.Silent) != AudioClientBufferFlags.Silent && buffer != IntPtr.Zero)
                {
                    Marshal.Copy(buffer, chunkBuffer, 0, byteCount);
                }

                if ((flags & AudioClientBufferFlags.DataDiscontinuity) == AudioClientBufferFlags.DataDiscontinuity)
                {
                    Interlocked.Increment(ref captureDiscontinuityPackets);
                }
                if ((flags & AudioClientBufferFlags.Silent) == AudioClientBufferFlags.Silent)
                {
                    Interlocked.Increment(ref captureSilentPackets);
                }

                packets++;
                frames += framesAvailable;
                bytes += byteCount;
                EnqueuePcmChunk(new PcmCaptureChunk(chunkBuffer, byteCount, format, framesAvailable, flags));
            }
            finally
            {
                captureClient.ReleaseBuffer(framesAvailable);
            }
        }

        NoteCaptureWake(packets, frames, bytes);
    }

    private void EnqueuePcmChunk(PcmCaptureChunk chunk)
    {
        while (!pcmQueue.IsAddingCompleted && !pcmQueue.TryAdd(chunk))
        {
            if (!pcmQueue.TryTake(out _))
            {
                break;
            }
            Interlocked.Increment(ref pcmDroppedChunks);
        }

        Interlocked.Increment(ref pcmQueuedChunks);
        UpdateMax(ref pcmQueueMaxChunks, pcmQueue.Count);
    }

    private void ProcessQueuedPcm()
    {
        try
        {
            TrySetThreadPriority(ThreadPriority.AboveNormal);
            using var mmcss = MmcssRegistration.TryRegister("Audio", "encoder", MmcssThreadPriority.High);
            foreach (var chunk in pcmQueue.GetConsumingEnumerable())
            {
                var dumpComplete = WriteRawCaptureDump(chunk.Buffer, chunk.ByteCount, chunk.Format);
                if (options.CaptureDumpOnly)
                {
                    if (dumpComplete)
                    {
                        _ = Task.Run(Stop);
                    }
                    continue;
                }

                ProcessPcm(chunk.Buffer, chunk.ByteCount, chunk.Format);
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: PCM encoder stopped: {error.GetType().Name}: {error.Message}");
            stopped.Set();
        }
    }

    private static bool WriteWasapiStartFailure(COMException error, string deviceName)
    {
        var reason = WasapiUnavailableReason(error.HResult);
        if (reason is null)
        {
            return false;
        }

        Console.Error.WriteLine(
            $"status: capture-unavailable reason={reason} hr={FormatHResult(error.HResult)} device='{deviceName}'");
        return true;
    }

    private static void WriteWasapiStopFailure(Exception? error)
    {
        if (error is null)
        {
            return;
        }

        if (error is COMException comError)
        {
            var reason = WasapiUnavailableReason(comError.HResult);
            if (reason is not null)
            {
                Console.Error.WriteLine(
                    $"status: capture-unavailable reason={reason} hr={FormatHResult(comError.HResult)}");
                return;
            }
        }

        Console.Error.WriteLine($"error: capture stopped: {error.Message}");
    }

    private static string? WasapiUnavailableReason(int hresult)
    {
        return hresult switch
        {
            AudioConstants.AudclntDeviceInUse => "device-in-use",
            AudioConstants.AudclntDeviceInvalidated => "device-invalidated",
            AudioConstants.AudclntUnsupportedFormat => "unsupported-format",
            _ => null
        };
    }

    private static string FormatHResult(int hresult)
    {
        return $"0x{unchecked((uint)hresult):X8}";
    }

    private static string EscapeStatusValue(string value)
    {
        return value.Replace("\\", "\\\\").Replace("'", "\\'");
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs eventArgs)
    {
        var format = capture?.WaveFormat;
        if (format is null || eventArgs.BytesRecorded <= 0)
        {
            return;
        }

        NoteCaptureCallback(eventArgs.BytesRecorded, format);
        lock (sync)
        {
            var dumpComplete = WriteRawCaptureDump(eventArgs.Buffer, eventArgs.BytesRecorded, format);
            if (options.CaptureDumpOnly)
            {
                if (dumpComplete)
                {
                    _ = Task.Run(Stop);
                }
                return;
            }
            ProcessPcm(eventArgs.Buffer, eventArgs.BytesRecorded, format);
        }
    }

    private void StartRawCaptureDump(WaveFormat format)
    {
        if (string.IsNullOrWhiteSpace(options.RawCaptureDumpPath))
        {
            return;
        }

        try
        {
            var fullPath = Path.GetFullPath(options.RawCaptureDumpPath);
            var directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            rawCaptureDump = new WaveFileWriter(fullPath, format);
            rawCaptureDumpFrameLimit = options.RawCaptureDumpSeconds <= 0
                ? 0
                : (long)options.RawCaptureDumpSeconds * format.SampleRate;
            Console.Error.WriteLine(
                $"status: raw-capture-dump-started path='{fullPath}' seconds={options.RawCaptureDumpSeconds} dumpOnly={(options.CaptureDumpOnly ? 1 : 0)}");
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(
                $"status: raw-capture-dump-unavailable path='{options.RawCaptureDumpPath}' error='{EscapeStatusValue(error.Message)}'");
        }
    }

    private bool WriteRawCaptureDump(byte[] buffer, int byteCount, WaveFormat format)
    {
        if (rawCaptureDump is null || rawCaptureDumpLimitLogged)
        {
            return rawCaptureDumpLimitLogged;
        }

        var bytesToWrite = byteCount;
        var blockAlign = Math.Max(1, format.BlockAlign);
        if (rawCaptureDumpFrameLimit > 0)
        {
            var remainingFrames = rawCaptureDumpFrameLimit - rawCaptureDumpFramesWritten;
            if (remainingFrames <= 0)
            {
                rawCaptureDumpLimitLogged = true;
                Console.Error.WriteLine($"status: raw-capture-dump-limit-reached frames={rawCaptureDumpFramesWritten}");
                return true;
            }
            bytesToWrite = Math.Min(byteCount, checked((int)Math.Min(int.MaxValue, remainingFrames * blockAlign)));
        }

        if (bytesToWrite > 0)
        {
            rawCaptureDump.Write(buffer, 0, bytesToWrite);
            rawCaptureDumpFramesWritten += bytesToWrite / blockAlign;
        }

        if (rawCaptureDumpFrameLimit > 0 && rawCaptureDumpFramesWritten >= rawCaptureDumpFrameLimit)
        {
            rawCaptureDumpLimitLogged = true;
            rawCaptureDump.Flush();
            Console.Error.WriteLine($"status: raw-capture-dump-limit-reached frames={rawCaptureDumpFramesWritten}");
            return true;
        }

        return false;
    }

    private void OnMicDataAvailable(object? sender, WaveInEventArgs eventArgs)
    {
        var format = micCapture?.WaveFormat;
        if (format is null || eventArgs.BytesRecorded <= 0)
        {
            return;
        }

        var channels = Math.Max(1, format.Channels);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = Math.Max(1, channels * bytesPerSample);
        var frameCount = eventArgs.BytesRecorded / frameBytes;
        if (AudioConstants.DiagnosticsEnabled)
        {
            Interlocked.Increment(ref micCallbacks);
            Interlocked.Add(ref micCapturedFrames, frameCount);

            var peak = 0;
            for (var frame = 0; frame < frameCount; frame++)
            {
                var offset = frame * frameBytes;
                for (var channel = 0; channel < channels; channel++)
                {
                    var sample = Math.Abs(ReadSample(eventArgs.Buffer, eventArgs.BytesRecorded, offset + channel * bytesPerSample, format));
                    peak = Math.Max(peak, (int)Math.Round(sample * 1000));
                }
            }
            if (peak > micPeakPermille)
            {
                Interlocked.Exchange(ref micPeakPermille, peak);
            }
        }
    }

    private void ProcessPcm(byte[] buffer, int byteCount, WaveFormat format)
    {
        if (options.HapticsOnly)
        {
            ProcessHapticsOnlyPcm(buffer, byteCount, format);
            return;
        }

        var channels = Math.Max(1, format.Channels);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = channels * bytesPerSample;
        var frameCount = byteCount / frameBytes;
        var outputPerInput = AudioConstants.TargetSampleRate / (double)format.SampleRate;
        if (AudioConstants.DiagnosticsEnabled)
        {
            capturedCallbacks++;
            capturedFrames += frameCount;
        }

        for (var frame = 0; frame < frameCount; frame++)
        {
            var offset = frame * frameBytes;
            var left = ReadSample(buffer, byteCount, offset, format);
            var right = channels > 1 ? ReadSample(buffer, byteCount, offset + bytesPerSample, format) : left;
            var hapticLeft = channels > 2 ? ReadSample(buffer, byteCount, offset + bytesPerSample * 2, format) : 0;
            var hapticRight = channels > 3 ? ReadSample(buffer, byteCount, offset + bytesPerSample * 3, format) : hapticLeft;
            if (AudioConstants.DiagnosticsEnabled)
            {
                var peak = (int)Math.Round(Math.Max(Math.Abs(left), Math.Abs(right)) * 1000);
                if (peak > peakSamplePermille)
                {
                    Interlocked.Exchange(ref peakSamplePermille, peak);
                }
            }

            resampleCredit += outputPerInput;
            while (resampleCredit >= 1)
            {
                PushPicoInputSample(left, right, hapticLeft, hapticRight, channels >= 4);
                resampleCredit -= 1;
            }
        }
    }

    private void NoteCaptureCallback(int bytesRecorded, WaveFormat format)
    {
        var channels = Math.Max(1, format.Channels);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = Math.Max(1, channels * bytesPerSample);
        var frameCount = Math.Max(0, bytesRecorded / frameBytes);

        var nowTicks = Stopwatch.GetTimestamp();
        var previousTicks = Interlocked.Exchange(ref lastCaptureCallbackTicks, nowTicks);
        if (previousTicks == 0)
        {
            return;
        }

        var gapUs = (nowTicks - previousTicks) * 1000000 / Stopwatch.Frequency;
        if (!AudioConstants.DiagnosticsEnabled)
        {
            return;
        }

        UpdateMax(ref captureCallbackGapMaxUs, gapUs);
        if (gapUs > AudioConstants.CaptureCallbackGapSoftWarningUs)
        {
            Interlocked.Increment(ref captureCallbackGapOver12msEvents);
        }
        if (gapUs > AudioConstants.CaptureCallbackGapMediumWarningUs)
        {
            Interlocked.Increment(ref captureCallbackGapOver16msEvents);
        }
        if (gapUs <= AudioConstants.CaptureCallbackGapWarningUs)
        {
            return;
        }

        Interlocked.Increment(ref captureCallbackGapEvents);
        LogHelperEvent("capture-gap", $"gapUs={gapUs} bytes={bytesRecorded} frames={frameCount}");
    }

    private void NoteCaptureWake(int packets, int frames, int bytes)
    {
        if (packets <= 0 && frames <= 0)
        {
            return;
        }

        Interlocked.Increment(ref captureWakeCount);
        Interlocked.Add(ref capturePacketsDrained, packets);
        Interlocked.Add(ref captureFramesDrained, frames);
        UpdateMax(ref captureMaxPacketsPerWake, packets);

        var nowTicks = Stopwatch.GetTimestamp();
        var previousTicks = Interlocked.Exchange(ref lastCaptureCallbackTicks, nowTicks);
        if (previousTicks == 0)
        {
            return;
        }

        var gapUs = (nowTicks - previousTicks) * 1000000 / Stopwatch.Frequency;
        if (AudioConstants.DiagnosticsEnabled)
        {
            UpdateMax(ref captureCallbackGapMaxUs, gapUs);
            if (gapUs > AudioConstants.CaptureCallbackGapSoftWarningUs)
            {
                Interlocked.Increment(ref captureCallbackGapOver12msEvents);
            }
            if (gapUs > AudioConstants.CaptureCallbackGapMediumWarningUs)
            {
                Interlocked.Increment(ref captureCallbackGapOver16msEvents);
            }
            if (gapUs > AudioConstants.CaptureCallbackGapWarningUs)
            {
                Interlocked.Increment(ref captureCallbackGapEvents);
                LogHelperEvent("capture-gap", $"gapUs={gapUs} bytes={bytes} frames={frames} packets={packets}");
            }
        }
    }

    private void ProcessHapticsOnlyPcm(byte[] buffer, int byteCount, WaveFormat format)
    {
        if (HapticsFrameOutput)
        {
            ProcessHapticsOnlyFramePcm(buffer, byteCount, format);
            return;
        }

        var targetFormat = hapticsMirrorFormat;
        if (targetFormat is null || hapticsMirrorBuffer is null)
        {
            return;
        }

        var channels = Math.Max(1, format.Channels);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = channels * bytesPerSample;
        var frameCount = byteCount / frameBytes;
        var outputPerInput = targetFormat.SampleRate / (double)format.SampleRate;
        if (AudioConstants.DiagnosticsEnabled)
        {
            capturedCallbacks++;
            capturedFrames += frameCount;
        }

        for (var frame = 0; frame < frameCount; frame++)
        {
            var offset = frame * frameBytes;
            var left = ReadSample(buffer, byteCount, offset, format);
            var right = channels > 1 ? ReadSample(buffer, byteCount, offset + bytesPerSample, format) : left;
            if (AudioConstants.DiagnosticsEnabled)
            {
                var peak = (int)Math.Round(Math.Max(Math.Abs(left), Math.Abs(right)) * 1000);
                if (peak > peakSamplePermille)
                {
                    Interlocked.Exchange(ref peakSamplePermille, peak);
                }
            }

            resampleCredit += outputPerInput;
            while (resampleCredit >= 1)
            {
                var processed = ProcessReactiveHapticsSample(left, right);
                AppendHapticsMirrorFrame(processed.Left, processed.Right);
                resampleCredit -= 1;
            }
        }
        FlushHapticsMirrorScratch();
    }

    private void ProcessHapticsOnlyFramePcm(byte[] buffer, int byteCount, WaveFormat format)
    {
        var channels = Math.Max(1, format.Channels);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var frameBytes = channels * bytesPerSample;
        var frameCount = byteCount / frameBytes;
        var outputPerInput = AudioConstants.TargetSampleRate / (double)format.SampleRate;
        if (AudioConstants.DiagnosticsEnabled)
        {
            capturedCallbacks++;
            capturedFrames += frameCount;
        }

        for (var frame = 0; frame < frameCount; frame++)
        {
            var offset = frame * frameBytes;
            var left = ReadSample(buffer, byteCount, offset, format);
            var right = channels > 1 ? ReadSample(buffer, byteCount, offset + bytesPerSample, format) : left;
            if (AudioConstants.DiagnosticsEnabled)
            {
                var peak = (int)Math.Round(Math.Max(Math.Abs(left), Math.Abs(right)) * 1000);
                if (peak > peakSamplePermille)
                {
                    Interlocked.Exchange(ref peakSamplePermille, peak);
                }
            }

            resampleCredit += outputPerInput;
            while (resampleCredit >= 1)
            {
                var processed = ProcessReactiveHapticsSample(left, right);
                PushPicoInputSample(0, 0, processed.Left, processed.Right, true);
                resampleCredit -= 1;
            }
        }
    }

    private static float ReadSample(byte[] buffer, int byteCount, int offset, WaveFormat format)
    {
        if (offset < 0 || offset >= byteCount)
        {
            return 0;
        }

        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
        {
            return Math.Clamp(BitConverter.ToSingle(buffer, offset), -1, 1);
        }

        return format.BitsPerSample switch
        {
            16 when offset + 1 < byteCount => BinaryPrimitives.ReadInt16LittleEndian(buffer.AsSpan(offset, 2)) / 32768f,
            24 when offset + 2 < byteCount => ReadInt24(buffer, offset) / 8388608f,
            32 when offset + 3 < byteCount && format.Encoding == WaveFormatEncoding.Pcm =>
                BinaryPrimitives.ReadInt32LittleEndian(buffer.AsSpan(offset, 4)) / 2147483648f,
            32 when offset + 3 < byteCount => Math.Clamp(BitConverter.ToSingle(buffer, offset), -1, 1),
            _ => 0
        };
    }

    private static int ReadInt24(byte[] buffer, int offset)
    {
        var value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
        if ((value & 0x800000) != 0)
        {
            value |= unchecked((int)0xff000000);
        }
        return value;
    }

    private static void WriteInt24(byte[] buffer, int offset, int value)
    {
        value = Math.Clamp(value, -8388608, 8388607);
        buffer[offset] = (byte)(value & 0xff);
        buffer[offset + 1] = (byte)((value >> 8) & 0xff);
        buffer[offset + 2] = (byte)((value >> 16) & 0xff);
    }

    private void PushPicoInputSample(float left, float right, float hapticLeft, float hapticRight, bool hasHaptics)
    {
        speakerBlock[picoBlockFrameIndex * 2] = left;
        speakerBlock[picoBlockFrameIndex * 2 + 1] = right;
        hapticLeftBlock[picoBlockFrameIndex] = hapticLeft;
        hapticRightBlock[picoBlockFrameIndex] = hapticRight;
        picoBlockHasHaptics |= hasHaptics;

        picoBlockFrameIndex++;
        if (picoBlockFrameIndex < AudioConstants.PicoInputBlockFrames)
        {
            return;
        }

        EmitReport(picoBlockHasHaptics);
        picoBlockFrameIndex = 0;
        picoBlockHasHaptics = false;
    }

    private (float Left, float Right) ProcessReactiveHapticsSample(float left, float right)
    {
        var coeff = HapticsFilterCoeff(Volatile.Read(ref hapticsBassFocus));
        hapticsFilterLeft += (left - hapticsFilterLeft) * coeff;
        hapticsFilterRight += (right - hapticsFilterRight) * coeff;
        var attack = Volatile.Read(ref hapticsAttack);
        var release = Volatile.Read(ref hapticsRelease);
        hapticsEnvelopeLeft = FollowHapticsEnvelope(hapticsEnvelopeLeft, hapticsFilterLeft, attack, release);
        hapticsEnvelopeRight = FollowHapticsEnvelope(hapticsEnvelopeRight, hapticsFilterRight, attack, release);

        var peak = Math.Max(hapticsEnvelopeLeft, hapticsEnvelopeRight);
        var gateTarget = peak > AudioConstants.HapticsGateThreshold ? 1.0f : 0.0f;
        var gateRate = gateTarget > hapticsGate
            ? AudioConstants.HapticsGateOpenRate
            : AudioConstants.HapticsGateCloseRate;
        hapticsGate += (gateTarget - hapticsGate) * gateRate;
        hapticsOutputRamp = Math.Min(1.0f, hapticsOutputRamp + AudioConstants.HapticsOutputRampStep);

        var gain = (Volatile.Read(ref hapticsGainPercent) / 100.0f)
            * HapticsFocusGain(Volatile.Read(ref hapticsBassFocus))
            * hapticsGate
            * hapticsOutputRamp;
        var response = Volatile.Read(ref hapticsResponse);
        gain *= HapticsResponseGain(response);
        var punch = HapticsResponsePunch(response);
        return (
            SoftClipUnit(hapticsFilterLeft * gain * HapticsEnvelopePunch(hapticsEnvelopeLeft, punch)),
            SoftClipUnit(hapticsFilterRight * gain * HapticsEnvelopePunch(hapticsEnvelopeRight, punch))
        );
    }

    private void AppendHapticsMirrorFrame(float hapticLeft, float hapticRight)
    {
        var format = hapticsMirrorFormat;
        if (format is null)
        {
            return;
        }

        var blockAlign = Math.Max(1, format.BlockAlign);
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        if (hapticsMirrorScratchLength + blockAlign > hapticsMirrorScratch.Length)
        {
            FlushHapticsMirrorScratch();
        }

        if (hapticsMirrorScratchLength + blockAlign > hapticsMirrorScratch.Length)
        {
            hapticsMirrorScratch = new byte[Math.Max(blockAlign, hapticsMirrorScratch.Length * 2)];
        }

        Array.Clear(hapticsMirrorScratch, hapticsMirrorScratchLength, blockAlign);
        var frameOffset = hapticsMirrorScratchLength;
        WriteSample(hapticsMirrorScratch, frameOffset + bytesPerSample * 2, format, hapticLeft);
        WriteSample(hapticsMirrorScratch, frameOffset + bytesPerSample * 3, format, hapticRight);
        hapticsMirrorScratchLength += blockAlign;
    }

    private void FlushHapticsMirrorScratch()
    {
        if (hapticsMirrorScratchLength <= 0 || hapticsMirrorBuffer is null)
        {
            return;
        }

        hapticsMirrorBuffer.AddSamples(hapticsMirrorScratch, 0, hapticsMirrorScratchLength);
        hapticsMirrorScratchLength = 0;
    }

    private static void WriteSample(byte[] buffer, int offset, WaveFormat format, float sample)
    {
        if (offset < 0 || offset >= buffer.Length)
        {
            return;
        }

        sample = Math.Clamp(sample, -1.0f, 1.0f);
        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
        {
            _ = BitConverter.TryWriteBytes(buffer.AsSpan(offset, Math.Min(4, buffer.Length - offset)), sample);
            return;
        }

        switch (format.BitsPerSample)
        {
            case 16 when offset + 1 < buffer.Length:
                BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(offset, 2), FloatToInt16(sample));
                break;
            case 24 when offset + 2 < buffer.Length:
                WriteInt24(buffer, offset, (int)Math.Round(sample * 8388607.0f));
                break;
            case 32 when offset + 3 < buffer.Length && format.Encoding == WaveFormatEncoding.Pcm:
                BinaryPrimitives.WriteInt32LittleEndian(
                    buffer.AsSpan(offset, 4),
                    (int)Math.Round(sample * 2147483647.0f)
                );
                break;
            case 32 when offset + 3 < buffer.Length:
                _ = BitConverter.TryWriteBytes(buffer.AsSpan(offset, 4), sample);
                break;
        }
    }

    private void EmitReport(bool hasHaptics)
    {
        ResampleSpeakerBlock();
        var encodedBytes = encoder.Encode(speakerPcm, 0, AudioConstants.OpusFrameSamples, opusScratch, 0, AudioConstants.OpusPacketBytes);
        if (AudioConstants.DiagnosticsEnabled)
        {
            encodedReports++;
        }
        BuildReport(report, opusScratch, encodedBytes, hasHaptics, hapticLeftBlock, hapticRightBlock);
        var frame = new byte[AudioConstants.CompactFrameBytes];
        Buffer.BlockCopy(report, 0, frame, 0, frame.Length);
        frameDump?.WriteFrame(frame);
        while (reportQueue.Count >= AudioConstants.MaxBufferedReports)
        {
            if (!reportQueue.TryTake(out _))
            {
                break;
            }
            if (AudioConstants.DiagnosticsEnabled)
            {
                droppedReports++;
            }
        }
        if (!reportQueue.TryAdd(frame))
        {
            _ = reportQueue.TryTake(out _);
            if (AudioConstants.DiagnosticsEnabled)
            {
                droppedReports++;
            }
            _ = reportQueue.TryAdd(frame);
        }
    }

    private void ResampleSpeakerBlock()
    {
        const double ratio = AudioConstants.PicoInputBlockFrames / (double)AudioConstants.OpusFrameSamples;
        var currentGainPermille = currentSpeakerGainPermille;
        var targetGainPermille = Volatile.Read(ref targetSpeakerGainPermille);
        for (var frame = 0; frame < AudioConstants.OpusFrameSamples; frame++)
        {
            var gainDelta = targetGainPermille - currentGainPermille;
            currentGainPermille += Math.Clamp(
                gainDelta,
                -AudioConstants.SpeakerGainRampStepPermille,
                AudioConstants.SpeakerGainRampStepPermille
            );
            var speakerGain = currentGainPermille / 1000f;
            var sourcePosition = (frame + 0.5) * ratio - 0.5;
            var sourceIndex = Math.Clamp((int)Math.Floor(sourcePosition), 0, AudioConstants.PicoInputBlockFrames - 1);
            var nextIndex = Math.Min(sourceIndex + 1, AudioConstants.PicoInputBlockFrames - 1);
            var fraction = Math.Clamp(sourcePosition - sourceIndex, 0, 1);
            var left = Lerp(speakerBlock[sourceIndex * 2], speakerBlock[nextIndex * 2], fraction);
            var right = Lerp(speakerBlock[sourceIndex * 2 + 1], speakerBlock[nextIndex * 2 + 1], fraction);
            speakerPcm[frame * 2] = FloatToInt16(left * speakerGain);
            speakerPcm[frame * 2 + 1] = FloatToInt16(right * speakerGain);
        }
        currentSpeakerGainPermille = currentGainPermille;
    }

    private void ProcessControlLine(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0)
        {
            return;
        }

        var parts = trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (
            parts.Length == 2
            && string.Equals(parts[0], "speaker-volume", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(parts[1], out var speakerVolumePercent)
        )
        {
            Volatile.Write(ref targetSpeakerGainPermille, VolumePercentToPermille(speakerVolumePercent));
            return;
        }

        if (
            parts.Length >= 4
            && string.Equals(parts[0], "haptics-config", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(parts[1], out var hapticsGain)
        )
        {
            Volatile.Write(ref hapticsGainPercent, Math.Clamp(hapticsGain, 0, 200));
            Volatile.Write(ref hapticsBassFocus, HelperOptions.ParseHapticsBassFocus(parts[2]));
            Volatile.Write(ref hapticsResponse, HelperOptions.ParseHapticsResponse(parts[3]));
            Volatile.Write(ref hapticsAttack, parts.Length > 4 ? HelperOptions.ParseHapticsAttack(parts[4]) : 1);
            Volatile.Write(ref hapticsRelease, parts.Length > 5 ? HelperOptions.ParseHapticsRelease(parts[5]) : 1);
            hapticsFilterLeft = 0;
            hapticsFilterRight = 0;
            hapticsEnvelopeLeft = 0;
            hapticsEnvelopeRight = 0;
            hapticsGate = 0;
            hapticsOutputRamp = 0;
            return;
        }
    }

    private static void BuildReport(
        byte[] destination,
        byte[] opus,
        int encodedBytes,
        bool hasHaptics,
        float[] hapticLeftBlock,
        float[] hapticRightBlock)
    {
        Array.Clear(destination);

        for (var bucket = 0; bucket < AudioConstants.HapticBuckets; bucket++)
        {
            var left = hasHaptics ? ResampleHapticBucket(hapticLeftBlock, bucket) : 0;
            var right = hasHaptics ? ResampleHapticBucket(hapticRightBlock, bucket) : 0;
            destination[bucket * 2] = FloatToInt8(left);
            destination[bucket * 2 + 1] = FloatToInt8(right);
        }

        Buffer.BlockCopy(opus, 0, destination, 64, Math.Min(encodedBytes, AudioConstants.OpusPacketBytes));
    }

    private static float ResampleHapticBucket(float[] samples, int bucket)
    {
        var sourcePosition = ((bucket + 0.5) * AudioConstants.PicoInputBlockFrames / AudioConstants.HapticBuckets) - 0.5;
        var sourceIndex = Math.Clamp((int)Math.Floor(sourcePosition), 0, AudioConstants.PicoInputBlockFrames - 1);
        var nextIndex = Math.Min(sourceIndex + 1, AudioConstants.PicoInputBlockFrames - 1);
        var fraction = Math.Clamp(sourcePosition - sourceIndex, 0, 1);
        return Lerp(samples[sourceIndex], samples[nextIndex], fraction);
    }

    private static float HapticsFilterCoeff(int bassFocus)
    {
        return bassFocus switch
        {
            0 => 0.01039f,
            2 => 0.03095f,
            3 => 0.05123f,
            _ => 0.02074f
        };
    }

    private static float FollowHapticsEnvelope(float current, float value, int attack, int release)
    {
        var target = Math.Abs(value);
        var rate = target > current
            ? HapticsEnvelopeAttackCoeff(attack)
            : HapticsEnvelopeReleaseCoeff(release);
        return current + ((target - current) * rate);
    }

    private static float HapticsEnvelopeAttackCoeff(int attack)
    {
        return attack switch
        {
            0 => 0.20f,
            2 => 0.65f,
            3 => 0.90f,
            _ => AudioConstants.HapticsEnvelopeAttack
        };
    }

    private static float HapticsEnvelopeReleaseCoeff(int release)
    {
        return release switch
        {
            0 => 0.055f,
            2 => 0.012f,
            3 => 0.006f,
            _ => AudioConstants.HapticsEnvelopeRelease
        };
    }

    private static float SoftClipUnit(float value)
    {
        var x = Math.Clamp(value, -4.0f, 4.0f);
        var x2 = x * x;
        return Math.Clamp((x * (27.0f + x2)) / (27.0f + (9.0f * x2)), -1.0f, 1.0f);
    }

    private static float HapticsFocusGain(int bassFocus)
    {
        return bassFocus switch
        {
            0 => 1.35f,
            2 => 1.12f,
            3 => 0.92f,
            _ => 1.0f
        };
    }

    private static float HapticsResponseGain(int response)
    {
        return response switch
        {
            0 => 0.68f,
            2 => 1.0f,
            _ => 1.0f
        };
    }

    private static float HapticsResponsePunch(int response)
    {
        return response switch
        {
            0 => 0.0f,
            2 => 3.0f,
            _ => 1.5f
        };
    }

    private static float HapticsEnvelopePunch(float envelope, float punch)
    {
        return 1.0f + (punch * Math.Clamp(envelope, 0.0f, 1.0f));
    }

    private static float Lerp(float a, float b, double amount)
    {
        return (float)(a + ((b - a) * amount));
    }

    private void WriteReports()
    {
        try
        {
            TrySetThreadPriority(ThreadPriority.Highest);
            using var mmcss = MmcssRegistration.TryRegister("Pro Audio", "writer", MmcssThreadPriority.High);
            var stdout = Console.OpenStandardOutput();
            var stopwatch = Stopwatch.StartNew();
            var nextWriteTicks = 0L;
            var needsPrebuffer = true;

            while (!reportQueue.IsCompleted)
            {
                if (needsPrebuffer)
                {
                    if (!WaitForReportPrebuffer())
                    {
                        break;
                    }
                    nextWriteTicks = stopwatch.ElapsedTicks;
                    needsPrebuffer = false;
                }

                if (!reportQueue.TryTake(out var frame, AudioConstants.WriterTakeTimeoutMilliseconds))
                {
                    needsPrebuffer = true;
                    continue;
                }

                var nowTicks = stopwatch.ElapsedTicks;
                if (nextWriteTicks == 0 || nowTicks - nextWriteTicks > AudioConstants.FrameIntervalTicks * 2)
                {
                    nextWriteTicks = nowTicks;
                }
                else
                {
                    WaitUntil(stopwatch, nextWriteTicks);
                }

                if (AudioConstants.DiagnosticsEnabled)
                {
                    var lateTicks = Math.Max(0, stopwatch.ElapsedTicks - nextWriteTicks);
                    if (lateTicks > 0)
                    {
                        var lateUs = lateTicks * 1000000 / Stopwatch.Frequency;
                        if (lateUs > 500)
                        {
                            writeLateEvents++;
                            if (lateUs > maxWriteLateUs)
                            {
                                maxWriteLateUs = lateUs;
                            }
                        }
                        if (lateUs > AudioConstants.WriterScheduleLateSoftWarningUs)
                        {
                            Interlocked.Increment(ref writerScheduleLateOver2msEvents);
                        }
                        if (lateUs > AudioConstants.WriterScheduleLateMediumWarningUs)
                        {
                            Interlocked.Increment(ref writerScheduleLateOver4msEvents);
                        }
                        if (lateUs > AudioConstants.WriterScheduleLateWarningUs)
                        {
                            Interlocked.Increment(ref writerScheduleLateEvents);
                            UpdateMax(ref writerScheduleLateMaxUs, lateUs);
                            LogHelperEvent("writer-schedule-late", $"lateUs={lateUs}");
                        }
                    }
                }

                var frameWritten = false;
                if (bridgeTransport is not null || hidStream is not null)
                {
                    frameWritten = TryWriteFrameToHid(frame);
                }
                else
                {
                    LegacyFramePacketizer.WriteStdoutFrame(stdout, writePrefix, frame);
                    frameWritten = true;
                }
                if (!frameWritten)
                {
                    nextWriteTicks += AudioConstants.FrameIntervalTicks;
                    continue;
                }
                if (AudioConstants.DiagnosticsEnabled)
                {
                    writtenReports++;
                }
                nextWriteTicks += AudioConstants.FrameIntervalTicks;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"error: writer stopped: {error.GetType().Name}: {error.Message}");
        }
    }

    private static void WaitUntil(Stopwatch stopwatch, long targetTicks)
    {
        while (true)
        {
            var remainingTicks = targetTicks - stopwatch.ElapsedTicks;
            if (remainingTicks <= 0)
            {
                return;
            }

            var remainingMs = remainingTicks * 1000 / Stopwatch.Frequency;
            if (remainingMs > 2)
            {
                Thread.Sleep(1);
            }
            else
            {
                Thread.Yield();
            }
        }
    }

    private bool TryWriteFrameToHid(byte[] frame)
    {
        var sequence = frameSequence++;
        var ok = LegacyFramePacketizer.WriteFastHidFragments(frame, sequence, hidReport, TryWriteHidReport, out var fragmentCount);
        if (ok && AudioConstants.DiagnosticsEnabled)
        {
            writtenFragments += fragmentCount;
        }
        return ok;
    }

    private bool TryWriteHidReport(byte[] report)
    {
        var winUsb = bridgeTransport;
        if (winUsb is not null)
        {
            try
            {
                winUsb.WriteReport(report);
                return true;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"status: WinUSB bridge direct output failed: {error.GetType().Name}: {error.Message}; using stdout frame transport");
                DisableBridgeTransport();
                return false;
            }
        }

        var stream = hidStream;
        if (stream is null)
        {
            return false;
        }

        try
        {
            if (!AudioConstants.DiagnosticsEnabled)
            {
                stream.Write(report, 0, report.Length);
                return true;
            }

            var start = Stopwatch.GetTimestamp();
            stream.Write(report, 0, report.Length);
            var elapsedUs = (Stopwatch.GetTimestamp() - start) * 1000000 / Stopwatch.Frequency;
            if (elapsedUs > AudioConstants.HidWriteTimeoutMilliseconds * 1000)
            {
                writeLateEvents++;
                if (elapsedUs > maxWriteLateUs)
                {
                    maxWriteLateUs = elapsedUs;
                }
            }
            if (elapsedUs > AudioConstants.HidWriteSoftWarningUs)
            {
                Interlocked.Increment(ref hidWriteOver2msEvents);
            }
            if (elapsedUs > AudioConstants.HidWriteMediumWarningUs)
            {
                Interlocked.Increment(ref hidWriteOver4msEvents);
            }
            if (elapsedUs > AudioConstants.HidWriteLateWarningUs)
            {
                Interlocked.Increment(ref hidWriteLateEvents);
                UpdateMax(ref hidWriteLateMaxUs, elapsedUs);
                LogHelperEvent("hid-write-late", $"elapsedUs={elapsedUs}");
            }
            return true;
        }
        catch (TimeoutException error)
        {
            NoteHidWriteTimeout(error);
            return false;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"status: companion HID direct output failed: {error.GetType().Name}: {error.Message}; using stdout frame transport");
            DisableHidTransport();
            return false;
        }
    }

    private void NoteHidWriteTimeout(TimeoutException error)
    {
        var timeoutCount = Interlocked.Increment(ref hidWriteTimeouts);
        Interlocked.Increment(ref hidWriteLateEvents);
        UpdateMax(ref hidWriteLateMaxUs, AudioConstants.HidWriteTimeoutMilliseconds * 1000L);

        var nowTicks = Stopwatch.GetTimestamp();
        var previousTicks = Interlocked.Read(ref lastHidTimeoutLogTicks);
        var minIntervalTicks = Stopwatch.Frequency * AudioConstants.HidTimeoutLogIntervalMilliseconds / 1000;
        if (previousTicks != 0 && nowTicks - previousTicks < minIntervalTicks)
        {
            return;
        }

        Interlocked.Exchange(ref lastHidTimeoutLogTicks, nowTicks);
        Console.Error.WriteLine($"status: companion HID direct output timeout count={timeoutCount}: {error.Message}; dropped frame and kept direct HID transport");
    }

    private static void RaiseSchedulingPriority()
    {
        try
        {
            Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.High;
        }
        catch
        {
        }
    }

    private static void TrySetThreadPriority(ThreadPriority priority)
    {
        try
        {
            Thread.CurrentThread.Priority = priority;
        }
        catch
        {
        }
    }

    private static bool TryBeginTimerResolution(uint milliseconds)
    {
        try
        {
            var ok = NativeMethods.TimeBeginPeriod(milliseconds) == 0;
            if (ok && AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine($"status: timer-resolution periodMs={milliseconds}");
            }
            return ok;
        }
        catch
        {
            return false;
        }
    }

    private static void TryEndTimerResolution(uint milliseconds)
    {
        try
        {
            _ = NativeMethods.TimeEndPeriod(milliseconds);
        }
        catch
        {
        }
    }

    private void DisableHidTransport()
    {
        var stream = hidStream;
        hidStream = null;
        PicoTransport.DisposeQuietly(stream);
    }

    private void DisableBridgeTransport()
    {
        var transport = bridgeTransport;
        bridgeTransport = null;
        try
        {
            transport?.Dispose();
        }
        catch
        {
        }
    }

    private static void UpdateMax(ref long target, long value)
    {
        while (true)
        {
            var current = Interlocked.Read(ref target);
            if (value <= current)
            {
                return;
            }

            if (Interlocked.CompareExchange(ref target, value, current) == current)
            {
                return;
            }
        }
    }

    private void LogHelperEvent(string eventName, string details)
    {
        if (!AudioConstants.DiagnosticsEnabled)
        {
            return;
        }

        var nowTicks = Stopwatch.GetTimestamp();
        var previousTicks = Interlocked.Read(ref lastHelperEventLogTicks);
        var minIntervalTicks = Stopwatch.Frequency * AudioConstants.HelperEventLogIntervalMilliseconds / 1000;
        if (previousTicks != 0 && nowTicks - previousTicks < minIntervalTicks)
        {
            return;
        }

        Interlocked.Exchange(ref lastHelperEventLogTicks, nowTicks);
        Console.Error.WriteLine(
            $"stage=helper-event {eventName} {details} pcmQueue={pcmQueue.Count} queuedReports={reportQueue.Count} callbacks={Interlocked.Read(ref capturedCallbacks)} capturedFrames={Interlocked.Read(ref capturedFrames)} encodedReports={Interlocked.Read(ref encodedReports)} writtenReports={Interlocked.Read(ref writtenReports)} writtenFragments={Interlocked.Read(ref writtenFragments)}");
    }

    private void WriteDiagnostics()
    {
        while (!stopped.Wait(AudioConstants.DiagnosticsIntervalMilliseconds))
        {
            var peak = Interlocked.Exchange(ref peakSamplePermille, 0);
            var micPeak = Interlocked.Exchange(ref micPeakPermille, 0);
            var writerState = writerTask.IsFaulted ? "faulted" : writerTask.IsCompleted ? "stopped" : "running";
            var encoderState = pcmEncoderTask is null ? "inline" : pcmEncoderTask.IsFaulted ? "faulted" : pcmEncoderTask.IsCompleted ? "stopped" : "running";
            var outputTransport = bridgeTransport is not null ? "winusb" : hidStream is not null ? "hid" : "stdout";
            Console.Error.WriteLine(
                $"stage=helper transport={outputTransport} writer={writerState} encoder={encoderState} callbacks={Interlocked.Read(ref capturedCallbacks)} capturedFrames={Interlocked.Read(ref capturedFrames)} encodedReports={Interlocked.Read(ref encodedReports)} queuedReports={reportQueue.Count} droppedReports={Interlocked.Read(ref droppedReports)} writtenReports={Interlocked.Read(ref writtenReports)} writtenFragments={Interlocked.Read(ref writtenFragments)} writeLateEvents={Interlocked.Read(ref writeLateEvents)} maxWriteLateUs={Interlocked.Read(ref maxWriteLateUs)} captureGapMaxUs={Interlocked.Read(ref captureCallbackGapMaxUs)} captureGapOver12ms={Interlocked.Read(ref captureCallbackGapOver12msEvents)} captureGapOver16ms={Interlocked.Read(ref captureCallbackGapOver16msEvents)} captureGapOver20ms={Interlocked.Read(ref captureCallbackGapEvents)} captureWakeCount={Interlocked.Read(ref captureWakeCount)} capturePacketsDrained={Interlocked.Read(ref capturePacketsDrained)} captureMaxPacketsPerWake={Interlocked.Read(ref captureMaxPacketsPerWake)} captureFramesDrained={Interlocked.Read(ref captureFramesDrained)} captureDiscontinuityPackets={Interlocked.Read(ref captureDiscontinuityPackets)} captureSilentPackets={Interlocked.Read(ref captureSilentPackets)} bulkReadCalls={Interlocked.Read(ref bulkPcmReadCalls)} bulkReadBytes={Interlocked.Read(ref bulkPcmReadBytes)} bulkParsedPackets={Interlocked.Read(ref bulkPcmParsedPackets)} bulkSequenceGaps={Interlocked.Read(ref bulkPcmSequenceGaps)} bulkGapFillPackets={Interlocked.Read(ref bulkPcmGapFillPackets)} pcmQueuedChunks={Interlocked.Read(ref pcmQueuedChunks)} pcmDroppedChunks={Interlocked.Read(ref pcmDroppedChunks)} pcmQueueMaxChunks={Interlocked.Read(ref pcmQueueMaxChunks)} pcmQueueCurrentChunks={pcmQueue.Count} writerScheduleLateOver2ms={Interlocked.Read(ref writerScheduleLateOver2msEvents)} writerScheduleLateOver4ms={Interlocked.Read(ref writerScheduleLateOver4msEvents)} writerScheduleLateOver8ms={Interlocked.Read(ref writerScheduleLateEvents)} writerScheduleLateMaxUs={Interlocked.Read(ref writerScheduleLateMaxUs)} hidWriteOver2ms={Interlocked.Read(ref hidWriteOver2msEvents)} hidWriteOver4ms={Interlocked.Read(ref hidWriteOver4msEvents)} hidWriteOver8ms={Interlocked.Read(ref hidWriteLateEvents)} hidWriteTimeouts={Interlocked.Read(ref hidWriteTimeouts)} hidWriteMaxUs={Interlocked.Read(ref hidWriteLateMaxUs)} peakPermille={peak} micCallbacks={Interlocked.Read(ref micCallbacks)} micCapturedFrames={Interlocked.Read(ref micCapturedFrames)} micPeakPermille={micPeak}");
        }
    }

    private bool WaitForReportPrebuffer()
    {
        var prebufferReports = WriterPrebufferReports;
        while (!reportQueue.IsCompleted)
        {
            if (reportQueue.Count >= prebufferReports)
            {
                return true;
            }
            Thread.Sleep(1);
        }
        return false;
    }

    private static short FloatToInt16(float sample)
    {
        return (short)Math.Round(Math.Clamp(sample, -1, 1) * short.MaxValue);
    }

    private static int VolumePercentToPermille(int percent)
    {
        return Math.Clamp(percent, 0, 100) * 10;
    }

    private static byte FloatToInt8(float sample)
    {
        return unchecked((byte)(sbyte)Math.Round(Math.Clamp(sample, -1, 1) * sbyte.MaxValue));
    }
}

sealed record PcmCaptureChunk(
    byte[] Buffer,
    int ByteCount,
    WaveFormat Format,
    int Frames,
    AudioClientBufferFlags Flags);

sealed class DefaultRenderNotificationClient : IMMNotificationClient
{
    private readonly Action onDefaultRenderChanged;

    public DefaultRenderNotificationClient(Action onDefaultRenderChanged)
    {
        this.onDefaultRenderChanged = onDefaultRenderChanged;
    }

    public void OnDeviceStateChanged(string deviceId, DeviceState newState)
    {
    }

    public void OnDeviceAdded(string pwstrDeviceId)
    {
    }

    public void OnDeviceRemoved(string deviceId)
    {
    }

    public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId)
    {
        if (flow == DataFlow.Render && role == Role.Multimedia)
        {
            onDefaultRenderChanged();
        }
    }

    public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key)
    {
    }
}

enum MmcssThreadPriority
{
    Low = -1,
    Normal = 0,
    High = 1,
    Critical = 2
}

sealed class MmcssRegistration : IDisposable
{
    private readonly IntPtr handle;

    private MmcssRegistration(IntPtr handle)
    {
        this.handle = handle;
    }

    public static MmcssRegistration? TryRegister(
        string taskName,
        string role,
        MmcssThreadPriority priority = MmcssThreadPriority.Normal)
    {
        try
        {
            var handle = NativeMethods.AvSetMmThreadCharacteristics(taskName, out _);
            if (handle == IntPtr.Zero)
            {
                return null;
            }

            var priorityApplied = false;
            try
            {
                priorityApplied = NativeMethods.AvSetMmThreadPriority(handle, priority);
            }
            catch
            {
            }

            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine(
                    $"status: mmcss role={role} task='{taskName}' priority={priority} priorityApplied={priorityApplied}");
            }
            return new MmcssRegistration(handle);
        }
        catch
        {
            return null;
        }
    }

    public void Dispose()
    {
        if (handle != IntPtr.Zero)
        {
            _ = NativeMethods.AvRevertMmThreadCharacteristics(handle);
        }
    }
}

static partial class NativeMethods
{
    [DllImport("avrt.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr AvSetMmThreadCharacteristics(string taskName, out int taskIndex);

    [DllImport("avrt.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AvSetMmThreadPriority(IntPtr handle, MmcssThreadPriority priority);

    [DllImport("avrt.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AvRevertMmThreadCharacteristics(IntPtr handle);

    [DllImport("winmm.dll")]
    public static extern uint TimeBeginPeriod(uint periodMilliseconds);

    [DllImport("winmm.dll")]
    public static extern uint TimeEndPeriod(uint periodMilliseconds);
}

sealed class FrameDumpWriter : IDisposable
{
    private readonly string path;
    private readonly int frameLimit;
    private readonly FileStream stream;
    private readonly byte[] prefix = new byte[2];
    private int framesWritten;
    private bool limitLogged;
    private bool disabled;

    private FrameDumpWriter(string path, int frameLimit, FileStream stream)
    {
        this.path = path;
        this.frameLimit = frameLimit;
        this.stream = stream;
    }

    public static FrameDumpWriter? TryCreate(string? path, int frameLimit)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        try
        {
            var fullPath = Path.GetFullPath(path);
            var directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var normalizedFrameLimit = Math.Max(0, frameLimit);
            var stream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.Read, 65536);
            Console.Error.WriteLine($"status: frame-dump-started path='{fullPath}' limit={normalizedFrameLimit}");
            return new FrameDumpWriter(fullPath, normalizedFrameLimit, stream);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"status: frame-dump-unavailable path='{path}' error='{error.Message}'");
            return null;
        }
    }

    public void WriteFrame(byte[] frame)
    {
        if (disabled)
        {
            return;
        }
        if (frameLimit > 0 && framesWritten >= frameLimit)
        {
            if (!limitLogged)
            {
                limitLogged = true;
                Console.Error.WriteLine($"status: frame-dump-limit-reached path='{path}' frames={framesWritten}");
            }
            return;
        }

        try
        {
            BinaryPrimitives.WriteUInt16LittleEndian(prefix, (ushort)frame.Length);
            stream.Write(prefix);
            stream.Write(frame, 0, frame.Length);
            framesWritten++;
        }
        catch (Exception error)
        {
            disabled = true;
            Console.Error.WriteLine($"status: frame-dump-disabled path='{path}' frames={framesWritten} error='{error.Message}'");
        }
    }

    public void Dispose()
    {
        try
        {
            stream.Flush();
            stream.Dispose();
        }
        catch
        {
        }
        Console.Error.WriteLine($"status: frame-dump-stopped path='{path}' frames={framesWritten}");
    }
}

enum AudioHelperSource
{
    RenderLoopback,
    RawPcmCapture,
    UsbBulkPcm
}

sealed record HelperOptions(
    string? DeviceName,
    string? HidPath,
    AudioHelperSource Source,
    bool ListDevices,
    bool MonitorAudioSessions,
    string? ResolveIconDataUrlPath,
    bool CompanionTransportServer,
    bool MicKeepaliveOnly,
    string? MicDeviceName,
    int? AppProcessId,
    string? AppProcessPath,
    string? AppExecutableName,
    int SpeakerVolumePercent,
    string? TestAudioPath,
    bool PlayTestTone,
    bool PlayTestHaptics,
    bool DefaultRenderStatus,
    bool SetDefaultRenderBridge,
    string? BridgePersona,
    bool HapticsOnly,
    bool StdoutOnly,
    int HapticsGainPercent,
    int HapticsBassFocus,
    int HapticsResponse,
    int HapticsAttack,
    int HapticsRelease,
    bool MediaDebugClock,
    int MediaDebugSeconds,
    int MediaDebugIntervalMs,
    string? MediaSessionCommand,
    int? MediaVolumePercent,
    long? MediaCommandStartedUnixMs,
    bool MediaSkipThumbnail,
    string? FrameDumpPath,
    int FrameDumpFrameLimit,
    string? RawCaptureDumpPath,
    int RawCaptureDumpSeconds,
    bool CaptureDumpOnly)
{
    public string SourceArgument => Source switch
    {
        AudioHelperSource.RawPcmCapture => "raw-pcm-capture",
        AudioHelperSource.UsbBulkPcm => "usb-pcm",
        _ => "render-loopback"
    };

    public static HelperOptions Parse(string[] args)
    {
        string? deviceName = null;
        string? hidPath = null;
        string? micDeviceName = null;
        var source = AudioHelperSource.RenderLoopback;
        var speakerVolumePercent = 100;
        string? testAudioPath = null;
        string? frameDumpPath = Environment.GetEnvironmentVariable("DS5_BRIDGE_AUDIO_HELPER_FRAME_DUMP");
        var frameDumpFrameLimit = ParseFrameDumpLimit(
            Environment.GetEnvironmentVariable("DS5_BRIDGE_AUDIO_HELPER_FRAME_DUMP_LIMIT")
        );
        string? rawCaptureDumpPath = Environment.GetEnvironmentVariable("DS5_BRIDGE_AUDIO_HELPER_RAW_CAPTURE_DUMP");
        var rawCaptureDumpSeconds = ParsePositiveInt(
            Environment.GetEnvironmentVariable("DS5_BRIDGE_AUDIO_HELPER_RAW_CAPTURE_DUMP_SECONDS"),
            20
        );
        var listDevices = false;
        var monitorAudioSessions = false;
        string? resolveIconDataUrlPath = null;
        var companionTransportServer = false;
        var micKeepaliveOnly = false;
        int? appProcessId = null;
        string? appProcessPath = null;
        string? appExecutableName = null;
        var playTestTone = false;
        var playTestHaptics = false;
        var defaultRenderStatus = false;
        var setDefaultRenderBridge = false;
        string? bridgePersona = null;
        var captureDumpOnly = false;
        var hapticsOnly = false;
        var stdoutOnly = false;
        var hapticsGainPercent = 100;
        var hapticsBassFocus = 1;
        var hapticsResponse = 1;
        var hapticsAttack = 1;
        var hapticsRelease = 1;
        var mediaDebugClock = false;
        var mediaDebugSeconds = 20;
        var mediaDebugIntervalMs = 250;
        string? mediaSessionCommand = null;
        int? mediaVolumePercent = null;
        long? mediaCommandStartedUnixMs = null;
        var mediaSkipThumbnail = false;

        for (var index = 0; index < args.Length; index++)
        {
            switch (args[index])
            {
                case "--device-name" when index + 1 < args.Length:
                    deviceName = args[++index];
                    break;
                case "--hid-path" when index + 1 < args.Length:
                    hidPath = args[++index];
                    break;
                case "--source" when index + 1 < args.Length:
                    source = ParseSource(args[++index]);
                    break;
                case "--mic-device-name" when index + 1 < args.Length:
                    micDeviceName = args[++index];
                    break;
                case "--haptics-app-process-id" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedAppProcessId) && parsedAppProcessId > 0)
                    {
                        appProcessId = parsedAppProcessId;
                    }
                    break;
                case "--haptics-app-process-path" when index + 1 < args.Length:
                    appProcessPath = args[++index];
                    break;
                case "--haptics-app-executable" when index + 1 < args.Length:
                    appExecutableName = args[++index];
                    break;
                case "--speaker-volume" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedSpeakerVolumePercent))
                    {
                        speakerVolumePercent = parsedSpeakerVolumePercent;
                    }
                    break;
                case "--haptics-gain" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedHapticsGainPercent))
                    {
                        hapticsGainPercent = Math.Clamp(parsedHapticsGainPercent, 0, 200);
                    }
                    break;
                case "--haptics-bass-focus" when index + 1 < args.Length:
                    hapticsBassFocus = ParseHapticsBassFocus(args[++index]);
                    break;
                case "--haptics-response" when index + 1 < args.Length:
                    hapticsResponse = ParseHapticsResponse(args[++index]);
                    break;
                case "--haptics-attack" when index + 1 < args.Length:
                    hapticsAttack = ParseHapticsAttack(args[++index]);
                    break;
                case "--haptics-release" when index + 1 < args.Length:
                    hapticsRelease = ParseHapticsRelease(args[++index]);
                    break;
                case "--media-debug-clock":
                    mediaDebugClock = true;
                    break;
                case "--media-debug-seconds" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedMediaDebugSeconds))
                    {
                        mediaDebugSeconds = Math.Clamp(parsedMediaDebugSeconds, 1, 300);
                    }
                    break;
                case "--media-debug-interval-ms" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedMediaDebugIntervalMs))
                    {
                        mediaDebugIntervalMs = Math.Clamp(parsedMediaDebugIntervalMs, 50, 5000);
                    }
                    break;
                case "--media-session" when index + 1 < args.Length:
                    mediaSessionCommand = args[++index];
                    break;
                case "--media-volume" when index + 1 < args.Length:
                    if (int.TryParse(args[++index], out var parsedMediaVolumePercent))
                    {
                        mediaVolumePercent = Math.Clamp(parsedMediaVolumePercent, 0, 100);
                    }
                    break;
                case "--media-command-started-at" when index + 1 < args.Length:
                    if (long.TryParse(args[++index], out var parsedMediaCommandStartedUnixMs))
                    {
                        mediaCommandStartedUnixMs = Math.Max(0, parsedMediaCommandStartedUnixMs);
                    }
                    break;
                case "--media-skip-thumbnail":
                    mediaSkipThumbnail = true;
                    break;
                case "--test-audio-path" when index + 1 < args.Length:
                    testAudioPath = args[++index];
                    break;
                case "--frame-dump-path" when index + 1 < args.Length:
                    frameDumpPath = args[++index];
                    break;
                case "--frame-dump-limit" when index + 1 < args.Length:
                    frameDumpFrameLimit = ParseFrameDumpLimit(args[++index]);
                    break;
                case "--raw-capture-dump-path" when index + 1 < args.Length:
                    rawCaptureDumpPath = args[++index];
                    break;
                case "--raw-capture-dump-seconds" when index + 1 < args.Length:
                    rawCaptureDumpSeconds = ParsePositiveInt(args[++index], rawCaptureDumpSeconds);
                    break;
                case "--list-devices":
                    listDevices = true;
                    break;
                case "--monitor-audio-sessions":
                    monitorAudioSessions = true;
                    break;
                case "--resolve-icon-data-url" when index + 1 < args.Length:
                    resolveIconDataUrlPath = args[++index];
                    break;
                case "--companion-transport":
                    companionTransportServer = true;
                    break;
                case "--mic-keepalive-only":
                    micKeepaliveOnly = true;
                    break;
                case "--play-test-tone":
                    playTestTone = true;
                    break;
                case "--play-test-haptics":
                    playTestHaptics = true;
                    break;
                case "--default-render-status":
                    defaultRenderStatus = true;
                    break;
                case "--set-default-render-bridge":
                    setDefaultRenderBridge = true;
                    break;
                case "--bridge-persona" when index + 1 < args.Length:
                    bridgePersona = args[++index];
                    break;
                case "--haptics-only":
                    hapticsOnly = true;
                    break;
                case "--stdout-only":
                    stdoutOnly = true;
                    break;
                case "--capture-dump-only":
                    captureDumpOnly = true;
                    break;
            }
        }

        return new HelperOptions(
            deviceName,
            hidPath,
            source,
            listDevices,
            monitorAudioSessions,
            resolveIconDataUrlPath,
            companionTransportServer,
            micKeepaliveOnly,
            micDeviceName,
            appProcessId,
            appProcessPath,
            appExecutableName,
            speakerVolumePercent,
            testAudioPath,
            playTestTone,
            playTestHaptics,
            defaultRenderStatus,
            setDefaultRenderBridge,
            bridgePersona,
            hapticsOnly,
            stdoutOnly,
            hapticsGainPercent,
            hapticsBassFocus,
            hapticsResponse,
            hapticsAttack,
            hapticsRelease,
            mediaDebugClock,
            mediaDebugSeconds,
            mediaDebugIntervalMs,
            mediaSessionCommand,
            mediaVolumePercent,
            mediaCommandStartedUnixMs,
            mediaSkipThumbnail,
            frameDumpPath,
            frameDumpFrameLimit,
            rawCaptureDumpPath,
            rawCaptureDumpSeconds,
            captureDumpOnly);
    }

    private static AudioHelperSource ParseSource(string value)
    {
        if (value.Equals("raw-pcm-capture", StringComparison.OrdinalIgnoreCase))
        {
            return AudioHelperSource.RawPcmCapture;
        }
        if (
            value.Equals("usb-pcm", StringComparison.OrdinalIgnoreCase)
            || value.Equals("usb-bulk-pcm", StringComparison.OrdinalIgnoreCase)
        )
        {
            return AudioHelperSource.UsbBulkPcm;
        }
        return AudioHelperSource.RenderLoopback;
    }

    public static int ParseHapticsBassFocus(string value)
    {
        if (value.Equals("deep", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }
        if (value.Equals("punchy", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }
        if (value.Equals("wide", StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }
        return 1;
    }

    public static int ParseHapticsResponse(string value)
    {
        if (value.Equals("subtle", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }
        if (value.Equals("strong", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }
        return 1;
    }

    public static int ParseHapticsAttack(string value)
    {
        if (value.Equals("soft", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }
        if (value.Equals("fast", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }
        if (value.Equals("sharp", StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }
        return 1;
    }

    public static int ParseHapticsRelease(string value)
    {
        if (value.Equals("tight", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }
        if (value.Equals("smooth", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }
        if (value.Equals("long", StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }
        return 1;
    }

    private static int ParseFrameDumpLimit(string? value)
    {
        if (int.TryParse(value, out var parsed))
        {
            return Math.Max(0, parsed);
        }
        return AudioConstants.DefaultFrameDumpFrameLimit;
    }

    private static int ParsePositiveInt(string? value, int fallback)
    {
        if (int.TryParse(value, out var parsed))
        {
            return Math.Max(0, parsed);
        }
        return fallback;
    }
}
