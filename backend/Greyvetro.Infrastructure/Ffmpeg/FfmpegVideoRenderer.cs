using System.Diagnostics;
using System.Text;
using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// Assembles a vertical (1080x1920, 30fps) mp4 from pre-composited scene frames +
/// the voiceover by driving ffmpeg as an external process. Each scene is a looped
/// still (or a dark placeholder card) scaled to cover the frame; segments are
/// concatenated and the audio track is muxed in. Captions are burned in client-side
/// (Homebrew's ffmpeg ships without the drawtext filter).
/// </summary>
public class FfmpegVideoRenderer(ILogger<FfmpegVideoRenderer> logger) : IVideoRenderService
{
    private const int Width = 1080;
    private const int Height = 1920;
    private const int Fps = 30;
    private const string PlaceholderColor = "0x1A1F26";

    private static readonly string[] FfmpegCandidates =
    [
        "/opt/homebrew/bin/ffmpeg", // Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",    // Intel Homebrew
        "ffmpeg",                   // PATH
    ];

    public async Task<byte[]> RenderAsync(RenderJob job, CancellationToken ct = default)
    {
        if (job.Scenes.Count == 0)
            throw new ArgumentException("At least one scene is required.");

        var ffmpeg = FindFfmpeg()
            ?? throw new InvalidOperationException(
                "ffmpeg was not found. Install it with `brew install ffmpeg` and restart the backend.");

        var dir = Directory.CreateTempSubdirectory("greyvetro-render-").FullName;
        try
        {
            var audioPath = Path.Combine(dir, "audio.mp3");
            await File.WriteAllBytesAsync(audioPath, job.Audio, ct);

            var scenes = job.Scenes.OrderBy(s => s.Start).ToList();
            var args = new List<string> { "-y" };
            var filters = new StringBuilder();

            for (var i = 0; i < scenes.Count; i++)
            {
                var duration = SegmentDuration(scenes, i);
                if (scenes[i].Image is { } image)
                {
                    var imagePath = Path.Combine(dir, $"img_{i}{ImageExtension(image)}");
                    await File.WriteAllBytesAsync(imagePath, image, ct);
                    args.AddRange(["-loop", "1", "-t", Fmt(duration), "-i", imagePath]);
                }
                else
                {
                    args.AddRange(["-f", "lavfi", "-t", Fmt(duration), "-i",
                        $"color=c={PlaceholderColor}:s={Width}x{Height}:r={Fps}"]);
                }

                filters.Append($"[{i}:v]scale={Width}:{Height}:force_original_aspect_ratio=increase,")
                    .Append($"crop={Width}:{Height},setsar=1,fps={Fps}")
                    .AppendLine($"[v{i}];");
            }

            filters.Append(string.Concat(Enumerable.Range(0, scenes.Count).Select(i => $"[v{i}]")))
                .Append($"concat=n={scenes.Count}:v=1:a=0[vout]");
            var filterPath = Path.Combine(dir, "filters.txt");
            await File.WriteAllTextAsync(filterPath, filters.ToString(), ct);

            var outPath = Path.Combine(dir, "out.mp4");
            args.AddRange([
                "-i", audioPath,
                "-filter_complex_script", filterPath,
                "-map", "[vout]", "-map", $"{scenes.Count}:a",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                outPath,
            ]);

            await RunFfmpegAsync(ffmpeg, args, ct);
            var bytes = await File.ReadAllBytesAsync(outPath, ct);
            logger.LogInformation("Rendered {Scenes} scenes to a {Size:N0}-byte mp4", scenes.Count, bytes.Length);
            return bytes;
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); }
            catch (Exception e) { logger.LogWarning(e, "Could not clean up render dir {Dir}", dir); }
        }
    }

    /// <summary>
    /// Segment i runs from its start to the next scene's start so the video timeline
    /// stays contiguous; the first segment is pulled back to 0 and the last gets a
    /// small pad (the audio's trailing silence), trimmed again by -shortest.
    /// </summary>
    private static double SegmentDuration(List<RenderScene> scenes, int i)
    {
        var start = i == 0 ? 0 : scenes[i].Start;
        var end = i == scenes.Count - 1 ? scenes[i].End + 1.5 : scenes[i + 1].Start;
        return Math.Max(0.5, end - start);
    }

    private static string? FindFfmpeg()
    {
        foreach (var candidate in FfmpegCandidates)
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

    private async Task RunFfmpegAsync(string ffmpeg, List<string> args, CancellationToken ct)
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

    private static string ImageExtension(byte[] image) => image switch
    {
        [0x89, 0x50, 0x4E, 0x47, ..] => ".png",
        [0xFF, 0xD8, ..] => ".jpg",
        [0x52, 0x49, 0x46, 0x46, ..] => ".webp",
        [0x47, 0x49, 0x46, ..] => ".gif",
        _ => ".png",
    };

    private static string Fmt(double seconds) =>
        seconds.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);
}
