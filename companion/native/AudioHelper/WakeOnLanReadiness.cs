using System.Buffers.Binary;
using System.Globalization;
using System.Runtime.InteropServices;

// --wake-on-lan-readiness --target-mac AA-BB-CC-DD-EE-FF: one JSON object
// describing what Windows can show about waking this PC from its Ethernet
// adapter. Ported from Kitsune Input (wake_readiness.rs and its power and
// event-log helpers). Every read is non-elevated and read-only: no power,
// network, driver, BIOS or registry setting is changed, nothing is sent on the
// network, and no PowerShell is spawned. Each field falls back to its unknown
// value on its own, and the whole snapshot is bounded by a hard time cap.

// The SYSTEM_POWER_CAPABILITIES flags readiness reports. Hiberboot is Fast
// Startup support; AoAc is Modern Standby (S0 low-power idle).
readonly record struct PowerCapabilities(bool SystemS3, bool SystemS4, bool HiberFilePresent, bool Hiberboot, bool AoAc);

// One HiberbootEnabled value. Valid is false when it is unreadable or
// malformed; Value is null when the key or value is absent.
readonly record struct HiberbootSetting(bool Valid, uint? Value)
{
    public static readonly HiberbootSetting Invalid = new(false, null);
}

// The local Fast Startup preference (Session Manager\Power) and the "Require
// use of fast startup" policy (Policies\Microsoft\Windows\System).
sealed record HiberbootSettings(HiberbootSetting Preference, HiberbootSetting Policy);

// The newest Microsoft-Windows-Power-Troubleshooter event 1. SourceType indexes
// the provider's wake-source map: 0 Unknown, 1 Power Button, 2 Sleep Button,
// 3 S4 Doze to Hibernate, 4 Predicted Presence, 5 Device, 6 Timer, 7 Legacy
// Driver Timer, 8 Unknown. SourceText is the device description for a device
// wake. TimeCreated is a FILETIME (100 ns since 1601 UTC).
sealed record WakeEvent(uint SourceType, string SourceText, ulong TimeCreated);

// The newest Microsoft-Windows-Kernel-Boot event 27, logged once per boot or
// hibernate resume. BootType: 0 full boot, 1 after a Fast Startup shutdown,
// 2 hibernate resume.
sealed record BootEvent(uint BootType, ulong TimeCreated);

// A newest-first System-log scan that finished; Event is null when it matched
// nothing. A scan that failed or did not finish in time is no EventScan.
sealed record EventScan<T>(T? Event) where T : class;

// How one EvtNext call on a newest-first query ended.
enum ScanOutcome
{
    Found,
    // The query finished and matched nothing.
    Absent,
    // Timed out, failed, or returned nothing without saying it finished.
    Incomplete
}

// What one DevicePowerEnumDevices result means for the enumeration: Grow
// retries the same index with a buffer of Bytes; Fail discards the list.
enum DevicePowerStepKind
{
    Device,
    End,
    Grow,
    Fail
}

readonly record struct DevicePowerStep(DevicePowerStepKind Kind, int Bytes = 0);

// The outcome of looking the target MAC up in the interface table: unknown
// when the table could not be read in time, absent when it was read and has
// no such physical Ethernet adapter.
sealed record AdapterLookup(string Status, PhysicalEthernetAdapter? Row)
{
    public static readonly AdapterLookup Unknown = new("unknown", null);
    public static readonly AdapterLookup Absent = new("absent", null);
    public static AdapterLookup Present(PhysicalEthernetAdapter row) => new("present", row);
}

// The raw reads behind one snapshot, each null when it failed or did not
// finish before the cap.
sealed record ReadinessReads
{
    public PowerCapabilities? Capabilities { get; init; }
    public HiberbootSettings? Settings { get; init; }
    public AdapterLookup Lookup { get; init; } = AdapterLookup.Unknown;
    public AdapterDevice? Device { get; init; }
    public IReadOnlyList<DefaultRoute>? Routes { get; init; }
    public IReadOnlyList<IReadOnlyList<string>>? Armed { get; init; }
    public EventScan<WakeEvent>? Wake { get; init; }
    public EventScan<BootEvent>? Boot { get; init; }
}

