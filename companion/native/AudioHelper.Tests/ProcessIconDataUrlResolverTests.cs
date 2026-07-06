using Xunit;

public sealed class ProcessIconDataUrlResolverTests
{
    [Fact]
    public void TryResolveExtractsPngDataUrlFromExecutable()
    {
        var processPath = Environment.ProcessPath;

        Assert.False(string.IsNullOrWhiteSpace(processPath));
        AssertPngDataUrl(ProcessIconDataUrlResolver.TryResolve(processPath));
    }

    [Fact]
    public void TryResolveAcceptsQuotedIconResourcePaths()
    {
        var processPath = Environment.ProcessPath;

        Assert.False(string.IsNullOrWhiteSpace(processPath));
        AssertPngDataUrl(ProcessIconDataUrlResolver.TryResolve(null, $"\"{processPath}\",0"));
    }

    [Fact]
    public void TryResolveExtractsPngDataUrlFromConfiguredExecutable()
    {
        var processPath = Environment.GetEnvironmentVariable("DS5_BRIDGE_TEST_ICON_EXE");
        if (string.IsNullOrWhiteSpace(processPath))
        {
            return;
        }

        Assert.True(File.Exists(processPath), processPath);
        AssertPngDataUrl(ProcessIconDataUrlResolver.TryResolve(processPath));
        AssertPngDataUrl(ProcessIconDataUrlResolver.TryResolve(null, $"\"{processPath}\",0"));
    }

    private static void AssertPngDataUrl(string? dataUrl)
    {
        Assert.False(string.IsNullOrWhiteSpace(dataUrl));
        Assert.StartsWith("data:image/png;base64,", dataUrl);

        var bytes = Convert.FromBase64String(dataUrl["data:image/png;base64,".Length..]);
        Assert.True(bytes.Length > 8);
        Assert.Equal(0x89, bytes[0]);
        Assert.Equal((byte)'P', bytes[1]);
        Assert.Equal((byte)'N', bytes[2]);
        Assert.Equal((byte)'G', bytes[3]);
    }
}
