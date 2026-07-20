/**
 * The timeline editor document (Greyvetro Studio Phase 5) — mirrors the backend C# DTO
 * (Greyvetro.Domain/Entities/Timeline.cs). Serialized straight to JSON for POST /render:
 * field names are camelCase and track/media types are lowercase strings, exactly what the
 * backend's case-insensitive + string-enum deserializer expects.
 *
 * Non-destructive by design: placement (startTime/duration) is kept apart from trim
 * (inPoint/outPoint), and transforms are normalized 0–1 so the output resolution can change
 * without re-authoring. Phase 1 only populates a subset (photo + audio + caption tracks);
 * the rest is here so the model is stable as later phases fill it in. See
 * docs/timeline-editor-plan.md §3.
 */

export type TrackType = 'video' | 'photo' | 'audio' | 'caption';
export type MediaType = 'video' | 'image' | 'audio';

export interface Timeline {
  id: string;
  outputWidth: number; // export target, e.g. 1080
  outputHeight: number; // e.g. 1920
  fps: number; // e.g. 30
  tracks: Track[];
  // Metadata for referenced source blobs — lets the backend compiler tell a looped still
  // (image) from a trimmed video. Blobs travel out-of-band (IndexedDB / multipart).
  assets: MediaAsset[];
}

export interface Track {
  id: string;
  type: TrackType;
  zIndex: number; // stacking order for visual tracks; lowest = base
  muted?: boolean;
  volume?: number; // 0–1, audio tracks
  clips: Clip[];
}

export interface Clip {
  id: string;
  sourceId: string; // -> MediaAsset.id (blank for caption clips, which carry text not media)

  // Timeline placement
  startTime: number; // seconds on the timeline
  duration: number; // seconds shown on the timeline

  // Trim — non-destructive, relative to the source media (0 for stills)
  inPoint: number;
  outPoint: number;

  // Transform — non-destructive, NORMALIZED 0–1 (survives output-resolution changes) [later phases]
  crop?: { x: number; y: number; width: number; height: number };
  position?: { x: number; y: number };
  scale?: number;
  rotation?: number;

  // Audio [later phases]
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;

  // Caption clips carry text; rasterized to an alpha overlay at export (Phase 3+).
  text?: string;

  // Ken Burns pan/zoom (Phase 5) — animates linearly from `from` to `to` across the clip's full
  // duration. Stills only (ignored by the backend for a video source). Mutually exclusive with a
  // static crop/rotation on the same clip: when animated, those are ignored for export.
  motion?: { from: KenBurns; to: KenBurns };

  // Crossfade into this base-track clip from the one immediately before it (Phase 6). The compiler
  // overlaps the two clips by `duration` seconds (ffmpeg `xfade`), so the base track's effective
  // length shrinks by that much at each transition — `reanchor` accounts for it. Ignored on the
  // first base-track clip (no predecessor) and on overlay/audio/caption tracks.
  transitionIn?: TransitionIn;
}

export type TransitionStyle = 'dissolve' | 'fadeToBlack';

export interface TransitionIn {
  style: TransitionStyle;
  duration: number; // seconds, clamped against both adjacent clips' own duration
}

/** A single Ken Burns keyframe: punch-in factor + normalized (0–1) pan center. */
export interface KenBurns {
  zoom: number; // 1 = full frame, higher = zoomed in
  panX: number;
  panY: number;
}

export interface MediaAsset {
  id: string;
  type: MediaType;
  // Blob persists in IndexedDB keyed by id; `url` is a runtime-only object URL, never persisted.
  url?: string;
  duration?: number; // video/audio only
  width?: number;
  height?: number;
}

/** Timeline total = the latest clip end across all tracks. */
export function timelineDuration(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks)
    for (const clip of track.clips) end = Math.max(end, clip.startTime + clip.duration);
  return end;
}