// The Windows reads behind one snapshot. A reader that fails throws; the
// event-log readers return null only when their scan finished without a
// match. Tests substitute stalling or failing readers.
sealed record ReadinessReaders(
    Func<PowerCapabilities?> Capabilities,
    Func<HiberbootSettings> Settings,
    Func<IReadOnlyList<PhysicalEthernetAdapter>> Adapters,
    Func<IReadOnlyList<string>, IReadOnlyList<AdapterDevice?>> Devices,
    Func<IReadOnlyList<DefaultRoute>> Routes,
    Func<IReadOnlyList<IReadOnlyList<string>>> Armed,
    Func<TimeSpan, WakeEvent?> Wake,
    Func<TimeSpan, BootEvent?> Boot)
{
    public static readonly ReadinessReaders Live = new(
        WakePowerReads.ReadCapabilities,
        WakePowerReads.ReadHiberbootSettings,
        PhysicalEthernetAdapters.List,
        PhysicalEthernetAdapters.AdapterDevices,
        PhysicalEthernetAdapters.DefaultRoutes,
        WakePowerReads.ReadWakeArmedHardwareIds,
        WakeEventLog.ReadLatestWakeEvent,
        WakeEventLog.ReadLatestBootEvent);
}

static class WakeOnLanReadiness
{
    // Reads still running at this point report their unknown value.
    private static readonly TimeSpan HardCap = TimeSpan.FromMilliseconds(2800);
    private const uint PowerTroubleshooterUnknown = 0;
    private const uint PowerTroubleshooterPowerButton = 1;
    private const uint PowerTroubleshooterDevice = 5;
    private const ulong FiletimeUnixEpoch = 116_444_736_000_000_000;

    // The snapshot when nothing could be read; also the output if building it
    // ever fails, so the command always prints one object.
    public const string UnknownJson =
        "{\"version\":1,\"power\":{\"modernStandby\":null,\"sleepS3\":null,\"hibernate\":null,"
        + "\"fastStartup\":\"unknown\"},\"adapterStatus\":\"unknown\",\"adapter\":null,"
        + "\"lastWake\":{\"source\":\"unknown\",\"bootType\":\"unknown\",\"at\":null,\"bootAt\":null}}";

    // Prints the snapshot; the caller then exits at once, so reads that
    // missed the cap cannot delay the exit. Usage errors return exit code 2.
    public static int PrintJson(IReadOnlyList<string> arguments)
    {
        if (ParseTargetMac(arguments) is not { } mac)
        {
            Console.Error.WriteLine("The --wake-on-lan-readiness option requires --target-mac AA-BB-CC-DD-EE-FF.");
            return 2;
        }
        return OneShot.PrintLine(ReadinessJson(mac, HardCap, ReadinessReaders.Live));
    }

    // Parses --target-mac, accepting AA-BB-CC-DD-EE-FF or AA:BB:CC:DD:EE:FF in
    // either case. A single separator style must be used throughout.
    public static byte[]? ParseTargetMac(IReadOnlyList<string> arguments)
    {
        var index = -1;
        for (var position = 0; position < arguments.Count; position++)
        {
            if (OneShot.EqualsIgnoreAsciiCase(arguments[position], "--target-mac"))
            {
                index = position;
                break;
            }
        }
        if (index < 0 || index + 1 >= arguments.Count)
        {
            return null;
        }
        var value = arguments[index + 1].Trim();
        var parts = value.Split(value.Contains(':') ? ':' : '-');
        if (parts.Length != 6)
        {
            return null;
        }
        var mac = new byte[6];
        for (var octet = 0; octet < mac.Length; octet++)
        {
            var part = parts[octet];
            if (part.Length != 2 || !char.IsAsciiHexDigit(part[0]) || !char.IsAsciiHexDigit(part[1]))
            {
                return null;
            }
            mac[octet] = byte.Parse(part, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
        }
        return mac;
    }

    // The companion's shutdown-mode rule: Fast Startup is effective when a
    // hiberfile is present, Windows supports hiberboot, and either the policy
    // or the local preference is 1. Any unreadable or malformed input is
    // unknown rather than guessed.
    public static string FastStartup(PowerCapabilities? capabilities, HiberbootSettings? settings)
    {
        if (capabilities is not { } power || settings is null || !settings.Policy.Valid || !settings.Preference.Valid)
        {
            return "unknown";
        }
        return power.HiberFilePresent
            && power.Hiberboot
            && (settings.Policy.Value == 1 || settings.Preference.Value == 1)
                ? "on"
                : "off";
    }

    public static string Keyword(KeywordState? state) => state switch
    {
        KeywordState.On => "on",
        KeywordState.Off => "off",
        KeywordState.NotExposed => "not-exposed",
        _ => "unknown"
    };

    // Maps DEVPKEY_Device_EnumeratorName. Thunderbolt and USB4 adapters are
    // tunneled PCIe and report PCI; `internal` tells them apart.
    public static string Bus(string? enumerator)
    {
        var name = enumerator?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return "unknown";
        }
        if (OneShot.EqualsIgnoreAsciiCase(name, "PCI"))
        {
            return "pci";
        }
        return OneShot.EqualsIgnoreAsciiCase(name, "USB") ? "usb" : "other";
    }

