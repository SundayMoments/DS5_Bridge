using System.Runtime.InteropServices;
using System.Text.Json;

// Types chord keyboard shortcuts from a resident process with SendInput, the way
// Steam Input does, so a press never waits for a process to start. Each tap is
// staged the way a person types (Kitsune Input's tap sequencer timings):
// modifiers down, keys down and held, keys up, then modifiers up.
static class KeyboardInputServer
{
    public const int MaxWaitingTaps = 4;
    public const int LeadMilliseconds = 20;
    public const int HoldMilliseconds = 60;
    // A waiting tap may end the hold early, but never before a 60 fps frame has seen it.
    public const int MinimumHoldMilliseconds = 20;
    public const int TrailMilliseconds = 20;

    private static readonly object OutputLock = new();
    private static readonly object QueueLock = new();
    private static readonly LinkedList<KeyboardTap> Waiting = new();
    private static readonly SemaphoreSlim QueuedSignal = new(0);
    private static readonly ManualResetEventSlim TapWaiting = new(false);

    public static async Task<int> RunAsync()
    {
        var worker = new Thread(RunTaps) { IsBackground = true, Name = "keyboard-taps" };
        worker.Start();

        string? line;
        while ((line = await Console.In.ReadLineAsync()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }
            HandleLine(line);
        }
        return 0;
    }

