using Xunit;

public sealed class EndpointManagerTests
{
    [Theory]
    [InlineData("DS5 Bridge")]
    [InlineData("Speakers (DS5 Bridge)")]
    [InlineData("Speakers (DualSense Edge Wireless Controller)")]
    [InlineData("Headphones (DualSense Wireless Controller)")]
    [InlineData("Headset Earphone (Wireless Controller)")]
    [InlineData("Speakers (Xbox 360 Controller for Windows)")]
    public void IsKnownBridgeEndpointNameAcceptsBridgePersonaNames(string friendlyName)
    {
        Assert.True(EndpointManager.IsKnownBridgeEndpointName(friendlyName));
    }

    [Fact]
    public void IsKnownBridgeEndpointNameRejectsUnrelatedEndpoints()
    {
        Assert.False(EndpointManager.IsKnownBridgeEndpointName("Speakers (Realtek USB Audio)"));
    }

    [Fact]
    public void IsKnownBridgeEndpointNameForPersonaDoesNotMatchDualSenseAsDs4()
    {
        Assert.False(EndpointManager.IsKnownBridgeEndpointNameForPersona(
            "Speakers (DualSense Wireless Controller)",
            "ds4"));
        Assert.True(EndpointManager.IsKnownBridgeEndpointNameForPersona(
            "Headset Earphone (Wireless Controller)",
            "ds4"));
    }

    [Fact]
    public void DisabledBridgeEndpointMessageNamesTheEndpointAndSoundSettings()
    {
        var message = EndpointManager.BridgeEndpointDisabledMessage("render", "Speakers (DualSense Wireless Controller)");

        Assert.Contains("'Speakers (DualSense Wireless Controller)'", message);
        // bridge-service.ts matches this phrase to show its own guidance.
        Assert.Contains("is disabled in Windows Sound settings", message);
    }

    [Fact]
    public void IsKnownBridgeEndpointNameForPersonaIsolatesDualSenseEdgeEndpoint()
    {
        Assert.True(EndpointManager.IsKnownBridgeEndpointNameForPersona(
            "Speakers (DualSense Edge Wireless Controller)",
            "dualsense-edge"));
        Assert.False(EndpointManager.IsKnownBridgeEndpointNameForPersona(
            "Speakers (DualSense Wireless Controller)",
            "dualsense-edge"));
        Assert.False(EndpointManager.IsKnownBridgeEndpointNameForPersona(
            "Speakers (DualSense Edge Wireless Controller)",
            "dualsense"));
    }
}
