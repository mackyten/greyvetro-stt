using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// Renders a <see cref="Timeline"/> by writing its supplied asset blobs to a temp dir, running
/// them through the pure <see cref="FilterGraphCompiler"/>, and driving ffmpeg. Execution-only —
/// all graph logic lives in the (unit-tested) compiler.
/// </summary>
public class FfmpegTimelineRenderer(
    FilterGraphCompiler compiler,
    ILogger<FfmpegTimelineRenderer> logger) : ITimelineRenderer
{
    public async Task<byte[]> RenderAsync(
        Timeline timeline,
        IReadOnlyDictionary<string, byte[]> assets,
        CancellationToken ct = default)
    {
        var ffmpeg = FfmpegProcess.Find()
            ?? throw new InvalidOperationException(
                "ffmpeg was not found. Install it with `brew install ffmpeg` and restart the backend.");

        var assetType = timeline.Assets
            .GroupBy(a => a.Id)
            .ToDictionary(g => g.Key, g => g.First().Type);
        var audioSourceIds = timeline.Tracks
            .Where(t => t.Type == TrackType.Audio)
            .SelectMany(t => t.Clips)
            .Select(c => c.SourceId)
            .ToHashSet();

        // Extension is cosmetic (ffmpeg probes content), but keep it meaningful.
        string ExtFor(string id, byte[] bytes) =>
            assetType.TryGetValue(id, out var t)
                ? t switch { MediaType.Video => ".mp4", MediaType.Audio => ".mp3", _ => FfmpegProcess.ImageExtension(bytes) }
                : audioSourceIds.Contains(id) ? ".mp3" : FfmpegProcess.ImageExtension(bytes);

        var dir = Directory.CreateTempSubdirectory("greyvetro-timeline-").FullName;
        try
        {
            // Materialize each asset to a temp file, building the id -> path map the compiler needs.
            var assetPaths = new Dictionary<string, string>();
            var index = 0;
            foreach (var (id, bytes) in assets)
            {
                var path = Path.Combine(dir, $"asset_{index++}{ExtFor(id, bytes)}");
                await File.WriteAllBytesAsync(path, bytes, ct);
                assetPaths[id] = path;
            }

            var plan = compiler.Compile(timeline, assetPaths);

            var filterPath = Path.Combine(dir, "filters.txt");
            await File.WriteAllTextAsync(filterPath, plan.FilterComplex, ct);

            var outPath = Path.Combine(dir, "out.mp4");
            var args = new List<string>(plan.InputArgs);
            args.AddRange(["-filter_complex_script", filterPath]);
            args.AddRange(plan.OutputArgs);
            args.Add(outPath);

            await FfmpegProcess.RunAsync(ffmpeg, args, logger, ct);
            var mp4 = await File.ReadAllBytesAsync(outPath, ct);
            logger.LogInformation(
                "Rendered timeline {Id} ({Tracks} tracks) to a {Size:N0}-byte mp4",
                timeline.Id, timeline.Tracks.Count, mp4.Length);
            return mp4;
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); }
            catch (Exception e) { logger.LogWarning(e, "Could not clean up render dir {Dir}", dir); }
        }
    }
}
