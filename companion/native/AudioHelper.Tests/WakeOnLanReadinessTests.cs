using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using Xunit;

// Ported from Kitsune Input's wake_readiness.rs, event_log.rs,
// event_log_windows.rs, power.rs and power_windows.rs tests. The live tests
// are read-only: GetPwrCapabilities, HKLM query-only registry reads, the
// device power cache and System-log queries.
public sealed class WakeOnLanReadinessTests
{
    // The reference PC's 2026-10-10 14:22 PDT full boot (Kernel-Boot 27).
    private const ulong BootFiletime = 134_361_409_311_589_158;
    private const string BootAt = "2026-10-10T21:22:11.158Z";
    // The reference PC's 2026-10-10 hibernate resume (Power-Troubleshooter 1).
    private const ulong WakeFiletime = 134_361_336_357_839_877;
    private const string RealtekId = @"PCI\VEN_10EC&DEV_8125&SUBSYS_E0001458&REV_0C";
    private static readonly byte[] Mac = [0x10, 0xff, 0xe0, 0x6b, 0x06, 0x85];
    private static readonly byte[] UnusedMac = [0x02, 0, 0, 0, 0, 0x01];

    private static PowerCapabilities Capabilities(bool hiberFilePresent, bool hiberboot) =>
        new(SystemS3: true, SystemS4: true, hiberFilePresent, hiberboot, AoAc: false);

    private static HiberbootSettings Settings(uint? policy, uint? preference) =>
        new(Preference: new HiberbootSetting(true, preference), Policy: new HiberbootSetting(true, policy));

    private static PhysicalEthernetAdapter FixtureRow(int operStatus = 1) => new(
        "{B6713AE1-0F07-4F26-9CF7-EA3B120F46D6}",
        "Ethernet",
        [0x10, 0xff, 0xe0, 0x6b, 0x06, 0x85],
        operStatus,
        14,
        "Realtek PCIe 2.5GbE Family Controller");

    private static EventScan<WakeEvent> Wake(uint sourceType, string sourceText) =>
        new(new WakeEvent(sourceType, sourceText, WakeFiletime));

    private static EventScan<BootEvent> Boot(uint bootType) => new(new BootEvent(bootType, BootFiletime));

    private static ReadinessReads ReferenceReads() => new()
    {
        Capabilities = new PowerCapabilities(true, true, true, true, false),
        Settings = Settings(null, 0),
        Lookup = AdapterLookup.Present(FixtureRow()),
        Device = new AdapterDevice
        {
            EnumeratorName = "PCI",
            InLocalMachineContainer = true,
            DriverProvider = "Realtek",
            DriverVersion = "1125.29.50.202",
            FriendlyName = "Realtek PCIe 2.5GbE Family Controller",
            DeviceDescription = "Realtek PCIe 2.5GbE Family Controller",
            HardwareIds = [RealtekId],
            IdenticalPresentDevices = 1,
            Keywords = new AdapterKeywords(KeywordState.On, KeywordState.On, KeywordState.NotExposed, KeywordState.Off)
        },
        Routes = [new DefaultRoute(true, 14, 25)],
        Armed = [[RealtekId]],
        Wake = Wake(5, "AMD USB 3.10 eXtensible Host Controller - 1.10 (Microsoft)"),
        Boot = Boot(0)
    };

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;

    private static void Stall() => Thread.Sleep(TimeSpan.FromSeconds(5));

    [Fact]
    public void ParsesDashOrColonTargetMacs()
    {
        foreach (var value in new[] { "10-FF-E0-6B-06-85", "10:ff:e0:6b:06:85", " 10-ff-E0-6B-06-85 " })
        {
            Assert.Equal(Mac, WakeOnLanReadiness.ParseTargetMac(["--wake-on-lan-readiness", "--target-mac", value]));
        }
        Assert.Equal(Mac, WakeOnLanReadiness.ParseTargetMac(["--TARGET-MAC", "10-FF-E0-6B-06-85"]));
        foreach (var invalid in new string[][]
        {
            ["--target-mac"],
            ["--target-mac", "10-FF-E0-6B-06"],
            ["--target-mac", "10-FF-E0-6B-06-85-00"],
            ["--target-mac", "10-FF:E0-6B-06-85"],
            ["--target-mac", "10FFE06B0685"],
            ["--target-mac", "1-FF-E0-6B-06-855"],
            ["--target-mac", "GG-FF-E0-6B-06-85"],
            ["--target-mac", "+1-FF-E0-6B-06-85"],
            ["10-FF-E0-6B-06-85"]
        })
        {
            Assert.Null(WakeOnLanReadiness.ParseTargetMac(invalid));
        }
    }

