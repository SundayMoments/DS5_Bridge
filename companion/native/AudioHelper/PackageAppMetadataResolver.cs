using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Xml.Linq;

sealed record PackageAppMetadata(string? DisplayName, string? IconPath);

static class PackageAppMetadataResolver
{
    private const int ErrorInsufficientBuffer = 122;
    private const string MsResourcePrefix = "ms-resource:";

    private static readonly ConcurrentDictionary<string, PackageAppMetadata> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static PackageAppMetadata? TryResolve(Process process, string? processPath, string? executableName)
    {
        var packageFullName = TryGetPackageFullName(process);
        var packageRoot = TryFindPackageRoot(processPath, packageFullName);
        if (string.IsNullOrWhiteSpace(packageFullName))
        {
            packageFullName = Path.GetFileName(packageRoot);
        }
        if (string.IsNullOrWhiteSpace(packageFullName) || string.IsNullOrWhiteSpace(packageRoot))
        {
            return null;
        }

        var cacheKey = $"{packageFullName}|{executableName ?? ""}";
        return Cache.GetOrAdd(cacheKey, _ => ResolveFromManifest(packageFullName, packageRoot, executableName));
    }

    internal static PackageAppMetadata ResolveFromManifest(
        string packageFullName,
        string packageRoot,
        string? executableName)
    {
        try
        {
            var manifestPath = Path.Combine(packageRoot, "AppxManifest.xml");
            var document = XDocument.Load(manifestPath);
            var root = document.Root;
            if (root is null)
            {
                return new PackageAppMetadata(null, null);
            }

            var identityName = AttributeValue(FirstDescendant(root, "Identity"), "Name");
            var properties = FirstChild(root, "Properties");
            var packageDisplayName = ResolveDisplayString(
                AttributeValue(properties, "DisplayName") ?? ElementValue(FirstChild(properties, "DisplayName")),
                packageFullName,
                identityName);
            var packageLogoPath = ResolveLogoPath(
                packageRoot,
                AttributeValue(properties, "Logo") ?? ElementValue(FirstChild(properties, "Logo")));
            var application = FindApplication(root, executableName) ?? FirstDescendant(root, "Application");
            var visualElements = FirstChild(application, "VisualElements");
            var appListEntry = AttributeValue(visualElements, "AppListEntry");
            var appDisplayName = ResolveDisplayString(
                AttributeValue(visualElements, "DisplayName"),
                packageFullName,
                identityName);
            var displayName = string.Equals(appListEntry, "none", StringComparison.OrdinalIgnoreCase)
                ? FirstNonBlank(packageDisplayName, appDisplayName)
                : FirstNonBlank(appDisplayName, packageDisplayName);
            var iconPath = ResolveLogoPath(
                    packageRoot,
                    AttributeValue(visualElements, "Square44x44Logo"))
                ?? ResolveLogoPath(
                    packageRoot,
                    AttributeValue(visualElements, "Square150x150Logo"))
                ?? packageLogoPath;

            return new PackageAppMetadata(displayName, iconPath);
        }
        catch
        {
            return new PackageAppMetadata(null, null);
        }
    }

    private static XElement? FindApplication(XElement root, string? executableName)
    {
        if (string.IsNullOrWhiteSpace(executableName))
        {
            return null;
        }

        foreach (var application in root.Descendants().Where(element => element.Name.LocalName == "Application"))
        {
            var executable = AttributeValue(application, "Executable");
            if (string.IsNullOrWhiteSpace(executable))
            {
                continue;
            }
            var manifestExecutableName = Path.GetFileName(executable.Replace('/', Path.DirectorySeparatorChar));
            if (string.Equals(manifestExecutableName, executableName, StringComparison.OrdinalIgnoreCase))
            {
                return application;
            }
        }

        return null;
    }

