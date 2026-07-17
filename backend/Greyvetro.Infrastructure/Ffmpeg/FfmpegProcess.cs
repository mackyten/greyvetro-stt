using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// Shared ffmpeg discovery + process execution used by both the legacy scene renderer
/// and the timeline renderer. Homebrew installs land in one of the first two paths;
/// otherwise we fall back to PATH.
/// </summary>
internal static class FfmpegProcess
{
    private static readonly string[] Candidates =
    [
        "/opt/homebrew/bin/ffmpeg", // Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",    // Intel Homebrew
        "ffmpeg",                   // PATH
    ];

    public static string? Find()
    {
        foreach (var candidate in Candidates)
        {
            try
            {
                using var probe = Process.Start(new ProcessStartInfo(candidate, "-version")
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                });
                probe?.WaitForExit(5000);
                if (probe?.ExitCode == 0) return candidate;
            }
            catch
            {
                // candidate not present — try the next one
            }
        }
        return null;
    }

    public static async Task RunAsync(
        string ffmpeg, IEnumerable<string> args, ILogger logger, CancellationToken ct)
    {
        var info = new ProcessStartInfo(ffmpeg)
        {
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };
        foreach (var arg in args) info.ArgumentList.Add(arg);

        using var process = Process.Start(info)
            ?? throw new InvalidOperationException("Failed to start ffmpeg.");
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0)
        {
            var tail = stderr.Length > 2000 ? stderr[^2000..] : stderr;
            logger.LogWarning("ffmpeg failed ({Code}): {Stderr}", process.ExitCode, tail);
            throw new InvalidOperationException($"ffmpeg failed (exit {process.ExitCode}): {tail}");
        }
    }

    public static string ImageExtension(byte[] image) => image switch
    {
        [0x89, 0x50, 0x4E, 0x47, ..] => ".png",
        [0xFF, 0xD8, ..] => ".jpg",
        [0x52, 0x49, 0x46, 0x46, ..] => ".webp",
        [0x47, 0x49, 0x46, ..] => ".gif",
        _ => ".png",
    };

    public static string Fmt(double seconds) =>
        seconds.ToString("0.###", CultureInfo.InvariantCulture);
}