    // Whether Windows lists this adapter among wake-armed devices. Devices are
    // matched by their most specific hardware ID; when several present
    // adapters share it, only an all-or-none answer is certain.
    public static bool? WakeArmed(
        IReadOnlyList<IReadOnlyList<string>> armed,
        IReadOnlyList<string> hardwareIds,
        int identicalPresentDevices)
    {
        if (hardwareIds.Count == 0)
        {
            return null;
        }
        var matches = armed.Count(ids => PhysicalEthernetAdapters.SameDeviceIdentity(ids, hardwareIds));
        if (matches == 0)
        {
            return false;
        }
        return identicalPresentDevices <= 1 || matches >= identicalPresentDevices ? true : null;
    }

    public static string BootType(EventScan<BootEvent>? scan) => scan?.Event?.BootType switch
    {
        0 => "full",
        1 => "fast-startup",
        2 => "hibernate-resume",
        _ => "unknown"
    };

    // When the newest boot event was logged: the current boot's start, which
    // os.uptime() misreports across Fast Startup. An unmapped boot type still
    // reports it.
    public static string? BootAt(EventScan<BootEvent>? scan) =>
        scan?.Event is { } boot ? FiletimeToIso8601(boot.TimeCreated) : null;

    // Maps the newest Power-Troubleshooter event 1. A device wake source is
    // this adapter when its description equals one of the adapter's names;
    // otherwise a description naming USB (host controllers, hubs, routers) is
    // a USB wake.
    public static string WakeSource(EventScan<WakeEvent>? scan, IReadOnlyList<string> adapterNames)
    {
        if (scan is null)
        {
            return "unknown";
        }
        if (scan.Event is not { } wake)
        {
            return "none";
        }
        switch (wake.SourceType)
        {
            case PowerTroubleshooterUnknown:
                return "unknown";
            case PowerTroubleshooterPowerButton:
                return "power-button";
            case PowerTroubleshooterDevice:
                var text = wake.SourceText.Trim();
                var lowered = text.ToLowerInvariant();
                if (text.Length > 0 && adapterNames.Any(name => name.Trim().ToLowerInvariant() == lowered))
                {
                    return "network-adapter";
                }
                return OneShot.ToAsciiUpper(text).Contains("USB", StringComparison.Ordinal) ? "usb" : "other";
            default:
                return "other";
        }
    }

    // Formats a FILETIME as UTC ISO 8601 with milliseconds (sub-millisecond
    // ticks truncated), e.g. 2026-10-10T19:20:35.783Z. Times before 1970 are null.
    public static string? FiletimeToIso8601(ulong filetime)
    {
        if (filetime < FiletimeUnixEpoch || filetime > (ulong)DateTime.MaxValue.ToFileTimeUtc())
        {
            return null;
        }
        return DateTime.FromFileTimeUtc((long)filetime)
            .ToString("yyyy'-'MM'-'dd'T'HH':'mm':'ss'.'fff'Z'", CultureInfo.InvariantCulture);
    }

    public static string ReadinessJson(byte[] mac, TimeSpan cap, ReadinessReaders readers)
    {
        try
        {
            return ReadinessJson(Collect(mac, OneShot.Deadline(cap), readers));
        }
        catch
        {
            return UnknownJson;
        }
    }

