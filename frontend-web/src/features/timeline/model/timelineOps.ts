import { VOICEOVER_ASSET_ID } from './seed';
import {
  timelineDuration,
  type Clip,
  type KenBurns,
  type MediaAsset,
  type Timeline,
  type Track,
  type TransitionIn,
  type TransitionStyle,
} from './types';

/** Smallest clip length the editor allows (seconds) — keeps trims/splits well-formed. */
export const MIN_CLIP = 0.3;

const isVisual = (t: Track) => t.type === 'photo' || t.type === 'video';

/**
 * The zIndex of the base (lowest) visual layer — the contiguous `concat` track. Higher-zIndex
 * photo/video tracks are overlay (PiP/logo) layers (Phase 3c), which float freely and never
 * participate in reanchor/reorder/split. Falls back to 0 for a timeline with no visual tracks yet.
 */
function baseVisualZIndex(timeline: Timeline): number {
  const zs = timeline.tracks.filter(isVisual).map((t) => t.zIndex);
  return zs.length ? Math.min(...zs) : 0;
}

/** True for a photo/video track that's part of the base concat, as opposed to an overlay layer. */
function isBaseVisual(timeline: Timeline, track: Track): boolean {
  return isVisual(track) && track.zIndex === baseVisualZIndex(timeline);
}

/** The track that owns a clip, or null. */
function trackOf(timeline: Timeline, clipId: string): Track | null {
  return timeline.tracks.find((t) => t.clips.some((c) => c.id === clipId)) ?? null;
}

/** Shortest transition the compiler will render; anything clamped below this is dropped. Mirrors
 * the backend's `MinTransitionDuration` (FilterGraphCompiler.cs) exactly. */
export const MIN_TRANSITION = 0.1;

/**
 * A transition's duration clamped against both adjacent clips' own length — a crossfade can't
 * outlast either shot it's between, and this is the exact formula the backend compiler uses
 * (`ValidTransition`), so the editor's re-anchored timeline always matches what actually renders.
 */
function clampTransitionDuration(requested: number, prevDuration: number, duration: number): number {
  return Math.min(requested, Math.min(prevDuration, duration) * 0.9);
}

/** The overlap (seconds) a clip's transitionIn actually contributes once clamped, or 0 if absent/
 * too short to survive clamping (matches the backend's drop-if-too-short behavior). */
function transitionOverlap(t: TransitionIn | undefined, prevDuration: number, duration: number): number {
  if (!t || t.duration <= 0) return 0;
  const clamped = clampTransitionDuration(t.duration, prevDuration, duration);
  return clamped < MIN_TRANSITION ? 0 : clamped;
}

/** All base-visual (photo/video) clips across tracks, in play order — mirrors the backend
 * compiler's `visualClips` (docs/timeline-editor-plan.md §6). */
