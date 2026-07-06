using System.Buffers.Binary;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

enum WinUsbPcmTransportKind
{
    Isochronous,
    Bulk
}

sealed class WinUsbPcmTransport : IDisposable
{
    public const int SampleRate = 48000;
    public const int Channels = 2;
    public const int BytesPerSample = 2;
    public const int FrameBytes = Channels * BytesPerSample;
    public const int BulkFramesPerPacket = 192;
    public const int HeaderBytes = 16;
    public const int BulkPacketBytes = HeaderBytes + BulkFramesPerPacket * FrameBytes;
    public const int ReadBufferBytes = 4096;
    public const int IsoFramesPerPacket = 48;
    public const int IsoHeaderBytes = 4;
    public const int IsoPacketBytes = IsoHeaderBytes + IsoFramesPerPacket * FrameBytes;
    private const int IsoTransferCount = 3;
    private const string PcmInterfaceMarker = "mi_06";
    public const string FriendlyName = "DS5 Bridge PCM Iso";
    private static readonly Guid DeviceInterfaceGuid = new("D5B7C5F4-8A68-4A86-9E31-1E5FA7B1D5B0");

    private readonly SafeFileHandle deviceHandle;
    private readonly IntPtr winUsbHandle;
    private readonly byte pipeId;
    private readonly WinUsbPcmTransportKind kind;
    private readonly int isoMaximumPacketSize;
    private readonly int isoMaximumBytesPerInterval;
    private readonly int isoInterval;
    private readonly int isoPacketsPerTransfer;
    private readonly int isoTransferBytes;
    private readonly byte[]? isoBuffer;
    private readonly GCHandle isoBufferPin;
    private readonly UsbdIsoPacketDescriptor[]? isoPacketDescriptors;
    private readonly GCHandle isoPacketDescriptorPin;
    private readonly OverlappedNative[]? isoOverlapped;
    private readonly GCHandle isoOverlappedPin;
    private readonly IntPtr[] isoEvents = new IntPtr[IsoTransferCount];
    private IntPtr isochBufferHandle;
    private int nextIsoTransfer;
    private uint isoReadFailureCount;
    private bool disposed;

    private WinUsbPcmTransport(SafeFileHandle deviceHandle, IntPtr winUsbHandle, byte pipeId)
    {
        this.deviceHandle = deviceHandle;
        this.winUsbHandle = winUsbHandle;
        this.pipeId = pipeId;
        kind = WinUsbPcmTransportKind.Bulk;
    }

