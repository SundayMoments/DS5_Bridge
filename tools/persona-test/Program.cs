using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using HidSharp;
using Microsoft.Win32.SafeHandles;

namespace DS5Bridge.PersonaTester;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (!PersonaTestOptions.TryParse(args, out var options, out var error))
        {
            Console.Error.WriteLine(error);
            Console.Error.WriteLine();
            PersonaTestOptions.PrintUsage(Console.Error);
            return 2;
        }

        if (options.ShowHelp)
        {
            PersonaTestOptions.PrintUsage(Console.Out);
            return 0;
        }

        var sink = new ResultSink(options.Json);
        try
        {
            switch (options.Persona)
            {
                case PersonaKind.Ds4:
                    await new Ds4PersonaRunner(options, sink).RunAsync();
                    break;
                case PersonaKind.Xbox:
                    await new XboxPersonaRunner(options, sink).RunAsync();
                    break;
                case PersonaKind.Auto:
                    await RunAutoAsync(options, sink);
                    break;
            }
        }
        catch (OperationCanceledException)
        {
            sink.Add("Test run", TestStatus.Fail, "Canceled.");
        }
        catch (Exception exception)
        {
            sink.Add("Test run", TestStatus.Fail, exception.Message);
        }

        sink.PrintSummary();
        return sink.HasFailures ? 1 : 0;
    }

    private static async Task RunAutoAsync(PersonaTestOptions options, ResultSink sink)
    {
        if (Ds4PersonaRunner.FindDevices(options.DevicePath).Count > 0)
        {
            await new Ds4PersonaRunner(options with { Persona = PersonaKind.Ds4 }, sink).RunAsync();
            return;
        }

        if (XboxNative.TryFindConnectedController(out _))
        {
            await new XboxPersonaRunner(options with { Persona = PersonaKind.Xbox }, sink).RunAsync();
            return;
        }

        sink.Add("Persona discovery", TestStatus.Fail, "No DS4 HID persona or XInput controller slot was detected.");
    }
}

internal enum PersonaKind
{
    Auto,
    Ds4,
    Xbox
}

internal enum TestStatus
{
    Good,
    Fail,
    Skip
}

internal sealed record PersonaTestOptions(
    PersonaKind Persona,
    int TimeoutMs,
    bool SkipOutput,
    string? DevicePath,
    bool Json,
    bool ShowHelp)
{
    public static bool TryParse(string[] args, out PersonaTestOptions options, out string error)
    {
        var persona = PersonaKind.Auto;
        var timeoutMs = 15000;
        var skipOutput = false;
        var json = false;
        var showHelp = false;
        string? path = null;

        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            switch (arg)
            {
                case "-h":
                case "--help":
                    showHelp = true;
                    break;
                case "--persona":
                    if (!TryTakeValue(args, ref index, out var personaValue))
                    {
                        options = Default;
                        error = "--persona requires auto, ds4, or xbox.";
                        return false;
                    }
                    if (!TryParsePersona(personaValue, out persona))
                    {
                        options = Default;
                        error = $"Unknown persona '{personaValue}'. Expected auto, ds4, or xbox.";
                        return false;
                    }
                    break;
                case "--timeout-ms":
                    if (!TryTakeValue(args, ref index, out var timeoutValue) || !int.TryParse(timeoutValue, out timeoutMs) || timeoutMs < 1000)
                    {
                        options = Default;
                        error = "--timeout-ms requires an integer >= 1000.";
                        return false;
                    }
                    break;
                case "--path":
                    if (!TryTakeValue(args, ref index, out path))
                    {
                        options = Default;
                        error = "--path requires a HID device path.";
                        return false;
                    }
                    break;
                case "--skip-output":
                    skipOutput = true;
                    break;
                case "--json":
                    json = true;
                    break;
                default:
                    options = Default;
                    error = $"Unknown argument '{arg}'.";
                    return false;
            }
        }

        options = new PersonaTestOptions(persona, timeoutMs, skipOutput, path, json, showHelp);
        error = string.Empty;
        return true;
    }

    public static void PrintUsage(TextWriter writer)
    {
        writer.WriteLine("DS5 Bridge Persona Tester");
        writer.WriteLine();
        writer.WriteLine("Usage:");
        writer.WriteLine("  dotnet run --project tools/persona-test -- --persona ds4");
        writer.WriteLine("  dotnet run --project tools/persona-test -- --persona xbox");
        writer.WriteLine();
        writer.WriteLine("Options:");
        writer.WriteLine("  --persona auto|ds4|xbox   Persona to validate. Default: auto.");
        writer.WriteLine("  --timeout-ms <ms>          Per-input prompt timeout. Default: 15000.");
        writer.WriteLine("  --path <hid path>          DS4 HID path override when multiple devices exist.");
        writer.WriteLine("  --skip-output              Skip rumble/lightbar tests.");
        writer.WriteLine("  --json                     Print final result JSON.");
        writer.WriteLine("  --help                     Show this help.");
    }

    private static PersonaTestOptions Default => new(PersonaKind.Auto, 15000, false, null, false, false);

    private static bool TryParsePersona(string value, out PersonaKind persona)
    {
        switch (value.Trim().ToLowerInvariant())
        {
            case "auto":
                persona = PersonaKind.Auto;
                return true;
            case "ds4":
            case "dualshock4":
            case "dualshock-4":
                persona = PersonaKind.Ds4;
                return true;
            case "xbox":
            case "x360":
            case "xinput":
            case "xusb":
                persona = PersonaKind.Xbox;
                return true;
            default:
                persona = PersonaKind.Auto;
                return false;
        }
    }

    private static bool TryTakeValue(string[] args, ref int index, out string value)
    {
        if (index + 1 >= args.Length)
        {
            value = string.Empty;
            return false;
        }
        index++;
        value = args[index];
        return true;
    }
}

