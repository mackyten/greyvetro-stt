import type { StoredScene } from '../../../core/types';
import type { Clip, MediaAsset, Timeline, Track } from './types';

/** Stable source id for the voiceover audio asset within a seeded timeline. */
export const VOICEOVER_ASSET_ID = 'voiceover';

/**
 * Seed a Timeline from a project's storyboard (Phase 1). The storyboard becomes the
 * *seeder*, not the editor: scene images become a photo track, the voiceover becomes a
 * single audio clip, and narration becomes a (display-only) caption track.
 *
 * Segment placement reproduces the legacy scene renderer exactly — the first clip is pulled
 * back to 0 and the last is padded 1.5s (trailing silence, trimmed by ffmpeg's -shortest) —
 * so a seeded timeline renders byte-for-similar to today's storyboard export. In Phase 1
 * captions stay fused into the photo frames at export, so the caption track is for the
 * read-only view only; it splits into its own overlay in Phase 3.
 */
export function seedTimelineFromScenes(
  projectId: string,
  scenes: StoredScene[],
  audioDuration: number,
): Timeline {
  const ordered = [...scenes].sort((a, b) => a.start - b.start);

  const photoClips: Clip[] = [];
  const captionClips: Clip[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const scene = ordered[i];
    const startTime = i === 0 ? 0 : scene.start;
    const end = i === ordered.length - 1 ? scene.end + 1.5 : ordered[i + 1].start;
    const duration = Math.max(0.5, end - startTime);

    photoClips.push({
      id: `photo-${scene.id}`,
      sourceId: scene.id, // the composited frame blob is keyed by the scene id at export
      startTime,
      duration,
      inPoint: 0,
      outPoint: duration,
    });
    captionClips.push({
      // Caption clips mirror their photo clip and carry the scene id as sourceId so edits
      // (reorder/trim/split) can re-derive the caption lane by source. Captions stay fused into
      // the photo frames at export (the caption track is display-only until the Phase 3 overlay).
      id: `caption-${scene.id}`,
      sourceId: scene.id,
      startTime,
      duration,
      inPoint: 0,
      outPoint: duration,
      text: scene.narration,
    });
  }

  const visualEnd = photoClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
  const audioLen = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : visualEnd;

  const tracks: Track[] = [
    { id: 'photo', type: 'photo', zIndex: 0, clips: photoClips },
    {
      id: 'audio',
      type: 'audio',
      zIndex: 0,
      clips: [
        {
          id: 'voiceover',
          sourceId: VOICEOVER_ASSET_ID,
          startTime: 0,
          duration: audioLen,
          inPoint: 0,
          outPoint: audioLen,
        },
      ],
    },
    { id: 'caption', type: 'caption', zIndex: 1, clips: captionClips },
  ];

  // Register the seeded sources so the backend compiler knows their kinds (stills vs audio).
  // Video assets are added later when the user brings a clip in (see timelineOps.appendVideoClip).
  const assets: MediaAsset[] = [
    ...photoClips.map((c) => ({ id: c.sourceId, type: 'image' as const })),
    { id: VOICEOVER_ASSET_ID, type: 'audio', duration: audioLen },
  ];

  return {
    id: projectId, // one timeline per project in Phase 1
    outputWidth: 1080,
    outputHeight: 1920,
    fps: 30,
    tracks,
    assets,
  };
}