function baseVisualClipsOrdered(timeline: Timeline): Clip[] {
  const baseZ = baseVisualZIndex(timeline);
  return timeline.tracks
    .filter((t) => isVisual(t) && t.zIndex === baseZ)
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Re-lay the timeline into a well-formed, contiguous document after a structural edit. The base
 * visual track is a `concat` (or, where a clip carries a `transitionIn`, an `xfade` overlap): photo
 * clips are anchored from 0 in array order, then video clips continue the cursor, each clip's start
 * pulled back by its (clamped) transition overlap with the one before it — see
 * {@link clampTransitionDuration}, which mirrors the backend compiler exactly so the editor's
 * timeline always reflects what will actually render. The (display-only) caption lane is rebuilt to
 * mirror the photo clips (text carried over by source id). Audio and overlay (PiP/logo) tracks are
 * left untouched — they float freely, not part of the concat. Pure.
 */
function reanchor(timeline: Timeline): Timeline {
  const baseZ = baseVisualZIndex(timeline);

  const anchorVisual = (clips: readonly Clip[]): Clip[] => {
    let cursor = 0;
    return clips.map((c, i) => {
      if (i > 0) cursor -= transitionOverlap(c.transitionIn, clips[i - 1].duration, c.duration);
      const clip = { ...c, startTime: cursor };
      cursor += c.duration;
      return clip;
    });
  };

  const photoTrack = timeline.tracks.find((t) => t.type === 'photo' && t.zIndex === baseZ);
  const videoTrack = timeline.tracks.find((t) => t.type === 'video' && t.zIndex === baseZ);
  const combined = anchorVisual([...(photoTrack?.clips ?? []), ...(videoTrack?.clips ?? [])]);
  const photoClips = photoTrack ? combined.slice(0, photoTrack.clips.length) : [];
  const videoClips = videoTrack ? combined.slice(photoTrack?.clips.length ?? 0) : [];

  const textBySource = new Map<string, string>();
  for (const c of timeline.tracks.find((t) => t.type === 'caption')?.clips ?? [])
    if (c.sourceId) textBySource.set(c.sourceId, c.text ?? '');
  const captionClips: Clip[] = photoClips.map((p) => ({
    id: `caption-${p.id}`,
    sourceId: p.sourceId,
    startTime: p.startTime,
    duration: p.duration,
    inPoint: 0,
    outPoint: p.duration,
    text: textBySource.get(p.sourceId) ?? '',
  }));

  const tracks = timeline.tracks.map((t) => {
    if (photoTrack && t.id === photoTrack.id) return { ...t, clips: photoClips };
    if (videoTrack && t.id === videoTrack.id) return { ...t, clips: videoClips };
    if (t.type === 'caption') return { ...t, clips: captionClips };
    return t;
  });
  return { ...timeline, tracks };
}

/**
 * Reorder a visual clip within its own lane, dropping it in front of `targetClipId`. Cross-lane
 * moves are ignored in this phase. Re-anchors so the concat order matches. Pure.
 */
export function moveClip(timeline: Timeline, clipId: string, targetClipId: string): Timeline {
  if (clipId === targetClipId) return timeline;
  const track = trackOf(timeline, clipId);
  if (!track || !isBaseVisual(timeline, track) || !track.clips.some((c) => c.id === targetClipId))
    return timeline;

  const clips = [...track.clips];
  const [moved] = clips.splice(
    clips.findIndex((c) => c.id === clipId),
    1,
  );
  clips.splice(
    clips.findIndex((c) => c.id === targetClipId),
    0,
    moved,
  );
  return reanchor(withTrackClips(timeline, track.id, clips));
}

/**
 * Trim a visual clip. Stills only change on-timeline `duration`; real video also moves its source
 * window (`inPoint`/`outPoint`), clamped to the asset length. Downstream clips re-anchor. Pure.
 */
export function trimClip(
  timeline: Timeline,
  clipId: string,
  next: { inPoint?: number; duration: number },
): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || (!isVisual(track) && track.type !== 'audio')) return timeline;
  const current = track.clips.find((c) => c.id === clipId)!;
  const srcDur = timeline.assets.find((a) => a.id === current.sourceId)?.duration;

  const clips = track.clips.map((c) => {
    if (c.id !== clipId) return c;
    // A known source length (video/audio) bounds the trim window; stills just change duration.
    if (srcDur && srcDur > 0) {
      const inPoint = clamp(next.inPoint ?? c.inPoint, 0, srcDur - MIN_CLIP);
      const duration = clamp(next.duration, MIN_CLIP, srcDur - inPoint);
      return { ...c, inPoint, duration, outPoint: inPoint + duration };
    }
    const duration = Math.max(MIN_CLIP, next.duration);
    return { ...c, duration, inPoint: 0, outPoint: duration };
  });
  return reanchor(withTrackClips(timeline, track.id, clips));
}

/**
 * Split a visual clip at `localOffset` seconds into it, yielding two clips over the same source
 * (both halves keep the video source window; stills just split their duration). Re-anchors. Pure.
 */
