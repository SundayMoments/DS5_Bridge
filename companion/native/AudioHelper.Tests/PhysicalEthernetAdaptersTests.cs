using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using Xunit;

// Ported from Kitsune Input's network.rs, network_windows.rs,
// network_device_windows.rs and system_commands.rs tests. The live tests are
// read-only: GetIfTable2, SetupDi properties, KEY_READ driver-key values and
// the routing table.
public sealed class PhysicalEthernetAdaptersTests
{
    private static byte[] Utf16(string text) => Encoding.Unicode.GetBytes(text + "\0");

    private static byte[] Dword(uint value) => BitConverter.GetBytes(value);

    private static PhysicalEthernetAdapter Adapter(uint index) => new(
        $"{{00000000-0000-0000-0000-00000000000{index}}}",
        $"Ethernet {index}",
        [2, 0, 0, 0, 0, (byte)index],
        1,
        index,
        "Fixture");

    private static void Stall() => Thread.Sleep(TimeSpan.FromSeconds(5));

    [Fact]
    public void FormatsAdapterIdentityLikeGetNetAdapter()
    {
        Assert.Equal(
            "{0A1B2C3D-4E5F-0607-8091-A2B3C4D5E6F7}",
            PhysicalEthernetAdapters.FormatBracedGuid(new Guid("0a1b2c3d-4e5f-0607-8091-a2b3c4d5e6f7")));
        Assert.Equal("02-11-22-AB-4C-5D", PhysicalEthernetAdapters.FormatMac([2, 0x11, 0x22, 0xab, 0x4c, 0x5d]));
    }

    [Fact]
    public void KeywordValuesAcceptStringAndDwordForms()
    {
        Assert.Equal(KeywordState.On, PhysicalEthernetAdapters.ParseKeywordValue(1, Utf16("1")));
        Assert.Equal(KeywordState.Off, PhysicalEthernetAdapters.ParseKeywordValue(1, Utf16("0")));
        Assert.Equal(KeywordState.On, PhysicalEthernetAdapters.ParseKeywordValue(1, Utf16(" 1 ")));
        Assert.Equal(KeywordState.Off, PhysicalEthernetAdapters.ParseKeywordValue(2, Utf16("0")));
        Assert.Equal(KeywordState.On, PhysicalEthernetAdapters.ParseKeywordValue(4, Dword(1)));
        Assert.Equal(KeywordState.Off, PhysicalEthernetAdapters.ParseKeywordValue(4, Dword(0)));
        // Other numbers, text, short data and other types are not guessed.
        foreach (var (kind, data) in new (uint, byte[])[]
        {
            (1, Utf16("2")),
            (1, Utf16("Enabled")),
            (1, Utf16("")),
            (4, Dword(2)),
            (4, [1, 0]),
            (3, [1]),
            (7, Utf16("1"))
        })
        {
            Assert.Equal(KeywordState.Unknown, PhysicalEthernetAdapters.ParseKeywordValue(kind, data));
        }
    }

    [Fact]
    public void KeywordsFallBackToTheDeclaredDefaultThenNotExposed()
    {
        var on = () => RegistryRead.Value(1, Utf16("1"));
        Assert.Equal(KeywordState.Off, PhysicalEthernetAdapters.ResolveKeyword(RegistryRead.Value(1, Utf16("0")), on));
        Assert.Equal(KeywordState.On, PhysicalEthernetAdapters.ResolveKeyword(RegistryRead.Absent, on));
        Assert.Equal(
            KeywordState.NotExposed,
            PhysicalEthernetAdapters.ResolveKeyword(RegistryRead.Absent, () => RegistryRead.Absent));
        Assert.Equal(
            KeywordState.Unknown,
            PhysicalEthernetAdapters.ResolveKeyword(RegistryRead.Absent, () => RegistryRead.Failure(5)));
        // A failed read is not absence: the declared default is never consulted.
        Assert.Equal(
            KeywordState.Unknown,
            PhysicalEthernetAdapters.ResolveKeyword(
                RegistryRead.Failure(5),
                () => throw new InvalidOperationException("a failed read is not absence")));
    }

