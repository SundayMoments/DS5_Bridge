using System.Text.Json;
using HidSharp;

static class BridgeCensus
{
    private const int SonyVendorId = 0x054C;
    private static readonly int[] KnownProductIds = [0x0CE6, 0x0DF2, 0x05C4, 0x09CC];

    public static void PrintJson()
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

        Console.WriteLine(JsonSerializer.Serialize(new
        {
            bridges = bridges.Select(bridge => new
            {
                path = bridge.DevicePath,
                containerId = bridge.ContainerId == Guid.Empty ? null : bridge.ContainerId.ToString()
            }),
            hidDevices
        }));
    }
}
