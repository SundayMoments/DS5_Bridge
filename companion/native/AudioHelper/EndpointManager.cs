using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;

sealed class EndpointManager
{
    private static readonly Guid PolicyConfigClientId = new("870af99c-171d-4f9e-af0d-e63df40c2bc9");

    private static readonly string[] RawPcmEndpointNames =
    [
        "DS5 Bridge Raw PCM"
    ];

    private static readonly string[] BridgeEndpointAliases =
    [
        "DS5 Bridge",
        "DualSense Wireless Controller",
        "Wireless Controller",
        "Xbox 360 Controller for Windows"
    ];

    private static readonly Role[] DefaultRenderRoles =
    [
        Role.Console,
        Role.Multimedia
    ];

    public static MMDevice SelectRenderEndpoint(MMDeviceEnumerator enumerator, string? deviceName)
    {
        var devices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)
            .ToArray();

        if (!string.IsNullOrWhiteSpace(deviceName))
        {
            return SelectNamedEndpoint(devices, deviceName, "Render");
        }

        var bridge = FindKnownBridgeEndpoint(devices);
        if (bridge is not null)
        {
            return bridge;
        }

        return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    }

    public static MMDevice SelectRenderBridgeEndpointForPersona(MMDeviceEnumerator enumerator, string? hostPersonaMode)
    {
        var devices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)
            .ToArray();

        return FindKnownBridgeEndpointForPersona(devices, hostPersonaMode)
            ?? throw BridgeEndpointNotFoundForPersona(devices, hostPersonaMode);
    }

    public static MMDevice SelectDefaultRenderEndpoint(MMDeviceEnumerator enumerator)
    {
        return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    }

    public static DefaultRenderEndpointStatus GetDefaultRenderEndpointStatus()
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = SelectDefaultRenderEndpoint(enumerator);
        return new DefaultRenderEndpointStatus(device.FriendlyName, IsKnownBridgeEndpoint(device));
    }

    public static void PrintDefaultRenderEndpointStatus()
    {
        var status = GetDefaultRenderEndpointStatus();
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            deviceName = status.DeviceName,
            isBridgeEndpoint = status.IsKnownBridgeEndpoint
        }));
    }

    public static void SetDefaultRenderBridgeEndpoint(string? hostPersonaMode)
    {
        using var enumerator = new MMDeviceEnumerator();
        var device = SelectRenderBridgeEndpointForPersona(enumerator, hostPersonaMode);

        SetDefaultRenderEndpoint(device);
        Console.Error.WriteLine($"status: default-render-set device='{device.FriendlyName}' persona='{hostPersonaMode ?? "auto"}'");
    }

    public static MMDevice SelectCaptureEndpoint(MMDeviceEnumerator enumerator, string? deviceName)
    {
        var devices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
            .ToArray();

        if (!string.IsNullOrWhiteSpace(deviceName))
        {
            return SelectNamedEndpoint(devices, deviceName, "Capture");
        }

        var bridge = FindKnownBridgeEndpoint(devices);
        if (bridge is not null)
        {
            return bridge;
        }

        return enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
    }

    public static MMDevice SelectRawPcmCaptureEndpoint(MMDeviceEnumerator enumerator, string? deviceName)
    {
        var devices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
            .ToArray();

        var exactRawPcm = SelectNamedRawPcmEndpoint(devices, deviceName)
            ?? SelectNamedRawPcmEndpoint(devices, RawPcmEndpointNames[0]);
        if (exactRawPcm is not null)
        {
            return exactRawPcm;
        }

        if (!string.IsNullOrWhiteSpace(deviceName))
        {
            var named = SelectPreferredNamedCaptureEndpoint(devices, deviceName, IsRawPcmEndpoint, allowFallback: false);
            if (named is not null)
            {
                return named;
            }
        }

        var bridge = SelectPreferredBridgeCaptureEndpoint(devices, IsRawPcmEndpoint, allowFallback: false);
        if (bridge is not null)
        {
            return bridge;
        }

        var target = string.IsNullOrWhiteSpace(deviceName)
            ? string.Join("' or '", RawPcmEndpointNames)
            : deviceName;
        var available = string.Join(", ", devices.Select(device => $"'{device.FriendlyName}'"));
        throw new InvalidOperationException(
            $"Raw PCM capture endpoint matching '{target}' was not found. Available capture endpoints: {available}");
    }

    public static MMDevice SelectMicCaptureEndpoint(MMDeviceEnumerator enumerator, string? deviceName)
    {
        var devices = enumerator
            .EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
            .ToArray();

        if (!string.IsNullOrWhiteSpace(deviceName))
        {
            var named = SelectPreferredNamedCaptureEndpoint(devices, deviceName, IsMicEndpoint);
            if (named is not null)
            {
                return named;
            }
        }

        var bridge = SelectPreferredBridgeCaptureEndpoint(devices, IsMicEndpoint);
        if (bridge is not null)
        {
            return bridge;
        }

        return SelectCaptureEndpoint(enumerator, deviceName);
    }

    public static MMDevice? FindKnownBridgeEndpoint(IEnumerable<MMDevice> devices)
    {
        foreach (var name in BridgeEndpointAliases)
        {
            var match = devices.FirstOrDefault(device =>
                EndpointNameMatchesAlias(device.FriendlyName, name));
            if (match is not null)
            {
                return match;
            }
        }

        return null;
    }

    public static void ListDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            Console.Error.WriteLine($"render-device: {device.FriendlyName}");
        }
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
        {
            Console.Error.WriteLine($"capture-device: {device.FriendlyName}");
        }
    }

    private static MMDevice SelectNamedEndpoint(MMDevice[] devices, string deviceName, string role)
    {
        var exact = devices.FirstOrDefault(device =>
            string.Equals(device.FriendlyName, deviceName, StringComparison.OrdinalIgnoreCase));
        if (exact is not null)
        {
            return exact;
        }

        var contains = devices.FirstOrDefault(device =>
            device.FriendlyName.Contains(deviceName, StringComparison.OrdinalIgnoreCase));
        if (contains is not null)
        {
            return contains;
        }

        if (deviceName.Contains("DS5 Bridge", StringComparison.OrdinalIgnoreCase))
        {
            var alias = FindKnownBridgeEndpoint(devices);
            if (alias is not null)
            {
                if (AudioConstants.DiagnosticsEnabled)
                {
                    Console.Error.WriteLine($"status: endpoint alias '{alias.FriendlyName}' matched for '{deviceName}'");
                }
                return alias;
            }
        }

        var available = string.Join(", ", devices.Select(device => $"'{device.FriendlyName}'"));
        throw new InvalidOperationException($"{role} endpoint matching '{deviceName}' was not found. Available endpoints: {available}");
    }

    private static MMDevice? SelectPreferredNamedCaptureEndpoint(
        MMDevice[] devices,
        string deviceName,
        Func<MMDevice, bool> preferred,
        bool allowFallback = true)
    {
        var matches = devices
            .Where(device =>
                string.Equals(device.FriendlyName, deviceName, StringComparison.OrdinalIgnoreCase)
                || device.FriendlyName.Contains(deviceName, StringComparison.OrdinalIgnoreCase)
                || (deviceName.Contains("DS5 Bridge", StringComparison.OrdinalIgnoreCase)
                    && IsKnownBridgeEndpoint(device)))
            .ToArray();

        return SelectPreferredEndpoint(matches, preferred, allowFallback);
    }

    private static MMDevice? SelectNamedRawPcmEndpoint(MMDevice[] devices, string? deviceName)
    {
        if (string.IsNullOrWhiteSpace(deviceName))
        {
            return null;
        }

        var exact = devices.FirstOrDefault(device =>
            IsRawPcmEndpoint(device)
            && string.Equals(device.FriendlyName, deviceName, StringComparison.OrdinalIgnoreCase));
        if (exact is not null)
        {
            return exact;
        }

        return devices.FirstOrDefault(device =>
            IsRawPcmEndpoint(device)
            && device.FriendlyName.Contains(deviceName, StringComparison.OrdinalIgnoreCase));
    }

    private static MMDevice? SelectPreferredBridgeCaptureEndpoint(
        MMDevice[] devices,
        Func<MMDevice, bool> preferred,
        bool allowFallback = true)
    {
        foreach (var name in BridgeEndpointAliases)
        {
            var matches = devices
                .Where(device => device.FriendlyName.Contains(name, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            var preferredEndpoint = SelectPreferredEndpoint(matches, preferred, allowFallback);
            if (preferredEndpoint is not null)
            {
                return preferredEndpoint;
            }
        }

        return null;
    }

    private static MMDevice? SelectPreferredEndpoint(MMDevice[] devices, Func<MMDevice, bool> preferred, bool allowFallback)
    {
        var preferredEndpoint = devices.FirstOrDefault(preferred);
        if (preferredEndpoint is not null)
        {
            return preferredEndpoint;
        }

        return allowFallback ? devices.FirstOrDefault() : null;
    }

    public static bool IsKnownBridgeEndpoint(MMDevice device)
    {
        return IsKnownBridgeEndpointName(device.FriendlyName);
    }

    internal static bool IsKnownBridgeEndpointName(string friendlyName)
    {
        return BridgeEndpointAliases.Any(alias =>
            EndpointNameMatchesAlias(friendlyName, alias));
    }

    internal static bool IsKnownBridgeEndpointNameForPersona(string friendlyName, string? hostPersonaMode)
    {
        return BridgeEndpointAliasesForPersona(hostPersonaMode).Any(alias =>
            EndpointNameMatchesAlias(friendlyName, alias));
    }

    private static MMDevice? FindKnownBridgeEndpointForPersona(MMDevice[] devices, string? hostPersonaMode)
    {
        foreach (var name in BridgeEndpointAliasesForPersona(hostPersonaMode))
        {
            var match = devices.FirstOrDefault(device =>
                EndpointNameMatchesAlias(device.FriendlyName, name));
            if (match is not null)
            {
                return match;
            }
        }

        return string.IsNullOrWhiteSpace(hostPersonaMode) ? FindKnownBridgeEndpoint(devices) : null;
    }

    private static string[] BridgeEndpointAliasesForPersona(string? hostPersonaMode)
    {
        return hostPersonaMode?.ToLowerInvariant() switch
        {
            "ds4" => ["Wireless Controller"],
            "xbox" => ["Xbox 360 Controller for Windows"],
            _ => ["DualSense Wireless Controller", "DS5 Bridge"]
        };
    }

    private static InvalidOperationException BridgeEndpointNotFoundForPersona(
        MMDevice[] devices,
        string? hostPersonaMode)
    {
        var expected = string.Join("' or '", BridgeEndpointAliasesForPersona(hostPersonaMode));
        var available = string.Join(", ", devices.Select(device => $"'{device.FriendlyName}'"));
        return new InvalidOperationException(
            $"Render endpoint matching persona '{hostPersonaMode ?? "dualsense"}' ('{expected}') was not found. Available endpoints: {available}");
    }

    private static bool EndpointNameMatchesAlias(string friendlyName, string alias)
    {
        if (!friendlyName.Contains(alias, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        return !alias.Equals("Wireless Controller", StringComparison.OrdinalIgnoreCase)
            || !friendlyName.Contains("DualSense Wireless Controller", StringComparison.OrdinalIgnoreCase);
    }

    private static void SetDefaultRenderEndpoint(MMDevice device)
    {
#pragma warning disable CA1416
        var policyConfigType = Type.GetTypeFromCLSID(PolicyConfigClientId)
            ?? throw new InvalidOperationException("Windows audio policy configuration is unavailable.");
#pragma warning restore CA1416
        var policyConfig = (IPolicyConfig)(Activator.CreateInstance(policyConfigType)
            ?? throw new InvalidOperationException("Windows audio policy configuration could not be created."));
        foreach (var role in DefaultRenderRoles)
        {
            var result = policyConfig.SetDefaultEndpoint(device.ID, role);
            if (result != 0)
            {
                Marshal.ThrowExceptionForHR(result);
            }
        }
    }

    private static bool IsRawPcmEndpoint(MMDevice device)
    {
        return device.FriendlyName.Contains("Raw PCM", StringComparison.OrdinalIgnoreCase)
            || device.FriendlyName.Contains("Line", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsMicEndpoint(MMDevice device)
    {
        return device.FriendlyName.Contains("Microphone", StringComparison.OrdinalIgnoreCase)
            || device.FriendlyName.Contains("Headset", StringComparison.OrdinalIgnoreCase);
    }
}

internal sealed record DefaultRenderEndpointStatus(
    string DeviceName,
    bool IsKnownBridgeEndpoint);

[ComImport]
[Guid("f8679f50-850a-41cf-9c72-430f290290c8")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig
{
    [PreserveSig]
    int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr format);

    [PreserveSig]
    int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, bool defaultFormat, out IntPtr format);

    [PreserveSig]
    int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId);

    [PreserveSig]
    int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr endpointFormat, IntPtr mixFormat);

    [PreserveSig]
    int GetProcessingPeriod(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceId,
        bool defaultPeriod,
        out long defaultProcessingPeriod,
        out long minimumProcessingPeriod);

    [PreserveSig]
    int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ref long processingPeriod);

    [PreserveSig]
    int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);

    [PreserveSig]
    int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);

    [PreserveSig]
    int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr key, IntPtr value);

    [PreserveSig]
    int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr key, IntPtr value);

    [PreserveSig]
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, Role role);

    [PreserveSig]
    int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, bool visible);
}