    public static string ReadinessJson(ReadinessReads reads)
    {
        var capabilities = reads.Capabilities;
        var row = reads.Lookup.Row;
        var device = reads.Device;
        var bestRoutes = reads.Routes is { } routes ? PhysicalEthernetAdapters.BestDefaultRouteInterfaces(routes) : null;
        var names = new List<string>();
        if (row is not null)
        {
            names.Add(row.Description);
        }
        if (device?.FriendlyName is { } friendlyName)
        {
            names.Add(friendlyName);
        }
        if (device?.DeviceDescription is { } deviceDescription)
        {
            names.Add(deviceDescription);
        }
        return OneShot.Json(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("version", 1);
            writer.WriteStartObject("power");
            OneShot.WriteNullable(writer, "modernStandby", capabilities?.AoAc);
            OneShot.WriteNullable(writer, "sleepS3", capabilities?.SystemS3);
            OneShot.WriteNullable(
                writer,
                "hibernate",
                capabilities is { } power ? power.SystemS4 && power.HiberFilePresent : (bool?)null);
            writer.WriteString("fastStartup", FastStartup(capabilities, reads.Settings));
            writer.WriteEndObject();
            // adapter is null for both absent and unknown; only absent means
            // "not this PC's adapter".
            writer.WriteString("adapterStatus", reads.Lookup.Status);
            if (row is null)
            {
                writer.WriteNull("adapter");
            }
            else
            {
                writer.WriteStartObject("adapter");
                writer.WriteBoolean("connected", row.OperStatus == 1);
                writer.WriteString("bus", Bus(device?.EnumeratorName));
                OneShot.WriteNullable(writer, "internal", device?.InLocalMachineContainer);
                OneShot.WriteNullable(writer, "defaultRoute", bestRoutes?.Contains(row.InterfaceIndex));
                writer.WriteString("magicPacket", Keyword(device?.Keywords.WakeOnMagicPacket));
                writer.WriteString("shutdownWake", Keyword(device?.Keywords.S5WakeOnLan));
                writer.WriteString("modernStandbyMagicPacket", Keyword(device?.Keywords.ModernStandbyWoLMagicPacket));
                writer.WriteString("energyEfficientEthernet", Keyword(device?.Keywords.Eee));
                OneShot.WriteNullable(
                    writer,
                    "windowsWakeArmed",
                    device is not null && reads.Armed is { } armed
                        ? WakeArmed(armed, device.HardwareIds, device.IdenticalPresentDevices)
                        : null);
                OneShot.WriteNullable(writer, "driverProvider", device?.DriverProvider);
                OneShot.WriteNullable(writer, "driverVersion", device?.DriverVersion);
                writer.WriteEndObject();
            }
            // lastWake is the newest wake event, which can predate the current
            // boot; the companion compares at with bootAt before using it.
            writer.WriteStartObject("lastWake");
            writer.WriteString("source", WakeSource(reads.Wake, names));
            writer.WriteString("bootType", BootType(reads.Boot));
            OneShot.WriteNullable(
                writer,
                "at",
                reads.Wake?.Event is { } wake ? FiletimeToIso8601(wake.TimeCreated) : null);
            OneShot.WriteNullable(writer, "bootAt", BootAt(reads.Boot));
            writer.WriteEndObject();
            writer.WriteEndObject();
        });
    }

    // Runs the independent reads on parallel threads. A read that cannot
    // start, fails, or is still running at the deadline reports its unknown
    // value; stragglers are abandoned and end with the process.
    public static ReadinessReads Collect(byte[] mac, long deadline, ReadinessReaders readers)
    {
        // Event-log scans get what remains of the cap, so a slow scan of a
        // large log ends itself (as unknown) rather than being abandoned.
        var scan = OneShot.Remaining(deadline) - TimeSpan.FromMilliseconds(100);
        if (scan < TimeSpan.Zero)
        {
            scan = TimeSpan.Zero;
        }
        var capabilities = OneShot.Start("readiness power", readers.Capabilities);
        var settings = OneShot.Start("readiness fast startup", readers.Settings);
        var routes = OneShot.Start("readiness routes", readers.Routes);
        var armed = OneShot.Start("readiness wake armed", readers.Armed);
        var wake = OneShot.Start("readiness last wake", () => new EventScan<WakeEvent>(readers.Wake(scan)));
        var boot = OneShot.Start("readiness boot type", () => new EventScan<BootEvent>(readers.Boot(scan)));
        Task<AdapterDevice?>? deviceRead = null;
        var lookups = OneShot.Start("readiness adapter", () =>
        {
            // The same physical-Ethernet filter as the adapter list; link
            // state is reported as connected, never used to hide the adapter.
            var valid = mac.Length == 6 && mac.Any(octet => octet != 0) && (mac[0] & 1) == 0;
            IReadOnlyList<PhysicalEthernetAdapter> adapters;
            try
            {
                adapters = readers.Adapters();
            }
            catch
            {
                return AdapterLookup.Unknown;
            }
            var row = valid ? adapters.FirstOrDefault(adapter => adapter.Mac.AsSpan().SequenceEqual(mac)) : null;
            if (row is null)
            {
                return AdapterLookup.Absent;
            }
            var guid = row.InterfaceGuid;
            // The device read continues on its own thread so the adapter row
            // is delivered first and never waits for it.
            Volatile.Write(
                ref deviceRead,
                OneShot.Start("readiness adapter device", () => readers.Devices([guid]).LastOrDefault()));
            return AdapterLookup.Present(row);
        });
        var lookup = OneShot.TryTake(lookups, deadline, out var found) && found is not null
            ? found
            : AdapterLookup.Unknown;
        return new ReadinessReads
        {
            Capabilities = OneShot.TryTake(capabilities, deadline, out var power) ? power : null,
            Settings = OneShot.TryTake(settings, deadline, out var hiberboot) ? hiberboot : null,
            Device = lookup.Row is not null && OneShot.TryTake(Volatile.Read(ref deviceRead), deadline, out var device)
                ? device
                : null,
            Lookup = lookup,
            Routes = OneShot.TryTake(routes, deadline, out var table) ? table : null,
            Armed = OneShot.TryTake(armed, deadline, out var armedIds) ? armedIds : null,
            Wake = OneShot.TryTake(wake, deadline, out var wakeScan) ? wakeScan : null,
            Boot = OneShot.TryTake(boot, deadline, out var bootScan) ? bootScan : null
        };
    }
}