    [Fact]
    public void UsageErrorsExitTwoWithoutPrinting()
    {
        var error = Console.Error;
        try
        {
            Console.SetError(TextWriter.Null);
            Assert.Equal(2, WakeOnLanReadiness.PrintJson(["--wake-on-lan-readiness"]));
            Assert.Equal(2, WakeOnLanReadiness.PrintJson(["--wake-on-lan-readiness", "--target-mac", "not-a-mac"]));
        }
        finally
        {
            Console.SetError(error);
        }
    }

    [Fact]
    public void FastStartupMatchesTheCompanionShutdownModeRule()
    {
        // windows-shutdown-mode.test.ts: policy x local preference.
        foreach (var (policy, preference, expected) in new (uint?, uint?, string)[]
        {
            (null, 1, "on"),
            (null, 0, "off"),
            (null, null, "off"),
            (0, 1, "on"),
            (0, 0, "off"),
            (0, null, "off"),
            (1, 1, "on"),
            (1, 0, "on"),
            (1, null, "on")
        })
        {
            Assert.Equal(expected, WakeOnLanReadiness.FastStartup(Capabilities(true, true), Settings(policy, preference)));
        }
        foreach (var policy in new uint?[] { null, 0, 1 })
        {
            Assert.Equal("off", WakeOnLanReadiness.FastStartup(Capabilities(false, true), Settings(policy, 1)));
        }
        Assert.Equal("off", WakeOnLanReadiness.FastStartup(Capabilities(true, false), Settings(null, 1)));
        // A reduced hiberfile without ordinary S4 still supports Fast Startup.
        Assert.Equal(
            "on",
            WakeOnLanReadiness.FastStartup(Capabilities(true, true) with { SystemS4 = false }, Settings(null, 1)));
        // Malformed or unreadable inputs are unknown, not a shutdown mode.
        Assert.Equal(
            "unknown",
            WakeOnLanReadiness.FastStartup(
                Capabilities(true, true),
                new HiberbootSettings(HiberbootSetting.Invalid, new HiberbootSetting(true, null))));
        Assert.Equal(
            "unknown",
            WakeOnLanReadiness.FastStartup(
                Capabilities(true, true),
                new HiberbootSettings(new HiberbootSetting(true, 1), HiberbootSetting.Invalid)));
        Assert.Equal("unknown", WakeOnLanReadiness.FastStartup(null, Settings(null, 1)));
        Assert.Equal("unknown", WakeOnLanReadiness.FastStartup(Capabilities(true, true), null));
    }

    [Fact]
    public void MapsKeywordsEnumeratorsAndBootTypes()
    {
        Assert.Equal("on", WakeOnLanReadiness.Keyword(KeywordState.On));
        Assert.Equal("off", WakeOnLanReadiness.Keyword(KeywordState.Off));
        Assert.Equal("not-exposed", WakeOnLanReadiness.Keyword(KeywordState.NotExposed));
        Assert.Equal("unknown", WakeOnLanReadiness.Keyword(KeywordState.Unknown));
        Assert.Equal("unknown", WakeOnLanReadiness.Keyword(null));
        foreach (var (enumerator, expected) in new (string?, string)[]
        {
            ("PCI", "pci"),
            ("pci", "pci"),
            ("USB", "usb"),
            ("SWD", "other"),
            ("ROOT", "other"),
            ("", "unknown"),
            (null, "unknown")
        })
        {
            Assert.Equal(expected, WakeOnLanReadiness.Bus(enumerator));
        }
        foreach (var (scan, expected, at) in new (EventScan<BootEvent>?, string, string?)[]
        {
            (Boot(0), "full", BootAt),
            (Boot(1), "fast-startup", BootAt),
            (Boot(2), "hibernate-resume", BootAt),
            // An unmapped boot type keeps the time of the boot it describes.
            (Boot(3), "unknown", BootAt),
            // A finished scan without a boot event, and a failed scan.
            (new EventScan<BootEvent>(null), "unknown", null),
            (null, "unknown", null)
        })
        {
            Assert.Equal(expected, WakeOnLanReadiness.BootType(scan));
            Assert.Equal(at, WakeOnLanReadiness.BootAt(scan));
        }
    }