    [Fact]
    public void DeviceIdentityComparesTheMostSpecificHardwareId()
    {
        string[] realtek = [@"PCI\VEN_10EC&DEV_8125&SUBSYS_E0001458&REV_0C", @"PCI\VEN_10EC&DEV_8125&CC_0200"];
        Assert.True(PhysicalEthernetAdapters.SameDeviceIdentity(
            realtek,
            [@"pci\ven_10ec&dev_8125&subsys_e0001458&rev_0c"]));
        Assert.False(PhysicalEthernetAdapters.SameDeviceIdentity(
            realtek,
            [@"PCI\VEN_10EC&DEV_8125&SUBSYS_E0001458&REV_05"]));
        Assert.False(PhysicalEthernetAdapters.SameDeviceIdentity(realtek, []));
        Assert.False(PhysicalEthernetAdapters.SameDeviceIdentity([], []));
        Assert.False(PhysicalEthernetAdapters.SameDeviceIdentity([""], [""]));
    }

    [Fact]
    public void DecodesRegistryAndMultiStrings()
    {
        Assert.Equal("PCI", PhysicalEthernetAdapters.DecodeRegistryString(Utf16("PCI")));
        Assert.Equal("A", PhysicalEthernetAdapters.DecodeRegistryString("A\0"u8));
        Assert.Null(PhysicalEthernetAdapters.DecodeRegistryString("A"u8));
        // An unpaired surrogate is not text.
        Assert.Null(PhysicalEthernetAdapters.DecodeRegistryString(new byte[] { 0x00, 0xD8, 0x41, 0x00 }));
        Assert.Equal(
            [@"PCI\A", @"PCI\B"],
            PhysicalEthernetAdapters.SplitMultiString(Encoding.Unicode.GetBytes("PCI\\A\0PCI\\B\0\0junk")));
        Assert.Empty(PhysicalEthernetAdapters.SplitMultiString(new byte[4]));
    }

    [Fact]
    public void DefaultRoutePrefersBestIpv4ThenIpv6()
    {
        Assert.Empty(PhysicalEthernetAdapters.BestDefaultRouteInterfaces([]));
        Assert.Equal(
            [14u],
            PhysicalEthernetAdapters.BestDefaultRouteInterfaces(
                [new DefaultRoute(true, 14, 25), new DefaultRoute(true, 7, 35), new DefaultRoute(false, 7, 5)]));
        // IPv6 decides only when no IPv4 default route exists.
        Assert.Equal(
            [7u],
            PhysicalEthernetAdapters.BestDefaultRouteInterfaces(
                [new DefaultRoute(false, 14, 30), new DefaultRoute(false, 7, 20)]));
        Assert.Equal(
            [7u, 14u],
            PhysicalEthernetAdapters.BestDefaultRouteInterfaces(
                [new DefaultRoute(true, 14, 25), new DefaultRoute(true, 7, 25), new DefaultRoute(true, 14, 25)]));
    }

    [Fact]
    public void OnlyHardwareEthernetRowsWithASixByteAddressQualify()
    {
        Assert.True(PhysicalEthernetAdapters.IsPhysicalEthernet(6, 1, 6));
        // Not a hardware interface, or a filter interface on the same MAC.
        Assert.False(PhysicalEthernetAdapters.IsPhysicalEthernet(6, 0, 6));
        Assert.False(PhysicalEthernetAdapters.IsPhysicalEthernet(6, 3, 6));
        // Low power still belongs to this PC.
        Assert.True(PhysicalEthernetAdapters.IsPhysicalEthernet(6, 1 | 64, 6));
        // Wi-Fi (IF_TYPE_IEEE80211) and other address lengths are excluded.
        Assert.False(PhysicalEthernetAdapters.IsPhysicalEthernet(71, 1, 6));
        Assert.False(PhysicalEthernetAdapters.IsPhysicalEthernet(6, 1, 8));
    }

