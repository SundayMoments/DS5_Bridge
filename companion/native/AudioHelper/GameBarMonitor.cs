using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Windows.Foundation.Metadata;
using Windows.Gaming.UI;

// Reports whether the Xbox Game Bar overlay (including compact mode) is open.
// Game Bar only accepts XInput controllers for navigation, so the companion
// uses this signal to switch the bridge to the Xbox persona while it is open.
sealed class GameBarMonitor
{
    private const int PollIntervalMilliseconds = 250;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private static readonly string[] GameBarProcessNames =
    [
        "GameBar",
        "XboxGameBar",
        "GameBarFTServer",
        "GameBarElevatedFT_Alias"
    ];

    private readonly ManualResetEventSlim stopped = new(false);
    private bool apiUnavailable;
    private string? lastApiError;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    public Task RunAsync()
    {
        Console.Error.WriteLine("status: game-bar-monitor-started");
        var inputThread = new Thread(ReadControlLoop)
        {
            IsBackground = true,
            Name = "GameBarMonitorControl"
        };
        inputThread.Start();

        bool? lastVisible = null;
        string lastSource = "";
        while (!stopped.IsSet)
        {
            var visible = IsGameBarVisible(out var source);
            if (visible != lastVisible || (visible && source != lastSource))
            {
                lastVisible = visible;
                lastSource = source;
                Console.Out.WriteLine(JsonSerializer.Serialize(new { visible, source }, JsonOptions));
                Console.Out.Flush();
            }
            stopped.Wait(PollIntervalMilliseconds);
        }

        Console.Error.WriteLine("status: game-bar-monitor-stopped");
        return Task.CompletedTask;
    }

    private bool IsGameBarVisible(out string source)
    {
        if (TryReadGameBarApi(out var apiVisible) && apiVisible)
        {
            source = "api";
            return true;
        }

        // The WinRT state can lag or be unavailable on some builds. Game Bar
        // takes the foreground while its overlay is open, so a foreground
        // window owned by a Game Bar process is a reliable fallback. Pinned
        // widgets stay visible after the overlay closes but do not keep focus.
        if (ForegroundWindowBelongsToGameBar())
        {
            source = "foreground";
            return true;
        }

        source = "none";
        return false;
    }

    private bool TryReadGameBarApi(out bool visible)
    {
        visible = false;
        if (apiUnavailable)
        {
            return false;
        }

        try
        {
            if (!ApiInformation.IsTypePresent("Windows.Gaming.UI.GameBar"))
            {
                apiUnavailable = true;
                Console.Error.WriteLine("status: game-bar-api-unavailable reason=type-not-present");
                return false;
            }

            visible = GameBar.Visible || GameBar.IsInputRedirected;
            lastApiError = null;
            return true;
        }
        catch (Exception error)
        {
            var message = $"{error.GetType().Name}: {error.Message}";
            if (message != lastApiError)
            {
                lastApiError = message;
                Console.Error.WriteLine($"status: game-bar-api-error {message}");
            }
            return false;
        }
    }

    private static bool ForegroundWindowBelongsToGameBar()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero)
        {
            return false;
        }

        GetWindowThreadProcessId(window, out var processId);
        if (processId == 0)
        {
            return false;
        }

        try
        {
            using var process = Process.GetProcessById((int)processId);
            var name = process.ProcessName;
            return GameBarProcessNames.Any((candidate) => name.Equals(candidate, StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return false;
        }
    }

    private void ReadControlLoop()
    {
        try
        {
            string? line;
            while (!stopped.IsSet && (line = Console.In.ReadLine()) is not null)
            {
                if (line.Trim().Equals("stop", StringComparison.OrdinalIgnoreCase))
                {
                    break;
                }
            }
        }
        catch
        {
        }
        stopped.Set();
    }
}