internal sealed class ResultSink
{
    private readonly bool json;
    private readonly List<TestResult> results = [];

    public ResultSink(bool json)
    {
        this.json = json;
    }

    public bool HasFailures => results.Any(result => result.Status == TestStatus.Fail);

    public void Add(string name, TestStatus status, string detail = "")
    {
        var result = new TestResult(name, status, detail);
        results.Add(result);
        if (!json)
        {
            PrintHumanResult(result);
        }
    }

    public void Info(string message)
    {
        if (!json)
        {
            Console.WriteLine(message);
        }
        else
        {
            Console.Error.WriteLine(message);
        }
    }

    public bool Confirm(string prompt)
    {
        var writer = json ? Console.Error : Console.Out;
        writer.Write($"{prompt} [y/N]: ");
        var answer = Console.ReadLine();
        return answer is not null && (answer.Equals("y", StringComparison.OrdinalIgnoreCase) || answer.Equals("yes", StringComparison.OrdinalIgnoreCase));
    }

    public void PrintSummary()
    {
        if (json)
        {
            var payload = new
            {
                passed = !HasFailures,
                results
            };
            Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
            return;
        }

        Console.WriteLine();
        var good = results.Count(result => result.Status == TestStatus.Good);
        var failed = results.Count(result => result.Status == TestStatus.Fail);
        var skipped = results.Count(result => result.Status == TestStatus.Skip);
        Console.WriteLine($"Summary: {good} GOOD, {failed} FAIL, {skipped} SKIP");
    }

    private static void PrintHumanResult(TestResult result)
    {
        var previous = Console.ForegroundColor;
        Console.ForegroundColor = result.Status switch
        {
            TestStatus.Good => ConsoleColor.Green,
            TestStatus.Fail => ConsoleColor.Red,
            TestStatus.Skip => ConsoleColor.Yellow,
            _ => previous
        };
        Console.Write($"{StatusText(result.Status),-6}");
        Console.ForegroundColor = previous;
        Console.Write($" {result.Name,-32}");
        if (!string.IsNullOrWhiteSpace(result.Detail))
        {
            Console.Write($" {result.Detail}");
        }
        Console.WriteLine();
    }

    private static string StatusText(TestStatus status) => status switch
    {
        TestStatus.Good => "GOOD",
        TestStatus.Fail => "FAIL",
        TestStatus.Skip => "SKIP",
        _ => status.ToString().ToUpperInvariant()
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };
}

internal sealed record TestResult(string Name, TestStatus Status, string Detail);

internal sealed class Ds4PersonaRunner
{
    private const int SonyVendorId = 0x054c;
    private const int Ds4ProductId = 0x09cc;
    private const byte Ds4InputReportId = 0x01;
    private const byte Ds4OutputReportId = 0x05;
    private const byte ButtonCross = 0x20;
    private const byte ButtonCircle = 0x40;
    private const byte ButtonSquare = 0x10;
    private const byte ButtonTriangle = 0x80;
    private const byte ButtonL1 = 0x01;
    private const byte ButtonR1 = 0x02;
    private const byte ButtonOptions = 0x20;
    private const byte ButtonShare = 0x10;
    private const byte ButtonPs = 0x01;
    private const int TriggerThreshold = 180;
    private const int GyroMotionThreshold = 300;
    private const int TouchSwipeThreshold = 120;

    private readonly PersonaTestOptions options;
    private readonly ResultSink sink;

    public Ds4PersonaRunner(PersonaTestOptions options, ResultSink sink)
    {
        this.options = options;
        this.sink = sink;
    }

