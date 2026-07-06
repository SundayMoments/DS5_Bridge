using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

static class ProcessLoopbackAudioClient
{
    private const string VirtualAudioDeviceProcessLoopback = "VAD\\Process_Loopback";
    private const ushort VtBlob = 65;
    private static readonly Guid IidAudioClient = new("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");

    public static AudioClient Activate(int processId, bool includeProcessTree, TimeSpan timeout)
    {
        var activationParams = new AudioClientActivationParamsNative
        {
            ActivationType = AudioClientActivationTypeNative.ProcessLoopback,
            ProcessLoopbackParams = new AudioClientProcessLoopbackParamsNative
            {
                TargetProcessId = unchecked((uint)processId),
                ProcessLoopbackMode = includeProcessTree
                    ? ProcessLoopbackModeNative.IncludeTargetProcessTree
                    : ProcessLoopbackModeNative.ExcludeTargetProcessTree
            }
        };

        var activationParamsPtr = IntPtr.Zero;
        var propVariantPtr = IntPtr.Zero;
        IActivateAudioInterfaceAsyncOperation? asyncOperation = null;
        try
        {
            activationParamsPtr = Marshal.AllocHGlobal(Marshal.SizeOf<AudioClientActivationParamsNative>());
            Marshal.StructureToPtr(activationParams, activationParamsPtr, false);
            var propVariant = new PropVariantBlob
            {
                vt = VtBlob,
                cbSize = Marshal.SizeOf<AudioClientActivationParamsNative>(),
                pBlobData = activationParamsPtr
            };
            propVariantPtr = Marshal.AllocHGlobal(Marshal.SizeOf<PropVariantBlob>());
            Marshal.StructureToPtr(propVariant, propVariantPtr, false);

            var handler = new ActivateAudioInterfaceCompletionHandler();
            var iid = IidAudioClient;
            var hr = ActivateAudioInterfaceAsync(
                VirtualAudioDeviceProcessLoopback,
                ref iid,
                propVariantPtr,
                handler,
                out asyncOperation);
            Marshal.ThrowExceptionForHR(hr);

            if (!handler.Wait(timeout))
            {
                throw new TimeoutException("Timed out while activating process loopback audio.");
            }

            return new AudioClient(handler.GetAudioClient());
        }
        finally
        {
            if (asyncOperation is not null)
            {
                if (OperatingSystem.IsWindows())
                {
                    Marshal.ReleaseComObject(asyncOperation);
                }
            }
            if (propVariantPtr != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(propVariantPtr);
            }
            if (activationParamsPtr != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(activationParamsPtr);
            }
        }
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        ref Guid riid,
        IntPtr activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    [ComImport]
    [Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig]
        int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig]
        int GetActivateResult(
            out int activateResult,
            [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    private sealed class ActivateAudioInterfaceCompletionHandler : IActivateAudioInterfaceCompletionHandler
    {
        private readonly ManualResetEventSlim completed = new(false);
        private int activationResult;
        private IAudioClient? audioClient;
        private Exception? callbackError;

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            try
            {
                var hr = activateOperation.GetActivateResult(out activationResult, out var activatedInterface);
                if (hr < 0)
                {
                    activationResult = hr;
                }
                if (activationResult >= 0 && activatedInterface is IAudioClient client)
                {
                    audioClient = client;
                }
            }
            catch (Exception error)
            {
                callbackError = error;
            }
            finally
            {
                completed.Set();
            }

            return 0;
        }

        public bool Wait(TimeSpan timeout)
        {
            return completed.Wait(timeout);
        }

        public IAudioClient GetAudioClient()
        {
            if (callbackError is not null)
            {
                throw callbackError;
            }
            Marshal.ThrowExceptionForHR(activationResult);
            return audioClient ?? throw new InvalidOperationException("Process loopback activation did not return IAudioClient.");
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropVariantBlob
    {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public int cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AudioClientActivationParamsNative
    {
        public AudioClientActivationTypeNative ActivationType;
        public AudioClientProcessLoopbackParamsNative ProcessLoopbackParams;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AudioClientProcessLoopbackParamsNative
    {
        public uint TargetProcessId;
        public ProcessLoopbackModeNative ProcessLoopbackMode;
    }

    private enum AudioClientActivationTypeNative
    {
        Default = 0,
        ProcessLoopback = 1
    }

    private enum ProcessLoopbackModeNative
    {
        IncludeTargetProcessTree = 0,
        ExcludeTargetProcessTree = 1
    }
}
