using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

#pragma warning disable CA1416

static class ProcessIconDataUrlResolver
{
    private const uint ShgfiIcon = 0x000000100;
    private const uint ShgfiLargeIcon = 0x000000000;

    private static readonly ConcurrentDictionary<string, string?> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static string? TryResolve(string? processPath, string? iconPath = null)
    {
        foreach (var candidatePath in CandidateIconPaths(processPath, iconPath))
        {
            var dataUrl = Cache.GetOrAdd(candidatePath, ExtractIconDataUrl);
            if (!string.IsNullOrWhiteSpace(dataUrl))
            {
                return dataUrl;
            }
        }

        return null;
    }

    private static string? ExtractIconDataUrl(string processPath)
    {
        try
        {
            using var icon = ExtractShellIcon(processPath) ?? Icon.ExtractAssociatedIcon(processPath);
            if (icon is null)
            {
                return null;
            }

            using var bitmap = icon.ToBitmap();
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            return $"data:image/png;base64,{Convert.ToBase64String(stream.ToArray())}";
        }
        catch
        {
            return null;
        }
    }

    private static IEnumerable<string> CandidateIconPaths(params string?[] paths)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths)
        {
            var normalizedPath = NormalizeIconPath(path);
            if (normalizedPath is not null && seen.Add(normalizedPath))
            {
                yield return normalizedPath;
            }
        }

        // Fall back to raw trimmed paths for entries that didn't survive
        // normalization (e.g. UWP / packaged-app paths that don't pass
        // File.Exists but can still be resolved by the shell icon APIs).
        foreach (var path in paths)
        {
            var raw = path?.Trim();
            if (!string.IsNullOrWhiteSpace(raw) && seen.Add(raw))
            {
                yield return raw;
            }
        }
    }

    private static string? NormalizeIconPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var candidates = new[]
        {
            path.Trim(),
            StripIconResourceIndex(path)
        };

        foreach (var candidate in candidates)
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            var expanded = Environment.ExpandEnvironmentVariables(candidate.Trim().Trim('"'));
            if (expanded.StartsWith("@", StringComparison.Ordinal))
            {
                expanded = expanded[1..].Trim();
            }
            if (!File.Exists(expanded))
            {
                continue;
            }

            try
            {
                return Path.GetFullPath(expanded);
            }
            catch
            {
                return expanded;
            }
        }

        return null;
    }

    private static string? StripIconResourceIndex(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var value = path.Trim();
        if (value.StartsWith("@", StringComparison.Ordinal))
        {
            value = value[1..].Trim();
        }

        if (value.StartsWith("\"", StringComparison.Ordinal))
        {
            var quoteEnd = value.IndexOf('"', 1);
            if (quoteEnd > 1)
            {
                return value[1..quoteEnd];
            }
        }

        var commaIndex = value.LastIndexOf(',');
        if (
            commaIndex > 0
            && commaIndex < value.Length - 1
            && int.TryParse(value[(commaIndex + 1)..].Trim(), out _)
        )
        {
            return value[..commaIndex].Trim().Trim('"');
        }

        return value.Trim('"');
    }

    private static Icon? ExtractShellIcon(string path)
    {
        if (SHGetFileInfo(
            path,
            0,
            out var fileInfo,
            (uint)Marshal.SizeOf<SHFILEINFO>(),
            ShgfiIcon | ShgfiLargeIcon
        ) == IntPtr.Zero || fileInfo.hIcon == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            return (Icon)Icon.FromHandle(fileInfo.hIcon).Clone();
        }
        finally
        {
            _ = DestroyIcon(fileInfo.hIcon);
        }
    }

    [DllImport("Shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(
        string pszPath,
        uint dwFileAttributes,
        out SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("User32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }
}

#pragma warning restore CA1416