    private WinUsbPcmTransport(
        SafeFileHandle deviceHandle,
        IntPtr winUsbHandle,
        byte pipeId,
        int maximumPacketSize,
        int maximumBytesPerInterval,
        byte interval)
    {
        var bytesPerInterval = maximumBytesPerInterval > 0 ? maximumBytesPerInterval : maximumPacketSize;
        if (bytesPerInterval < IsoPacketBytes)
        {
            throw new InvalidOperationException(
                $"WinUSB isochronous PCM pipe is {bytesPerInterval} bytes, expected at least {IsoPacketBytes} bytes.");
        }

        this.deviceHandle = deviceHandle;
        this.winUsbHandle = winUsbHandle;
        this.pipeId = pipeId;
        kind = WinUsbPcmTransportKind.Isochronous;
        isoMaximumPacketSize = maximumPacketSize;
        isoMaximumBytesPerInterval = bytesPerInterval;
        isoInterval = interval == 0 ? 1 : interval;
        isoPacketsPerTransfer = ComputeIsoPacketsPerTransfer(isoInterval);
        isoTransferBytes = checked(isoPacketsPerTransfer * isoMaximumBytesPerInterval);

        isoBuffer = new byte[IsoTransferCount * isoTransferBytes];
        isoPacketDescriptors = new UsbdIsoPacketDescriptor[IsoTransferCount * isoPacketsPerTransfer];
        isoOverlapped = new OverlappedNative[IsoTransferCount];
        isoBufferPin = GCHandle.Alloc(isoBuffer, GCHandleType.Pinned);
        isoPacketDescriptorPin = GCHandle.Alloc(isoPacketDescriptors, GCHandleType.Pinned);
        isoOverlappedPin = GCHandle.Alloc(isoOverlapped, GCHandleType.Pinned);

        if (!NativeMethods.WinUsb_RegisterIsochBuffer(
                winUsbHandle,
                pipeId,
                isoBufferPin.AddrOfPinnedObject(),
                (uint)isoBuffer.Length,
                out isochBufferHandle))
        {
            throw new IOException(
                $"WinUSB isochronous PCM buffer registration failed: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
        }

        for (var index = 0; index < IsoTransferCount; index++)
        {
            isoEvents[index] = NativeMethods.CreateEvent(IntPtr.Zero, true, false, null);
            if (isoEvents[index] == IntPtr.Zero)
            {
                throw new IOException($"CreateEvent failed: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
            }
        }

        for (var index = 0; index < IsoTransferCount; index++)
        {
            SubmitIsoTransfer(index, index != 0);
        }
    }

    public bool IsIsochronous => kind == WinUsbPcmTransportKind.Isochronous;

    public string TransportName => IsIsochronous ? "winusb-isochronous" : "winusb-bulk";

    public string TransportDetails => IsIsochronous
        ? $"pipe=0x{pipeId:X2} maxPacket={isoMaximumPacketSize} maxBytesPerInterval={isoMaximumBytesPerInterval} interval={isoInterval} packetsPerTransfer={isoPacketsPerTransfer} transferBytes={isoTransferBytes}"
        : $"pipe=0x{pipeId:X2}";

    public static WinUsbPcmTransport Open()
    {
        Exception? lastError = null;
        foreach (var path in NativeMethods.EnumerateDeviceInterfacePaths(DeviceInterfaceGuid))
        {
            if (!IsPcmInterfacePath(path))
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

                if (TryFindInPipe(winUsb, NativeMethods.UsbdPipeTypeIsochronous, out var isoPipe))
                {
                    return new WinUsbPcmTransport(
                        device,
                        winUsb,
                        isoPipe.PipeId,
                        isoPipe.MaximumPacketSize,
                        checked((int)isoPipe.MaximumBytesPerInterval),
                        isoPipe.Interval);
                }

                if (TryFindInPipe(winUsb, NativeMethods.UsbdPipeTypeBulk, out var bulkPipe))
                {
                    var timeoutMs = 100u;
                    _ = NativeMethods.WinUsb_SetPipePolicy(
                        winUsb,
                        bulkPipe.PipeId,
                        NativeMethods.PipeTransferTimeout,
                        sizeof(uint),
                        ref timeoutMs);
                    return new WinUsbPcmTransport(device, winUsb, bulkPipe.PipeId);
                }

                NativeMethods.WinUsb_Free(winUsb);
                device.Dispose();
                lastError = new InvalidOperationException("WinUSB interface does not expose an isochronous or bulk IN pipe.");
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

        throw new BulkPcmUnavailableException(
            lastError is null
                ? "DS5 Bridge WinUSB PCM interface was not found."
                : $"DS5 Bridge WinUSB PCM interface could not be opened: {lastError.Message}");
    }

    private static bool IsPcmInterfacePath(string path)
    {
        return path.Contains(PcmInterfaceMarker, StringComparison.OrdinalIgnoreCase);
    }

    public int Read(byte[] buffer)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (IsIsochronous)
        {
            throw new InvalidOperationException("Use ReadIsoFrames for the isochronous PCM transport.");
        }

        if (!NativeMethods.WinUsb_ReadPipe(
                winUsbHandle,
                pipeId,
                buffer,
                (uint)buffer.Length,
                out var transferred,
                IntPtr.Zero))
        {
            var error = Marshal.GetLastWin32Error();
            if (error == NativeMethods.ErrorSemTimeout)
            {
                return 0;
            }
            throw new IOException($"WinUSB bulk PCM read failed: {new Win32Exception(error).Message}", error);
        }

        return checked((int)transferred);
    }

    public List<BulkPcmFrame> ReadIsoFrames()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (!IsIsochronous || isoBuffer is null || isoPacketDescriptors is null)
        {
            throw new InvalidOperationException("Isochronous PCM transport was not initialized.");
        }

        var transferIndex = nextIsoTransfer;
        var overlappedPointer = IsoOverlappedPointer(transferIndex);
        if (!NativeMethods.WinUsb_GetOverlappedResult(winUsbHandle, overlappedPointer, out _, true))
        {
            var error = Marshal.GetLastWin32Error();
            if (disposed && (error == NativeMethods.ErrorOperationAborted || error == NativeMethods.ErrorInvalidHandle))
            {
                return [];
            }

            LogIsoReadFailure(error, transferIndex);
            SubmitIsoTransfer(transferIndex, false);
            nextIsoTransfer = (transferIndex + 1) % IsoTransferCount;
            return [];
        }

        var frames = DecodeIsoTransfer(transferIndex);
        SubmitIsoTransfer(transferIndex, true);
        nextIsoTransfer = (transferIndex + 1) % IsoTransferCount;
        return frames;
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
        if (isochBufferHandle != IntPtr.Zero)
        {
            NativeMethods.WinUsb_UnregisterIsochBuffer(isochBufferHandle);
            isochBufferHandle = IntPtr.Zero;
        }
        foreach (var evt in isoEvents)
        {
            if (evt != IntPtr.Zero)
            {
                NativeMethods.CloseHandle(evt);
            }
        }
        if (isoOverlappedPin.IsAllocated)
        {
            isoOverlappedPin.Free();
        }
        if (isoPacketDescriptorPin.IsAllocated)
        {
            isoPacketDescriptorPin.Free();
        }
        if (isoBufferPin.IsAllocated)
        {
            isoBufferPin.Free();
        }
        if (winUsbHandle != IntPtr.Zero)
        {
            NativeMethods.WinUsb_Free(winUsbHandle);
        }
        deviceHandle.Dispose();
    }

    private static int ComputeIsoPacketsPerTransfer(int interval)
    {
        // WinUSB requires isochronous transfer sizes to be a multiple of
        // MaximumBytesPerInterval * 8 / Interval. At full speed our 1ms endpoint
        // reports interval 1, which means 8 packet descriptors per read.
        return Math.Max(1, 8 / Math.Max(1, interval));
    }

    private static bool TryFindInPipe(IntPtr winUsb, int pipeType, out WinUsbPcmPipeInformation pipe)
    {
        pipe = default;
        if (!NativeMethods.WinUsb_QueryInterfaceSettings(winUsb, 0, out var descriptor))
        {
            return false;
        }

        for (byte index = 0; index < descriptor.bNumEndpoints; index++)
        {
            if (
                pipeType == NativeMethods.UsbdPipeTypeIsochronous
                && NativeMethods.WinUsb_QueryPipeEx(winUsb, 0, index, out var isoCandidate)
                && isoCandidate.PipeType == pipeType
                && (isoCandidate.PipeId & 0x80) != 0)
            {
                pipe = new WinUsbPcmPipeInformation
                {
                    PipeType = isoCandidate.PipeType,
                    PipeId = isoCandidate.PipeId,
                    MaximumPacketSize = isoCandidate.MaximumPacketSize,
                    MaximumBytesPerInterval = isoCandidate.MaximumBytesPerInterval,
                    Interval = isoCandidate.Interval
                };
                return true;
            }

            if (
                NativeMethods.WinUsb_QueryPipe(winUsb, 0, index, out var candidate)
                && candidate.PipeType == pipeType
                && (candidate.PipeId & 0x80) != 0)
            {
                pipe = candidate;
                return true;
            }
        }

        return false;
    }

    private void SubmitIsoTransfer(int transferIndex, bool continueStream)
    {
        if (isoOverlapped is null || isoPacketDescriptors is null)
        {
            throw new InvalidOperationException("Isochronous PCM transport was not initialized.");
        }

        Array.Clear(isoPacketDescriptors, transferIndex * isoPacketsPerTransfer, isoPacketsPerTransfer);
        NativeMethods.ResetEvent(isoEvents[transferIndex]);
        isoOverlapped[transferIndex] = new OverlappedNative
        {
            EventHandle = isoEvents[transferIndex]
        };

        if (!NativeMethods.WinUsb_ReadIsochPipeAsap(
                isochBufferHandle,
                (uint)(transferIndex * isoTransferBytes),
                (uint)isoTransferBytes,
                continueStream,
                (uint)isoPacketsPerTransfer,
                IsoPacketDescriptorPointer(transferIndex),
                IsoOverlappedPointer(transferIndex)))
        {
            var error = Marshal.GetLastWin32Error();
            if (error != NativeMethods.ErrorIoPending)
            {
                throw new IOException(
                    $"WinUSB isochronous PCM transfer queue failed: {new Win32Exception(error).Message}",
                    error);
            }
        }
    }

    private List<BulkPcmFrame> DecodeIsoTransfer(int transferIndex)
    {
        if (isoBuffer is null || isoPacketDescriptors is null)
        {
            return [];
        }

        var frames = new List<BulkPcmFrame>(isoPacketsPerTransfer);
        var baseDescriptor = transferIndex * isoPacketsPerTransfer;
        var transferBaseOffset = transferIndex * isoTransferBytes;
        for (var packetIndex = 0; packetIndex < isoPacketsPerTransfer; packetIndex++)
        {
            var descriptor = isoPacketDescriptors[baseDescriptor + packetIndex];
            if (descriptor.Status != 0 || descriptor.Length < IsoHeaderBytes)
            {
                continue;
            }

            var packetOffset = checked((int)descriptor.Offset);
            if (packetOffset < isoTransferBytes)
            {
                packetOffset += transferBaseOffset;
            }
            if (packetOffset < 0 || packetOffset + descriptor.Length > isoBuffer.Length)
            {
                continue;
            }

            var sequence = BinaryPrimitives.ReadUInt16LittleEndian(isoBuffer.AsSpan(packetOffset, 2));
            var frameCount = isoBuffer[packetOffset + 2];
            if (frameCount == 0 || frameCount > IsoFramesPerPacket)
            {
                continue;
            }

            var payloadBytes = frameCount * FrameBytes;
            if (descriptor.Length < IsoHeaderBytes + payloadBytes)
            {
                continue;
            }

            var payload = new byte[payloadBytes];
            Buffer.BlockCopy(isoBuffer, packetOffset + IsoHeaderBytes, payload, 0, payloadBytes);
            frames.Add(new BulkPcmFrame(payload, frameCount, sequence, 0, isoBuffer[packetOffset + 3] != 0));
        }

        return frames;
    }

    private void LogIsoReadFailure(int error, int transferIndex)
    {
        isoReadFailureCount++;
        if (isoReadFailureCount > 3 && isoReadFailureCount % 250 != 0)
        {
            return;
        }

        Console.Error.WriteLine(
            $"status: winusb-iso-read-warning error={error} message='{new Win32Exception(error).Message}' failures={isoReadFailureCount} {DescribeIsoPackets(transferIndex)}");
    }

    private string DescribeIsoPackets(int transferIndex)
    {
        if (isoPacketDescriptors is null)
        {
            return "packets=unavailable";
        }

        var ok = 0;
        var empty = 0;
        var failed = 0;
        var firstStatus = 0u;
        var baseDescriptor = transferIndex * isoPacketsPerTransfer;
        for (var packetIndex = 0; packetIndex < isoPacketsPerTransfer; packetIndex++)
        {
            var descriptor = isoPacketDescriptors[baseDescriptor + packetIndex];
            if (descriptor.Status == 0 && descriptor.Length >= IsoHeaderBytes)
            {
                ok++;
            }
            else if (descriptor.Status == 0 && descriptor.Length == 0)
            {
                empty++;
            }
            else
            {
                failed++;
                firstStatus = firstStatus == 0 ? descriptor.Status : firstStatus;
            }
        }

        return $"packets=ok:{ok},empty:{empty},failed:{failed},firstStatus=0x{firstStatus:X8}";
    }

    private IntPtr IsoPacketDescriptorPointer(int transferIndex)
    {
        return IntPtr.Add(
            isoPacketDescriptorPin.AddrOfPinnedObject(),
            transferIndex * isoPacketsPerTransfer * Marshal.SizeOf<UsbdIsoPacketDescriptor>());
    }

    private IntPtr IsoOverlappedPointer(int transferIndex)
    {
        return IntPtr.Add(
            isoOverlappedPin.AddrOfPinnedObject(),
            transferIndex * Marshal.SizeOf<OverlappedNative>());
    }
}

sealed record BulkPcmFrame(byte[] Payload, int Frames, ushort Sequence, uint TimestampUs, bool Silent = false);

sealed class BulkPcmFrameParser
{
    private const byte Magic0 = (byte)'D';
    private const byte Magic1 = (byte)'5';
    private const byte Magic2 = (byte)'P';
    private const byte Magic3 = (byte)'C';