// Read-only power capability, Fast Startup setting and wake-armed device reads.
static class WakePowerReads
{
    // SYSTEM_POWER_CAPABILITIES (winnt.h) is 76 bytes; the BOOLEANs reported
    // here are read as bytes at their offsets, so an unexpected non-0/1 value
    // is still just true.
    private const int PowerCapabilitiesBytes = 76;
    private const int SystemS3Offset = 5;
    private const int SystemS4Offset = 6;
    private const int HiberFilePresentOffset = 8;
    private const int HiberbootOffset = 18;
    private const int AoAcOffset = 20;
    private const uint RegDword = 4;
    private const uint DevicePowerHardwareId = 0x80000000;
    private const uint DevicePowerFilterDevicesPresent = 0x20000000;
    private const uint DevicePowerFilterWakeEnabled = 0x08000000;
    private const uint ErrorInsufficientBuffer = 122;
    private const uint ErrorMoreData = 234;
    private const uint ErrorNoMoreItems = 259;
    private const int DevicePowerBufferLimit = 256 * 1024;
    // Device entries plus buffer regrowths one enumeration may take.
    private const int MaxDevicePowerSteps = 4096;

    // GetPwrCapabilities; null when Windows refuses.
    public static PowerCapabilities? ReadCapabilities()
    {
        var raw = new byte[PowerCapabilitiesBytes];
        if (!GetPwrCapabilities(raw))
        {
            return null;
        }
        return new PowerCapabilities(
            raw[SystemS3Offset] != 0,
            raw[SystemS4Offset] != 0,
            raw[HiberFilePresentOffset] != 0,
            raw[HiberbootOffset] != 0,
            raw[AoAcOffset] != 0);
    }

    // Reads both HiberbootEnabled values from the 64-bit registry view
    // without changing either.
    public static HiberbootSettings ReadHiberbootSettings() => new(
        ReadHiberbootSetting(@"SYSTEM\CurrentControlSet\Control\Session Manager\Power"),
        ReadHiberbootSetting(@"SOFTWARE\Policies\Microsoft\Windows\System"));

