using System.Runtime.InteropServices;
using System.Text;
using NAudio.CoreAudioApi;

static class BridgeDeviceIdentity
{
    private const string MmDeviceInstancePrefix = "SWD\\MMDEVAPI\\";
    private const uint MaxPropertyBytes = 64 * 1024;
    private static readonly Guid NullContainer = new("00000000-0000-0000-ffff-ffffffffffff");

    public sealed record BridgeInfo(string DevicePath, Guid ContainerId);

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
                bridges.Add(new BridgeInfo(path, IsUsableContainerId(containerId) ? containerId : Guid.Empty));
            }
        }
        return bridges;
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