    private byte[] buffer = new byte[8192];
    private int buffered;

    public List<BulkPcmFrame> Push(byte[] data, int byteCount)
    {
        if (byteCount <= 0)
        {
            return [];
        }

        EnsureCapacity(buffered + byteCount);
        Buffer.BlockCopy(data, 0, buffer, buffered, byteCount);
        buffered += byteCount;

        var frames = new List<BulkPcmFrame>();
        while (buffered >= WinUsbPcmTransport.HeaderBytes)
        {
            var magicOffset = FindMagic();
            if (magicOffset < 0)
            {
                Discard(buffered - 3);
                break;
            }
            if (magicOffset > 0)
            {
                Discard(magicOffset);
            }
            if (buffered < WinUsbPcmTransport.HeaderBytes)
            {
                break;
            }

            var version = buffer[4];
            var channels = buffer[5];
            var bytesPerSample = buffer[6];
            var sequence = BinaryPrimitives.ReadUInt16LittleEndian(buffer.AsSpan(8, 2));
            var frameCount = BinaryPrimitives.ReadUInt16LittleEndian(buffer.AsSpan(10, 2));
            var timestampUs = BinaryPrimitives.ReadUInt32LittleEndian(buffer.AsSpan(12, 4));
            if (
                version != 1
                || channels != WinUsbPcmTransport.Channels
                || bytesPerSample != WinUsbPcmTransport.BytesPerSample
                || frameCount == 0
                || frameCount > WinUsbPcmTransport.BulkFramesPerPacket)
            {
                Discard(1);
                continue;
            }

            var payloadBytes = checked((int)frameCount * WinUsbPcmTransport.FrameBytes);
            var packetBytes = WinUsbPcmTransport.HeaderBytes + payloadBytes;
            if (buffered < packetBytes)
            {
                break;
            }

            var payload = new byte[payloadBytes];
            Buffer.BlockCopy(buffer, WinUsbPcmTransport.HeaderBytes, payload, 0, payloadBytes);
            frames.Add(new BulkPcmFrame(payload, frameCount, sequence, timestampUs));
            Discard(packetBytes);
        }

        return frames;
    }