    private static void HandleLine(string line)
    {
        var id = 0;
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            id = root.GetProperty("id").GetInt32();
            var op = root.GetProperty("op").GetString();
            switch (op)
            {
                case "tap":
                    Enqueue(KeyboardTap.FromVirtualKeys(id, root.GetProperty("keys").EnumerateArray()
                        .Select(element => element.GetInt32())));
                    return;
                case "close":
                    WriteResponse(new { id, ok = true });
                    Environment.Exit(0);
                    return;
                default:
                    throw new InvalidOperationException($"Unknown operation '{op}'.");
            }
        }
        catch (Exception error)
        {
            WriteResponse(new { id, ok = false, error = error.Message });
        }
    }

    private static void Enqueue(KeyboardTap tap)
    {
        KeyboardTap? dropped = null;
        lock (QueueLock)
        {
            if (Waiting.Count >= MaxWaitingTaps)
            {
                dropped = Waiting.First!.Value;
                Waiting.RemoveFirst();
            }
            Waiting.AddLast(tap);
            TapWaiting.Set();
        }
        if (dropped is not null)
        {
            WriteResponse(new { id = dropped.Id, ok = false, error = "Too many shortcuts were waiting." });
        }
        else
        {
            QueuedSignal.Release();
        }
    }

    private static KeyboardTap? Dequeue()
    {
        lock (QueueLock)
        {
            if (Waiting.Count == 0)
            {
                return null;
            }
            var tap = Waiting.First!.Value;
            Waiting.RemoveFirst();
            if (Waiting.Count == 0)
            {
                TapWaiting.Reset();
            }
            return tap;
        }
    }

    private static void RunTaps()
    {
        while (true)
        {
            QueuedSignal.Wait();
            var tap = Dequeue();
            if (tap is null)
            {
                continue;
            }
            try
            {
                Type(tap);
                WriteResponse(new { id = tap.Id, ok = true });
            }
            catch (Exception error)
            {
                WriteResponse(new { id = tap.Id, ok = false, error = error.Message });
            }
        }
    }

    private static void Type(KeyboardTap tap)
    {
        var layout = ForegroundKeyboardLayout();
        var modifiers = tap.Modifiers.Select((vk) => KeyEvent.For(vk, layout)).ToArray();
        var keys = tap.Keys.Select((vk) => KeyEvent.For(vk, layout)).ToArray();
        try
        {
            if (modifiers.Length > 0)
            {
                Send(modifiers, keyUp: false);
                if (keys.Length > 0)
                {
                    Thread.Sleep(LeadMilliseconds);
                }
            }
            if (keys.Length > 0)
            {
                Send(keys, keyUp: false);
            }
            Thread.Sleep(MinimumHoldMilliseconds);
            TapWaiting.Wait(HoldMilliseconds - MinimumHoldMilliseconds);
        }
        finally
        {
            // Every key pressed is released, even when a later stage failed.
            if (keys.Length > 0)
            {
                Send(keys.Reverse().ToArray(), keyUp: true);
                if (modifiers.Length > 0)
                {
                    Thread.Sleep(TrailMilliseconds);
                }
            }
            if (modifiers.Length > 0)
            {
                Send(modifiers.Reverse().ToArray(), keyUp: true);
            }
        }
    }

    private static void Send(KeyEvent[] events, bool keyUp)
    {
        var inputs = events.Select((key) => key.ToInput(keyUp)).ToArray();
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>());
        if (sent != inputs.Length)
        {
            // UIPI blocks injected input into windows running as administrator.
            throw new InvalidOperationException("Windows blocked the key press.");
        }
    }

    private static IntPtr ForegroundKeyboardLayout()
    {
        var window = GetForegroundWindow();
        var thread = window == IntPtr.Zero ? 0 : GetWindowThreadProcessId(window, out _);
        return GetKeyboardLayout(thread);
    }

    private static void WriteResponse(object response)
    {
        lock (OutputLock)
        {
            Console.Out.WriteLine(JsonSerializer.Serialize(response));
            Console.Out.Flush();
        }
    }

    internal sealed record KeyboardTap(int Id, int[] Modifiers, int[] Keys)
    {
        public static KeyboardTap FromVirtualKeys(int id, IEnumerable<int> virtualKeys)
        {
            var all = virtualKeys.Distinct().ToArray();
            if (all.Length is 0 or > 4 || all.Any((vk) => vk is <= 0 or > 0xfe))
            {
                throw new ArgumentException("A shortcut needs one to four valid keys.");
            }
            // Generic modifiers are sent as their left keys, which is what games read from the scan code.
            var modifiers = all.Where(IsModifier).Select(LeftModifier).ToArray();
            var keys = all.Where((vk) => !IsModifier(vk)).ToArray();
            return new KeyboardTap(id, modifiers, keys);
        }

        internal static bool IsModifier(int vk) => vk is VkShift or VkControl or VkMenu or VkLeftWin or VkRightWin
            or >= VkLeftShift and <= VkRightMenu;

        internal static int LeftModifier(int vk) => vk switch
        {
            VkShift => VkLeftShift,
            VkControl => VkLeftControl,
            VkMenu => VkLeftMenu,
            _ => vk
        };
    }

    internal readonly record struct KeyEvent(ushort VirtualKey, ushort ScanCode, bool Extended)
    {
        public static KeyEvent For(int vk, IntPtr layout)
        {
            var scan = MapVirtualKeyEx((uint)vk, MapVkToVscEx, layout);
            return new KeyEvent((ushort)vk, (ushort)(scan & 0xff), (scan & 0xff00) is 0xe000 or 0xe100 || IsExtendedKey(vk));
        }

        public Input ToInput(bool keyUp) => new()
        {
            Type = InputKeyboard,
            Union = new InputUnion
            {
                Keyboard = new KeyboardInput
                {
                    VirtualKey = VirtualKey,
                    ScanCode = ScanCode,
                    Flags = (Extended ? KeyEventExtendedKey : 0) | (keyUp ? KeyEventKeyUp : 0)
                }
            }
        };
    }

    // Keys Windows reports with the E0 prefix even when the layout lookup omits it.
    internal static bool IsExtendedKey(int vk) => vk is >= 0x21 and <= 0x28 // Page Up, Page Down, End, Home, arrows
        or 0x2c or 0x2d or 0x2e // Print Screen, Insert, Delete
        or VkLeftWin or VkRightWin or 0x5d // Windows keys, Menu
        or 0x6f or 0x90 // Numpad divide, Num Lock
        or VkRightControl or VkRightMenu
        or >= 0xa6 and <= 0xb7; // Browser, volume and media keys

    private const int VkShift = 0x10;
    private const int VkControl = 0x11;
    private const int VkMenu = 0x12;
    private const int VkLeftWin = 0x5b;
    private const int VkRightWin = 0x5c;
    private const int VkLeftShift = 0xa0;
    private const int VkLeftControl = 0xa2;
    private const int VkRightControl = 0xa3;
    private const int VkLeftMenu = 0xa4;
    private const int VkRightMenu = 0xa5;
    private const uint InputKeyboard = 1;
    private const uint KeyEventExtendedKey = 0x0001;
    private const uint KeyEventKeyUp = 0x0002;
    private const uint MapVkToVscEx = 4;

    [StructLayout(LayoutKind.Sequential)]
    internal struct Input
    {
        public uint Type;
        public InputUnion Union;
    }

    // MOUSEINPUT is the largest member, so it sets the union's size.
    [StructLayout(LayoutKind.Explicit)]
    internal struct InputUnion
    {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MouseInput
    {
        public int X;
        public int Y;
        public uint Data;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int size);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern IntPtr GetKeyboardLayout(uint threadId);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKeyEx(uint code, uint mapType, IntPtr layout);
}
