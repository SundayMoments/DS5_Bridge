using Xunit;

public sealed class PackageAppMetadataResolverTests
{
    [Fact]
    public void HiddenHelperApplicationUsesPackageDisplayNameAndSharedIcon()
    {
        using var package = TestPackage.Create();

        var metadata = PackageAppMetadataResolver.ResolveFromManifest(
            "Contoso.Music_1.0.0.0_x64__test",
            package.Root,
            "LibraryAgent.exe");

        Assert.Equal("Contoso Music", metadata.DisplayName);
        Assert.Equal(package.TargetSizeIconPath, metadata.IconPath);
    }

    [Fact]
    public void VisibleApplicationUsesApplicationDisplayName()
    {
        using var package = TestPackage.Create();

        var metadata = PackageAppMetadataResolver.ResolveFromManifest(
            "Contoso.Music_1.0.0.0_x64__test",
            package.Root,
            "ContosoMusic.exe");

        Assert.Equal("Contoso Music Player", metadata.DisplayName);
        Assert.Equal(package.TargetSizeIconPath, metadata.IconPath);
    }

    private sealed class TestPackage : IDisposable
    {
        public string Root { get; }
        public string TargetSizeIconPath { get; }

        private TestPackage(string root, string targetSizeIconPath)
        {
            Root = root;
            TargetSizeIconPath = targetSizeIconPath;
        }

        public static TestPackage Create()
        {
            var root = Path.Combine(Path.GetTempPath(), $"ds5-package-test-{Guid.NewGuid():N}");
            var images = Path.Combine(root, "Images");
            Directory.CreateDirectory(images);
            var targetSizeIcon = Path.Combine(images, "Square44x44Logo.targetsize-32.png");
            File.WriteAllBytes(targetSizeIcon, [4, 5, 6]);
            File.WriteAllText(Path.Combine(root, "AppxManifest.xml"), """
                <?xml version="1.0" encoding="utf-8"?>
                <Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
                         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10">
                  <Identity Name="Contoso.Music" Publisher="CN=Contoso" Version="1.0.0.0" ProcessorArchitecture="x64" />
                  <Properties>
                    <DisplayName>Contoso Music</DisplayName>
                    <PublisherDisplayName>Contoso</PublisherDisplayName>
                    <Logo>Images\Square44x44Logo.png</Logo>
                  </Properties>
                  <Applications>
                    <Application Id="App" Executable="ContosoMusic.exe" EntryPoint="Windows.FullTrustApplication">
                      <uap:VisualElements DisplayName="Contoso Music Player"
                                          Square44x44Logo="Images\Square44x44Logo.png"
                                          Square150x150Logo="Images\Square44x44Logo.png"
                                          BackgroundColor="transparent" />
                    </Application>
                    <Application Id="LibraryAgent" Executable="LibraryAgent.exe" EntryPoint="Windows.FullTrustApplication">
                      <uap:VisualElements DisplayName="LibraryAgent"
                                          Square44x44Logo="Images\Square44x44Logo.png"
                                          Square150x150Logo="Images\Square44x44Logo.png"
                                          BackgroundColor="transparent"
                                          AppListEntry="none" />
                    </Application>
                  </Applications>
                </Package>
                """);
            return new TestPackage(root, targetSizeIcon);
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Root, recursive: true);
            }
            catch
            {
            }
        }
    }
}
