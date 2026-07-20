using System.Text;
using Greyvetro.Domain.Entities;

namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// Pure <see cref="Timeline"/> → ffmpeg <see cref="FfmpegPlan"/> compiler. No file or process
/// I/O — assets are referenced by caller-resolved paths — so the fiddly filter-graph math is
/// unit-testable without ffmpeg (see docs/timeline-editor-plan.md §6).
///
/// A full-frame visual base layer (the lowest-zIndex photo/video track(s)) is assembled from
/// cut-joined segments (each a <c>concat</c>, stills looped, real video trimmed) folded pairwise with
/// <c>xfade</c> wherever a clip carries a <see cref="Clip.TransitionIn"/> — with none anywhere this
/// reduces to a single plain <c>concat</c>, byte-identical to the pre-transitions graph. Each clip is
/// optionally reframed (<see cref="Clip.Crop"/>), rotated (<see cref="Clip.Rotation"/>), or animated
/// (<see cref="Clip.Motion"/>, Ken Burns via <c>zoompan</c>). Higher-zIndex visual tracks composite as
/// PiP/logo-style <c>overlay</c> layers (<see cref="Clip.Position"/>/<see cref="Clip.Scale"/>), under
/// the caption alpha-PNG layer. Audio supports multi-track mixing (per-clip/-track volume, fades).
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
            var isVideo = hasSource && TypeOf(clip.SourceId) == MediaType.Video;
            var useMotion = hasSource && !isVideo && IsAnimated(clip.Motion);

            if (isVideo)
            {
                // Real video: input-seek to the trim in-point and read `duration` seconds. Its own
                // audio is muted by default (this same input's `[i:a]` is already trimmed to exactly
                // this clip's window, so opting in via IncludeAudio just mixes that stream in below —
                // no separate input needed).
                hasVideo = true;
                inputs.AddRange(["-ss", FfmpegProcess.Fmt(clip.InPoint), "-t", duration, "-i", path!]);
            }
            else if (useMotion)
            {
                // No -t: zoompan's own `d` (frame count) plus the trailing `trim=end_frame=` bound
                // this clip's frame count on their own — see ZoompanChain.
                inputs.AddRange(["-loop", "1", "-i", path!]);
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

            var chain = useMotion
                ? ZoompanChain(clip.Motion!, clip.Duration, w, h, fps)
                : $"{CropPrefix(clip.Crop)}scale={w}:{h}:force_original_aspect_ratio=increase," +
                  $"crop={w}:{h}{RotateSuffix(clip.Rotation, w, h)},setsar=1,fps={fps}";
            filters.Append($"[{i}:v]{chain}").AppendLine($"[v{i}];");
        }

        AppendBaseTrackAssembly(filters, visualClips);

        // --- Audio ---
        // Every unmuted audio clip with a supplied source becomes an input (input-seek trimmed),
        // placed on the timeline with adelay, given per-clip/-track volume and fades, then amix'd.
        var audioParts = timeline.Tracks
            .Where(t => t.Type == TrackType.Audio && !t.Muted)
            .SelectMany(t => t.Clips.Select(c => (Clip: c, TrackVolume: t.Volume)))
            .Where(p => assetPaths.ContainsKey(p.Clip.SourceId))
            .OrderBy(p => p.Clip.StartTime)
            .ToList();

        // Base-track video clips that opted in to mixing their own embedded audio (IncludeAudio).
        // Each reuses its already-added visual input's `[i:a]` stream — no separate `-i` needed,
        // since that input's `-ss`/`-t` already trims the audio to exactly this clip's window.
        var videoAudioParts = new List<(Clip Clip, int InputIndex)>();
        for (var i = 0; i < visualClips.Count; i++)
        {
            var clip = visualClips[i];
            if (clip.IncludeAudio && assetPaths.ContainsKey(clip.SourceId) && TypeOf(clip.SourceId) == MediaType.Video)
                videoAudioParts.Add((clip, i));
        }

        if (audioParts.Count == 0 && videoAudioParts.Count == 0)
            throw new ArgumentException("The audio track has no (supplied, unmuted) clips.");

        string audioMap;
        int audioInputCount;
        var first = audioParts.Count > 0 ? audioParts[0].Clip : null;
        var isSimpleVoiceover = audioParts.Count == 1 && videoAudioParts.Count == 0
            && first!.StartTime == 0 && first.InPoint == 0
            && first.Volume is null && first.FadeIn is null && first.FadeOut is null
            && audioParts[0].TrackVolume is null;

        if (isSimpleVoiceover)
        {
            // Legacy path: map the single voiceover stream directly (apad only when video can outrun
            // it, so -shortest stops at the visual concat). Byte-for-similar with the pre-audio phases.
            var audioIndex = visualClips.Count;
            inputs.AddRange(["-i", assetPaths[first!.SourceId]]);
            audioMap = hasVideo ? "[aout]" : $"{audioIndex}:a";
            if (hasVideo)
                filters.Append($";[{audioIndex}:a]apad[aout]");
            audioInputCount = 1;
        }
        else
        {
            // Mix path: apad the mix so -shortest always stops at the visual length (the master).
            var audio = new StringBuilder();
            var totalMembers = audioParts.Count + videoAudioParts.Count;
            var label = 0;
            for (var k = 0; k < audioParts.Count; k++)
            {
                var (clip, trackVolume) = audioParts[k];
                var idx = visualClips.Count + k;
                inputs.AddRange(["-ss", FfmpegProcess.Fmt(clip.InPoint), "-t", FfmpegProcess.Fmt(clip.Duration),
                    "-i", assetPaths[clip.SourceId]]);
                audio.Append($";[{idx}:a]{BuildAudioChain(clip, trackVolume)}[a{label}]");
                label++;
            }
            foreach (var (clip, inputIndex) in videoAudioParts)
            {
                audio.Append($";[{inputIndex}:a]{BuildAudioChain(clip, trackVolume: null)}[a{label}]");
                label++;
            }

            if (totalMembers == 1)
                audio.Append(";[a0]apad[aout]");
            else
                audio.Append(';')
                    .Append(string.Concat(Enumerable.Range(0, totalMembers).Select(k => $"[a{k}]")))
                    .Append($"amix=inputs={totalMembers}:normalize=0:dropout_transition=0[amixed];[amixed]apad[aout]");

            filters.Append(audio);
            audioMap = "[aout]";
            // Only the dedicated audio-track clips added NEW inputs (video-audio reuses an existing
            // one), so this is what downstream overlay/caption index math must offset past.
            audioInputCount = audioParts.Count;
        }

        // --- Overlay visual layers (Phase 3c: 2nd+ visual track, z-index layering) ---
        // Any photo/video track above the base zIndex composites as a PiP/logo-style overlay: each
        // clip is scaled to its normalized Scale (source aspect kept via -2) and placed at its
        // normalized Position, gated to its [startTime, startTime+duration] window — the same
        // overlay/enable technique as captions, just underneath them. A still is fed as a single
        // frame and held for its window by overlay's default eof_action=repeat (same trick captions
        // already rely on); real video is input-seek trimmed like the base track. Inputs are
        // appended right after the audio inputs (before captions — see the caption index below).
        var overlayClips = visualTracks
            .Where(t => t.ZIndex != baseZ)
            .SelectMany(t => t.Clips.Select(c => (Clip: c, TrackZIndex: t.ZIndex)))
            .Where(p => assetPaths.ContainsKey(p.Clip.SourceId))
            .OrderBy(p => p.TrackZIndex)
            .ThenBy(p => p.Clip.StartTime)
            .Select(p => p.Clip)
            .ToList();

        var videoMap = "[vout]";
        if (overlayClips.Count > 0)
        {
            var overlayBase = visualClips.Count + audioInputCount;
            var prev = "[vout]";
            for (var j = 0; j < overlayClips.Count; j++)
            {
                var clip = overlayClips[j];
                var idx = overlayBase + j;
                var path = assetPaths[clip.SourceId];
                if (TypeOf(clip.SourceId) == MediaType.Video)
                    inputs.AddRange(["-ss", FfmpegProcess.Fmt(clip.InPoint), "-t", FfmpegProcess.Fmt(clip.Duration), "-i", path]);
                else
                    inputs.AddRange(["-i", path]);

                var scale = clip.Scale is > 0 ? clip.Scale.Value : 0.3;
                var targetW = (int)Math.Round(w * scale);
                var x = (int)Math.Round((clip.Position?.X ?? 0) * w);
                var y = (int)Math.Round((clip.Position?.Y ?? 0) * h);
                var start = FfmpegProcess.Fmt(clip.StartTime);
                var end = FfmpegProcess.Fmt(clip.StartTime + clip.Duration);
                var outLabel = j == overlayClips.Count - 1 ? "[vov]" : $"[vv{j}]";

                filters.Append($";[{idx}:v]{CropPrefix(clip.Crop)}scale={targetW}:-2,setsar=1[ovl{j}]")
                    .Append($";{prev}[ovl{j}]overlay={x}:{y}:enable='between(t,{start},{end})'{outLabel}");
                prev = outLabel;
            }
            videoMap = "[vov]";
        }

        // --- Captions (Phase 3a: alpha-PNG overlay track) ---
        // Each caption clip with a supplied transparent PNG becomes a top overlay, gated to its
        // [startTime, startTime+duration] window. The PNGs are browser-rendered (brand font) and
        // only composited here — the backend has no drawtext/freetype (docs/timeline-editor-plan.md
        // §5). Caption inputs come after audio AND the overlay-visual inputs above (so those stream
        // indices stay valid); with none, the graph maps straight through (legacy path, or the
        // overlay-visual output).
        var captionClips = captionPaths is { Count: > 0 }
            ? timeline.Tracks
                .Where(t => t.Type == TrackType.Caption)
                .SelectMany(t => t.Clips)
                .Where(c => captionPaths.ContainsKey(c.Id))
                .OrderBy(c => c.StartTime)
                .ToList()
            : [];
        if (captionClips.Count > 0)
        {
            var prev = videoMap;
            for (var j = 0; j < captionClips.Count; j++)
            {
                var clip = captionClips[j];
                var idx = visualClips.Count + audioInputCount + overlayClips.Count + j;
                inputs.AddRange(["-i", captionPaths![clip.Id]]);

                var start = FfmpegProcess.Fmt(clip.StartTime);
                var end = FfmpegProcess.Fmt(clip.StartTime + clip.Duration);
                var outLabel = j == captionClips.Count - 1 ? "[vcap]" : $"[vc{j}]";
                filters.Append($";{prev}[{idx}:v]overlay=0:0:enable='between(t,{start},{end})'{outLabel}");
                prev = outLabel;
            }

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

    /// <summary>Shortest transition ffmpeg is asked to render; anything clamped below this is dropped.</summary>
    private const double MinTransitionDuration = 0.1;

    /// <summary>
    /// A transition's duration clamped against both adjacent clips' own length (a crossfade can't
    /// outlast either shot it's between), leaving a small margin so at least a sliver of each clip
    /// plays on its own. Returns null when absent, non-positive, or too short after clamping — the
    /// server never trusts the client's duration outright.
    /// </summary>
    private static Transition? ValidTransition(Transition? transition, double prevDuration, double duration)
    {
        if (transition is null || transition.Duration <= 0) return null;
        var cap = Math.Min(prevDuration, duration) * 0.9;
        var clamped = Math.Min(transition.Duration, cap);
        return clamped < MinTransitionDuration ? null : transition with { Duration = clamped };
    }

    /// <summary>
    /// Assembles the base visual track's <c>[v{i}]</c> streams into <c>[vout]</c>. Clips joined by a
    /// plain cut are grouped into a segment and <c>concat</c>'d (the original, cheap path — with no
    /// transitions anywhere this reduces to exactly the pre-Phase-6 single concat, byte-identical: the
    /// regression gate this method must never break). A clip with a valid <see
    /// cref="Clip.TransitionIn"/> starts a new segment instead; segments are then folded pairwise with
    /// ffmpeg <c>xfade</c>, each one overlapping the running combined stream by the transition's
    /// duration. <c>offset</c> is expressed against the *combined* left stream's own running duration
    /// (not the original per-clip timestamps) — the standard formula for chaining multiple xfades.
    /// </summary>
    private static void AppendBaseTrackAssembly(StringBuilder filters, IReadOnlyList<Clip> visualClips)
    {
        var segments = new List<(int Start, int Count, double Duration)>();
        var transitionsBetween = new List<Transition>();
        var segStart = 0;
        var segDuration = 0.0;
        for (var i = 0; i < visualClips.Count; i++)
        {
            if (i > 0)
            {
                var transition = ValidTransition(visualClips[i].TransitionIn, visualClips[i - 1].Duration, visualClips[i].Duration);
                if (transition is not null)
                {
                    segments.Add((segStart, i - segStart, segDuration));
                    transitionsBetween.Add(transition);
                    segStart = i;
                    segDuration = 0;
                }
            }
            segDuration += visualClips[i].Duration;
        }
        segments.Add((segStart, visualClips.Count - segStart, segDuration));

        var isFirstStatement = true;
        void AppendStatement(string stmt)
        {
            if (!isFirstStatement) filters.Append(';');
            filters.Append(stmt);
            isFirstStatement = false;
        }

        string SegmentLabel(int segIdx)
        {
            var (start, count, _) = segments[segIdx];
            if (count == 1) return $"v{start}";
            var label = $"seg{segIdx}";
            AppendStatement(string.Concat(Enumerable.Range(start, count).Select(i => $"[v{i}]")) +
                $"concat=n={count}:v=1:a=0[{label}]");
            return label;
        }

        if (segments.Count == 1)
        {
            AppendStatement(string.Concat(Enumerable.Range(0, visualClips.Count).Select(i => $"[v{i}]")) +
                $"concat=n={visualClips.Count}:v=1:a=0[vout]");
            return;
        }

        var prevLabel = SegmentLabel(0);
        var cumulative = segments[0].Duration;
        for (var s = 1; s < segments.Count; s++)
        {
            var nextLabel = SegmentLabel(s);
            var transition = transitionsBetween[s - 1];
            var xfadeType = transition.Style == TransitionStyle.FadeToBlack ? "fadeblack" : "fade";
            var offset = Math.Max(0, cumulative - transition.Duration);
            var outLabel = s == segments.Count - 1 ? "vout" : $"xf{s}";
            AppendStatement($"[{prevLabel}][{nextLabel}]xfade=transition={xfadeType}:" +
                $"duration={FfmpegProcess.Fmt(transition.Duration)}:offset={FfmpegProcess.Fmt(offset)}[{outLabel}]");
            cumulative = cumulative + segments[s].Duration - transition.Duration;
            prevLabel = outLabel;
        }
    }

    /// <summary>Clip gain × track gain, or null when neither is set (unity — no filter emitted).</summary>
    private static double? EffectiveVolume(double? clipVolume, double? trackVolume) =>
        clipVolume is null && trackVolume is null ? null : (clipVolume ?? 1.0) * (trackVolume ?? 1.0);

    /// <summary>
    /// The <c>volume,afade,adelay</c> chain for one audio mix member — a dedicated audio-track clip
    /// (<paramref name="trackVolume"/> from its track) or a base-track video clip's own embedded
    /// audio (<paramref name="trackVolume"/> null, since there's no track-level gain to fold in).
    /// </summary>
    private static string BuildAudioChain(Clip clip, double? trackVolume)
    {
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
        return string.Join(",", chain);
    }

    /// <summary>
    /// A leading <c>crop=…,</c> filter (with trailing comma) for a normalized source crop, or empty
    /// when the crop is absent or the full frame. Expressed with <c>iw</c>/<c>ih</c> so it's
    /// independent of the source's pixel dimensions.
    /// </summary>
    private static string CropPrefix(CropRect? crop)
    {
        if (crop is null || (crop.X <= 0 && crop.Y <= 0 && crop.Width >= 1 && crop.Height >= 1))
            return string.Empty;
        return $"crop=iw*{FfmpegProcess.Fmt(crop.Width)}:ih*{FfmpegProcess.Fmt(crop.Height)}:" +
               $"iw*{FfmpegProcess.Fmt(crop.X)}:ih*{FfmpegProcess.Fmt(crop.Y)},";
    }

    /// <summary>
    /// A <c>scale,rotate</c> suffix that tilts an already-cover-fit WxH frame by <paramref
    /// name="rotationDegrees"/>, or empty when rotation is absent/zero (keeps the un-rotated graph
    /// byte-identical). The frame is pre-scaled by the smallest uniform factor that keeps the
    /// rotated rectangle fully covering the WxH canvas, so no black corners appear after ffmpeg
    /// crops back down to WxH (<c>rotate</c>'s <c>ow</c>/<c>oh</c>).
    /// </summary>
    private static string RotateSuffix(double? rotationDegrees, int w, int h)
    {
        if (rotationDegrees is null or 0)
            return string.Empty;

        var rad = Math.Abs(rotationDegrees.Value) * Math.PI / 180;
        var k = Math.Cos(rad) + (double)h / w * Math.Sin(rad);
        var zw = (int)Math.Ceiling(w * k);
        var zh = (int)Math.Ceiling(h * k);
        return $",scale={zw}:{zh},rotate={FfmpegProcess.Fmt(rotationDegrees.Value)}*PI/180:ow={w}:oh={h}:c=black";
    }

    /// <summary>True when a clip's Motion has distinct From/To keyframes — an identical pair is a
    /// no-op that falls back to the (cheaper) static chain instead of running zoompan.</summary>
    private static bool IsAnimated(Motion? motion) =>
        motion is not null && (
            Math.Abs(motion.From.Zoom - motion.To.Zoom) > 1e-6 ||
            Math.Abs(motion.From.PanX - motion.To.PanX) > 1e-6 ||
            Math.Abs(motion.From.PanY - motion.To.PanY) > 1e-6);

    /// <summary>
    /// Pre-scale-then-<c>zoompan</c> chain size the crop window stays at (at least) native output
    /// resolution even at the deepest keyframed zoom, so panning/zooming in doesn't soften the image.
    /// </summary>
    private const int KenBurnsHeadroom = 3;

    /// <summary>
    /// A Ken Burns chain that animates linearly from <paramref name="motion"/>'s <c>From</c> to
    /// <c>To</c> keyframe across the clip's full duration. Verified empirically against ffmpeg 8.1
    /// (docs/timeline-editor-plan.md §9): the source must be fed as an unbounded <c>-loop 1 -i</c>
    /// input (no input-side <c>-t</c> — combining the two makes ffmpeg re-run the whole <c>d</c>-frame
    /// zoompan cycle once per demuxed input frame instead of once total). The chain instead bounds its
    /// own frame count with a trailing <c>trim=end_frame=</c>, so it terminates on its own with no
    /// external <c>-t</c>/<c>-frames:v</c> needed — required because this clip's stream feeds a
    /// `concat` alongside others, not a standalone output.
    /// <para/>
    /// The source is first cover-fit to <see cref="KenBurnsHeadroom"/>× the output size (matching the
    /// existing cover-fit crop, just larger) so <c>iw</c>/<c>ih</c> inside zoompan already match the
    /// output aspect ratio — a centered zoom window then always covers without stretching. <c>x</c>/
    /// <c>y</c> reference zoompan's own <c>zoom</c> variable (the just-evaluated <c>z</c> for that
    /// frame) to place the window's top-left from the (also keyframed) pan center, clamped in-bounds.
    /// </summary>
    private static string ZoompanChain(Motion motion, double duration, int w, int h, int fps)
    {
        var kw = w * KenBurnsHeadroom;
        var kh = h * KenBurnsHeadroom;
        var frames = Math.Max(2, (int)Math.Round(duration * fps));
        var denom = frames - 1;

        string Lerp(double from, double to) =>
            $"{FfmpegProcess.Fmt(from)}+{FfmpegProcess.Fmt(to - from)}*on/{denom}";

        var zoomExpr = Lerp(Math.Max(motion.From.Zoom, 1), Math.Max(motion.To.Zoom, 1));
        var xExpr = $"min(max(({Lerp(motion.From.PanX, motion.To.PanX)})*iw-(iw/zoom/2),0),iw-iw/zoom)";
        var yExpr = $"min(max(({Lerp(motion.From.PanY, motion.To.PanY)})*ih-(ih/zoom/2),0),ih-ih/zoom)";

        return $"scale={kw}:{kh}:force_original_aspect_ratio=increase,crop={kw}:{kh}," +
               $"zoompan=z='{zoomExpr}':x='{xExpr}':y='{yExpr}':d={frames}:s={w}x{h}:fps={fps}," +
               $"trim=end_frame={frames},setpts=PTS-STARTPTS,setsar=1";
    }
}