    private static HiberbootSetting ReadHiberbootSetting(string path) =>
        ParseHiberbootValue(RegistryValues.Read(
            RegistryValues.LocalMachine,
            path,
            "HiberbootEnabled",
            RegistryValues.Subkey64BitView));

    // Only a DWORD 0 or 1 is a setting; an absent key or value is a valid
    // "not set". Any other type, size or value is malformed, as in the
    // companion's shutdown-mode reader.
    public static HiberbootSetting ParseHiberbootValue(RegistryRead value)
    {
        if (value.Failed)
        {
            return HiberbootSetting.Invalid;
        }
        if (value.Data is not { } data)
        {
            return new HiberbootSetting(true, null);
        }
        if (data.Length != 4)
        {
            return HiberbootSetting.Invalid;
        }
        var setting = BinaryPrimitives.ReadUInt32LittleEndian(data);
        return value.Kind == RegDword && setting is 0 or 1
            ? new HiberbootSetting(true, setting)
            : HiberbootSetting.Invalid;
    }

    // Classifies one DevicePowerEnumDevices call from its return value,
    // GetLastError, the size Windows reported and the buffer that was passed.
    // Only ERROR_NO_MORE_ITEMS ends the list.
    public static DevicePowerStep ClassifyDevicePowerStep(bool found, uint lastError, uint reportedBytes, int bufferBytes)
    {
        if (found)
        {
            return new DevicePowerStep(DevicePowerStepKind.Device);
        }
        if (lastError == ErrorNoMoreItems)
        {
            return new DevicePowerStep(DevicePowerStepKind.End);
        }
        if (lastError is ErrorInsufficientBuffer or ErrorMoreData
            && reportedBytes > bufferBytes
            && reportedBytes <= DevicePowerBufferLimit)
        {
            return new DevicePowerStep(DevicePowerStepKind.Grow, (int)reportedBytes);
        }
        return new DevicePowerStep(DevicePowerStepKind.Fail);
    }

    // Hardware-id lists of the present devices Windows has armed to wake the
    // system (the source of powercfg /devicequery wake_armed). DevicePowerOpen
    // only caches the device power table for this process; nothing is changed
    // (DevicePowerSetDeviceState is never called). Non-present devices are
    // filtered out so an installed but absent twin can never stand in for the
    // present adapter. Any failure before the end discards the partial list.
    public static List<IReadOnlyList<string>> ReadWakeArmedHardwareIds()
    {
        if (!DevicePowerOpen(0))
        {
            throw new InvalidOperationException("Device power data unavailable.");
        }
        try
        {
            var devices = new List<IReadOnlyList<string>>();
            var buffer = new byte[4096];
            uint index = 0;
            for (var step = 0; step < MaxDevicePowerSteps; step++)
            {
                var size = (uint)buffer.Length;
                var found = DevicePowerEnumDevices(
                    index,
                    DevicePowerFilterDevicesPresent | DevicePowerFilterWakeEnabled | DevicePowerHardwareId,
                    0,
                    buffer,
                    ref size);
                var error = found ? 0 : (uint)Marshal.GetLastPInvokeError();
                var next = ClassifyDevicePowerStep(found, error, size, buffer.Length);
                switch (next.Kind)
                {
                    case DevicePowerStepKind.Device:
                        devices.Add(PhysicalEthernetAdapters.SplitMultiString(buffer));
                        Array.Clear(buffer);
                        index++;
                        break;
                    case DevicePowerStepKind.End:
                        return devices;
                    case DevicePowerStepKind.Grow:
                        // Even, so the UTF-16 multi-string stays whole.
                        buffer = new byte[(next.Bytes + 1) & ~1];
                        break;
                    default:
                        throw new InvalidOperationException($"Device power enumeration failed ({error}).");
                }
            }
            throw new InvalidOperationException("Device power data is implausibly large.");
        }
        finally
        {
            _ = DevicePowerClose();
        }
    }

    [DllImport("powrprof.dll")]
    [return: MarshalAs(UnmanagedType.U1)]
    private static extern bool GetPwrCapabilities([Out] byte[] capabilities);