    [Fact]
    public void MapsWakeSourcesWithThisAdapterFirst()
    {
        string[] names = ["Realtek PCIe 2.5GbE Family Controller"];
        foreach (var (scan, expected) in new (EventScan<WakeEvent>?, string)[]
        {
            (Wake(5, "Realtek PCIe 2.5GbE Family Controller"), "network-adapter"),
            (Wake(5, " realtek pcie 2.5gbe family controller "), "network-adapter"),
            (Wake(5, "AMD USB 3.10 eXtensible Host Controller - 1.10 (Microsoft)"), "usb"),
            (Wake(5, "USB4(TM) Host Router (Microsoft)"), "usb"),
            (Wake(5, "Intel(R) Ethernet Controller I226-V"), "other"),
            (Wake(5, ""), "other"),
            (Wake(1, ""), "power-button"),
            (Wake(0, ""), "unknown"),
            (Wake(2, ""), "other"),
            (Wake(3, ""), "other"),
            (Wake(6, "timer"), "other"),
            (Wake(8, ""), "other"),
            (new EventScan<WakeEvent>(null), "none"),
            (null, "unknown")
        })
        {
            Assert.Equal(expected, WakeOnLanReadiness.WakeSource(scan, names));
        }
        // Without adapter names a NIC wake source is never claimed.
        Assert.Equal("other", WakeOnLanReadiness.WakeSource(Wake(5, "Realtek PCIe 2.5GbE Family Controller"), []));
    }

    [Fact]
    public void WakeArmedIsCertainOnlyWhenHardwareIdsIdentifyTheAdapter()
    {
        string[] realtek = [RealtekId, @"PCI\CC_0200"];
        string[] keyboard = [@"HID\VID_1209&PID_DB08&REV_0106&MI_02", @"PCI\CC_0200"];
        Assert.True(WakeOnLanReadiness.WakeArmed([keyboard, realtek], realtek, 1));
        Assert.False(WakeOnLanReadiness.WakeArmed([keyboard], realtek, 1));
        Assert.False(WakeOnLanReadiness.WakeArmed([], realtek, 1));
        Assert.Null(WakeOnLanReadiness.WakeArmed([realtek], [], 1));
        // Two identical adapters: one armed entry cannot say which one.
        Assert.Null(WakeOnLanReadiness.WakeArmed([realtek], realtek, 2));
        Assert.True(WakeOnLanReadiness.WakeArmed([realtek, realtek], realtek, 2));
        Assert.False(WakeOnLanReadiness.WakeArmed([keyboard], realtek, 2));
    }

    [Fact]
    public void ReadinessJsonHasTheExactContractShape()
    {
        Assert.Equal(
            "{\"version\":1,\"power\":{\"modernStandby\":false,\"sleepS3\":true,\"hibernate\":true,"
            + "\"fastStartup\":\"off\"},\"adapterStatus\":\"present\",\"adapter\":{\"connected\":true,"
            + "\"bus\":\"pci\",\"internal\":true,\"defaultRoute\":true,\"magicPacket\":\"on\","
            + "\"shutdownWake\":\"on\",\"modernStandbyMagicPacket\":\"not-exposed\","
            + "\"energyEfficientEthernet\":\"off\",\"windowsWakeArmed\":true,"
            + "\"driverProvider\":\"Realtek\",\"driverVersion\":\"1125.29.50.202\"},"
            + "\"lastWake\":{\"source\":\"usb\",\"bootType\":\"full\",\"at\":\"2026-10-10T19:20:35.783Z\","
            + "\"bootAt\":\"2026-10-10T21:22:11.158Z\"}}",
            WakeOnLanReadiness.ReadinessJson(ReferenceReads()));
    }

