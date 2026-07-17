import { renderTimeline } from '../../../core/api';
import type { StoredScene } from '../../../core/types';
import { renderCaptionOverlay } from '../captions/drawCaption';
import { compositeFrame } from '../../storyboard/composite';
import { getSceneImage } from '../../storyboard/sceneRepo';
import { VOICEOVER_ASSET_ID } from '../model/seed';
import type { Timeline } from '../model/types';
import { getAsset } from '../timelineAssetRepo';

/**
 * Render a seeded timeline to an mp4 (Greyvetro Studio Phase 5).
 *
 * Each photo clip's sourceId is a storyboard scene id, so we composite that scene's image into a
 * full-frame image *without* captions. From TL Phase 3 on, captions are their own alpha-overlay
 * track (docs/timeline-editor-plan.md §5): each caption clip rasterizes to a transparent PNG the
 * backend composites via `overlay`, so the underlying image can later crop/scale independently.
 * The voiceover packs under its stable asset id; the structured timeline + these blobs POST to
 * /render, where the backend compiler builds the ffmpeg graph.
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
    assets[clip.sourceId] = await compositeFrame(image, scene.narration, false);
  }

  // Captions: one transparent full-frame PNG per caption clip, keyed by clip id. The timeline's
  // caption track is the source of truth (it survives reorder/split/trim), not the raw scenes.
  const captions: Record<string, Blob> = {};
  const captionTrack = timeline.tracks.find((t) => t.type === 'caption');
  for (const clip of captionTrack?.clips ?? []) {
    if (!clip.text?.trim()) continue;
    captions[clip.id] = await renderCaptionOverlay(
      clip.text,
      timeline.outputWidth,
      timeline.outputHeight,
    );
  }

  // Video sources ship as their raw blobs; the backend compiler trims/renders them.
  for (const asset of timeline.assets) {
    if (asset.type !== 'video') continue;
    const blob = await getAsset(asset.id);
    if (blob) assets[asset.id] = blob;
  }

  // Music/SFX the user added (the voiceover is already packed above under its own id).
  for (const asset of timeline.assets) {
    if (asset.type !== 'audio' || asset.id === VOICEOVER_ASSET_ID) continue;
    const blob = await getAsset(asset.id);
    if (blob) assets[asset.id] = blob;
  }

  return renderTimeline(timeline, assets, captions);
}