export function splitClip(timeline: Timeline, clipId: string, localOffset: number): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || !isBaseVisual(timeline, track)) return timeline;
  const idx = track.clips.findIndex((c) => c.id === clipId);
  const clip = track.clips[idx];
  if (localOffset <= MIN_CLIP || localOffset >= clip.duration - MIN_CLIP) return timeline;

  const cut = clip.inPoint + localOffset;
  const tag = Date.now().toString(36);
  const isVideo = track.type === 'video';
  const first: Clip = {
    ...clip,
    id: `${clip.id}.${tag}a`,
    duration: localOffset,
    inPoint: isVideo ? clip.inPoint : 0,
    outPoint: isVideo ? cut : localOffset,
  };
  const second: Clip = {
    ...clip,
    id: `${clip.id}.${tag}b`,
    duration: clip.duration - localOffset,
    inPoint: isVideo ? cut : 0,
    outPoint: isVideo ? clip.outPoint : clip.duration - localOffset,
    // The second half's predecessor is now the first half (a plain cut) — a transition into the
    // original clip belongs on the first half only, not duplicated onto the new interior boundary.
    transitionIn: undefined,
  };

  const clips = [...track.clips];
  clips.splice(idx, 1, first, second);
  return reanchor(withTrackClips(timeline, track.id, clips));
}

/** Remove a visual clip and close the gap. Refuses to remove the last visual clip (the compiler
 * requires at least one). Re-anchors. Pure. */
export function deleteClip(timeline: Timeline, clipId: string): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || !isBaseVisual(timeline, track)) return timeline;
  const clips = track.clips.filter((c) => c.id !== clipId);
  const remainingVisual = timeline.tracks
    .filter((t) => isBaseVisual(timeline, t))
    .reduce((n, t) => n + (t.id === track.id ? clips.length : t.clips.length), 0);
  if (remainingVisual === 0) return timeline;
  return reanchor(withTrackClips(timeline, track.id, clips));
}

/** Add a music/SFX track (one clip anchored at t=0) at a default low gain so it sits under the
 * voiceover. The asset is registered so the backend mixes it. Pure. */
export function addMusic(
  timeline: Timeline,
  assetId: string,
  duration: number,
  opts?: { volume?: number },
): Timeline {
  // Clamp the initial clip to the existing content length (the export stops at the visual length);
  // the asset keeps its full intrinsic duration so the user can trim the end back out if they want.
  const target = timelineDuration(timeline);
  const clipDuration = target > 0 ? Math.min(duration, target) : duration;
  const clip: Clip = {
    id: `music-${assetId}`,
    sourceId: assetId,
    startTime: 0,
    duration: clipDuration,
    inPoint: 0,
    outPoint: clipDuration,
  };
  const maxZ = timeline.tracks
    .filter((t) => t.type === 'audio')
    .reduce((m, t) => Math.max(m, t.zIndex), 0);
  const track: Track = {
    id: `audio-${assetId}`,
    type: 'audio',
    zIndex: maxZ + 1,
    volume: opts?.volume,
    clips: [clip],
  };
  const asset: MediaAsset = { id: assetId, type: 'audio', duration };
  return { ...timeline, tracks: [...timeline.tracks, track], assets: [...timeline.assets, asset] };
}

/** Set an audio track's gain (0–1) and/or mute; unspecified fields are left as they were. Pure. */
export function setTrackAudio(
  timeline: Timeline,
  trackId: string,
  patch: { volume?: number; muted?: boolean },
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) =>
      t.id === trackId
        ? { ...t, volume: patch.volume ?? t.volume, muted: patch.muted ?? t.muted }
        : t,
    ),
  };
}

/** Set fade-in/out (seconds) on a clip; unspecified fields are left as they were. Pure. */
export function setClipFade(
  timeline: Timeline,
  clipId: string,
  patch: { fadeIn?: number; fadeOut?: number },
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, fadeIn: patch.fadeIn ?? c.fadeIn, fadeOut: patch.fadeOut ?? c.fadeOut }
          : c,
      ),
    })),
  };
}