    [Fact]
    public void AdapterStatusSeparatesAbsentFromUnknown()
    {
        Assert.Equal("present", Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads())).GetProperty("adapterStatus").GetString());
        foreach (var (lookup, status) in new[] { (AdapterLookup.Absent, "absent"), (AdapterLookup.Unknown, "unknown") })
        {
            var value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with { Lookup = lookup, Device = null }));
            Assert.Equal(status, value.GetProperty("adapterStatus").GetString());
            Assert.Equal(JsonValueKind.Null, value.GetProperty("adapter").ValueKind);
        }
    }

    [Fact]
    public void EveryFieldFallsBackIndependently()
    {
        // Nothing finished: power and wake fields are unknown; with no
        // interface table the adapter cannot be established. This is also the
        // fallback output.
        Assert.Equal(WakeOnLanReadiness.UnknownJson, WakeOnLanReadiness.ReadinessJson(new ReadinessReads()));

        // The adapter exists but its device, routes and wake list are missing.
        var value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with
        {
            Device = null,
            Routes = null,
            Armed = null,
            Wake = new EventScan<WakeEvent>(null)
        }));
        Assert.Equal(
            "{\"connected\":true,\"bus\":\"unknown\",\"internal\":null,\"defaultRoute\":null,"
            + "\"magicPacket\":\"unknown\",\"shutdownWake\":\"unknown\",\"modernStandbyMagicPacket\":\"unknown\","
            + "\"energyEfficientEthernet\":\"unknown\",\"windowsWakeArmed\":null,\"driverProvider\":null,"
            + "\"driverVersion\":null}",
            value.GetProperty("adapter").GetRawText());
        Assert.Equal("none", value.GetProperty("lastWake").GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, value.GetProperty("lastWake").GetProperty("at").ValueKind);

        // Not a physical Ethernet adapter on this PC.
        value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with { Lookup = AdapterLookup.Absent, Device = null }));
        Assert.Equal(JsonValueKind.Null, value.GetProperty("adapter").ValueKind);
        Assert.Equal("absent", value.GetProperty("adapterStatus").GetString());

        // A missing boot event leaves bootAt null without touching the wake.
        value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with { Boot = new EventScan<BootEvent>(null) }));
        Assert.Equal(JsonValueKind.Null, value.GetProperty("lastWake").GetProperty("bootAt").ValueKind);
        Assert.Equal("2026-10-10T19:20:35.783Z", value.GetProperty("lastWake").GetProperty("at").GetString());

        // A disconnected adapter is still reported, never hidden.
        value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with
        {
            Lookup = AdapterLookup.Present(FixtureRow(operStatus: 2))
        }));
        Assert.False(value.GetProperty("adapter").GetProperty("connected").GetBoolean());
    }

    [Fact]
    public void WakeFromThisAdapterIsRecognizedFromItsDeviceNames()
    {
        var value = Parse(WakeOnLanReadiness.ReadinessJson(ReferenceReads() with
        {
            Wake = Wake(5, "Realtek PCIe 2.5GbE Family Controller")
        }));
        Assert.Equal("network-adapter", value.GetProperty("lastWake").GetProperty("source").GetString());
    }

    [Fact]
    public void AFailedInterfaceReadIsUnknownAndAMissingMacIsAbsent()
    {
        var failed = ReadinessReaders.Live with { Adapters = () => throw new Win32Exception(5, "GetIfTable2 failed") };
        var value = Parse(WakeOnLanReadiness.ReadinessJson(Mac, TimeSpan.FromSeconds(2), failed));
        Assert.Equal("unknown", value.GetProperty("adapterStatus").GetString());
        Assert.Equal(JsonValueKind.Null, value.GetProperty("adapter").ValueKind);

        var table = ReadinessReaders.Live with
        {
            Adapters = () => [FixtureRow(), FixtureRow() with { Mac = new byte[6] }, FixtureRow() with { Mac = [0x01, 0, 0x5e, 0, 0, 1] }],
            Devices = guids => new AdapterDevice?[guids.Count]
        };
        // Not in the table, and addresses that can never be a wake target
        // (all-zero, multicast), even when a row reports one.
        foreach (var mac in new[] { UnusedMac, new byte[6], new byte[] { 0x01, 0, 0x5e, 0, 0, 1 } })
        {
            value = Parse(WakeOnLanReadiness.ReadinessJson(mac, TimeSpan.FromSeconds(2), table));
            Assert.Equal("absent", value.GetProperty("adapterStatus").GetString());
            Assert.Equal(JsonValueKind.Null, value.GetProperty("adapter").ValueKind);
        }
    }

    [Fact]
    public void StalledOrFailingReadsFallBackWithoutDelayingTheSnapshot()
    {
        var stalled = new ReadinessReaders(
            () =>
            {
                Stall();
                return null;
            },
            () =>
            {
                Stall();
                return Settings(null, 1);
            },
            () =>
            {
                Stall();
                return [];
            },
            _ =>
            {
                Stall();
                return [];
            },
            () =>
            {
                Stall();
                return [];
            },
            () => throw new InvalidOperationException("device power read failed"),
            _ =>
            {
                Stall();
                return null;
            },
            _ =>
            {
                Stall();
                return new BootEvent(0, BootFiletime);
            });
        var started = Stopwatch.StartNew();

        var line = WakeOnLanReadiness.ReadinessJson(Mac, TimeSpan.FromMilliseconds(300), stalled);

        Assert.True(started.Elapsed < TimeSpan.FromMilliseconds(700), started.Elapsed.ToString());
        Assert.Equal(WakeOnLanReadiness.UnknownJson, line);
    }

    [Fact]
    public void AStalledDeviceReadNeverHidesTheAdapterRow()
    {
        var readers = new ReadinessReaders(
            () => ReferenceReads().Capabilities,
            () => Settings(null, 0),
            () => [FixtureRow()],
            _ =>
            {
                Stall();
                return [];
            },
            () => ReferenceReads().Routes!,
            () => [],
            _ => null,
            _ => new BootEvent(2, BootFiletime));
        var started = Stopwatch.StartNew();

        var value = Parse(WakeOnLanReadiness.ReadinessJson(Mac, TimeSpan.FromMilliseconds(300), readers));

        Assert.True(started.Elapsed < TimeSpan.FromMilliseconds(700), started.Elapsed.ToString());
        Assert.Equal(
            "{\"connected\":true,\"bus\":\"unknown\",\"internal\":null,\"defaultRoute\":true,"
            + "\"magicPacket\":\"unknown\",\"shutdownWake\":\"unknown\",\"modernStandbyMagicPacket\":\"unknown\","
            + "\"energyEfficientEthernet\":\"unknown\",\"windowsWakeArmed\":null,\"driverProvider\":null,"
            + "\"driverVersion\":null}",
            value.GetProperty("adapter").GetRawText());
        Assert.Equal("present", value.GetProperty("adapterStatus").GetString());
        Assert.Equal("off", value.GetProperty("power").GetProperty("fastStartup").GetString());
        Assert.Equal("none", value.GetProperty("lastWake").GetProperty("source").GetString());
        Assert.Equal("hibernate-resume", value.GetProperty("lastWake").GetProperty("bootType").GetString());
        Assert.Equal(BootAt, value.GetProperty("lastWake").GetProperty("bootAt").GetString());
    }

    [Fact]
    public void EventScansReceiveTheRemainingCapAsTheirTimeout()
    {
        long scanMs = -1;
        var readers = ReadinessReaders.Live with
        {
            Wake = timeout =>
            {
                Interlocked.Exchange(ref scanMs, (long)timeout.TotalMilliseconds);
                throw new InvalidOperationException("System log scan did not finish.");
            }
        };

        var value = Parse(WakeOnLanReadiness.ReadinessJson(Mac, TimeSpan.FromSeconds(1), readers));

        // The scan may run almost to the cap, but never past it.
        Assert.InRange(Interlocked.Read(ref scanMs), 500, 999);
        // A scan that did not finish is unknown, never "none".
        Assert.Equal("unknown", value.GetProperty("lastWake").GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, value.GetProperty("lastWake").GetProperty("at").ValueKind);
    }

    [Fact]
    public void OnlyAFinishedScanReportsNoEvent()
    {
        Assert.Equal(ScanOutcome.Found, WakeEventLog.ClassifyScan(true, 1, 0));
        Assert.Equal(ScanOutcome.Absent, WakeEventLog.ClassifyScan(false, 0, 259));
        // ERROR_TIMEOUT from a slow scan of a large log is not "no event".
        Assert.Equal(ScanOutcome.Incomplete, WakeEventLog.ClassifyScan(false, 0, 1460));
        Assert.Equal(ScanOutcome.Incomplete, WakeEventLog.ClassifyScan(false, 0, 5));
        Assert.Equal(ScanOutcome.Incomplete, WakeEventLog.ClassifyScan(true, 0, 0));
    }

    [Fact]
    public void FormatsFiletimesAsUtcIso8601()
    {
        const ulong unixEpoch = 116_444_736_000_000_000;
        static ulong Filetime(ulong unixMillis) => unixEpoch + unixMillis * 10_000;
        Assert.Equal("1970-01-01T00:00:00.000Z", WakeOnLanReadiness.FiletimeToIso8601(unixEpoch));
        // A leap day, and sub-millisecond ticks are truncated.
        Assert.Equal("2000-02-29T12:34:56.789Z", WakeOnLanReadiness.FiletimeToIso8601(Filetime(951_827_696_789) + 9_999));
        Assert.Equal("2026-10-10T19:20:35.783Z", WakeOnLanReadiness.FiletimeToIso8601(WakeFiletime));
        Assert.Equal("2099-12-31T23:59:59.999Z", WakeOnLanReadiness.FiletimeToIso8601(Filetime(4_102_444_799_999)));
        Assert.Null(WakeOnLanReadiness.FiletimeToIso8601(unixEpoch - 1));
        Assert.Null(WakeOnLanReadiness.FiletimeToIso8601(ulong.MaxValue));
    }

    [Fact]
    public void DevicePowerEnumerationEndsOnlyOnNoMoreItems()
    {
        Assert.Equal(DevicePowerStepKind.Device, WakePowerReads.ClassifyDevicePowerStep(true, 0, 8192, 8192).Kind);
        Assert.Equal(DevicePowerStepKind.End, WakePowerReads.ClassifyDevicePowerStep(false, 259, 8192, 8192).Kind);
        // ERROR_INSUFFICIENT_BUFFER reports the size it needs (observed: 316).
        Assert.Equal(
            new DevicePowerStep(DevicePowerStepKind.Grow, 316),
            WakePowerReads.ClassifyDevicePowerStep(false, 122, 316, 8));
        Assert.Equal(
            new DevicePowerStep(DevicePowerStepKind.Grow, 9000),
            WakePowerReads.ClassifyDevicePowerStep(false, 234, 9000, 8192));
        // A size that does not grow, an absurd size, or any other error is a
        // failure: the partial list is discarded rather than reported.
        Assert.Equal(DevicePowerStepKind.Fail, WakePowerReads.ClassifyDevicePowerStep(false, 122, 8192, 8192).Kind);
        Assert.Equal(DevicePowerStepKind.Fail, WakePowerReads.ClassifyDevicePowerStep(false, 122, 1 << 30, 8192).Kind);
        foreach (var error in new uint[] { 0, 5, 87, 1460 })
        {
            Assert.Equal(DevicePowerStepKind.Fail, WakePowerReads.ClassifyDevicePowerStep(false, error, 8192, 8192).Kind);
        }
    }

    [Fact]
    public void HiberbootValuesMatchTheCompanionReader()
    {
        Assert.Equal(new HiberbootSetting(true, null), WakePowerReads.ParseHiberbootValue(RegistryRead.Absent));
        Assert.Equal(new HiberbootSetting(true, 1), WakePowerReads.ParseHiberbootValue(RegistryRead.Value(4, BitConverter.GetBytes(1u))));
        Assert.Equal(new HiberbootSetting(true, 0), WakePowerReads.ParseHiberbootValue(RegistryRead.Value(4, BitConverter.GetBytes(0u))));
        // REG_SZ "1", other numbers, short data and unreadable values are
        // malformed, not absent.
        foreach (var malformed in new[]
        {
            RegistryRead.Value(1, [(byte)'1', 0, 0, 0]),
            RegistryRead.Value(4, BitConverter.GetBytes(2u)),
            RegistryRead.Value(4, [1, 0]),
            RegistryRead.Value(11, [1, 0, 0, 0, 0, 0, 0, 0]),
            RegistryRead.Failure(5)
        })
        {
            Assert.False(WakePowerReads.ParseHiberbootValue(malformed).Valid);
        }
    }

    [Fact]
    public void RealSnapshotFinishesQuicklyAndParses()
    {
        // Read-only probes on this PC with an address no adapter uses.
        var started = Stopwatch.StartNew();
        var value = Parse(WakeOnLanReadiness.ReadinessJson(UnusedMac, TimeSpan.FromMilliseconds(2800), ReadinessReaders.Live));
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(3), started.Elapsed.ToString());
        Assert.Equal(1, value.GetProperty("version").GetInt32());
        Assert.Equal(JsonValueKind.Null, value.GetProperty("adapter").ValueKind);
        // The interface table was read, so this is a definite absence.
        Assert.Equal("absent", value.GetProperty("adapterStatus").GetString());
        Assert.Equal(JsonValueKind.String, value.GetProperty("power").GetProperty("fastStartup").ValueKind);
        Assert.Equal(JsonValueKind.String, value.GetProperty("lastWake").GetProperty("bootAt").ValueKind);
    }

    [Fact]
    public void ARealPhysicalEthernetAdapterProducesAPopulatedAdapterObject()
    {
        // Read-only: SetupDi matching, driver-key keyword reads, the
        // wake-armed list and the routing table on this machine.
        var adapters = PhysicalEthernetAdapters.List();
        var adapter = adapters.FirstOrDefault(candidate => candidate.OperStatus != 6);
        if (adapter is null)
        {
            // This machine has no present physical Ethernet adapter.
            return;
        }
        var value = Parse(WakeOnLanReadiness.ReadinessJson(adapter.Mac, TimeSpan.FromMilliseconds(2800), ReadinessReaders.Live));
        var row = value.GetProperty("adapter");
        Assert.Equal("present", value.GetProperty("adapterStatus").GetString());
        Assert.Equal(adapter.OperStatus == 1, row.GetProperty("connected").GetBoolean());
        Assert.NotEqual("unknown", row.GetProperty("bus").GetString());
        Assert.Contains(row.GetProperty("internal").ValueKind, new[] { JsonValueKind.True, JsonValueKind.False });
        Assert.Contains(row.GetProperty("defaultRoute").ValueKind, new[] { JsonValueKind.True, JsonValueKind.False });
        Assert.Equal(JsonValueKind.String, row.GetProperty("driverProvider").ValueKind);
        Assert.Contains(
            new[] { "magicPacket", "shutdownWake", "modernStandbyMagicPacket", "energyEfficientEthernet" },
            field => row.GetProperty(field).GetString() != "unknown");
        // Only identical adapters that are partly armed can leave this null.
        Assert.True(row.GetProperty("windowsWakeArmed").ValueKind != JsonValueKind.Null || adapters.Count > 1);
        Assert.NotEqual("unknown", value.GetProperty("power").GetProperty("fastStartup").GetString());
        Assert.NotEqual("unknown", value.GetProperty("lastWake").GetProperty("bootType").GetString());
        // The current boot's Kernel-Boot 27 time, ISO 8601 UTC with milliseconds.
        var bootAt = value.GetProperty("lastWake").GetProperty("bootAt").GetString();
        Assert.Matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", bootAt);
    }

    [Fact]
    public void CapabilityAndWakeReadsAreAvailableWithoutElevation()
    {
        Assert.NotNull(WakePowerReads.ReadCapabilities());
        var settings = WakePowerReads.ReadHiberbootSettings();
        Assert.True(settings.Preference.Valid, settings.ToString());
        Assert.True(settings.Policy.Valid, settings.ToString());
        foreach (var ids in WakePowerReads.ReadWakeArmedHardwareIds())
        {
            // Every entry is a non-empty hardware-id list such as
            // PCI\VEN_10EC&DEV_8125&..., never an empty or partial buffer.
            Assert.NotEmpty(ids);
            Assert.Contains("\\", ids[0]);
            Assert.All(ids, id => Assert.NotEmpty(id));
        }
    }

    [Fact]
    public void ReadsTheNewestWakeAndBootEventsWithoutElevation()
    {
        var scan = TimeSpan.FromSeconds(10);
        if (WakeEventLog.ReadLatestWakeEvent(scan) is { } wake)
        {
            // After 2000-01-01 and within the provider's wake-source map.
            Assert.True(wake.TimeCreated > 125_911_584_000_000_000, wake.ToString());
            Assert.True(wake.SourceType <= 8, wake.ToString());
            if (wake.SourceType == 5)
            {
                Assert.NotEmpty(wake.SourceText);
            }
        }
        var boot = WakeEventLog.ReadLatestBootEvent(scan);
        Assert.NotNull(boot);
        Assert.True(boot.BootType <= 2, boot.ToString());
        Assert.True(boot.TimeCreated > 125_911_584_000_000_000, boot.ToString());
    }

    [Fact]
    public void ACompletedScanWithoutAMatchIsAbsentNotAnError()
    {
        Assert.Null(WakeEventLog.Newest(
            "*[System[Provider[@Name='Kitsune-Nonexistent-Provider'] and EventID=1]]",
            ["Event/System/TimeCreated/@SystemTime"],
            TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public void InvalidQueriesAreErrorsNotAbsent()
    {
        Assert.Throws<InvalidOperationException>(() => WakeEventLog.Newest(
            "*[System[Provider[@Name='x'] and",
            ["Event/System/TimeCreated/@SystemTime"],
            TimeSpan.FromSeconds(10)));
    }
}
