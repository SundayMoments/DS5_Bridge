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
    public void HelperOptionsIgnoreMalformedBridgeContainer()
    {
        var options = HelperOptions.Parse(["--bridge-container", "not-a-guid"]);
        Assert.Null(options.BridgeContainer);
    }
}