/** Remove a whole track (used to drop an added music track). Leaves its asset (harmless). Pure. */
export function removeTrack(timeline: Timeline, trackId: string): Timeline {
  return { ...timeline, tracks: timeline.tracks.filter((t) => t.id !== trackId) };
}

/** Deepest punch-in the reframe control allows. */
export const MAX_ZOOM = 3;

type Crop = NonNullable<Clip['crop']>;

/**
 * A normalized crop rect from an intuitive zoom (1–MAX_ZOOM) + pan-center (0–1). Equal normalized
 * width/height preserve the source aspect, so the crop cover-fits to the output as a uniform
 * zoom regardless of the source's shape. The pan-center is clamped so the box stays in-bounds.
 */
export function cropFromZoomPan(zoom: number, panX: number, panY: number): Crop {
  const z = clamp(zoom, 1, MAX_ZOOM);
  const size = 1 / z;
  return {
    x: clamp(panX - size / 2, 0, 1 - size),
    y: clamp(panY - size / 2, 0, 1 - size),
    width: size,
    height: size,
  };
}

/** Inverse of {@link cropFromZoomPan}: the zoom + pan-center a crop represents (drives the sliders). */
export function zoomPanFromCrop(crop: Clip['crop']): { zoom: number; panX: number; panY: number } {
  if (!crop || crop.width <= 0) return { zoom: 1, panX: 0.5, panY: 0.5 };
  return { zoom: 1 / crop.width, panX: crop.x + crop.width / 2, panY: crop.y + crop.height / 2 };
}

/** Set (or clear, with null / a full-frame rect) a visual clip's crop/reframe. Pure. */
export function setCrop(timeline: Timeline, clipId: string, crop: Crop | null): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || !isVisual(track)) return timeline;
  const isFull =
    !crop || (crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1);
  return withTrackClips(
    timeline,
    track.id,
    track.clips.map((c) => (c.id === clipId ? { ...c, crop: isFull ? undefined : crop } : c)),
  );
}

/** Widest tilt the reframe control allows, in either direction (degrees). */
export const MAX_ROTATION = 45;

/** Set (or clear, with null) a base-track clip's tilt in degrees. Overlay-track clips don't
 * rotate in v1 (they're already free-positioned; the compiler ignores Rotation on them). Pure. */
export function setRotation(timeline: Timeline, clipId: string, rotation: number | null): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || !isBaseVisual(timeline, track)) return timeline;
  return withTrackClips(
    timeline,
    track.id,
    track.clips.map((c) =>
      c.id === clipId ? { ...c, rotation: rotation && Math.abs(rotation) > 0.01 ? rotation : undefined } : c,
    ),
  );
}

/** Default Ken Burns keyframes for a freshly enabled motion clip: a gentle static-to-punched-in zoom. */
export const DEFAULT_MOTION: { from: KenBurns; to: KenBurns } = {
  from: { zoom: 1, panX: 0.5, panY: 0.5 },
  to: { zoom: 1.3, panX: 0.5, panY: 0.5 },
};

/** Set (or clear, with null) a visual clip's keyframed Ken Burns pan/zoom. Pure. */
export function setMotion(
  timeline: Timeline,
  clipId: string,
  motion: { from: KenBurns; to: KenBurns } | null,
): Timeline {
  const track = trackOf(timeline, clipId);
  if (!track || !isVisual(track)) return timeline;
  return withTrackClips(
    timeline,
    track.id,
    track.clips.map((c) => (c.id === clipId ? { ...c, motion: motion ?? undefined } : c)),
  );
}

/** The largest transition duration (seconds) the boundary before `clipId` can support, or 0 if
 * there's no predecessor (first base-track clip) or the clip isn't on the base track. */
