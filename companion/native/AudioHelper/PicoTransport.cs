using HidSharp;

static class PicoTransport
{
    public static HidStream? TryOpenDirectHid(string? hidPath)
    {
        if (string.IsNullOrWhiteSpace(hidPath))
        {
            return null;
        }

        var device = DeviceList.Local.GetHidDevices()
            .FirstOrDefault(candidate => string.Equals(candidate.DevicePath, hidPath, StringComparison.OrdinalIgnoreCase));
        if (device is null)
        {
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine("status: companion HID path not found; using stdout frame transport");
            }
            return null;
        }

        try
        {
            var stream = device.Open();
            stream.WriteTimeout = AudioConstants.HidWriteTimeoutMilliseconds;
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine($"status: companion HID direct output active maxOutput={device.GetMaxOutputReportLength()}");
            }
            return stream;
        }
        catch (Exception error)
        {
            if (AudioConstants.DiagnosticsEnabled)
            {
                Console.Error.WriteLine($"status: companion HID direct output unavailable: {error.Message}; using stdout frame transport");
            }
            return null;
        }
    }

    public static void DisposeQuietly(HidStream? stream)
    {
        try
        {
            stream?.Dispose();
        }
        catch
        {
        }
    }
}
