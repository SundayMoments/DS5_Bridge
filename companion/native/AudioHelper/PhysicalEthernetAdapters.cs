using System.Buffers.Binary;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

// Read-only physical Ethernet adapter facts for Wake-on-LAN, ported from Kitsune
// Input's network modules and its --list-physical-ethernet-adapters command.
// Nothing here changes a network, driver, power or registry setting, and
// nothing sends traffic. The interface identity matches Get-NetAdapter, so
// wake-target ids stay stable.

// One hardware Ethernet interface from GetIfTable2. OperStatus is
// IF_OPER_STATUS (1 is up); InterfaceIndex is what routes refer to.
sealed record PhysicalEthernetAdapter(
    string InterfaceGuid,
    string Name,
    byte[] Mac,
    int OperStatus,
    uint InterfaceIndex,
    string Description);

// A stored advanced-property keyword in an adapter's driver key. NotExposed
// means the driver neither stores it nor declares it under Ndi\Params;
// Unknown is unreadable or a value other than 0/1.
enum KeywordState
{
    On,
    Off,
    NotExposed,
    Unknown
}

// Only keywords a driver INF actually uses are read; no vendor keyword is
// guessed. S5WakeOnLan is Realtek's "Shutdown Wake-On-Lan".
sealed record AdapterKeywords(
    KeywordState WakeOnMagicPacket,
    KeywordState S5WakeOnLan,
    KeywordState ModernStandbyWoLMagicPacket,
    KeywordState Eee)
{
    public static readonly AdapterKeywords Unknown =
        new(KeywordState.Unknown, KeywordState.Unknown, KeywordState.Unknown, KeywordState.Unknown);
}

// PnP and driver facts for one adapter, read with SetupDi and KEY_READ.
// HardwareIds is most specific first. IdenticalPresentDevices counts present
// network-class devices, this one included, with the same most specific
// hardware ID; above 1, hardware IDs alone cannot tell them apart.
sealed record AdapterDevice
{
    public string? EnumeratorName { get; init; }
    public bool? InLocalMachineContainer { get; init; }
    public string? DriverProvider { get; init; }
    public string? DriverVersion { get; init; }
    public string? FriendlyName { get; init; }
    public string? DeviceDescription { get; init; }
    public IReadOnlyList<string> HardwareIds { get; init; } = [];
    public int IdenticalPresentDevices { get; init; }
    public AdapterKeywords Keywords { get; init; } = AdapterKeywords.Unknown;
}

// One IPv4 or IPv6 default route on a connected interface; Metric is the
// route metric plus the interface metric.
readonly record struct DefaultRoute(bool Ipv4, uint InterfaceIndex, ulong Metric);

