using System.Runtime.InteropServices;
using System.Text;
using NAudio.CoreAudioApi;

static class BridgeDeviceIdentity
{
    private const string MmDeviceInstancePrefix = "SWD\\MMDEVAPI\\";
    private const uint MaxPropertyBytes = 64 * 1024;
    private static readonly Guid NullContainer = new("00000000-0000-0000-ffff-ffffffffffff");

    public sealed record BridgeInfo(string DevicePath, Guid ContainerId, string? SerialUniqueId = null);

    public static HashSet<Guid> GetBridgeContainerIds()
    {
        return ListBridges()
            .Select(bridge => bridge.ContainerId)
            .Where(IsUsableContainerId)
            .ToHashSet();
    }

    public static List<BridgeInfo> ListBridges()
    {
        var bridges = new List<BridgeInfo>();
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenContainers = new HashSet<Guid>();
        foreach (var interfaceGuid in WinUsbBridgeTransport.BridgeDeviceInterfaceGuids)
        {
            foreach (var path in NativeMethods.EnumerateDeviceInterfacePaths(interfaceGuid))
            {
                if (!WinUsbBridgeTransport.IsBridgeInterfacePath(path) || !seenPaths.Add(path))
                {
                    continue;
                }
                _ = TryGetContainerIdForInterfacePath(path, out var containerId);
                if (IsUsableContainerId(containerId) && !seenContainers.Add(containerId))
                {
                    continue;
                }
                bridges.Add(new BridgeInfo(
                    path,
                    IsUsableContainerId(containerId) ? containerId : Guid.Empty,
                    TryGetSerialUniqueIdForInterfacePath(path, out var serialUniqueId) ? serialUniqueId : null));
            }
        }
        return bridges;
    }

    /// <summary>
    /// The bridge's board ID when its USB device reports one as its serial,
    /// as the bridge-only receiver does. Controller personas have no serial,
    /// so Windows names them by port location and this finds nothing.
    /// </summary>
    public static bool TryGetSerialUniqueIdForInterfacePath(string interfacePath, out string uniqueId)
    {
        uniqueId = string.Empty;
        if (string.IsNullOrWhiteSpace(interfacePath)
            || !TryGetInterfaceInstanceId(interfacePath, out var instanceId)
            || CmNative.CM_Locate_DevNodeW(out var deviceInstance, instanceId, CmNative.LocateDevnodePhantom)
                != CmNative.CrSuccess)
        {
            return false;
        }
        string? parentInstanceId = null;
        if (CmNative.CM_Get_Parent(out var parentInstance, deviceInstance, 0) == CmNative.CrSuccess)
        {
            _ = TryGetDevNodeString(parentInstance, CmNative.DevpkeyDeviceInstanceId, out parentInstanceId);
        }
        uniqueId = SerialUniqueIdForInterface(instanceId, parentInstanceId) ?? string.Empty;
        return uniqueId.Length > 0;
    }

    /// <summary>
    /// Reads the serial from the USB device that owns a bridge interface: the
    /// interface itself when the device has one function, else its composite
    /// parent with the same VID and PID. Only a 16-digit hex serial is a board ID.
    /// </summary>
    public static string? SerialUniqueIdForInterface(string interfaceInstanceId, string? parentInstanceId)
    {
        var separator = interfaceInstanceId.LastIndexOf('\\');
        if (separator <= 0)
        {
            return null;
        }
        var hardwareId = interfaceInstanceId[..separator];
        var functionIndex = hardwareId.IndexOf("&MI_", StringComparison.OrdinalIgnoreCase);
        string deviceInstanceId;
        if (functionIndex < 0)
        {
            deviceInstanceId = interfaceInstanceId;
        }
        else if (parentInstanceId is not null
            && parentInstanceId.StartsWith(hardwareId[..functionIndex] + "\\", StringComparison.OrdinalIgnoreCase))
        {
            deviceInstanceId = parentInstanceId;
        }
        else
        {
            return null;
        }
        var serial = deviceInstanceId[(deviceInstanceId.LastIndexOf('\\') + 1)..];
        return serial.Length == 16 && serial.All(Uri.IsHexDigit) ? serial.ToLowerInvariant() : null;
    }