    [Fact]
    public void ListsPhysicalRowsWithTheirWindowsIdentity()
    {
        var row = new PhysicalEthernetAdapters.MibIfRow2
        {
            Type = 6,
            PhysicalAddressLength = 6,
            InterfaceIndex = 14,
            InterfaceGuid = new Guid("0a1b2c3d-4e5f-0607-8091-a2b3c4d5e6f7"),
            OperStatus = 1,
            InterfaceAndOperStatusFlags = 1,
            PhysicalAddress = new byte[32],
            Alias = "Ethernet 2",
            Description = "Example 2.5GbE Controller"
        };
        new byte[] { 2, 17, 34, 51, 68, 85 }.CopyTo(row.PhysicalAddress, 0);

        var adapter = PhysicalEthernetAdapters.FromRow(row);

        Assert.NotNull(adapter);
        Assert.Equal("{0A1B2C3D-4E5F-0607-8091-A2B3C4D5E6F7}", adapter.InterfaceGuid);
        Assert.Equal("Ethernet 2", adapter.Name);
        Assert.Equal(new byte[] { 2, 17, 34, 51, 68, 85 }, adapter.Mac);
        Assert.Equal(1, adapter.OperStatus);
        Assert.Equal(14u, adapter.InterfaceIndex);
        Assert.Equal("Example 2.5GbE Controller", adapter.Description);
        // Filter interfaces share the hardware MAC but are not adapters.
        row.InterfaceAndOperStatusFlags = 3;
        Assert.Null(PhysicalEthernetAdapters.FromRow(row));
    }

    [Fact]
    public void NativeRowLayoutsMatchTheX64Headers()
    {
        if (!Environment.Is64BitProcess)
        {
            return;
        }
        // netioapi.h / setupapi.h sizes and the offsets of every field read.
        Assert.Equal(1352, Marshal.SizeOf<PhysicalEthernetAdapters.MibIfRow2>());
        Assert.Equal(8, Offset<PhysicalEthernetAdapters.MibIfRow2>("InterfaceIndex"));
        Assert.Equal(12, Offset<PhysicalEthernetAdapters.MibIfRow2>("InterfaceGuid"));
        Assert.Equal(28, Offset<PhysicalEthernetAdapters.MibIfRow2>("Alias"));
        Assert.Equal(542, Offset<PhysicalEthernetAdapters.MibIfRow2>("Description"));
        Assert.Equal(1056, Offset<PhysicalEthernetAdapters.MibIfRow2>("PhysicalAddressLength"));
        Assert.Equal(1060, Offset<PhysicalEthernetAdapters.MibIfRow2>("PhysicalAddress"));
        Assert.Equal(1128, Offset<PhysicalEthernetAdapters.MibIfRow2>("Type"));
        Assert.Equal(1152, Offset<PhysicalEthernetAdapters.MibIfRow2>("InterfaceAndOperStatusFlags"));
        Assert.Equal(1156, Offset<PhysicalEthernetAdapters.MibIfRow2>("OperStatus"));
        Assert.Equal(168, Marshal.SizeOf<PhysicalEthernetAdapters.MibIpInterfaceRow>());
        Assert.Equal(16, Offset<PhysicalEthernetAdapters.MibIpInterfaceRow>("InterfaceIndex"));
        Assert.Equal(148, Offset<PhysicalEthernetAdapters.MibIpInterfaceRow>("Metric"));
        Assert.Equal(156, Offset<PhysicalEthernetAdapters.MibIpInterfaceRow>("Connected"));
        Assert.Equal(104, Marshal.SizeOf<PhysicalEthernetAdapters.MibIpForwardRow2>());
        Assert.Equal(8, Offset<PhysicalEthernetAdapters.MibIpForwardRow2>("InterfaceIndex"));
        Assert.Equal(12, Offset<PhysicalEthernetAdapters.MibIpForwardRow2>("DestinationPrefix"));
        Assert.Equal(40, Offset<PhysicalEthernetAdapters.MibIpForwardRow2>("DestinationPrefixLength"));
        Assert.Equal(84, Offset<PhysicalEthernetAdapters.MibIpForwardRow2>("Metric"));
        Assert.Equal(32, Marshal.SizeOf<PhysicalEthernetAdapters.SpDevinfoData>());
    }

    private static int Offset<T>(string field) => (int)Marshal.OffsetOf<T>(field);