    public static List<HidDevice> FindDevices(string? path = null)
    {
        return DeviceList.Local.GetHidDevices()
            .Where(device => device.VendorID == SonyVendorId && device.ProductID == Ds4ProductId)
            .Where(device => SafeReportLength(device.GetMaxInputReportLength) >= 64)
            .Where(device => string.IsNullOrWhiteSpace(path) || string.Equals(device.DevicePath, path, StringComparison.OrdinalIgnoreCase))
            .OrderBy(device => device.DevicePath, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task RunAsync()
    {
        sink.Info("Persona: DS4");
        var devices = FindDevices(options.DevicePath);
        if (devices.Count == 0)
        {
            sink.Add("DS4 identity", TestStatus.Fail, "No HID device with VID 054C / PID 09CC was found.");
            return;
        }

        if (devices.Count > 1 && string.IsNullOrWhiteSpace(options.DevicePath))
        {
            sink.Add("DS4 device selection", TestStatus.Skip, $"Using first of {devices.Count} DS4 HID devices. Pass --path to choose one.");
        }

        var device = devices[0];
        sink.Add("DS4 identity", TestStatus.Good, DeviceLabel(device));

        using var stream = device.Open();
        stream.ReadTimeout = 20;
        stream.WriteTimeout = 1000;
        sink.Add("DS4 HID open", TestStatus.Good, $"input={device.GetMaxInputReportLength()} output={device.GetMaxOutputReportLength()}");

        await using (var reader = new Ds4LiveInputReader(stream, device.GetMaxInputReportLength()))
        {
            await RunInputChecksAsync(reader);
        }
        await RunOutputChecksAsync(stream, device.GetMaxOutputReportLength());
    }

    private async Task RunInputChecksAsync(Ds4LiveInputReader reader)
    {
        sink.Info("");
        sink.Info("Release the controls before each prompt. The tool will mark GOOD when it sees the expected input report.");

        if (!await reader.WaitForFirstReportAsync(Math.Min(1500, options.TimeoutMs)))
        {
            sink.Add("DS4 input stream", TestStatus.Fail, "No DS4 input report was read.");
            return;
        }

        await CheckControlAsync(reader, "Cross detected", "Press Cross", state => state.Cross);
        await CheckControlAsync(reader, "Circle detected", "Press Circle", state => state.Circle);
        await CheckControlAsync(reader, "Square detected", "Press Square", state => state.Square);
        await CheckControlAsync(reader, "Triangle detected", "Press Triangle", state => state.Triangle);
        await CheckControlAsync(reader, "D-pad up detected", "Press D-pad Up", state => state.DpadUp);
        await CheckControlAsync(reader, "D-pad down detected", "Press D-pad Down", state => state.DpadDown);
        await CheckControlAsync(reader, "D-pad left detected", "Press D-pad Left", state => state.DpadLeft);
        await CheckControlAsync(reader, "D-pad right detected", "Press D-pad Right", state => state.DpadRight);
        await CheckControlAsync(reader, "L1 detected", "Press L1", state => state.L1);
        await CheckControlAsync(reader, "R1 detected", "Press R1", state => state.R1);
        await CheckControlAsync(reader, "L3 detected", "Press L3/left stick click", state => state.L3);
        await CheckControlAsync(reader, "R3 detected", "Press R3/right stick click", state => state.R3);
        await CheckControlAsync(reader, "Options detected", "Press Options", state => state.Options);
        await CheckControlAsync(reader, "Share detected", "Press Create/Share", state => state.Share);
        await CheckControlAsync(reader, "PS detected", "Press PS/Home", state => state.Ps);
        await CheckControlAsync(reader, "Touchpad click detected", "Press the touchpad click", state => state.Touchpad);
        await CheckTouchSwipeAsync(reader);
        await CheckControlAsync(reader, "L2 analog detected", "Press L2 fully", state => state.L2 >= TriggerThreshold);
        await CheckControlAsync(reader, "R2 analog detected", "Press R2 fully", state => state.R2 >= TriggerThreshold);
        await CheckAxisAsync(reader, "Left stick X detected", "Move left stick left or right", state => AxisMoved(state.LeftStickX));
        await CheckAxisAsync(reader, "Left stick Y detected", "Move left stick up or down", state => AxisMoved(state.LeftStickY));
        await CheckAxisAsync(reader, "Right stick X detected", "Move right stick left or right", state => AxisMoved(state.RightStickX));
        await CheckAxisAsync(reader, "Right stick Y detected", "Move right stick up or down", state => AxisMoved(state.RightStickY));
        await CheckMotionAsync(reader);
    }

    private async Task RunOutputChecksAsync(HidStream stream, int maxOutputReportLength)
    {
        if (options.SkipOutput)
        {
            sink.Add("DS4 output tests", TestStatus.Skip, "--skip-output was provided.");
            return;
        }

        sink.Info("");
        sink.Info("Output checks send host reports, then ask you to confirm the physical controller response.");

        if (SendDs4Output(stream, maxOutputReportLength, rumbleLeft: 0xc0, rumbleRight: 0x50, red: 0, green: 0, blue: 0, lightbar: false))
        {
            await Task.Delay(650);
            SendDs4Output(stream, maxOutputReportLength, rumbleLeft: 0, rumbleRight: 0, red: 0, green: 0, blue: 0, lightbar: false);
            sink.Add(
                "DS4 rumble output",
                sink.Confirm("Did the controller rumble?")
                    ? TestStatus.Good
                    : TestStatus.Fail,
                "Report ID 05 was sent.");
        }
        else
        {
            sink.Add("DS4 rumble output", TestStatus.Fail, "Could not write output report.");
        }

        if (SendDs4Output(stream, maxOutputReportLength, rumbleLeft: 0, rumbleRight: 0, red: 0xff, green: 0x00, blue: 0x9a, lightbar: true))
        {
            sink.Add(
                "DS4 lightbar output",
                sink.Confirm("Did the lightbar turn hot pink?")
                    ? TestStatus.Good
                    : TestStatus.Fail,
                "Report ID 05 lightbar RGB was sent.");
            SendDs4Output(stream, maxOutputReportLength, rumbleLeft: 0, rumbleRight: 0, red: 0, green: 0, blue: 0, lightbar: true);
        }
        else
        {
            sink.Add("DS4 lightbar output", TestStatus.Fail, "Could not write output report.");
        }
    }

    private async Task CheckControlAsync(
        Ds4LiveInputReader reader,
        string resultName,
        string prompt,
        Func<Ds4InputState, bool> predicate)
    {
        sink.Info("");
        sink.Info(prompt);

        var released = await reader.WaitForStateAsync(state => !predicate(state), Math.Min(3000, options.TimeoutMs));
        if (!released)
        {
            sink.Add(resultName, TestStatus.Fail, "The control looked active before the prompt. Release it and rerun.");
            return;
        }

        var sequence = reader.Sequence;
        var matched = await reader.WaitForStateAsync(predicate, options.TimeoutMs, sequence);
        sink.Add(resultName, matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for input.");
    }

    private async Task CheckAxisAsync(
        Ds4LiveInputReader reader,
        string resultName,
        string prompt,
        Func<Ds4InputState, bool> predicate)
    {
        sink.Info("");
        sink.Info(prompt);

        var released = await reader.WaitForStateAsync(state => !predicate(state), Math.Min(3000, options.TimeoutMs));
        if (!released)
        {
            sink.Add(resultName, TestStatus.Fail, "The axis looked active before the prompt. Center it and rerun.");
            return;
        }

        var matched = await reader.WaitForStateAsync(predicate, options.TimeoutMs, reader.Sequence);
        sink.Add(resultName, matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for axis movement.");
    }

    private async Task CheckMotionAsync(Ds4LiveInputReader reader)
    {
        sink.Info("");
        sink.Info("Rotate the controller for gyro detection");

        var baseline = reader.Latest;
        if (baseline is null)
        {
            sink.Add("DS4 gyro detected", TestStatus.Fail, "No DS4 input report was read.");
            return;
        }

        var matched = await reader.WaitForStateAsync(
            state => MotionDelta(baseline, state) >= GyroMotionThreshold,
            options.TimeoutMs,
            reader.Sequence);
        sink.Add("DS4 gyro detected", matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for gyro movement.");
    }

    private async Task CheckTouchSwipeAsync(Ds4LiveInputReader reader)
    {
        sink.Info("");
        sink.Info("Touch and swipe across the touchpad");

        var released = await reader.WaitForStateAsync(state => !state.TouchContactActive, Math.Min(3000, options.TimeoutMs));
        if (!released)
        {
            sink.Add("Touchpad finger coordinates", TestStatus.Fail, "The touchpad looked active before the prompt. Release it and rerun.");
            return;
        }

        var touchStartSequence = reader.Sequence;
        var touched = await reader.WaitForStateAsync(state => state.TouchContactActive, options.TimeoutMs, touchStartSequence);
        if (!touched || reader.Latest is not { TouchContactActive: true } baseline)
        {
            sink.Add("Touchpad finger coordinates", TestStatus.Fail, "Timed out waiting for touch contact.");
            return;
        }

        var swipeStartSequence = reader.Sequence;
        var matched = await reader.WaitForStateAsync(
            state => state.TouchContactActive && TouchDelta(baseline, state) >= TouchSwipeThreshold,
            options.TimeoutMs,
            swipeStartSequence);
        sink.Add("Touchpad finger coordinates", matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for coordinate movement.");
    }

    private static int MotionDelta(Ds4InputState baseline, Ds4InputState state)
    {
        return Math.Max(
            Math.Max(Math.Abs(state.GyroX - baseline.GyroX), Math.Abs(state.GyroY - baseline.GyroY)),
            Math.Abs(state.GyroZ - baseline.GyroZ));
    }

    private static int TouchDelta(Ds4InputState baseline, Ds4InputState state)
    {
        return Math.Max(Math.Abs(state.TouchX - baseline.TouchX), Math.Abs(state.TouchY - baseline.TouchY));
    }

    private static bool AxisMoved(byte value)
    {
        return value <= 64 || value >= 192;
    }

    private static bool SendDs4Output(HidStream stream, int maxOutputReportLength, byte rumbleLeft, byte rumbleRight, byte red, byte green, byte blue, bool lightbar)
    {
        var report = new byte[Math.Max(32, maxOutputReportLength)];
        report[0] = Ds4OutputReportId;
        report[1] = lightbar ? (byte)0x02 : (byte)0x00;
        report[4] = rumbleRight;
        report[5] = rumbleLeft;
        report[6] = red;
        report[7] = green;
        report[8] = blue;
        try
        {
            stream.Write(report);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static string DeviceLabel(HidDevice device)
    {
        var product = Safe(() => device.GetProductName()) ?? "Unknown product";
        var manufacturer = Safe(() => device.GetManufacturer()) ?? "Unknown manufacturer";
        return $"{manufacturer} {product} path={device.DevicePath}";
    }

    private static string? Safe(Func<string?> read)
    {
        try
        {
            return read();
        }
        catch
        {
            return null;
        }
    }

    private static int SafeReportLength(Func<int> read)
    {
        try
        {
            return read();
        }
        catch
        {
            return 0;
        }
    }
}

internal sealed class Ds4LiveInputReader : IAsyncDisposable
{
    private readonly HidStream stream;
    private readonly byte[] buffer;
    private readonly CancellationTokenSource cancellation = new();
    private readonly object gate = new();
    private readonly Task readTask;
    private readonly TaskCompletionSource firstReport = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Ds4InputState? latest;
    private long sequence;

    public Ds4LiveInputReader(HidStream stream, int maxInputReportLength)
    {
        this.stream = stream;
        buffer = new byte[Math.Max(64, maxInputReportLength)];
        readTask = Task.Run(ReadLoopAsync);
    }

    public long Sequence
    {
        get
        {
            lock (gate)
            {
                return sequence;
            }
        }
    }

    public Ds4InputState? Latest
    {
        get
        {
            lock (gate)
            {
                return latest;
            }
        }
    }

    public async Task<bool> WaitForFirstReportAsync(int timeoutMs)
    {
        try
        {
            await firstReport.Task.WaitAsync(TimeSpan.FromMilliseconds(timeoutMs));
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
    }

    public async Task<bool> WaitForStateAsync(Func<Ds4InputState, bool> predicate, int timeoutMs, long minimumSequence = 0)
    {
        var deadline = DateTimeOffset.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTimeOffset.UtcNow < deadline)
        {
            Ds4InputState? state;
            long currentSequence;
            lock (gate)
            {
                state = latest;
                currentSequence = sequence;
            }

            var sequenceReady = minimumSequence <= 0 || currentSequence > minimumSequence;
            if (state is not null && sequenceReady && predicate(state))
            {
                return true;
            }

            await Task.Delay(8);
        }

        return false;
    }

    public async ValueTask DisposeAsync()
    {
        cancellation.Cancel();
        try
        {
            await readTask.WaitAsync(TimeSpan.FromMilliseconds(250));
        }
        catch
        {
            // The HID read timeout bounds shutdown; ignore late exits.
        }
        cancellation.Dispose();
    }

    private async Task ReadLoopAsync()
    {
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                var length = stream.Read(buffer);
                if (Ds4InputState.TryParse(buffer, length, out var state))
                {
                    lock (gate)
                    {
                        latest = state;
                        sequence++;
                    }
                    firstReport.TrySetResult();
                }
            }
            catch (TimeoutException)
            {
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (IOException)
            {
                await Task.Delay(10, cancellation.Token).ContinueWith(_ => { }, TaskScheduler.Default);
            }
        }
    }
}

internal sealed record Ds4InputState(
    byte LeftStickX,
    byte LeftStickY,
    byte RightStickX,
    byte RightStickY,
    bool DpadUp,
    bool DpadDown,
    bool DpadLeft,
    bool DpadRight,
    bool Cross,
    bool Circle,
    bool Square,
    bool Triangle,
    bool L1,
    bool R1,
    bool L3,
    bool R3,
    bool Options,
    bool Share,
    bool Ps,
    bool Touchpad,
    bool TouchContactActive,
    ushort TouchX,
    ushort TouchY,
    byte L2,
    byte R2,
    short GyroX,
    short GyroY,
    short GyroZ)
{
    public static bool TryParse(byte[] report, int length, out Ds4InputState state)
    {
        state = new Ds4InputState(
            0x80,
            0x80,
            0x80,
            0x80,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            0,
            0,
            0,
            0,
            0,
            0,
            0);
        if (length <= 0)
        {
            return false;
        }

        var offset = report[0] == 0x01 ? 1 : 0;
        if (length - offset < 42)
        {
            return false;
        }

        if (offset == 0 && report[0] != 0 && report[0] != 0x7f)
        {
            return false;
        }

        var face = report[offset + 4];
        var dpad = face & 0x0f;
        var buttons = report[offset + 5];
        var psTouchCounter = report[offset + 6];
        var touchPointOffset = offset + 34;
        var touchContact = report[touchPointOffset];
        var touchActive = (touchContact & 0x80) == 0;
        var touchX = (ushort)(report[touchPointOffset + 1] | ((report[touchPointOffset + 2] & 0x0f) << 8));
        var touchY = (ushort)(((report[touchPointOffset + 2] >> 4) & 0x0f) | (report[touchPointOffset + 3] << 4));
        state = new Ds4InputState(
            LeftStickX: report[offset + 0],
            LeftStickY: report[offset + 1],
            RightStickX: report[offset + 2],
            RightStickY: report[offset + 3],
            DpadUp: dpad is 0 or 1 or 7,
            DpadDown: dpad is 3 or 4 or 5,
            DpadLeft: dpad is 5 or 6 or 7,
            DpadRight: dpad is 1 or 2 or 3,
            Cross: (face & 0x20) != 0,
            Circle: (face & 0x40) != 0,
            Square: (face & 0x10) != 0,
            Triangle: (face & 0x80) != 0,
            L1: (buttons & 0x01) != 0,
            R1: (buttons & 0x02) != 0,
            L3: (buttons & 0x40) != 0,
            R3: (buttons & 0x80) != 0,
            Options: (buttons & 0x20) != 0,
            Share: (buttons & 0x10) != 0,
            Ps: (psTouchCounter & 0x01) != 0,
            Touchpad: (psTouchCounter & 0x02) != 0,
            TouchContactActive: touchActive,
            TouchX: touchX,
            TouchY: touchY,
            L2: report[offset + 7],
            R2: report[offset + 8],
            GyroX: ReadInt16Le(report, offset + 12),
            GyroY: ReadInt16Le(report, offset + 14),
            GyroZ: ReadInt16Le(report, offset + 16));
        return true;
    }

    private static short ReadInt16Le(byte[] report, int offset)
    {
        return unchecked((short)(report[offset] | (report[offset + 1] << 8)));
    }
}

internal sealed class XboxPersonaRunner
{
    private const int TriggerThreshold = 180;
    private readonly PersonaTestOptions options;
    private readonly ResultSink sink;

    public XboxPersonaRunner(PersonaTestOptions options, ResultSink sink)
    {
        this.options = options;
        this.sink = sink;
    }

    public async Task RunAsync()
    {
        sink.Info("Persona: Xbox 360 / XInput");
        var xusbPath = WindowsDeviceInterfaces.FindXusbDevicePath("vid_1209", "pid_db05");
        if (xusbPath is not null)
        {
            sink.Add("XUSB VID/PID identity", TestStatus.Good, xusbPath);
        }
        else
        {
            sink.Add("XUSB VID/PID identity", TestStatus.Skip, "XInput can still be tested, but DS5 Bridge VID/PID was not found via XUSB interface enumeration.");
        }

        if (!XboxNative.TryFindConnectedController(out var userIndex))
        {
            sink.Add("XInput slot", TestStatus.Fail, "No connected XInput controller was found.");
            return;
        }

        sink.Add("XInput slot", TestStatus.Good, $"slot={userIndex}");
        await RunInputChecksAsync(userIndex);
        await RunOutputChecksAsync(userIndex);
    }

    private async Task RunInputChecksAsync(int userIndex)
    {
        sink.Info("");
        sink.Info("Release the controls before each prompt. The tool will mark GOOD when XInput reports the expected state.");

        await CheckControlAsync(userIndex, "A detected", "Press Cross/A", state => (state.Gamepad.Buttons & XInputButtons.A) != 0);
        await CheckControlAsync(userIndex, "B detected", "Press Circle/B", state => (state.Gamepad.Buttons & XInputButtons.B) != 0);
        await CheckControlAsync(userIndex, "X detected", "Press Square/X", state => (state.Gamepad.Buttons & XInputButtons.X) != 0);
        await CheckControlAsync(userIndex, "Y detected", "Press Triangle/Y", state => (state.Gamepad.Buttons & XInputButtons.Y) != 0);
        await CheckControlAsync(userIndex, "D-pad up detected", "Press D-pad Up", state => (state.Gamepad.Buttons & XInputButtons.DpadUp) != 0);
        await CheckControlAsync(userIndex, "D-pad down detected", "Press D-pad Down", state => (state.Gamepad.Buttons & XInputButtons.DpadDown) != 0);
        await CheckControlAsync(userIndex, "D-pad left detected", "Press D-pad Left", state => (state.Gamepad.Buttons & XInputButtons.DpadLeft) != 0);
        await CheckControlAsync(userIndex, "D-pad right detected", "Press D-pad Right", state => (state.Gamepad.Buttons & XInputButtons.DpadRight) != 0);
        await CheckControlAsync(userIndex, "LB detected", "Press L1/LB", state => (state.Gamepad.Buttons & XInputButtons.LeftShoulder) != 0);
        await CheckControlAsync(userIndex, "RB detected", "Press R1/RB", state => (state.Gamepad.Buttons & XInputButtons.RightShoulder) != 0);
        await CheckControlAsync(userIndex, "Left stick click detected", "Press L3/left stick click", state => (state.Gamepad.Buttons & XInputButtons.LeftThumb) != 0);
        await CheckControlAsync(userIndex, "Right stick click detected", "Press R3/right stick click", state => (state.Gamepad.Buttons & XInputButtons.RightThumb) != 0);
        await CheckControlAsync(userIndex, "Start detected", "Press Options/Start", state => (state.Gamepad.Buttons & XInputButtons.Start) != 0);
        await CheckControlAsync(userIndex, "Back detected", "Press Create/Back", state => (state.Gamepad.Buttons & XInputButtons.Back) != 0);
        await CheckControlAsync(userIndex, "L2 analog detected", "Press L2 fully", state => state.Gamepad.LeftTrigger >= TriggerThreshold);
        await CheckControlAsync(userIndex, "R2 analog detected", "Press R2 fully", state => state.Gamepad.RightTrigger >= TriggerThreshold);
        await CheckAxisAsync(userIndex, "Left stick X detected", "Move left stick left or right", state => AxisMoved(state.Gamepad.ThumbLX));
        await CheckAxisAsync(userIndex, "Left stick Y detected", "Move left stick up or down", state => AxisMoved(state.Gamepad.ThumbLY));
        await CheckAxisAsync(userIndex, "Right stick X detected", "Move right stick left or right", state => AxisMoved(state.Gamepad.ThumbRX));
        await CheckAxisAsync(userIndex, "Right stick Y detected", "Move right stick up or down", state => AxisMoved(state.Gamepad.ThumbRY));
    }

    private async Task RunOutputChecksAsync(int userIndex)
    {
        if (options.SkipOutput)
        {
            sink.Add("XInput output tests", TestStatus.Skip, "--skip-output was provided.");
            return;
        }

        sink.Info("");
        sink.Info("Output checks send host commands, then ask you to confirm the physical controller response.");
        if (!XboxNative.SetVibration(userIndex, 45000, 45000, out var error))
        {
            sink.Add("XInput rumble output", TestStatus.Fail, error);
            return;
        }

        await Task.Delay(650);
        XboxNative.SetVibration(userIndex, 0, 0, out _);
        sink.Add(
            "XInput rumble output",
            sink.Confirm("Did the controller rumble?")
                ? TestStatus.Good
                : TestStatus.Fail,
            "XInputSetState was sent.");
        sink.Add("XInput lightbar output", TestStatus.Skip, "Xbox 360 persona has no lightbar output.");
    }

    private async Task CheckControlAsync(
        int userIndex,
        string resultName,
        string prompt,
        Func<XInputState, bool> predicate)
    {
        sink.Info("");
        sink.Info(prompt);

        var released = await WaitForXInputStateAsync(userIndex, state => !predicate(state), Math.Min(3000, options.TimeoutMs));
        if (!released)
        {
            sink.Add(resultName, TestStatus.Fail, "The control looked active before the prompt. Release it and rerun.");
            return;
        }

        var sequence = CurrentXInputPacket(userIndex);
        var matched = await WaitForXInputStateAsync(userIndex, predicate, options.TimeoutMs, sequence);
        sink.Add(resultName, matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for input.");
    }

    private async Task CheckAxisAsync(
        int userIndex,
        string resultName,
        string prompt,
        Func<XInputState, bool> predicate)
    {
        sink.Info("");
        sink.Info(prompt);

        var released = await WaitForXInputStateAsync(userIndex, state => !predicate(state), Math.Min(3000, options.TimeoutMs));
        if (!released)
        {
            sink.Add(resultName, TestStatus.Fail, "The axis looked active before the prompt. Center it and rerun.");
            return;
        }

        var sequence = CurrentXInputPacket(userIndex);
        var matched = await WaitForXInputStateAsync(userIndex, predicate, options.TimeoutMs, sequence);
        sink.Add(resultName, matched ? TestStatus.Good : TestStatus.Fail, matched ? string.Empty : "Timed out waiting for axis movement.");
    }

    private static async Task<bool> WaitForXInputStateAsync(
        int userIndex,
        Func<XInputState, bool> predicate,
        int timeoutMs,
        uint? minimumPacketNumber = null)
    {
        var deadline = DateTimeOffset.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (
                XboxNative.TryGetState(userIndex, out var state)
                && (minimumPacketNumber is null || state.PacketNumber != minimumPacketNumber.Value)
                && predicate(state)
            )
            {
                return true;
            }
            await Task.Delay(25);
        }
        return false;
    }

    private static uint? CurrentXInputPacket(int userIndex)
    {
        return XboxNative.TryGetState(userIndex, out var state) ? state.PacketNumber : null;
    }

    private static bool AxisMoved(short value)
    {
        return Math.Abs((int)value) >= 16000;
    }
}

internal static class XboxNative
{
    private const int ErrorSuccess = 0;
    private const int MaxControllers = 4;

    public static bool TryFindConnectedController(out int userIndex)
    {
        for (var index = 0; index < MaxControllers; index++)
        {
            if (TryGetState(index, out _))
            {
                userIndex = index;
                return true;
            }
        }

        userIndex = -1;
        return false;
    }

    public static bool TryGetState(int userIndex, out XInputState state)
    {
        try
        {
            return XInputGetState(userIndex, out state) == ErrorSuccess;
        }
        catch (DllNotFoundException)
        {
            state = default;
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            state = default;
            return false;
        }
    }

    public static bool SetVibration(int userIndex, ushort leftMotor, ushort rightMotor, out string error)
    {
        var vibration = new XInputVibration
        {
            LeftMotorSpeed = leftMotor,
            RightMotorSpeed = rightMotor
        };
        int result;
        try
        {
            result = XInputSetState(userIndex, ref vibration);
        }
        catch (DllNotFoundException exception)
        {
            error = exception.Message;
            return false;
        }
        catch (EntryPointNotFoundException exception)
        {
            error = exception.Message;
            return false;
        }
        if (result == ErrorSuccess)
        {
            error = string.Empty;
            return true;
        }

        error = new Win32Exception(result).Message;
        return false;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern int XInputGetState(int dwUserIndex, out XInputState pState);

    [DllImport("xinput1_4.dll", EntryPoint = "XInputSetState")]
    private static extern int XInputSetState(int dwUserIndex, ref XInputVibration pVibration);
}

[StructLayout(LayoutKind.Sequential)]
internal struct XInputState
{
    public uint PacketNumber;
    public XInputGamepad Gamepad;
}

[StructLayout(LayoutKind.Sequential)]
internal struct XInputGamepad
{
    public XInputButtons Buttons;
    public byte LeftTrigger;
    public byte RightTrigger;
    public short ThumbLX;
    public short ThumbLY;
    public short ThumbRX;
    public short ThumbRY;
}

[StructLayout(LayoutKind.Sequential)]
internal struct XInputVibration
{
    public ushort LeftMotorSpeed;
    public ushort RightMotorSpeed;
}

[Flags]
internal enum XInputButtons : ushort
{
    DpadUp = 0x0001,
    DpadDown = 0x0002,
    DpadLeft = 0x0004,
    DpadRight = 0x0008,
    Start = 0x0010,
    Back = 0x0020,
    LeftThumb = 0x0040,
    RightThumb = 0x0080,
    LeftShoulder = 0x0100,
    RightShoulder = 0x0200,
    A = 0x1000,
    B = 0x2000,
    X = 0x4000,
    Y = 0x8000
}

internal static class WindowsDeviceInterfaces
{
    private static readonly Guid XusbDeviceInterfaceGuid = new("EC87F1E3-C13B-4100-B5F7-8B84D54260CB");

    public static string? FindXusbDevicePath(string vendorToken, string productToken)
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return null;
        }

        try
        {
            return EnumerateDeviceInterfacePaths(XusbDeviceInterfaceGuid)
                .FirstOrDefault(path =>
                    path.Contains(vendorToken, StringComparison.OrdinalIgnoreCase)
                    && path.Contains(productToken, StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return null;
        }
    }

    private static IEnumerable<string> EnumerateDeviceInterfacePaths(Guid interfaceGuid)
    {
        var deviceInfoSet = SetupDiGetClassDevs(
            ref interfaceGuid,
            IntPtr.Zero,
            IntPtr.Zero,
            DigcfPresent | DigcfDeviceInterface);
        if (deviceInfoSet == IntPtr.Zero || deviceInfoSet == new IntPtr(-1))
        {
            yield break;
        }

        try
        {
            for (uint index = 0; ; index++)
            {
                var interfaceData = new SpDeviceInterfaceData
                {
                    cbSize = Marshal.SizeOf<SpDeviceInterfaceData>()
                };
                if (!SetupDiEnumDeviceInterfaces(deviceInfoSet, IntPtr.Zero, ref interfaceGuid, index, ref interfaceData))
                {
                    if (Marshal.GetLastWin32Error() == ErrorNoMoreItems)
                    {
                        yield break;
                    }
                    continue;
                }

                var detail = new SpDeviceInterfaceDetailData
                {
                    cbSize = IntPtr.Size == 8 ? 8 : 6,
                    DevicePath = new string('\0', 1024)
                };
                if (SetupDiGetDeviceInterfaceDetail(
                        deviceInfoSet,
                        ref interfaceData,
                        ref detail,
                        Marshal.SizeOf<SpDeviceInterfaceDetailData>(),
                        out _,
                        IntPtr.Zero))
                {
                    yield return detail.DevicePath;
                }
            }
        }
        finally
        {
            SetupDiDestroyDeviceInfoList(deviceInfoSet);
        }
    }

    private const uint DigcfPresent = 0x00000002;
    private const uint DigcfDeviceInterface = 0x00000010;
    private const int ErrorNoMoreItems = 259;

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevs(
        ref Guid classGuid,
        IntPtr enumerator,
        IntPtr hwndParent,
        uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiEnumDeviceInterfaces(
        IntPtr deviceInfoSet,
        IntPtr deviceInfoData,
        ref Guid interfaceClassGuid,
        uint memberIndex,
        ref SpDeviceInterfaceData deviceInterfaceData);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiGetDeviceInterfaceDetail(
        IntPtr deviceInfoSet,
        ref SpDeviceInterfaceData deviceInterfaceData,
        ref SpDeviceInterfaceDetailData deviceInterfaceDetailData,
        int deviceInterfaceDetailDataSize,
        out int requiredSize,
        IntPtr deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [StructLayout(LayoutKind.Sequential)]
    private struct SpDeviceInterfaceData
    {
        public int cbSize;
        public Guid InterfaceClassGuid;
        public int Flags;
        public IntPtr Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SpDeviceInterfaceDetailData
    {
        public int cbSize;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
        public string DevicePath;
    }
}
