using Xunit;

public sealed class MultiBridgeOptionsTests
{
    [Fact]
    public void HelperOptionsParseSelectedBridgeTarget()
    {
        var options = HelperOptions.Parse([
            "--list-bridges",
            "--device-path",
            "winusb://selected",
            "--bridge-container",
            "11111111-2222-3333-4444-555555555555"
        ]);

        Assert.True(options.ListBridges);
        Assert.Equal("winusb://selected", options.CompanionDevicePath);
        Assert.Equal(
            new Guid("11111111-2222-3333-4444-555555555555"),
            options.BridgeContainer);
    }

    [Fact]
    public void HelperOptionsParseBridgeDeviceServer()
    {
        var options = HelperOptions.Parse(["--bridge-device-server"]);

        Assert.True(options.BridgeDeviceServer);
        Assert.False(options.ListBridges);
    }

    [Fact]
    public async Task BridgeCensusServerAnswersEachSnapshotFromOneProcessAndStops()
    {
        using var input = new StringReader("snapshot\n\nsnapshot\nstop\nsnapshot\n");
        using var output = new StringWriter();
        var censuses = 0;

        await BridgeCensus.RunServerAsync(input, output, () =>
        {
            censuses += 1;
            return $"{{\"bridges\":[{{\"path\":\"winusb://bridge-{censuses}\",\"containerId\":null}}],\"hidDevices\":[]}}";
        });

        var lines = output.ToString().Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(2, censuses);
        Assert.Equal(2, lines.Length);
        Assert.Contains("winusb://bridge-1", lines[0]);
        Assert.Contains("winusb://bridge-2", lines[1]);
    }

    [Fact]
    public async Task BridgeCensusServerEndsWithItsInput()
    {
        using var input = new StringReader("snapshot\n");
        using var output = new StringWriter();

        await BridgeCensus.RunServerAsync(input, output, () => "{\"bridges\":[],\"hidDevices\":[]}");

        Assert.Equal("{\"bridges\":[],\"hidDevices\":[]}", output.ToString().Trim());
    }

    [Fact]
    public void BridgeOnlyReceiverReportsItsBoardIdAsItsSerial()
    {
        Assert.Equal(
            "c7a9c48819b4825a",
            BridgeDeviceIdentity.SerialUniqueIdForInterface(
                @"USB\VID_1209&PID_DB08&MI_01\9&2C29198E&0&0001",
                @"USB\VID_1209&PID_DB08\C7A9C48819B4825A"));
        Assert.Equal(
            "b06621e46c7ecbd1",
            BridgeDeviceIdentity.SerialUniqueIdForInterface(@"USB\VID_1209&PID_DB08\B06621E46C7ECBD1", null));
    }

    [Fact]
    public void ControllerPersonasAndUnrelatedParentsGiveNoBoardId()
    {
        // Controller personas have no serial; Windows names them by port.
        Assert.Null(BridgeDeviceIdentity.SerialUniqueIdForInterface(
            @"USB\VID_054C&PID_0DF2&MI_05\9&1C2D3E4F&0&0005",
            @"USB\VID_054C&PID_0DF2\8&1FB63BB6&0&7"));
        // A parent that is not this device, such as a hub, is never read.
        Assert.Null(BridgeDeviceIdentity.SerialUniqueIdForInterface(
            @"USB\VID_1209&PID_DB08&MI_01\9&2C29198E&0&0001",
            @"USB\VID_05E3&PID_0610\C7A9C48819B4825A"));
        Assert.Null(BridgeDeviceIdentity.SerialUniqueIdForInterface(
            @"USB\VID_1209&PID_DB08&MI_01\9&2C29198E&0&0001",
            @"USB\VID_1209&PID_DB08\NOTAHEXSERIAL123"));
        Assert.Null(BridgeDeviceIdentity.SerialUniqueIdForInterface("malformed", null));
    }

    [Fact]
    public void HelperOptionsIgnoreMalformedBridgeContainer()
    {
        var options = HelperOptions.Parse(["--bridge-container", "not-a-guid"]);
        Assert.Null(options.BridgeContainer);
    }
}
