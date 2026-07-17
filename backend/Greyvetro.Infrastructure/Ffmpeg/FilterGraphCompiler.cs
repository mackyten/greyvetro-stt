using System.Text;
using Greyvetro.Domain.Entities;

namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// Pure <see cref="Timeline"/> → ffmpeg <see cref="FfmpegPlan"/> compiler. No file or process
/// I/O — assets are referenced by caller-resolved paths — so the fiddly filter-graph math is
/// unit-testable without ffmpeg (see docs/timeline-editor-plan.md §6).
///
/// Scope so far: one full-frame visual base layer assembled with <c>concat</c> (stills looped,
/// real video trimmed) + one voiceover audio track. Overlay layers, transforms, and multi-audio
/// come in later phases.
/// </summary>
public class FilterGraphCompiler
{
    /// <summary>Fallback card colour for a visual clip whose source asset is missing.</summary>
    private const string PlaceholderColor = "0x1A1F26";

    /// <param name="timeline">The document to compile.</param>
    /// <param name="assetPaths">Resolved file path per <see cref="MediaAsset.Id"/>. A visual
    /// clip whose source is absent here renders a placeholder card.</param>
    public FfmpegPlan Compile(Timeline timeline, IReadOnlyDictionary<string, string> assetPaths)
    {
        var w = timeline.OutputWidth;
        var h = timeline.OutputHeight;
        var fps = timeline.Fps;

        // Source-id -> media type. A clip whose source isn't listed is treated as a still.
        var assetTypes = timeline.Assets.GroupBy(a => a.Id).ToDictionary(g => g.Key, g => g.First().Type);
        MediaType TypeOf(string id) => assetTypes.TryGetValue(id, out var t) ? t : MediaType.Image;

        // Base visual layer = every Photo/Video clip on the lowest-zIndex visual track(s),
        // merged and laid out in start-time order. (Overlay layers land in a later phase.)
        var visualTracks = timeline.Tracks
            .Where(t => t.Type is TrackType.Photo or TrackType.Video)
            .ToList();
        if (visualTracks.Count == 0)
            throw new ArgumentException("The timeline has no visual (photo/video) track.");

        var baseZ = visualTracks.Min(t => t.ZIndex);
        var visualClips = visualTracks
            .Where(t => t.ZIndex == baseZ)
            .SelectMany(t => t.Clips)
            .OrderBy(c => c.StartTime)
            .ToList();
        if (visualClips.Count == 0)
            throw new ArgumentException("The base visual track has no clips.");

        // First audio track = the voiceover. Phase 1 muxes exactly one audio stream.
        var audioTrack = timeline.Tracks.FirstOrDefault(t => t.Type == TrackType.Audio)
            ?? throw new ArgumentException("The timeline has no audio track.");
        var audioClip = audioTrack.Clips.OrderBy(c => c.StartTime).FirstOrDefault()
            ?? throw new ArgumentException("The audio track has no clips.");
        if (!assetPaths.TryGetValue(audioClip.SourceId, out var audioPath))
            throw new ArgumentException("The audio clip's source asset was not supplied.");

        var inputs = new List<string> { "-y" };
        var filters = new StringBuilder();
        var hasVideo = false;

        for (var i = 0; i < visualClips.Count; i++)
        {
            var clip = visualClips[i];
            var duration = FfmpegProcess.Fmt(clip.Duration);
            var hasSource = assetPaths.TryGetValue(clip.SourceId, out var path);

            if (hasSource && TypeOf(clip.SourceId) == MediaType.Video)
            {
                // Real video: input-seek to the trim in-point and read `duration` seconds. The
                // clip's own audio is ignored (v1 keeps the voiceover as the only audio track).
                hasVideo = true;
                inputs.AddRange(["-ss", FfmpegProcess.Fmt(clip.InPoint), "-t", duration, "-i", path!]);
            }
            else if (hasSource)
            {
                inputs.AddRange(["-loop", "1", "-t", duration, "-i", path!]);
            }
            else
            {
                inputs.AddRange(["-f", "lavfi", "-t", duration, "-i",
                    $"color=c={PlaceholderColor}:s={w}x{h}:r={fps}"]);
            }

            // Same normalization for stills and video: cover-fit to the output frame at target fps.
            filters.Append($"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,")
                .Append($"crop={w}:{h},setsar=1,fps={fps}")
                .AppendLine($"[v{i}];");
        }

        filters.Append(string.Concat(Enumerable.Range(0, visualClips.Count).Select(i => $"[v{i}]")))
            .Append($"concat=n={visualClips.Count}:v=1:a=0[vout]");

        // The audio input follows all visual inputs, so its input index is the visual count.
        var audioIndex = visualClips.Count;
        inputs.AddRange(["-i", audioPath]);

        // With video present the visual track can outrun the voiceover, so pad the voiceover with
        // silence (apad) and let -shortest stop at the visual concat. Without video we keep the
        // legacy behavior exactly (map the audio stream directly; -shortest == voiceover length),
        // which preserves the byte-for-similar Phase-1 regression.
        var audioMap = hasVideo ? "[aout]" : $"{audioIndex}:a";
        if (hasVideo)
            filters.Append($";[{audioIndex}:a]apad[aout]");

        var output = new List<string>
        {
            "-map", "[vout]", "-map", audioMap,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart",
        };

        return new FfmpegPlan
        {
            InputArgs = inputs,
            FilterComplex = filters.ToString(),
            OutputArgs = output,
        };
    }
}