static class PhysicalEthernetAdapters
{
    // The list's readiness fields wait at most this long. The companion gives
    // the whole command 5 s and depends on its ownership rows.
    private static readonly TimeSpan EnrichmentCap = TimeSpan.FromMilliseconds(1500);
    private const uint IfTypeEthernetCsmacd = 6;
    private const int MaxInterfaceRows = 4096;
    private const int MaxRouteRows = 65536;
    // The IP Helper tables' rows start 8 bytes in: NumEntries is padded to the
    // rows' 8-byte (NET_LUID) alignment.
    private const int MibTableRowsOffset = 8;
    private const ushort AfUnspec = 0;
    private const ushort AfInet = 2;
    private const ushort AfInet6 = 23;
    private const int MaxDevices = 4096;
    private const int PropertyBytes = 4096;
    private const uint DevpropTypeBoolean = 0x11;
    private const uint DevpropTypeString = 0x12;
    private const uint DevpropTypeStringList = 0x2012;
    private const uint DicsFlagGlobal = 1;
    private const uint DiregDrv = 2;
    private const uint KeyRead = 0x20019;
    private static readonly IntPtr InvalidHandleValue = new(-1);
    private static readonly UnicodeEncoding StrictUtf16 = new(bigEndian: false, byteOrderMark: false, throwOnInvalidBytes: true);
    private static readonly Guid NetDeviceClass = new("4d36e972-e325-11ce-bfc1-08002be10318");
    private static readonly Guid DeviceGeneralProperties = new("a45c254e-df1c-4efd-8020-67d146a850e0");
    private static readonly Guid DeviceDriverProperties = new("a8b865dd-2e3d-4094-ad97-e593a70c75d6");
    private static readonly DevPropKey DeviceDescKey = new(DeviceGeneralProperties, 2);
    private static readonly DevPropKey HardwareIdsKey = new(DeviceGeneralProperties, 3);
    private static readonly DevPropKey FriendlyNameKey = new(DeviceGeneralProperties, 14);
    private static readonly DevPropKey EnumeratorNameKey = new(DeviceGeneralProperties, 24);
    private static readonly DevPropKey DriverVersionKey = new(DeviceDriverProperties, 3);
    private static readonly DevPropKey DriverProviderKey = new(DeviceDriverProperties, 9);
    private static readonly DevPropKey IsPresentKey = new(new Guid("540b947e-8b40-45bc-a8a2-6a0b894cbda2"), 5);
    private static readonly DevPropKey InLocalMachineContainerKey =
        new(new Guid("8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c"), 4);

    // --list-physical-ethernet-adapters: Get-NetAdapter-shaped rows plus
    // read-only readiness facts that are null when unreadable.
    public static int PrintJson()
    {
        IReadOnlyList<PhysicalEthernetAdapter> adapters;
        try
        {
            adapters = List();
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Failed to read physical Ethernet adapters: {error.Message}");
            return 1;
        }
        var (devices, bestRoutes) = Enrich(adapters, OneShot.Deadline(EnrichmentCap), AdapterDevices, DefaultRoutes);
        string line;
        try
        {
            line = AdaptersJson(adapters, devices, bestRoutes);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Failed to serialize the Ethernet adapter list: {error.Message}");
            return 1;
        }
        // The caller exits at once: an enrichment read that missed the cap
        // must not delay the ownership list.
        return OneShot.PrintLine(line);
    }

    // Maps IF_OPER_STATUS to the Get-NetAdapter status words. The companion
    // only treats Up as connected.
    public static string AdapterStatus(int operStatus) => operStatus switch
    {
        1 => "Up",
        3 => "Testing",
        5 => "Dormant",
        6 => "Not Present",
        2 or 7 => "Disconnected",
        _ => "Unknown"
    };

