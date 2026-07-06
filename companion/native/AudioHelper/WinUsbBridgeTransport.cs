using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

sealed class WinUsbBridgeTransport : IDisposable
{
    private const byte ControlGetReport = 0x31;
    private const byte ControlSetReport = 0x32;
    private const ushort BridgeInterfaceNumber = 0x0005;
    private const string BridgeInterfaceMarker = "mi_05";
    private const int ReportBytes = 64;
    private const uint BridgeOutTransferTimeoutMs = 35;
    private static readonly Guid DeviceInterfaceGuid = new("E4C8B2A9-87F5-4C4C-9E52-2B4C1B8B4F62");
    private static readonly Guid LegacySharedDeviceInterfaceGuid = new("D5B7C5F4-8A68-4A86-9E31-1E5FA7B1D5B0");

    private readonly SafeFileHandle deviceHandle;
    private readonly IntPtr winUsbHandle;
    private readonly byte outPipeId;
    private bool disposed;

    private WinUsbBridgeTransport(string devicePath, SafeFileHandle deviceHandle, IntPtr winUsbHandle, byte outPipeId)
    {
        DevicePath = devicePath;
        this.deviceHandle = deviceHandle;
        this.winUsbHandle = winUsbHandle;
        this.outPipeId = outPipeId;
    }

    public string DevicePath { get; }

    public static WinUsbBridgeTransport Open()
    {
        Exception? lastError = null;
        foreach (var deviceInterfaceGuid in new[] { DeviceInterfaceGuid, LegacySharedDeviceInterfaceGuid })
        {
            foreach (var path in NativeMethods.EnumerateDeviceInterfacePaths(deviceInterfaceGuid))
            {
                if (!IsBridgeInterfacePath(path))
                {
                    continue;
                }

                SafeFileHandle? device = null;
                IntPtr winUsb = IntPtr.Zero;
                try
                {
                    device = NativeMethods.CreateFile(
                        path,
                        NativeMethods.GenericRead | NativeMethods.GenericWrite,
                        NativeMethods.FileShareRead | NativeMethods.FileShareWrite,
                        IntPtr.Zero,
                        NativeMethods.OpenExisting,
                        NativeMethods.FileAttributeNormal | NativeMethods.FileFlagOverlapped,
                        IntPtr.Zero);
                    if (device.IsInvalid)
                    {
                        lastError = new Win32Exception(Marshal.GetLastWin32Error());
                        device.Dispose();
                        continue;
                    }

                    if (!NativeMethods.WinUsb_Initialize(device, out winUsb))
                    {
                        lastError = new Win32Exception(Marshal.GetLastWin32Error());
                        device.Dispose();
                        continue;
                    }

                    if (TryFindBulkOutPipe(winUsb, out var outPipe))
                    {
                        var timeoutMs = BridgeOutTransferTimeoutMs;
                        _ = NativeMethods.WinUsb_SetPipePolicy(
                            winUsb,
                            outPipe.PipeId,
                            NativeMethods.PipeTransferTimeout,
                            sizeof(uint),
                            ref timeoutMs);
                        return new WinUsbBridgeTransport(path, device, winUsb, outPipe.PipeId);
                    }

                    NativeMethods.WinUsb_Free(winUsb);
                    device.Dispose();
                    lastError = new InvalidOperationException("WinUSB bridge interface does not expose a bulk OUT pipe.");
                }
                catch (Exception error)
                {
                    if (winUsb != IntPtr.Zero)
                    {
                        NativeMethods.WinUsb_Free(winUsb);
                    }
                    device?.Dispose();
                    lastError = error;
                }
            }
        }

        throw new IOException(
            lastError is null
                ? "DS5 Bridge WinUSB interface was not found."
                : $"DS5 Bridge WinUSB interface could not be opened: {lastError.Message}");
    }

    public static WinUsbBridgeTransport? TryOpen()
    {
        try
        {
            return Open();
        }
        catch
        {
            return null;
        }
    }