    [DllImport("powrprof.dll")]
    [return: MarshalAs(UnmanagedType.U1)]
    private static extern bool DevicePowerOpen(uint debugMask);

    [DllImport("powrprof.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    private static extern bool DevicePowerEnumDevices(
        uint queryIndex,
        uint queryInterpretationFlags,
        uint queryFlags,
        [Out] byte[] returnBuffer,
        ref uint bufferSize);

    [DllImport("powrprof.dll")]
    [return: MarshalAs(UnmanagedType.U1)]
    private static extern bool DevicePowerClose();
}

// Read-only, newest-first queries of the System event log for wake evidence.
static class WakeEventLog
{
    private const uint EvtQueryChannelPath = 0x1;
    private const uint EvtQueryReverseDirection = 0x200;
    private const uint EvtRenderContextValues = 0;
    private const uint EvtRenderEventValues = 0;
    private const int ErrorNoMoreItems = 259;
    private const int ErrorTimeout = 1460;
    private const int RenderLimit = 64 * 1024;
    // EVT_VARIANT: an 8-byte value union, then Count and Type.
    private const int VariantBytes = 16;
    private const int VariantTypeOffset = 12;
    private const uint VariantTypeMask = 0x7f;
    private const uint EvtVarTypeString = 1;
    private const uint EvtVarTypeUInt16 = 6;
    private const uint EvtVarTypeUInt32 = 8;
    private const uint EvtVarTypeFileTime = 17;
    private const uint EvtVarTypeHexInt32 = 20;

    // Null only when the scan of the System log finished without a match.
    // Throws when the log cannot be queried or rendered, or when the scan is
    // still running after the timeout.
    public static WakeEvent? ReadLatestWakeEvent(TimeSpan timeout)
    {
        var values = Newest(
            "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]",
            [
                "Event/System/TimeCreated/@SystemTime",
                "Event/EventData/Data[@Name='WakeSourceType']",
                "Event/EventData/Data[@Name='WakeSourceText']"
            ],
            timeout);
        if (values is null)
        {
            return null;
        }
        if (values[0] is not ulong timeCreated || values[1] is not uint sourceType)
        {
            throw new InvalidOperationException("Wake event fields are missing.");
        }
        return new WakeEvent(sourceType, values[2] as string ?? string.Empty, timeCreated);
    }

    public static BootEvent? ReadLatestBootEvent(TimeSpan timeout)
    {
        var values = Newest(
            "*[System[Provider[@Name='Microsoft-Windows-Kernel-Boot'] and EventID=27]]",
            ["Event/System/TimeCreated/@SystemTime", "Event/EventData/Data[@Name='BootType']"],
            timeout);
        if (values is null)
        {
            return null;
        }
        if (values[0] is not ulong timeCreated || values[1] is not uint bootType)
        {
            throw new InvalidOperationException("Boot event fields are missing.");
        }
        return new BootEvent(bootType, timeCreated);
    }

    // Only ERROR_NO_MORE_ITEMS proves there is no matching event; ERROR_TIMEOUT
    // on a large log, any other error, or an empty success is unknown.
    public static ScanOutcome ClassifyScan(bool succeeded, uint returned, int lastError)
    {
        if (succeeded)
        {
            return returned > 0 ? ScanOutcome.Found : ScanOutcome.Incomplete;
        }
        return lastError == ErrorNoMoreItems ? ScanOutcome.Absent : ScanOutcome.Incomplete;
    }