    // Devices is parallel to adapters; bestRoutes is null when the routing
    // table could not be read. The first four fields keep Get-NetAdapter's
    // names, order and formats.
    public static string AdaptersJson(
        IReadOnlyList<PhysicalEthernetAdapter> adapters,
        IReadOnlyList<AdapterDevice?> devices,
        IReadOnlyList<uint>? bestRoutes)
    {
        return OneShot.Json(writer =>
        {
            writer.WriteStartArray();
            for (var index = 0; index < adapters.Count; index++)
            {
                var adapter = adapters[index];
                var device = index < devices.Count ? devices[index] : null;
                writer.WriteStartObject();
                writer.WriteString("InterfaceGuid", adapter.InterfaceGuid);
                writer.WriteString("Name", adapter.Name);
                writer.WriteString("MacAddress", FormatMac(adapter.Mac));
                writer.WriteString("Status", AdapterStatus(adapter.OperStatus));
                OneShot.WriteNullable(writer, "EnumeratorName", device?.EnumeratorName);
                OneShot.WriteNullable(writer, "InLocalMachineContainer", device?.InLocalMachineContainer);
                OneShot.WriteNullable(writer, "DefaultRoute", bestRoutes?.Contains(adapter.InterfaceIndex));
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        });
    }

    // Runs the read-only enrichment on worker threads and waits only until the
    // deadline. Anything late, failed or malformed is left null, so the rows
    // are printed within the cap whatever SetupDi, the driver keys or the
    // routing table do.
    public static (IReadOnlyList<AdapterDevice?> Devices, IReadOnlyList<uint>? BestRoutes) Enrich(
        IReadOnlyList<PhysicalEthernetAdapter> adapters,
        long deadline,
        Func<IReadOnlyList<string>, IReadOnlyList<AdapterDevice?>> devices,
        Func<IReadOnlyList<DefaultRoute>> routes)
    {
        var count = adapters.Count;
        if (count == 0)
        {
            return ([], null);
        }
        var guids = adapters.Select(adapter => adapter.InterfaceGuid).ToArray();
        var deviceRead = OneShot.Start("adapter devices", () => devices(guids));
        var routeRead = OneShot.Start("adapter routes", routes);
        IReadOnlyList<AdapterDevice?> found =
            OneShot.TryTake(deviceRead, deadline, out var list) && list?.Count == count
                ? list
                : new AdapterDevice?[count];
        var bestRoutes = OneShot.TryTake(routeRead, deadline, out var table) && table is not null
            ? BestDefaultRouteInterfaces(table)
            : null;
        return (found, bestRoutes);
    }

    // Lists hardware Ethernet interfaces with a six-byte MAC from one
    // GetIfTable2 snapshot. Wi-Fi, virtual and filter interfaces are excluded;
    // link state is reported, never filtered. Throws when the table cannot be read.
    public static List<PhysicalEthernetAdapter> List()
    {
        var status = GetIfTable2(out var table);
        if (status != 0 || table == IntPtr.Zero)
        {
            throw new Win32Exception(unchecked((int)status));
        }
        try
        {
            var count = Marshal.ReadInt32(table);
            if (count < 0 || count > MaxInterfaceRows)
            {
                throw new InvalidOperationException("The interface table is implausibly large.");
            }
            var rowSize = Marshal.SizeOf<MibIfRow2>();
            var adapters = new List<PhysicalEthernetAdapter>();
            for (var index = 0; index < count; index++)
            {
                var row = Marshal.PtrToStructure<MibIfRow2>(table + MibTableRowsOffset + index * rowSize);
                if (FromRow(row) is { } adapter)
                {
                    adapters.Add(adapter);
                }
            }
            return adapters;
        }
        finally
        {
            FreeMibTable(table);
        }
    }

    // netioapi.h declares HardwareInterface first (bit 0) and FilterInterface
    // second (bit 1). OperStatus and LowPower are intentionally not tests:
    // Windows may already be changing them while preparing to suspend.
    internal static bool IsPhysicalEthernet(uint type, byte interfaceFlags, uint physicalAddressLength) =>
        type == IfTypeEthernetCsmacd && (interfaceFlags & 3) == 1 && physicalAddressLength == 6;

    internal static PhysicalEthernetAdapter? FromRow(MibIfRow2 row)
    {
        if (!IsPhysicalEthernet(row.Type, row.InterfaceAndOperStatusFlags, row.PhysicalAddressLength)
            || row.PhysicalAddress is not { Length: >= 6 })
        {
            return null;
        }
        return new PhysicalEthernetAdapter(
            FormatBracedGuid(row.InterfaceGuid),
            row.Alias ?? string.Empty,
            row.PhysicalAddress[..6],
            row.OperStatus,
            row.InterfaceIndex,
            row.Description ?? string.Empty);
    }

    // Formats a GUID the way the registry and Get-NetAdapter do.
    public static string FormatBracedGuid(Guid guid) => guid.ToString("B").ToUpperInvariant();

    // Formats a MAC as Get-NetAdapter does: upper-case, dash separated.
    public static string FormatMac(byte[] mac) => string.Join('-', mac.Select(octet => octet.ToString("X2")));

    // Default routes on connected interfaces, from the routing and IP-interface
    // tables. This is a table read; no destination is resolved or contacted.
    public static List<DefaultRoute> DefaultRoutes()
    {
        var interfaces = new Dictionary<(bool Ipv4, uint Index), (ulong Metric, bool Connected)>();
        var status = GetIpInterfaceTable(AfUnspec, out var interfaceTable);
        if (status != 0 || interfaceTable == IntPtr.Zero)
        {
            throw new Win32Exception(unchecked((int)status));
        }
        try
        {
            var count = RowCount(interfaceTable);
            var rowSize = Marshal.SizeOf<MibIpInterfaceRow>();
            for (var index = 0; index < count; index++)
            {
                var row = Marshal.PtrToStructure<MibIpInterfaceRow>(
                    interfaceTable + MibTableRowsOffset + index * rowSize);
                if (row.Family is AfInet or AfInet6)
                {
                    interfaces[(row.Family == AfInet, row.InterfaceIndex)] = (row.Metric, row.Connected != 0);
                }
            }
        }
        finally
        {
            FreeMibTable(interfaceTable);
        }

        status = GetIpForwardTable2(AfUnspec, out var routeTable);
        if (status != 0 || routeTable == IntPtr.Zero)
        {
            throw new Win32Exception(unchecked((int)status));
        }
        try
        {
            var routes = new List<DefaultRoute>();
            var count = RowCount(routeTable);
            var rowSize = Marshal.SizeOf<MibIpForwardRow2>();
            for (var index = 0; index < count; index++)
            {
                var row = Marshal.PtrToStructure<MibIpForwardRow2>(routeTable + MibTableRowsOffset + index * rowSize);
                if (row.DestinationPrefixLength != 0 || row.DestinationPrefix.Family is not (AfInet or AfInet6))
                {
                    continue;
                }
                var ipv4 = row.DestinationPrefix.Family == AfInet;
                if (interfaces.TryGetValue((ipv4, row.InterfaceIndex), out var routeInterface) && routeInterface.Connected)
                {
                    routes.Add(new DefaultRoute(ipv4, row.InterfaceIndex, row.Metric + routeInterface.Metric));
                }
            }
            return routes;
        }
        finally
        {
            FreeMibTable(routeTable);
        }
    }

    private static int RowCount(IntPtr table)
    {
        var count = Marshal.ReadInt32(table);
        if (count < 0 || count > MaxRouteRows)
        {
            throw new InvalidOperationException("The routing table is implausibly large.");
        }
        return count;
    }

    // Interfaces carrying the best-metric IPv4 default route, or the best IPv6
    // default route when there is no IPv4 default route. Ties keep every
    // interface at the best metric.
    public static List<uint> BestDefaultRouteInterfaces(IReadOnlyList<DefaultRoute> routes)
    {
        var ipv4 = routes.Any(route => route.Ipv4);
        var family = routes.Where(route => route.Ipv4 == ipv4).ToList();
        if (family.Count == 0)
        {
            return [];
        }
        var best = family.Min(route => route.Metric);
        return family
            .Where(route => route.Metric == best)
            .Select(route => route.InterfaceIndex)
            .Distinct()
            .Order()
            .ToList();
    }

    // Whether two hardware-id lists name the same device model: their first,
    // most specific IDs (vendor, device, subsystem and revision) are equal,
    // ignoring ASCII case. Empty lists never match.
    public static bool SameDeviceIdentity(IReadOnlyList<string> left, IReadOnlyList<string> right) =>
        left.Count > 0
        && right.Count > 0
        && left[0].Length > 0
        && OneShot.EqualsIgnoreAsciiCase(left[0], right[0]);

    // Parses an advanced-property value. Drivers store these as REG_SZ "0"/"1"
    // and occasionally as REG_DWORD; both forms are accepted.
    public static KeywordState ParseKeywordValue(uint kind, ReadOnlySpan<byte> data)
    {
        const uint regSz = 1;
        const uint regExpandSz = 2;
        const uint regDword = 4;
        uint? number = null;
        if (kind is regSz or regExpandSz && DecodeRegistryString(data) is { } text && TryParseUnsigned(text.Trim(), out var parsed))
        {
            number = parsed;
        }
        else if (kind == regDword && data.Length == 4)
        {
            number = BinaryPrimitives.ReadUInt32LittleEndian(data);
        }
        return number switch
        {
            1 => KeywordState.On,
            0 => KeywordState.Off,
            _ => KeywordState.Unknown
        };
    }

    // Rust's str::parse::<u32>: an optional '+' and ASCII digits only.
    private static bool TryParseUnsigned(string text, out uint value)
    {
        var digits = text.StartsWith('+') ? text[1..] : text;
        value = 0;
        return digits.Length > 0
            && digits.All(char.IsAsciiDigit)
            && uint.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out value);
    }

