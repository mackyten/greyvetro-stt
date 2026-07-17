import { renderTimeline } from '../../../core/api';
import type { StoredScene } from '../../../core/types';
import { compositeFrame } from '../../storyboard/composite';
import { getSceneImage } from '../../storyboard/sceneRepo';
import { VOICEOVER_ASSET_ID } from '../model/seed';
import type { Timeline } from '../model/types';
import { getAsset } from '../timelineAssetRepo';

/**
 * Render a seeded timeline to an mp4 (Greyvetro Studio Phase 5, Phase-1 scope).
 *
 * Each photo clip's sourceId is a storyboard scene id, so we composite that scene's image +
 * narration into a full-frame image (captions stay burned in this phase — see
 * docs/timeline-editor-plan.md §5) and pack the voiceover under its stable asset id. The
 * structured timeline + these asset blobs POST to /render, where the backend compiler builds
 * the ffmpeg graph.
 */
export async function exportTimelineVideo(
  timeline: Timeline,
  scenes: StoredScene[],
  audio: Blob,
): Promise<Blob> {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const assets: Record<string, Blob> = { [VOICEOVER_ASSET_ID]: audio };

  const photoTrack = timeline.tracks.find((t) => t.type === 'photo');
  for (const clip of photoTrack?.clips ?? []) {
    const scene = byId.get(clip.sourceId);
    if (!scene) continue;
    const image = scene.hasImage ? await getSceneImage(scene.id) : null;
    assets[clip.sourceId] = await compositeFrame(image, scene.narration, true);
  }

  // Video sources ship as their raw blobs; the backend compiler trims/renders them.
  for (const asset of timeline.assets) {
    if (asset.type !== 'video') continue;
    const blob = await getAsset(asset.id);
    if (blob) assets[asset.id] = blob;
  }

  return renderTimeline(timeline, assets);
}
