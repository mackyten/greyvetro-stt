import type { Clip, MediaAsset, Timeline, Track } from './types';

/** Latest end across the visual (photo/video) tracks — where the next clip appends. */
export function visualEnd(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) {
    if (track.type !== 'photo' && track.type !== 'video') continue;
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
 * Re-attach the video track from a previously saved timeline onto a freshly seeded one (the
 * photo/audio/caption tracks are re-derived from the current storyboard each time). Video clips
 * are re-anchored sequentially after the new visual end so storyboard edits stay reflected while
 * user-added videos survive. Pure.
 */
export function mergeVideoTracks(base: Timeline, saved: Timeline | null): Timeline {
  const savedClips = saved?.tracks.find((t) => t.type === 'video')?.clips ?? [];
  if (savedClips.length === 0) return base;

  let cursor = visualEnd(base);
  const reanchored: Clip[] = [...savedClips]
    .sort((a, b) => a.startTime - b.startTime)
    .map((c) => {
      const clip = { ...c, startTime: cursor };
      cursor += c.duration;
      return clip;
    });

  const ids = new Set(reanchored.map((c) => c.sourceId));
  const videoAssets = (saved?.assets ?? []).filter((a) => ids.has(a.id));

  return {
    ...base,
    tracks: [...base.tracks, { id: 'video', type: 'video', zIndex: 0, clips: reanchored }],
    assets: [...base.assets, ...videoAssets],
  };
}