    private static string? ResolveDisplayString(string? rawValue, string packageFullName, string? identityName)
    {
        var value = EmptyToNull(rawValue);
        if (value is null)
        {
            return null;
        }
        if (!value.StartsWith(MsResourcePrefix, StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        foreach (var source in ResourceSources(value, packageFullName, identityName))
        {
            var resolved = TryLoadIndirectString(source);
            if (!string.IsNullOrWhiteSpace(resolved)
                && !resolved.StartsWith(MsResourcePrefix, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(resolved, source, StringComparison.OrdinalIgnoreCase))
            {
                return resolved.Trim();
            }
        }

        return null;
    }

    private static IEnumerable<string> ResourceSources(string rawValue, string packageFullName, string? identityName)
    {
        if (rawValue.StartsWith("ms-resource://", StringComparison.OrdinalIgnoreCase))
        {
            yield return $"@{{{packageFullName}?{rawValue}}}";
            yield break;
        }

        var resourceKey = rawValue[MsResourcePrefix.Length..].Trim().TrimStart('/');
        if (string.IsNullOrWhiteSpace(resourceKey))
        {
            yield break;
        }

        if (!string.IsNullOrWhiteSpace(identityName))
        {
            yield return $"@{{{packageFullName}?ms-resource://{identityName}/resources/{resourceKey}}}";
            yield return $"@{{{packageFullName}?ms-resource://{identityName}/{resourceKey}}}";
        }
        yield return $"@{{{packageFullName}?ms-resource:///resources/{resourceKey}}}";
    }

    private static string? TryLoadIndirectString(string source)
    {
        try
        {
            var output = new StringBuilder(512);
            var result = NativeMethods.SHLoadIndirectString(source, output, (uint)output.Capacity, IntPtr.Zero);
            return result == 0 ? EmptyToNull(output.ToString()) : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveLogoPath(string packageRoot, string? rawLogoPath)
    {
        var logoPath = EmptyToNull(rawLogoPath);
        if (logoPath is null || logoPath.StartsWith(MsResourcePrefix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        try
        {
            logoPath = logoPath.Replace('/', Path.DirectorySeparatorChar);
            var directPath = Path.GetFullPath(Path.Combine(packageRoot, logoPath));
            if (IsImageFile(directPath) && File.Exists(directPath))
            {
                return directPath;
            }

            var directory = Path.GetDirectoryName(directPath);
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                return null;
            }

            var extension = Path.GetExtension(directPath);
            var stem = Path.GetFileNameWithoutExtension(directPath);
            if (string.IsNullOrWhiteSpace(extension) || string.IsNullOrWhiteSpace(stem))
            {
                return null;
            }

            return Directory.EnumerateFiles(directory, $"{stem}*{extension}", SearchOption.TopDirectoryOnly)
                .Where(IsImageFile)
                .OrderBy(LogoCandidateScore)
                .FirstOrDefault();
        }
        catch
        {
            return null;
        }
    }

    private static int LogoCandidateScore(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
        var score = 0;
        if (name.Contains("_contrast-")) score += 1000;
        if (name.Contains("_altform-")) score += 100;

        var targetSize = ExtractNumericQualifier(name, "targetsize-");
        if (targetSize is not null)
        {
            return score + Math.Abs(targetSize.Value - 32);
        }

        var scale = ExtractNumericQualifier(name, "scale-");
        if (scale is not null)
        {
            return score + 200 + Math.Abs(scale.Value - 100);
        }

        return score + 500;
    }

    private static int? ExtractNumericQualifier(string value, string prefix)
    {
        var start = value.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            return null;
        }
        start += prefix.Length;
        var end = start;
        while (end < value.Length && char.IsDigit(value[end]))
        {
            end++;
        }
        return end > start && int.TryParse(value[start..end], out var parsed) ? parsed : null;
    }

    private static string? TryFindPackageRoot(string? processPath, string? packageFullName)
    {
        if (string.IsNullOrWhiteSpace(processPath))
        {
            return null;
        }

        try
        {
            var directory = Path.GetDirectoryName(processPath);
            while (!string.IsNullOrWhiteSpace(directory))
            {
                if (File.Exists(Path.Combine(directory, "AppxManifest.xml")))
                {
                    return directory;
                }
                if (!string.IsNullOrWhiteSpace(packageFullName)
                    && string.Equals(Path.GetFileName(directory), packageFullName, StringComparison.OrdinalIgnoreCase))
                {
                    return directory;
                }
                directory = Path.GetDirectoryName(directory);
            }
        }
        catch
        {
        }

        return null;
    }

    private static string? TryGetPackageFullName(Process process)
    {
        try
        {
            var length = 0;
            var result = NativeMethods.GetPackageFullName(process.Handle, ref length, null);
            if (result != ErrorInsufficientBuffer || length <= 0)
            {
                return null;
            }

            var buffer = new StringBuilder(length);
            result = NativeMethods.GetPackageFullName(process.Handle, ref length, buffer);
            return result == 0 ? EmptyToNull(buffer.ToString()) : null;
        }
        catch
        {
            return null;
        }
    }

    private static XElement? FirstChild(XElement? element, string localName)
    {
        return element?.Elements().FirstOrDefault(child => child.Name.LocalName == localName);
    }

    private static XElement? FirstDescendant(XElement? element, string localName)
    {
        return element?.Descendants().FirstOrDefault(child => child.Name.LocalName == localName);
    }

    private static string? AttributeValue(XElement? element, string localName)
    {
        return EmptyToNull(element?.Attributes().FirstOrDefault(attribute => attribute.Name.LocalName == localName)?.Value);
    }

    private static string? ElementValue(XElement? element)
    {
        return EmptyToNull(element?.Value);
    }

    private static string? FirstNonBlank(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return null;
    }

    private static string? EmptyToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool IsImageFile(string path)
    {
        var extension = Path.GetExtension(path);
        return extension.Equals(".ico", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".png", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".bmp", StringComparison.OrdinalIgnoreCase);
    }
}

static partial class NativeMethods
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetPackageFullName(IntPtr hProcess, ref int packageFullNameLength, StringBuilder? packageFullName);

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    public static extern int SHLoadIndirectString(string source, StringBuilder outputBuffer, uint outputBufferCharacters, IntPtr reserved);
}