export function maxTransitionDuration(timeline: Timeline, clipId: string): number {
  const ordered = baseVisualClipsOrdered(timeline);
  const idx = ordered.findIndex((c) => c.id === clipId);
  if (idx <= 0) return 0;
  return Math.min(ordered[idx - 1].duration, ordered[idx].duration) * 0.9;
}

/** Set (or clear, with null) a base-track clip's crossfade from the clip immediately before it.
 * Ignored on the first base-track clip (nothing to fade from). Clamped against both adjacent
 * clips' own duration — see {@link clampTransitionDuration} — so a request too small to survive
 * clamping is dropped, same as the backend compiler would drop it. Re-anchors. Pure. */
export function setClipTransition(
  timeline: Timeline,
  clipId: string,
  transition: { style: TransitionStyle; duration: number } | null,
): Timeline {
  const ordered = baseVisualClipsOrdered(timeline);
  const idx = ordered.findIndex((c) => c.id === clipId);
  if (idx <= 0) return timeline;
  const track = trackOf(timeline, clipId);
  if (!track) return timeline;

  let next: TransitionIn | undefined;
  if (transition) {
    const clamped = clampTransitionDuration(transition.duration, ordered[idx - 1].duration, ordered[idx].duration);
    next = clamped >= MIN_TRANSITION ? { style: transition.style, duration: clamped } : undefined;
  }
  return reanchor(
    withTrackClips(
      timeline,
      track.id,
      track.clips.map((c) => (c.id === clipId ? { ...c, transitionIn: next } : c)),
    ),
  );
}

/** True for a photo/video track that's an overlay (PiP/logo) layer, not the base concat. */
export function isOverlayTrack(timeline: Timeline, trackId: string): boolean {
  const track = timeline.tracks.find((t) => t.id === trackId);
  return !!track && isVisual(track) && !isBaseVisual(timeline, track);
}

/** Default placement/size for a freshly added overlay (top-right-ish PiP, 30% of the frame width). */
const DEFAULT_OVERLAY_POSITION = { x: 0.62, y: 0.04 };
const DEFAULT_OVERLAY_SCALE = 0.3;

/**
 * Add an image overlay (logo/PiP) as its own visual track above the base, one clip spanning the
 * current timeline length by default (a persistent watermark; trim its end to shorten). The asset
 * is registered so the backend compiler composites it with `overlay`. Pure.
 */
export function addOverlayImage(timeline: Timeline, assetId: string): Timeline {
  const span = Math.max(timelineDuration(timeline), MIN_CLIP);
  const clip: Clip = {
    id: `overlay-${assetId}`,
    sourceId: assetId,
    startTime: 0,
    duration: span,
    inPoint: 0,
    outPoint: span,
    position: DEFAULT_OVERLAY_POSITION,
    scale: DEFAULT_OVERLAY_SCALE,
  };
  const maxZ = timeline.tracks.filter(isVisual).reduce((m, t) => Math.max(m, t.zIndex), 0);
  const track: Track = { id: `overlay-${assetId}`, type: 'photo', zIndex: maxZ + 1, clips: [clip] };
  const asset: MediaAsset = { id: assetId, type: 'image' };
  return { ...timeline, tracks: [...timeline.tracks, track], assets: [...timeline.assets, asset] };
}

/** Set an overlay clip's position (normalized 0–1 top-left) and/or scale (0–1 of output width).
 * Unspecified fields are left as they were. Pure. */
export function setOverlayTransform(
  timeline: Timeline,
  clipId: string,
  patch: { position?: { x: number; y: number }; scale?: number },
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId
          ? { ...c, position: patch.position ?? c.position, scale: patch.scale ?? c.scale }
          : c,
      ),
    })),
  };
}

