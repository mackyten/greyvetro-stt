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
    /// <param name="captionPaths">Resolved file path per caption <see cref="Clip.Id"/> — a
    /// pre-rendered transparent full-frame PNG. Each is overlaid on top of the base video, gated
    /// to its clip window. Null/empty keeps captions out of the graph (legacy fused-caption path).</param>
    public FfmpegPlan Compile(
        Timeline timeline,
        IReadOnlyDictionary<string, string> assetPaths,
        IReadOnlyDictionary<string, string>? captionPaths = null)
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

        // Require an audio track up front (clear early error); the audio graph itself is built
        // after the visual concat so it can use the visual input count for stream indices.
        if (timeline.Tracks.All(t => t.Type != TrackType.Audio))
            throw new ArgumentException("The timeline has no audio track.");

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

        // --- Audio ---
        // Every unmuted audio clip with a supplied source becomes an input (input-seek trimmed),
        // placed on the timeline with adelay, given per-clip/-track volume and fades, then amix'd.
        var audioParts = timeline.Tracks
            .Where(t => t.Type == TrackType.Audio && !t.Muted)
            .SelectMany(t => t.Clips.Select(c => (Clip: c, TrackVolume: t.Volume)))
            .Where(p => assetPaths.ContainsKey(p.Clip.SourceId))
            .OrderBy(p => p.Clip.StartTime)
            .ToList();
        if (audioParts.Count == 0)
            throw new ArgumentException("The audio track has no (supplied, unmuted) clips.");

        string audioMap;
        int audioInputCount;
        var first = audioParts[0].Clip;
        var isSimpleVoiceover = audioParts.Count == 1
            && first.StartTime == 0 && first.InPoint == 0
            && first.Volume is null && first.FadeIn is null && first.FadeOut is null
            && audioParts[0].TrackVolume is null;

        if (isSimpleVoiceover)
        {
            // Legacy path: map the single voiceover stream directly (apad only when video can outrun
            // it, so -shortest stops at the visual concat). Byte-for-similar with the pre-audio phases.
            var audioIndex = visualClips.Count;
            inputs.AddRange(["-i", assetPaths[first.SourceId]]);
            audioMap = hasVideo ? "[aout]" : $"{audioIndex}:a";
            if (hasVideo)
                filters.Append($";[{audioIndex}:a]apad[aout]");
            audioInputCount = 1;
        }
        else
        {
            // Mix path: apad the mix so -shortest always stops at the visual length (the master).
            var audio = new StringBuilder();
            for (var k = 0; k < audioParts.Count; k++)
            {
                var (clip, trackVolume) = audioParts[k];
                var idx = visualClips.Count + k;
                inputs.AddRange(["-ss", FfmpegProcess.Fmt(clip.InPoint), "-t", FfmpegProcess.Fmt(clip.Duration),
                    "-i", assetPaths[clip.SourceId]]);

                var chain = new List<string>();
                var volume = EffectiveVolume(clip.Volume, trackVolume);
                if (volume is not null && Math.Abs(volume.Value - 1.0) > 1e-9)
                    chain.Add($"volume={FfmpegProcess.Fmt(volume.Value)}");
                if (clip.FadeIn is > 0)
                    chain.Add($"afade=t=in:st=0:d={FfmpegProcess.Fmt(clip.FadeIn.Value)}");
                if (clip.FadeOut is > 0)
                    chain.Add($"afade=t=out:st={FfmpegProcess.Fmt(Math.Max(0, clip.Duration - clip.FadeOut.Value))}:d={FfmpegProcess.Fmt(clip.FadeOut.Value)}");
                var delayMs = (long)Math.Round(clip.StartTime * 1000);
                if (delayMs > 0)
                    chain.Add($"adelay={delayMs}:all=1");
                if (chain.Count == 0)
                    chain.Add("anull");
                audio.Append($";[{idx}:a]{string.Join(",", chain)}[a{k}]");
            }

            if (audioParts.Count == 1)
                audio.Append(";[a0]apad[aout]");
            else
                audio.Append(';')
                    .Append(string.Concat(Enumerable.Range(0, audioParts.Count).Select(k => $"[a{k}]")))
                    .Append($"amix=inputs={audioParts.Count}:normalize=0:dropout_transition=0[amixed];[amixed]apad[aout]");

            filters.Append(audio);
            audioMap = "[aout]";
            audioInputCount = audioParts.Count;
        }

        // --- Captions (Phase 3: alpha-PNG overlay track) ---
        // Each caption clip with a supplied transparent PNG becomes a top overlay on the base
        // video, gated to its [startTime, startTime+duration] window. The PNGs are browser-rendered
        // (brand font) and only composited here — the backend has no drawtext/freetype
        // (docs/timeline-editor-plan.md §5). Caption inputs come after the audio inputs so the
        // audio stream indices above are untouched; with none, the graph is the legacy one.
        var videoMap = "[vout]";
        if (captionPaths is { Count: > 0 })
        {
            var captionClips = timeline.Tracks
                .Where(t => t.Type == TrackType.Caption)
                .SelectMany(t => t.Clips)
                .Where(c => captionPaths.ContainsKey(c.Id))
                .OrderBy(c => c.StartTime)
                .ToList();

            var prev = "[vout]";
            for (var j = 0; j < captionClips.Count; j++)
            {
                var clip = captionClips[j];
                var idx = visualClips.Count + audioInputCount + j;
                inputs.AddRange(["-i", captionPaths[clip.Id]]);

                var start = FfmpegProcess.Fmt(clip.StartTime);
                var end = FfmpegProcess.Fmt(clip.StartTime + clip.Duration);
                var outLabel = j == captionClips.Count - 1 ? "[vcap]" : $"[vc{j}]";
                filters.Append($";{prev}[{idx}:v]overlay=0:0:enable='between(t,{start},{end})'{outLabel}");
                prev = outLabel;
            }

            if (captionClips.Count > 0)
                videoMap = "[vcap]";
        }

        var output = new List<string>
        {
            "-map", videoMap, "-map", audioMap,
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

    /// <summary>Clip gain × track gain, or null when neither is set (unity — no filter emitted).</summary>
    private static double? EffectiveVolume(double? clipVolume, double? trackVolume) =>
        clipVolume is null && trackVolume is null ? null : (clipVolume ?? 1.0) * (trackVolume ?? 1.0);
}