    private int FindMagic()
    {
        for (var index = 0; index <= buffered - 4; index++)
        {
            if (
                buffer[index] == Magic0
                && buffer[index + 1] == Magic1
                && buffer[index + 2] == Magic2
                && buffer[index + 3] == Magic3)
            {
                return index;
            }
        }

        return -1;
    }

    private void EnsureCapacity(int needed)
    {
        if (needed <= buffer.Length)
        {
            return;
        }

        var next = buffer.Length;
        while (next < needed)
        {
            next *= 2;
        }
        Array.Resize(ref buffer, next);
    }

    private void Discard(int byteCount)
    {
        if (byteCount <= 0)
        {
            return;
        }
        if (byteCount >= buffered)
        {
            buffered = 0;
            return;
        }

        Buffer.BlockCopy(buffer, byteCount, buffer, 0, buffered - byteCount);
        buffered -= byteCount;
    }
}

sealed class BulkPcmUnavailableException : Exception
{
    public BulkPcmUnavailableException(string message) : base(message)
    {
    }
}

static partial class NativeMethods
{
    public const uint GenericRead = 0x80000000;
    public const uint GenericWrite = 0x40000000;
    public const uint FileShareRead = 0x00000001;
    public const uint FileShareWrite = 0x00000002;
    public const uint OpenExisting = 3;
    public const uint FileAttributeNormal = 0x00000080;
    public const uint FileFlagOverlapped = 0x40000000;
    public const uint DigcfPresent = 0x00000002;
    public const uint DigcfDeviceInterface = 0x00000010;
    public const int ErrorNoMoreItems = 259;
    public const int ErrorOperationAborted = 995;
    public const int ErrorIoPending = 997;
    public const int ErrorInvalidHandle = 6;
    public const int ErrorSemTimeout = 121;
    public const int UsbdPipeTypeIsochronous = 1;
    public const int UsbdPipeTypeBulk = 2;
    public const uint PipeTransferTimeout = 3;

