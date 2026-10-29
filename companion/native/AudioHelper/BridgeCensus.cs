using System.Text.Json;
using HidSharp;

static class BridgeCensus
{
    private const int SonyVendorId = 0x054C;
    private static readonly int[] KnownProductIds = [0x0CE6, 0x0DF2, 0x05C4, 0x09CC];

    public static void PrintJson()
    {
        Console.WriteLine(Snapshot());
    }

    /// <summary>
    /// Answers each "snapshot" line on stdin with one census line on stdout, so
    /// the app can take a census every couple of seconds without starting a
    /// process each time. "stop" or end of input ends the server.
    /// </summary>
    public static async Task RunServerAsync(
        TextReader? input = null,
        TextWriter? output = null,
        Func<string>? snapshot = null)
    {
        input ??= Console.In;
        output ??= Console.Out;
        snapshot ??= Snapshot;
        while (true)
        {
            var line = await input.ReadLineAsync();
            if (line is null || line.Trim().Equals("stop", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            await output.WriteLineAsync(snapshot());
            await output.FlushAsync();
        }
    }

    public static string Snapshot()
    {
        var bridges = BridgeDeviceIdentity.ListBridges();
        var bridgeContainers = bridges
            .Select(bridge => bridge.ContainerId)
            .Where(container => container != Guid.Empty)
            .ToHashSet();
        var hidDevices = new List<object>();

        foreach (var device in DeviceList.Local.GetHidDevices(SonyVendorId))
        {
            if (!KnownProductIds.Contains(device.ProductID))
            {
                continue;
            }
            _ = BridgeDeviceIdentity.TryGetContainerIdForInterfacePath(device.DevicePath, out var containerId);
            string? product = null;
            try
            {
                product = device.GetProductName();
            }
            catch
            {
                // Product text is optional census metadata.
            }
            hidDevices.Add(new
            {
                path = device.DevicePath,
                productId = device.ProductID,
                product,
                containerId = containerId == Guid.Empty ? null : containerId.ToString(),
                isBridge = containerId != Guid.Empty && bridgeContainers.Contains(containerId)
            });
        }

        return JsonSerializer.Serialize(new
        {
            bridges = bridges.Select(bridge => new
            {
                path = bridge.DevicePath,
                containerId = bridge.ContainerId == Guid.Empty ? null : bridge.ContainerId.ToString(),
                uniqueId = bridge.SerialUniqueId
            }),
            hidDevices
        });
    }
}