function withTrackClips(timeline: Timeline, trackId: string, clips: Clip[]): Timeline {
  return { ...timeline, tracks: timeline.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Latest end across the BASE visual (photo/video) tracks — where the next clip appends. Overlay
 * (PiP/logo) layers are excluded — they float independently of the base concat's length. */
export function visualEnd(timeline: Timeline): number {
  const baseZ = baseVisualZIndex(timeline);
  let end = 0;
  for (const track of timeline.tracks) {
    if (!isVisual(track) || track.zIndex !== baseZ) continue;
    for (const clip of track.clips) end = Math.max(end, clip.startTime + clip.duration);
  }
  return end;
}

/**
 * Append a video source to the timeline: it lands on the base-layer video track (created if
 * absent) at the current visual end, so it plays after the existing scenes with no overlap. The
 * asset (with its type/duration) is registered so the backend compiler renders real motion.
 * Pure — returns a new Timeline.
 */
export function appendVideoClip(
  timeline: Timeline,
  assetId: string,
  duration: number,
  meta: { width?: number; height?: number },
): Timeline {
  const start = visualEnd(timeline);
  const clip: Clip = {
    id: `clip-${assetId}`,
    sourceId: assetId,
    startTime: start,
    duration,
    inPoint: 0,
    outPoint: duration,
  };
  const asset: MediaAsset = { id: assetId, type: 'video', duration, ...meta };

  const tracks = [...timeline.tracks];
  const idx = tracks.findIndex((t) => t.type === 'video' && t.zIndex === 0);
  if (idx >= 0) {
    tracks[idx] = { ...tracks[idx], clips: [...tracks[idx].clips, clip] };
  } else {
    const video: Track = { id: 'video', type: 'video', zIndex: 0, clips: [clip] };
    tracks.push(video);
  }
  return { ...timeline, tracks, assets: [...timeline.assets, asset] };
}

/**
 * Re-attach user-added media (video clips + music tracks + overlay/PiP tracks) from a previously
 * saved timeline onto a freshly seeded one (the photo/audio-voiceover/caption tracks are
 * re-derived from the current storyboard each re-sync). Video clips are re-anchored sequentially
 * after the new visual end so storyboard edits stay reflected; music tracks (any audio track that
 * isn't the seeded voiceover) and overlay tracks (any visual track above the saved timeline's base
 * zIndex) carry over as-is. Pure.
 */
export function mergeAddedMedia(base: Timeline, saved: Timeline | null): Timeline {
  if (!saved) return base;
  let result = base;

  const savedVideo = saved.tracks.find((t) => t.type === 'video')?.clips ?? [];
  if (savedVideo.length > 0) {
    let cursor = visualEnd(result);
    const reanchored: Clip[] = [...savedVideo]
      .sort((a, b) => a.startTime - b.startTime)
      .map((c) => {
        const clip = { ...c, startTime: cursor };
        cursor += c.duration;
        return clip;
      });
    const ids = new Set(reanchored.map((c) => c.sourceId));
    result = {
      ...result,
      tracks: [...result.tracks, { id: 'video', type: 'video', zIndex: 0, clips: reanchored }],
      assets: [...result.assets, ...saved.assets.filter((a) => ids.has(a.id))],
    };
  }

  const musicTracks = saved.tracks.filter(
    (t) => t.type === 'audio' && !t.clips.some((c) => c.sourceId === VOICEOVER_ASSET_ID),
  );
  if (musicTracks.length > 0) {
    const ids = new Set(musicTracks.flatMap((t) => t.clips.map((c) => c.sourceId)));
    result = {
      ...result,
      tracks: [...result.tracks, ...musicTracks],
      assets: [...result.assets, ...saved.assets.filter((a) => ids.has(a.id))],
    };
  }

  const savedBaseZ = baseVisualZIndex(saved);
  const overlayTracks = saved.tracks.filter((t) => isVisual(t) && t.zIndex !== savedBaseZ);
  if (overlayTracks.length > 0) {
    const ids = new Set(overlayTracks.flatMap((t) => t.clips.map((c) => c.sourceId)));
    result = {
      ...result,
      tracks: [...result.tracks, ...overlayTracks],
      assets: [...result.assets, ...saved.assets.filter((a) => ids.has(a.id))],
    };
  }

  return result;
}