    // Resolves one keyword: a stored value wins; otherwise the driver uses the
    // default declared under Ndi\Params\<keyword>; neither means the driver
    // does not expose the keyword.
    public static KeywordState ResolveKeyword(RegistryRead stored, Func<RegistryRead> declaredDefault)
    {
        if (stored.Failed)
        {
            return KeywordState.Unknown;
        }
        if (stored.Data is { } value)
        {
            return ParseKeywordValue(stored.Kind, value);
        }
        var declared = declaredDefault();
        if (declared.Failed)
        {
            return KeywordState.Unknown;
        }
        return declared.Data is { } fallback
            ? ParseKeywordValue(declared.Kind, fallback)
            : KeywordState.NotExposed;
    }

    // Decodes a NUL-terminated (or unterminated) UTF-16LE registry string.
    // Odd-length data and invalid UTF-16 are null, not guessed.
    public static string? DecodeRegistryString(ReadOnlySpan<byte> data)
    {
        if (data.Length % 2 != 0)
        {
            return null;
        }
        var words = MemoryMarshal.Cast<byte, char>(data);
        var end = words.IndexOf('\0');
        try
        {
            return StrictUtf16.GetString(data[..((end < 0 ? words.Length : end) * 2)]);
        }
        catch (DecoderFallbackException)
        {
            return null;
        }
    }