    public static IEnumerable<string> EnumerateDeviceInterfacePaths(Guid interfaceGuid)
    {
        var deviceInfoSet = SetupDiGetClassDevs(
            ref interfaceGuid,
            IntPtr.Zero,
            IntPtr.Zero,
            DigcfPresent | DigcfDeviceInterface);
        if (deviceInfoSet == IntPtr.Zero || deviceInfoSet == new IntPtr(-1))
        {
            yield break;
        }

        try
        {
            for (uint index = 0; ; index++)
            {
                var interfaceData = new SpDeviceInterfaceData
                {
                    cbSize = Marshal.SizeOf<SpDeviceInterfaceData>()
                };
                if (!SetupDiEnumDeviceInterfaces(deviceInfoSet, IntPtr.Zero, ref interfaceGuid, index, ref interfaceData))
                {
                    if (Marshal.GetLastWin32Error() == ErrorNoMoreItems)
                    {
                        yield break;
                    }
                    continue;
                }

                var detail = new SpDeviceInterfaceDetailData
                {
                    cbSize = IntPtr.Size == 8 ? 8 : 6,
                    DevicePath = new string('\0', 1024)
                };
                if (SetupDiGetDeviceInterfaceDetail(
                        deviceInfoSet,
                        ref interfaceData,
                        ref detail,
                        Marshal.SizeOf<SpDeviceInterfaceDetailData>(),
                        out _,
                        IntPtr.Zero))
                {
                    yield return detail.DevicePath;
                }
            }
        }
        finally
        {
            SetupDiDestroyDeviceInfoList(deviceInfoSet);
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern SafeFileHandle CreateFile(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CancelIoEx(SafeFileHandle hFile, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateEvent(
        IntPtr lpEventAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool bManualReset,
        [MarshalAs(UnmanagedType.Bool)] bool bInitialState,
        string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ResetEvent(IntPtr hEvent);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_Initialize(SafeFileHandle deviceHandle, out IntPtr interfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_Free(IntPtr interfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_QueryInterfaceSettings(
        IntPtr interfaceHandle,
        byte alternateInterfaceNumber,
        out UsbInterfaceDescriptor usbAltInterfaceDescriptor);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_QueryPipe(
        IntPtr interfaceHandle,
        byte alternateInterfaceNumber,
        byte pipeIndex,
        out WinUsbPipeInformation pipeInformation);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_QueryPipeEx(
        IntPtr interfaceHandle,
        byte alternateInterfaceNumber,
        byte pipeIndex,
        out WinUsbPipeInformationEx pipeInformation);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_ReadPipe(
        IntPtr interfaceHandle,
        byte pipeId,
        [Out] byte[] buffer,
        uint bufferLength,
        out uint lengthTransferred,
        IntPtr overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_RegisterIsochBuffer(
        IntPtr interfaceHandle,
        byte pipeId,
        IntPtr buffer,
        uint bufferLength,
        out IntPtr isochBufferHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_UnregisterIsochBuffer(IntPtr isochBufferHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_ReadIsochPipeAsap(
        IntPtr isochBufferHandle,
        uint offset,
        uint length,
        [MarshalAs(UnmanagedType.Bool)] bool continueStream,
        uint numberOfPackets,
        IntPtr isoPacketDescriptors,
        IntPtr overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_GetOverlappedResult(
        IntPtr interfaceHandle,
        IntPtr overlapped,
        out uint lengthTransferred,
        [MarshalAs(UnmanagedType.Bool)] bool wait);

    [DllImport("winusb.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WinUsb_SetPipePolicy(
        IntPtr interfaceHandle,
        byte pipeId,
        uint policyType,
        int valueLength,
        ref uint value);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SetupDiGetClassDevs(
        ref Guid classGuid,
        IntPtr enumerator,
        IntPtr hwndParent,
        uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetupDiEnumDeviceInterfaces(
        IntPtr deviceInfoSet,
        IntPtr deviceInfoData,
        ref Guid interfaceClassGuid,
        uint memberIndex,
        ref SpDeviceInterfaceData deviceInterfaceData);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetupDiGetDeviceInterfaceDetail(
        IntPtr deviceInfoSet,
        ref SpDeviceInterfaceData deviceInterfaceData,
        ref SpDeviceInterfaceDetailData deviceInterfaceDetailData,
        int deviceInterfaceDetailDataSize,
        out int requiredSize,
        IntPtr deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);
}

[StructLayout(LayoutKind.Sequential)]
struct SpDeviceInterfaceData
{
    public int cbSize;
    public Guid InterfaceClassGuid;
    public int Flags;
    public IntPtr Reserved;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
struct SpDeviceInterfaceDetailData
{
    public int cbSize;

    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
    public string DevicePath;
}

[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct UsbInterfaceDescriptor
{
    public byte bLength;
    public byte bDescriptorType;
    public byte bInterfaceNumber;
    public byte bAlternateSetting;
    public byte bNumEndpoints;
    public byte bInterfaceClass;
    public byte bInterfaceSubClass;
    public byte bInterfaceProtocol;
    public byte iInterface;
}

[StructLayout(LayoutKind.Sequential)]
struct WinUsbPipeInformation
{
    public int PipeType;
    public byte PipeId;
    public ushort MaximumPacketSize;
    public byte Interval;
}

[StructLayout(LayoutKind.Sequential)]
struct WinUsbPipeInformationEx
{
    public int PipeType;
    public byte PipeId;
    public ushort MaximumPacketSize;
    public byte Interval;
    public uint MaximumBytesPerInterval;
}

struct WinUsbPcmPipeInformation
{
    public int PipeType;
    public byte PipeId;
    public ushort MaximumPacketSize;
    public byte Interval;
    public uint MaximumBytesPerInterval;

    public static implicit operator WinUsbPcmPipeInformation(WinUsbPipeInformation pipe)
    {
        return new WinUsbPcmPipeInformation
        {
            PipeType = pipe.PipeType,
            PipeId = pipe.PipeId,
            MaximumPacketSize = pipe.MaximumPacketSize,
            Interval = pipe.Interval,
            MaximumBytesPerInterval = pipe.MaximumPacketSize
        };
    }
}

[StructLayout(LayoutKind.Sequential)]
struct UsbdIsoPacketDescriptor
{
    public uint Offset;
    public uint Length;
    public uint Status;
}

[StructLayout(LayoutKind.Sequential)]
struct OverlappedNative
{
    public UIntPtr Internal;
    public UIntPtr InternalHigh;
    public uint Offset;
    public uint OffsetHigh;
    public IntPtr EventHandle;
}