    [Fact]
    public void ShapesAdaptersWithGetNetAdapterFieldNames()
    {
        PhysicalEthernetAdapter[] adapters =
        [
            new("{0A1B2C3D-4E5F-0607-8091-A2B3C4D5E6F7}", "Ethernet", [2, 0x11, 0x22, 0x33, 0x44, 0x55], 1, 14, "Onboard"),
            new("{00000000-0000-0000-0000-000000000001}", "Ethernet 2", [2, 0x11, 0x22, 0x33, 0x44, 0x66], 2, 21, "Dock")
        ];
        AdapterDevice?[] devices =
        [
            new AdapterDevice { EnumeratorName = "PCI", InLocalMachineContainer = true },
            new AdapterDevice { EnumeratorName = "USB", InLocalMachineContainer = false }
        ];
        // The existing four fields keep their names, order and formats; the
        // readiness fields follow them.
        Assert.Equal(
            "[{\"InterfaceGuid\":\"{0A1B2C3D-4E5F-0607-8091-A2B3C4D5E6F7}\",\"Name\":\"Ethernet\","
            + "\"MacAddress\":\"02-11-22-33-44-55\",\"Status\":\"Up\",\"EnumeratorName\":\"PCI\","
            + "\"InLocalMachineContainer\":true,\"DefaultRoute\":true},"
            + "{\"InterfaceGuid\":\"{00000000-0000-0000-0000-000000000001}\",\"Name\":\"Ethernet 2\","
            + "\"MacAddress\":\"02-11-22-33-44-66\",\"Status\":\"Disconnected\",\"EnumeratorName\":\"USB\","
            + "\"InLocalMachineContainer\":false,\"DefaultRoute\":false}]",
            PhysicalEthernetAdapters.AdaptersJson(adapters, devices, [14u]));
        // Unreadable facts are null, never guessed.
        Assert.Equal(
            "[{\"InterfaceGuid\":\"{0A1B2C3D-4E5F-0607-8091-A2B3C4D5E6F7}\",\"Name\":\"Ethernet\","
            + "\"MacAddress\":\"02-11-22-33-44-55\",\"Status\":\"Up\",\"EnumeratorName\":null,"
            + "\"InLocalMachineContainer\":null,\"DefaultRoute\":null}]",
            PhysicalEthernetAdapters.AdaptersJson(adapters[..1], [null], null));
        Assert.Equal("[]", PhysicalEthernetAdapters.AdaptersJson([], [], null));
    }

    [Fact]
    public void StalledEnrichmentPrintsBaseRowsWithNullFactsWithinTheCap()
    {
        PhysicalEthernetAdapter[] adapters = [Adapter(1), Adapter(2)];
        var started = Stopwatch.StartNew();

        var (devices, routes) = PhysicalEthernetAdapters.Enrich(
            adapters,
            OneShot.Deadline(TimeSpan.FromMilliseconds(300)),
            _ =>
            {
                Stall();
                return [];
            },
            () =>
            {
                Stall();
                return [];
            });

        Assert.True(started.Elapsed < TimeSpan.FromMilliseconds(700), started.Elapsed.ToString());
        Assert.Equal([null, null], devices);
        Assert.Null(routes);
        Assert.StartsWith(
            "[{\"InterfaceGuid\":\"{00000000-0000-0000-0000-000000000001}\",\"Name\":\"Ethernet 1\","
            + "\"MacAddress\":\"02-00-00-00-00-01\",\"Status\":\"Up\",\"EnumeratorName\":null,"
            + "\"InLocalMachineContainer\":null,\"DefaultRoute\":null}",
            PhysicalEthernetAdapters.AdaptersJson(adapters, devices, routes));
    }

    [Fact]
    public void PromptEnrichmentFillsFactsAndRejectsMismatchedDeviceLists()
    {
        PhysicalEthernetAdapter[] adapters = [Adapter(1), Adapter(2)];
        var (devices, routes) = PhysicalEthernetAdapters.Enrich(
            adapters,
            OneShot.Deadline(TimeSpan.FromSeconds(2)),
            guids => guids
                .Select(guid => guid.EndsWith("1}") ? new AdapterDevice { EnumeratorName = "PCI" } : null)
                .ToArray(),
            () => [new DefaultRoute(true, 2, 10)]);
        Assert.Equal("PCI", devices[0]?.EnumeratorName);
        Assert.Null(devices[1]);
        Assert.Equal([2u], routes);

        // A device list that does not line up with the rows is discarded.
        (devices, _) = PhysicalEthernetAdapters.Enrich(
            adapters,
            OneShot.Deadline(TimeSpan.FromSeconds(2)),
            _ => [new AdapterDevice()],
            () => throw new InvalidOperationException("routing table unavailable"));
        Assert.Equal([null, null], devices);

        // No adapters: no reads start.
        (devices, routes) = PhysicalEthernetAdapters.Enrich(
            [],
            OneShot.Deadline(TimeSpan.Zero),
            _ => throw new InvalidOperationException(),
            () => throw new InvalidOperationException());
        Assert.Empty(devices);
        Assert.Null(routes);
    }