    // Splits a UTF-16 multi-string (a\0b\0\0) into its non-empty entries.
    public static List<string> SplitMultiString(ReadOnlySpan<byte> data)
    {
        var entries = new List<string>();
        var words = MemoryMarshal.Cast<byte, char>(data[..(data.Length & ~1)]);
        while (true)
        {
            var end = words.IndexOf('\0');
            var entry = end < 0 ? words : words[..end];
            if (entry.IsEmpty)
            {
                return entries;
            }
            entries.Add(Encoding.Unicode.GetString(MemoryMarshal.AsBytes(entry)));
            if (end < 0)
            {
                return entries;
            }
            words = words[(end + 1)..];
        }
    }

    // Finds each interface GUID's network-class device by its driver key's
    // NetCfgInstanceId, in one device enumeration. An entry is null when no
    // device matches or the device set cannot be read.
    public static AdapterDevice?[] AdapterDevices(IReadOnlyList<string> interfaceGuids)
    {
        var found = new AdapterDevice?[interfaceGuids.Count];
        var deviceClass = NetDeviceClass;
        // Flags 0 include adapters that are installed but not present.
        var set = SetupDiGetClassDevsW(ref deviceClass, IntPtr.Zero, IntPtr.Zero, 0);
        if (set == IntPtr.Zero || set == InvalidHandleValue)
        {
            return found;
        }
        try
        {
            var candidates = new List<(IReadOnlyList<string> HardwareIds, bool Present)>();
            for (uint index = 0; index < MaxDevices; index++)
            {
                var device = new SpDevinfoData { CbSize = (uint)Marshal.SizeOf<SpDevinfoData>() };
                if (!SetupDiEnumDeviceInfo(set, index, ref device))
                {
                    break;
                }
                var hardwareIds = ListProperty(set, ref device, HardwareIdsKey);
                var present = FlagProperty(set, ref device, IsPresentKey) ?? false;
                var key = OpenDriverKey(set, ref device);
                try
                {
                    var instance = key == IntPtr.Zero
                        ? null
                        : RegistryValues.Read(key, null, "NetCfgInstanceId") is { Data: { } data }
                            ? DecodeRegistryString(data)?.Trim()
                            : null;
                    for (var slot = 0; instance is not null && slot < found.Length; slot++)
                    {
                        if (found[slot] is null && OneShot.EqualsIgnoreAsciiCase(instance, interfaceGuids[slot].Trim()))
                        {
                            found[slot] = new AdapterDevice
                            {
                                EnumeratorName = TextProperty(set, ref device, EnumeratorNameKey),
                                InLocalMachineContainer = FlagProperty(set, ref device, InLocalMachineContainerKey),
                                DriverProvider = TextProperty(set, ref device, DriverProviderKey),
                                DriverVersion = TextProperty(set, ref device, DriverVersionKey),
                                FriendlyName = TextProperty(set, ref device, FriendlyNameKey),
                                DeviceDescription = TextProperty(set, ref device, DeviceDescKey),
                                HardwareIds = hardwareIds,
                                Keywords = new AdapterKeywords(
                                    Keyword(key, "*WakeOnMagicPacket"),
                                    Keyword(key, "S5WakeOnLan"),
                                    Keyword(key, "*ModernStandbyWoLMagicPacket"),
                                    Keyword(key, "*EEE"))
                            };
                        }
                    }
                }
                finally
                {
                    if (key != IntPtr.Zero)
                    {
                        _ = RegCloseKey(key);
                    }
                }
                candidates.Add((hardwareIds, present));
            }
            for (var slot = 0; slot < found.Length; slot++)
            {
                if (found[slot] is { } match)
                {
                    found[slot] = match with
                    {
                        IdenticalPresentDevices = candidates.Count(candidate =>
                            candidate.Present && SameDeviceIdentity(candidate.HardwareIds, match.HardwareIds))
                    };
                }
            }
            return found;
        }
        finally
        {
            _ = SetupDiDestroyDeviceInfoList(set);
        }
    }

