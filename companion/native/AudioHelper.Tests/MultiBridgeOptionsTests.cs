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
    public void HelperOptionsIgnoreMalformedBridgeContainer()
    {
        var options = HelperOptions.Parse(["--bridge-container", "not-a-guid"]);
        Assert.Null(options.BridgeContainer);
    }
}