    [Fact]
    public void OnlyOperationalAdaptersReportUp()
    {
        Assert.Equal("Up", PhysicalEthernetAdapters.AdapterStatus(1));
        Assert.Equal("Not Present", PhysicalEthernetAdapters.AdapterStatus(6));
        foreach (var status in new[] { 2, 3, 4, 5, 6, 7, 99 })
        {
            Assert.NotEqual("Up", PhysicalEthernetAdapters.AdapterStatus(status));
        }
    }

    [Fact]
    public void HelperOptionsRecognizeTheReadOnlyWakeOnLanCommands()
    {
        var list = HelperOptions.Parse(["--list-physical-ethernet-adapters"]);
        Assert.True(list.ListPhysicalEthernetAdapters);
        Assert.False(list.QueryWakeOnLanReadiness);

        var readiness = HelperOptions.Parse(["--wake-on-lan-readiness", "--target-mac", "10-FF-E0-6B-06-85"]);
        Assert.True(readiness.QueryWakeOnLanReadiness);
        Assert.False(readiness.ListPhysicalEthernetAdapters);

        var bridge = HelperOptions.Parse(["--list-bridges"]);
        Assert.False(bridge.ListPhysicalEthernetAdapters);
        Assert.False(bridge.QueryWakeOnLanReadiness);
    }

    [Fact]
    public void DefaultRouteTableReadsWithoutSendingTraffic()
    {
        // A table snapshot only; no destination is resolved or contacted.
        var routes = PhysicalEthernetAdapters.DefaultRoutes();
        if (routes.Count == 0)
        {
            return;
        }
        // Every default route names an interface .NET also reports.
        var indexes = new HashSet<uint>();
        foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
        {
            var properties = networkInterface.GetIPProperties();
            try
            {
                indexes.Add((uint)properties.GetIPv4Properties().Index);
            }
            catch (NetworkInformationException)
            {
            }
            try
            {
                indexes.Add((uint)properties.GetIPv6Properties().Index);
            }
            catch (NetworkInformationException)
            {
            }
        }
        Assert.All(routes, route => Assert.Contains(route.InterfaceIndex, indexes));
        var best = PhysicalEthernetAdapters.BestDefaultRouteInterfaces(routes);
        Assert.NotEmpty(best);
        Assert.All(best, index => Assert.Contains(index, indexes));
    }

    [Fact]
    public void ARealPhysicalEthernetAdapterMapsToItsDeviceAndDriverKey()
    {
        var adapter = PhysicalEthernetAdapters.List().FirstOrDefault(candidate => candidate.OperStatus != 6);
        if (adapter is null)
        {
            // This machine has no present physical Ethernet adapter.
            return;
        }
        Assert.Matches("^\\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\\}$", adapter.InterfaceGuid);
        Assert.Equal(6, adapter.Mac.Length);

        var device = PhysicalEthernetAdapters.AdapterDevices([adapter.InterfaceGuid]).Single();

        Assert.NotNull(device);
        Assert.NotNull(device.EnumeratorName);
        Assert.NotNull(device.InLocalMachineContainer);
        Assert.NotEmpty(device.HardwareIds);
        Assert.True(device.IdenticalPresentDevices >= 1);
        Assert.NotNull(device.DriverProvider);
        Assert.Contains(
            new[]
            {
                device.Keywords.WakeOnMagicPacket,
                device.Keywords.S5WakeOnLan,
                device.Keywords.ModernStandbyWoLMagicPacket,
                device.Keywords.Eee
            },
            state => state != KeywordState.Unknown);
    }

    [Fact]
    public void UnknownInterfaceGuidsMatchNoDevice()
    {
        Assert.Null(Assert.Single(PhysicalEthernetAdapters.AdapterDevices(["{00000000-0000-0000-0000-000000000000}"])));
    }
}