    private static KeywordState Keyword(IntPtr driverKey, string name) =>
        ResolveKeyword(
            RegistryValues.Read(driverKey, null, name),
            () => RegistryValues.Read(driverKey, $@"Ndi\Params\{name}", "default"));

    // KEY_READ opens the existing driver key for reading and never creates it
    // (SetupDiCreateDevRegKey is not used). Zero when it cannot be opened.
    private static IntPtr OpenDriverKey(IntPtr set, ref SpDevinfoData device)
    {
        var key = SetupDiOpenDevRegKey(set, ref device, DicsFlagGlobal, 0, DiregDrv, KeyRead);
        return key == InvalidHandleValue ? IntPtr.Zero : key;
    }

    // Windows writes at most the buffer's length; a larger value fails instead.
    private static bool RawProperty(IntPtr set, ref SpDevinfoData device, DevPropKey key, out uint type, out byte[] value)
    {
        var buffer = new byte[PropertyBytes];
        if (!SetupDiGetDevicePropertyW(set, ref device, ref key, out type, buffer, (uint)buffer.Length, out var required, 0))
        {
            value = [];
            return false;
        }
        value = buffer[..(int)Math.Min(required, (uint)PropertyBytes)];
        return true;
    }

    private static string? TextProperty(IntPtr set, ref SpDevinfoData device, DevPropKey key) =>
        RawProperty(set, ref device, key, out var type, out var value)
        && type == DevpropTypeString
        && DecodeRegistryString(value.AsSpan(0, value.Length & ~1)) is { Length: > 0 } text
            ? text
            : null;