    public byte[] GetReport(byte reportId)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        var report = new byte[ReportBytes];
        var setup = new WinUsbSetupPacket
        {
            RequestType = 0xC1,
            Request = ControlGetReport,
            Value = reportId,
            Index = BridgeInterfaceNumber,
            Length = ReportBytes
        };
        if (!NativeMethods.WinUsb_ControlTransfer(
                winUsbHandle,
                setup,
                report,
                ReportBytes,
                out var transferred,
                IntPtr.Zero))
        {
            throw new IOException($"WinUSB bridge GET_REPORT failed: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
        }
        if (transferred != ReportBytes)
        {
            Array.Resize(ref report, checked((int)transferred));
        }
        return report;
    }

    public void WriteReport(byte[] report)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (report.Length != ReportBytes)
        {
            throw new ArgumentException($"Bridge reports must be {ReportBytes} bytes.", nameof(report));
        }

        for (var attempt = 0; attempt < 2; attempt++)
        {
            if (NativeMethods.WinUsb_WritePipe(
                    winUsbHandle,
                    outPipeId,
                    report,
                    ReportBytes,
                    out var transferred,
                    IntPtr.Zero))
            {
                if (transferred != ReportBytes)
                {
                    throw new IOException($"WinUSB bridge write was short: {transferred}/{ReportBytes} bytes.");
                }
                return;
            }

            var error = Marshal.GetLastWin32Error();
            if (error != NativeMethods.ErrorSemTimeout || attempt != 0)
            {
                throw new IOException($"WinUSB bridge write failed: {new Win32Exception(error).Message}", error);
            }
        }
    }

    public void SetReport(byte[] report)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (report.Length != ReportBytes)
        {
            throw new ArgumentException($"Bridge reports must be {ReportBytes} bytes.", nameof(report));
        }
        var setup = new WinUsbSetupPacket
        {
            RequestType = 0x41,
            Request = ControlSetReport,
            Value = report[0],
            Index = BridgeInterfaceNumber,
            Length = ReportBytes
        };
        if (!NativeMethods.WinUsb_ControlTransfer(
                winUsbHandle,
                setup,
                report,
                ReportBytes,
                out _,
                IntPtr.Zero))
        {
            throw new IOException($"WinUSB bridge SET_REPORT failed: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
        }
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }
        disposed = true;
        if (!deviceHandle.IsInvalid)
        {
            _ = NativeMethods.CancelIoEx(deviceHandle, IntPtr.Zero);
        }
        if (winUsbHandle != IntPtr.Zero)
        {
            NativeMethods.WinUsb_Free(winUsbHandle);
        }
        deviceHandle.Dispose();
    }

    private static bool TryFindBulkOutPipe(IntPtr winUsb, out WinUsbPipeInformation pipe)
    {
        pipe = default;
        if (!NativeMethods.WinUsb_QueryInterfaceSettings(winUsb, 0, out var descriptor))
        {
            return false;
        }

        for (byte index = 0; index < descriptor.bNumEndpoints; index++)
        {
            if (
                NativeMethods.WinUsb_QueryPipe(winUsb, 0, index, out var candidate)
                && candidate.PipeType == NativeMethods.UsbdPipeTypeBulk
                && (candidate.PipeId & 0x80) == 0)
            {
                pipe = candidate;
                return true;
            }
        }

        return false;
    }

    private static bool IsBridgeInterfacePath(string path)
    {
        return path.Contains(BridgeInterfaceMarker, StringComparison.OrdinalIgnoreCase);
    }
}

static partial class NativeMethods
{
    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_WritePipe(
        IntPtr interfaceHandle,
        byte pipeId,
        [In] byte[] buffer,
        uint bufferLength,
        out uint lengthTransferred,
        IntPtr overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_ControlTransfer(
        IntPtr interfaceHandle,
        WinUsbSetupPacket setupPacket,
        [In, Out] byte[] buffer,
        uint bufferLength,
        out uint lengthTransferred,
        IntPtr overlapped);
}

[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct WinUsbSetupPacket
{
    public byte RequestType;
    public byte Request;
    public ushort Value;
    public ushort Index;
    public ushort Length;
}