    // Renders paths from the newest System-log event matching query: uint for
    // UInt16/UInt32/HexInt32, ulong for FILETIME, string for text, null for
    // anything else. Null overall only when the scan finished without a match.
    internal static object?[]? Newest(string query, string[] paths, TimeSpan timeout)
    {
        // INFINITE (uint.MaxValue) is excluded, so the scan always ends.
        var timeoutMs = (uint)Math.Clamp(timeout.TotalMilliseconds, 1, uint.MaxValue - 1);
        // The query is lazily evaluated and opens the channel for reading only.
        var results = EvtQuery(IntPtr.Zero, "System", query, EvtQueryChannelPath | EvtQueryReverseDirection);
        if (results == IntPtr.Zero)
        {
            throw new InvalidOperationException($"System log query failed ({Marshal.GetLastPInvokeError()}).");
        }
        try
        {
            var events = new IntPtr[1];
            var succeeded = EvtNext(results, 1, events, timeoutMs, 0, out var returned);
            var error = succeeded ? 0 : Marshal.GetLastPInvokeError();
            // Own a returned handle before deciding anything, so it is always closed.
            var eventHandle = succeeded && returned > 0 ? events[0] : IntPtr.Zero;
            try
            {
                switch (ClassifyScan(succeeded, returned, error))
                {
                    case ScanOutcome.Absent:
                        return null;
                    case ScanOutcome.Incomplete:
                        throw new InvalidOperationException(
                            succeeded ? "System log read returned no event."
                            : error == ErrorTimeout ? $"System log scan did not finish within {timeoutMs} ms."
                            : $"System log read failed ({error}).");
                }
                if (eventHandle == IntPtr.Zero)
                {
                    throw new InvalidOperationException("System log returned an invalid event handle.");
                }
                return Render(eventHandle, paths);
            }
            finally
            {
                if (eventHandle != IntPtr.Zero)
                {
                    _ = EvtClose(eventHandle);
                }
            }
        }
        finally
        {
            _ = EvtClose(results);
        }
    }

    private static object?[] Render(IntPtr eventHandle, string[] paths)
    {
        var context = EvtCreateRenderContext((uint)paths.Length, paths, EvtRenderContextValues);
        if (context == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Event render context failed ({Marshal.GetLastPInvokeError()}).");
        }
        try
        {
            // A size query with no buffer; Windows reports the needed bytes.
            _ = EvtRender(context, eventHandle, EvtRenderEventValues, 0, IntPtr.Zero, out var used, out _);
            var bytes = (int)Math.Clamp(used, 1u, (uint)RenderLimit);
            // AllocHGlobal keeps the EVT_VARIANT array 8-byte aligned, and the
            // string values it points to stay live until it is freed.
            var buffer = Marshal.AllocHGlobal(bytes);
            try
            {
                if (!EvtRender(context, eventHandle, EvtRenderEventValues, (uint)bytes, buffer, out _, out var count))
                {
                    throw new InvalidOperationException($"Event render failed ({Marshal.GetLastPInvokeError()}).");
                }
                if (count != paths.Length || paths.Length * VariantBytes > bytes)
                {
                    throw new InvalidOperationException("Event render returned an unexpected shape.");
                }
                var values = new object?[paths.Length];
                for (var index = 0; index < paths.Length; index++)
                {
                    values[index] = Value(buffer + index * VariantBytes);
                }
                return values;
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        finally
        {
            _ = EvtClose(context);
        }
    }

    private static object? Value(IntPtr variant)
    {
        var type = (uint)Marshal.ReadInt32(variant, VariantTypeOffset);
        // Array values (EVT_VARIANT_TYPE_ARRAY) are never expected here.
        if ((type & ~VariantTypeMask) != 0)
        {
            return null;
        }
        switch (type)
        {
            case EvtVarTypeUInt32 or EvtVarTypeHexInt32:
                return (uint)Marshal.ReadInt32(variant);
            case EvtVarTypeUInt16:
                return (uint)(ushort)Marshal.ReadInt16(variant);
            case EvtVarTypeFileTime:
                return (ulong)Marshal.ReadInt64(variant);
            case EvtVarTypeString:
                var text = Marshal.ReadIntPtr(variant);
                return text == IntPtr.Zero ? string.Empty : Marshal.PtrToStringUni(text) ?? string.Empty;
            default:
                return null;
        }
    }

    [DllImport("wevtapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr EvtQuery(IntPtr session, string path, string query, uint flags);

    [DllImport("wevtapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EvtNext(
        IntPtr resultSet,
        uint eventsSize,
        [Out] IntPtr[] events,
        uint timeout,
        uint flags,
        out uint returned);

    [DllImport("wevtapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr EvtCreateRenderContext(
        uint valuePathsCount,
        [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] valuePaths,
        uint flags);

    [DllImport("wevtapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EvtRender(
        IntPtr context,
        IntPtr fragment,
        uint flags,
        uint bufferSize,
        IntPtr buffer,
        out uint bufferUsed,
        out uint propertyCount);

    [DllImport("wevtapi.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EvtClose(IntPtr handle);
}