    private static List<string> ListProperty(IntPtr set, ref SpDevinfoData device, DevPropKey key) =>
        RawProperty(set, ref device, key, out var type, out var value) && type == DevpropTypeStringList
            ? SplitMultiString(value)
            : [];

    // DEVPROP_BOOLEAN is one byte: DEVPROP_TRUE (0xFF) or DEVPROP_FALSE.
    private static bool? FlagProperty(IntPtr set, ref SpDevinfoData device, DevPropKey key) =>
        RawProperty(set, ref device, key, out var type, out var value)
        && type == DevpropTypeBoolean
        && value.Length == 1
            ? value[0] != 0
            : null;

    // MIB_IF_ROW2 (netioapi.h); 1352 bytes on x64. The status flags are one
    // byte of BOOLEAN bit fields.
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct MibIfRow2
    {
        public ulong InterfaceLuid;
        public uint InterfaceIndex;
        public Guid InterfaceGuid;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 257)]
        public string Alias;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 257)]
        public string Description;
        public uint PhysicalAddressLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] PhysicalAddress;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] PermanentPhysicalAddress;
        public uint Mtu;
        public uint Type;
        public int TunnelType;
        public int MediaType;
        public int PhysicalMediumType;
        public int AccessType;
        public int DirectionType;
        public byte InterfaceAndOperStatusFlags;
        public int OperStatus;
        public int AdminStatus;
        public int MediaConnectState;
        public Guid NetworkGuid;
        public int ConnectionType;
        public ulong TransmitLinkSpeed;
        public ulong ReceiveLinkSpeed;
        // InOctets through OutQLen.
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 18)]
        public ulong[] Counters;
    }

    // MIB_IPINTERFACE_ROW (netioapi.h); 168 bytes on x64. BOOLEANs are bytes.
    [StructLayout(LayoutKind.Sequential)]
    internal struct MibIpInterfaceRow
    {
        public ushort Family;
        public ulong InterfaceLuid;
        public uint InterfaceIndex;
        public uint MaxReassemblySize;
        public ulong InterfaceIdentifier;
        public uint MinRouterAdvertisementInterval;
        public uint MaxRouterAdvertisementInterval;
        public byte AdvertisingEnabled;
        public byte ForwardingEnabled;
        public byte WeakHostSend;
        public byte WeakHostReceive;
        public byte UseAutomaticMetric;
        public byte UseNeighborUnreachabilityDetection;
        public byte ManagedAddressConfigurationSupported;
        public byte OtherStatefulConfigurationSupported;
        public byte AdvertiseDefaultRoute;
        public int RouterDiscoveryBehavior;
        public uint DadTransmits;
        public uint BaseReachableTime;
        public uint RetransmitTime;
        public uint PathMtuDiscoveryTimeout;
        public int LinkLocalAddressBehavior;
        public uint LinkLocalAddressTimeout;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public uint[] ZoneIndices;
        public uint SitePrefixLength;
        public uint Metric;
        public uint NlMtu;
        public byte Connected;
        public byte SupportsWakeUpPatterns;
        public byte SupportsNeighborDiscovery;
        public byte SupportsRouterDiscovery;
        public uint ReachableTime;
        public byte TransmitOffload;
        public byte ReceiveOffload;
        public byte DisableDefaultRoutes;
    }

    // SOCKADDR_INET: the SOCKADDR_IN6 arm (28 bytes) covers the union.
    [StructLayout(LayoutKind.Sequential)]
    internal struct SockAddrInet
    {
        public ushort Family;
        public ushort Port;
        public uint FlowInfo;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] Address;
        public uint ScopeId;
    }

    // MIB_IPFORWARD_ROW2 (netioapi.h); 104 bytes on x64. DestinationPrefix is
    // IP_ADDRESS_PREFIX { SOCKADDR_INET Prefix; UINT8 PrefixLength; }.
    [StructLayout(LayoutKind.Sequential)]
    internal struct MibIpForwardRow2
    {
        public ulong InterfaceLuid;
        public uint InterfaceIndex;
        public SockAddrInet DestinationPrefix;
        public byte DestinationPrefixLength;
        public SockAddrInet NextHop;
        public byte SitePrefixLength;
        public uint ValidLifetime;
        public uint PreferredLifetime;
        public uint Metric;
        public int Protocol;
        public byte Loopback;
        public byte AutoconfigureAddress;
        public byte Publish;
        public byte Immortal;
        public uint Age;
        public int Origin;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SpDevinfoData
    {
        public uint CbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public IntPtr Reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DevPropKey(Guid fmtId, uint pid)
    {
        public Guid FmtId = fmtId;
        public uint Pid = pid;
    }

    [DllImport("iphlpapi.dll")]
    private static extern uint GetIfTable2(out IntPtr table);

    [DllImport("iphlpapi.dll")]
    private static extern uint GetIpInterfaceTable(ushort family, out IntPtr table);

    [DllImport("iphlpapi.dll")]
    private static extern uint GetIpForwardTable2(ushort family, out IntPtr table);

    [DllImport("iphlpapi.dll")]
    private static extern void FreeMibTable(IntPtr memory);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevsW(ref Guid classGuid, IntPtr enumerator, IntPtr parent, uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiEnumDeviceInfo(IntPtr deviceInfoSet, uint memberIndex, ref SpDevinfoData deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiGetDevicePropertyW(
        IntPtr deviceInfoSet,
        ref SpDevinfoData deviceInfoData,
        ref DevPropKey propertyKey,
        out uint propertyType,
        [Out] byte[] propertyBuffer,
        uint propertyBufferSize,
        out uint requiredSize,
        uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern IntPtr SetupDiOpenDevRegKey(
        IntPtr deviceInfoSet,
        ref SpDevinfoData deviceInfoData,
        uint scope,
        uint hwProfile,
        uint keyType,
        uint samDesired);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [DllImport("advapi32.dll")]
    private static extern int RegCloseKey(IntPtr key);
}

// One raw registry read: Data is null when the key or value is absent, and
// Error is the Win32 code of any other failure.
readonly record struct RegistryRead(int Error, uint Kind, byte[]? Data)
{
    public bool Failed => Error != 0;
    public static RegistryRead Absent => new(0, 0, null);
    public static RegistryRead Value(uint kind, byte[] data) => new(0, kind, data);
    public static RegistryRead Failure(int error) => new(error, 0, null);
}

// Bounded, read-only registry value reads. RegGetValueW opens any subkey
// with query access only; nothing here can create, change or delete state.
static class RegistryValues
{
    public static readonly IntPtr LocalMachine = new(unchecked((int)0x80000002));
    public const uint Subkey64BitView = 0x00010000;
    private const uint AnyType = 0x0000ffff;
    private const uint NoExpand = 0x10000000;
    private const int ValueLimit = 4096;
    private const int ErrorFileNotFound = 2;
    private const int ErrorPathNotFound = 3;

    public static RegistryRead Read(IntPtr key, string? subkey, string name, uint extraFlags = 0)
    {
        var data = new byte[ValueLimit];
        var length = (uint)data.Length;
        // A larger value returns ERROR_MORE_DATA instead of writing past it.
        var status = RegGetValueW(key, subkey, name, AnyType | NoExpand | extraFlags, out var kind, data, ref length);
        if (status is ErrorFileNotFound or ErrorPathNotFound)
        {
            return RegistryRead.Absent;
        }
        if (status != 0)
        {
            return RegistryRead.Failure(status);
        }
        return RegistryRead.Value(kind, data[..(int)Math.Min(length, (uint)ValueLimit)]);
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int RegGetValueW(
        IntPtr key,
        string? subKey,
        string? valueName,
        uint flags,
        out uint type,
        [Out] byte[] data,
        ref uint dataLength);
}
