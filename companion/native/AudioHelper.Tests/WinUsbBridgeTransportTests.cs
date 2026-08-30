using Xunit;

public sealed class WinUsbBridgeTransportTests
{
    [Theory]
    [InlineData(@"\\?\usb#vid_1209&pid_db08&mi_01#bridge-only")]
    [InlineData(@"\\?\usb#vid_054c&pid_0ce6&mi_05#full-persona")]
    [InlineData(@"WINUSB://VID_054C&PID_0DF2&MI_05#EDGE")]
    public void BridgeInterfacePathAcceptsRuntimeInterfaceNumbers(string path)
    {
        Assert.True(WinUsbBridgeTransport.IsBridgeInterfacePath(path));
    }

    [Theory]
    [InlineData(@"\\?\usb#vid_1209&pid_db08#missing-interface")]
    [InlineData(@"\\?\usb#vid_1209&pid_db08&mi_xyz#malformed")]
    public void BridgeInterfacePathRejectsMissingOrMalformedInterfaceNumbers(string path)
    {
        Assert.False(WinUsbBridgeTransport.IsBridgeInterfacePath(path));
    }
}