    private static bool TryGetDevNodeString(uint deviceInstance, CmNative.DevPropKey key, out string value)
    {
        value = string.Empty;
        var buffer = new byte[1024];
        var size = (uint)buffer.Length;
        var result = CmNative.CM_Get_DevNode_PropertyW(
            deviceInstance, ref key, out var propertyType, buffer, ref size, 0);
        if (result != CmNative.CrSuccess || propertyType != CmNative.DevpropTypeString || size == 0)
        {
            return false;
        }
        value = System.Text.Encoding.Unicode.GetString(buffer, 0, (int)size).TrimEnd('\0');
        return value.Length > 0;
    }

    public static bool TryGetContainerIdForInterfacePath(string interfacePath, out Guid containerId)
    {
        containerId = Guid.Empty;
        return !string.IsNullOrWhiteSpace(interfacePath)
            && TryGetInterfaceInstanceId(interfacePath, out var instanceId)
            && TryGetDevNodeContainerId(instanceId, out containerId)
            && IsUsableContainerId(containerId);
    }

    public static bool TryGetEndpointContainerId(MMDevice device, out Guid containerId)
    {
        return TryGetDevNodeContainerId(MmDeviceInstancePrefix + device.ID, out containerId)
            && IsUsableContainerId(containerId);
    }

    private static bool TryGetInterfaceInstanceId(string interfacePath, out string instanceId)
    {
        instanceId = string.Empty;
        var key = CmNative.DevpkeyDeviceInstanceId;
        uint size = 0;
        var result = CmNative.CM_Get_Device_Interface_PropertyW(
            interfacePath, ref key, out var propertyType, null, ref size, 0);
        if (result != CmNative.CrBufferSmall || size == 0 || size > MaxPropertyBytes)
        {
            return false;
        }

        var buffer = new byte[size];
        result = CmNative.CM_Get_Device_Interface_PropertyW(
            interfacePath, ref key, out propertyType, buffer, ref size, 0);
        if (result != CmNative.CrSuccess || propertyType != CmNative.DevpropTypeString)
        {
            return false;
        }
        instanceId = Encoding.Unicode.GetString(buffer).TrimEnd('\0');
        return instanceId.Length > 0;
    }

    private static bool TryGetDevNodeContainerId(string instanceId, out Guid containerId)
    {
        containerId = Guid.Empty;
        var locate = CmNative.CM_Locate_DevNodeW(
            out var deviceInstance, instanceId, CmNative.LocateDevnodePhantom);
        if (locate != CmNative.CrSuccess)
        {
            return false;
        }

        var key = CmNative.DevpkeyDeviceContainerId;
        var buffer = new byte[16];
        uint size = (uint)buffer.Length;
        var result = CmNative.CM_Get_DevNode_PropertyW(
            deviceInstance, ref key, out var propertyType, buffer, ref size, 0);
        if (result != CmNative.CrSuccess || propertyType != CmNative.DevpropTypeGuid || size != 16)
        {
            return false;
        }
        containerId = new Guid(buffer);
        return IsUsableContainerId(containerId);
    }

    private static bool IsUsableContainerId(Guid containerId)
    {
        return containerId != Guid.Empty && containerId != NullContainer;
    }

    private static class CmNative
    {
        public const int CrSuccess = 0;
        public const int CrBufferSmall = 26;
        public const uint LocateDevnodePhantom = 1;
        public const uint DevpropTypeString = 0x00000012;
        public const uint DevpropTypeGuid = 0x0000000D;

        public static DevPropKey DevpkeyDeviceInstanceId = new()
        {
            FmtId = new Guid("78c34fc8-104a-4aca-9ea4-524d52996e57"),
            PropertyId = 256
        };

        public static DevPropKey DevpkeyDeviceContainerId = new()
        {
            FmtId = new Guid("8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c"),
            PropertyId = 2
        };

        [StructLayout(LayoutKind.Sequential)]
        public struct DevPropKey
        {
            public Guid FmtId;
            public uint PropertyId;
        }

        [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
        public static extern int CM_Get_Device_Interface_PropertyW(
            string deviceInterface,
            ref DevPropKey propertyKey,
            out uint propertyType,
            byte[]? propertyBuffer,
            ref uint propertyBufferSize,
            uint flags);

        [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
        public static extern int CM_Locate_DevNodeW(
            out uint deviceInstance,
            string deviceId,
            uint flags);

        [DllImport("cfgmgr32.dll")]
        public static extern int CM_Get_Parent(out uint parentInstance, uint deviceInstance, uint flags);

        [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)]
        public static extern int CM_Get_DevNode_PropertyW(
            uint deviceInstance,
            ref DevPropKey propertyKey,
            out uint propertyType,
            byte[] propertyBuffer,
            ref uint propertyBufferSize,
            uint flags);
    }
}
