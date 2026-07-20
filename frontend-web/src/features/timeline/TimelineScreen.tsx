import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../core/toast';
import { slugify, type GalleryItem, type Project, type StoredScene } from '../../core/types';
import { getGalleryAudio, listGallery } from '../gallery/galleryRepo';
import { listProjects } from '../projects/projectRepo';
import { getSceneImage, listScenes } from '../storyboard/sceneRepo';
import { exportTimelineVideo } from './export/exportService';
import { audioDuration, capturePoster, probeVideo } from './media';
import { seedTimelineFromScenes } from './model/seed';
import { addMusic, addOverlayImage, appendVideoClip, mergeAddedMedia } from './model/timelineOps';
import type { Timeline } from './model/types';
import { getAsset, saveAsset } from './timelineAssetRepo';
import { getTimeline, saveTimeline } from './timelineRepo';
import { TimelineEditor } from './TimelineEditor';

/**
 * Timeline editor (Greyvetro Studio Phase 5, Phase 2) — interactive multi-track editing. Seeds a
 * Timeline from the active project's storyboard + voiceover the first time, then the saved
 * timeline is the source of truth: the user reorders / trims / splits / deletes clips and brings
 * in video, all persisted. "Re-sync from storyboard" rebuilds the photo/caption/audio tracks from
 * the current storyboard (keeping added videos). Export goes through the backend Timeline render
 * path, which trims/renders real video and burns captions into the stills.
 */
export function TimelineScreen() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [clips, setClips] = useState<GalleryItem[]>([]);
  const [scenes, setScenes] = useState<StoredScene[] | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const audioRef = useRef<Blob | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const musicInput = useRef<HTMLInputElement | null>(null);
  const overlayInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listProjects().then((list) => {
      setProjects(list);
      setProjectId((id) => id ?? list[0]?.id ?? null);
    });
    listGallery().then(setClips);
  }, []);

  // Seed the timeline from the active project's storyboard, re-attaching any added videos.
  useEffect(() => {
    if (!projectId) {
      setScenes(null);
      setTimeline(null);
      return;
    }
    let cancelled = false;
    let urls: string[] = [];
    let audioObjUrl: string | null = null;
    setScenes(null);
    setTimeline(null);
    setAudioUrl(null);
    audioRef.current = null;

    (async () => {
      const list = await listScenes(projectId);
      if (cancelled) return;
      if (list.length === 0) {
        setScenes([]);
        return;
      }

      // Scene thumbnails for the photo lane.
      const map: Record<string, string> = {};
      for (const scene of list) {
        if (!scene.hasImage) continue;
        const blob = await getSceneImage(scene.id);
        if (blob) map[scene.id] = URL.createObjectURL(blob);
      }

      // The timeline is the source of truth once it exists — load it and keep the user's edits.
      // Only seed from the storyboard the first time (no saved timeline yet).
      const audio = await getGalleryAudio(list[0].clipId);
      const saved = await getTimeline(projectId);
      let tl: Timeline;
      if (saved && saved.tracks.some((t) => t.type === 'photo' || t.type === 'video')) {
        tl = saved;
      } else {
        const duration = audio ? await audioDuration(audio) : 0;
        tl = seedTimelineFromScenes(projectId, list, duration);
        await saveTimeline(tl);
      }

      // Poster frames for the video lane.
      for (const asset of tl.assets) {
        if (asset.type !== 'video') continue;
        const blob = await getAsset(asset.id);
        if (!blob) continue;
        const poster = await capturePoster(blob);
        if (poster) map[asset.id] = URL.createObjectURL(poster);
      }

      // Overlay (PiP/logo) image thumbnails — any image asset not already loaded above as a
      // storyboard scene (those are user-added overlays, stored in timelineAssetRepo).
      for (const asset of tl.assets) {
        if (asset.type !== 'image' || map[asset.id]) continue;
        const blob = await getAsset(asset.id);
        if (blob) map[asset.id] = URL.createObjectURL(blob);
      }

      if (cancelled) {
        Object.values(map).forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urls = Object.values(map);
      audioRef.current = audio;
      audioObjUrl = audio ? URL.createObjectURL(audio) : null;
      setImageUrls(map);
      setAudioUrl(audioObjUrl);
      setScenes(list);
      setTimeline(tl);
    })();

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (audioObjUrl) URL.revokeObjectURL(audioObjUrl);
      setImageUrls({});
      setAudioUrl(null);
    };
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const voiceClip = scenes?.length ? clips.find((c) => c.id === scenes[0].clipId) ?? null : null;
  const clipTitle = (c: GalleryItem) => c.title || c.text.slice(0, 32) || 'Untitled';

  const addVideo = () => videoInput.current?.click();

  const onVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !timeline || !projectId) return;
    try {
      const meta = await probeVideo(file);
      const assetId = `vid-${Date.now()}`;
      await saveAsset({
        id: assetId,
        projectId,
        type: 'video',
        blob: file,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
      });
      const next = appendVideoClip(timeline, assetId, meta.duration, {
        width: meta.width,
        height: meta.height,
      });
      await saveTimeline(next);
      const poster = await capturePoster(file);
      if (poster) {
        const url = URL.createObjectURL(poster);
        setImageUrls((m) => ({ ...m, [assetId]: url }));
      }
      setTimeline(next);
      toast(`Video added — ${meta.width}×${meta.height}, ${meta.duration.toFixed(1)}s.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add video.', 'error');
    }
  };

  const addMusicFile = () => musicInput.current?.click();

  const onMusicFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !timeline || !projectId) return;
    try {
      const dur = await audioDuration(file);
      if (dur <= 0) {
        toast('Could not read that audio file.', 'error');
        return;
      }
      const assetId = `aud-${Date.now()}`;
      await saveAsset({ id: assetId, projectId, type: 'audio', blob: file, duration: dur });
      const next = addMusic(timeline, assetId, dur, { volume: 0.3 });
      await saveTimeline(next);
      setTimeline(next);
      toast(`Music added — ${dur.toFixed(1)}s. Select it on the timeline to set volume/fades.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add music.', 'error');
    }
  };

  const addOverlay = () => overlayInput.current?.click();

  const onOverlayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !timeline || !projectId) return;
    try {
      const assetId = `ovl-${Date.now()}`;
      await saveAsset({ id: assetId, projectId, type: 'image', blob: file });
      const next = addOverlayImage(timeline, assetId);
      await saveTimeline(next);
      const url = URL.createObjectURL(file);
      setImageUrls((m) => ({ ...m, [assetId]: url }));
      setTimeline(next);
      toast('Overlay added — select it on the timeline to position/resize.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add that image.', 'error');
    }
  };

  // Persist every edit — the timeline is the source of truth (see the load effect above).
  const commit = (next: Timeline) => {
    setTimeline(next);
    void saveTimeline(next);
  };

  const resync = async () => {
    if (!projectId || !scenes?.length || !timeline) return;
    if (
      !window.confirm(
        'Re-sync rebuilds the photo, caption, and audio tracks from the current storyboard and discards manual edits to them (reorder / trim / split / delete). Videos you added are kept. Continue?',
      )
    )
      return;
    const audio = audioRef.current ?? (await getGalleryAudio(scenes[0].clipId));
    const duration = audio ? await audioDuration(audio) : 0;
    const seeded = seedTimelineFromScenes(projectId, scenes, duration);
    const merged = mergeAddedMedia(seeded, timeline);
    await saveTimeline(merged);
    setTimeline(merged);
    toast('Timeline re-synced from storyboard.');
  };

  const exportVideo = async () => {
    if (!timeline || !scenes?.length || exporting) return;
    const missing = scenes.filter((s) => !s.hasImage).length;
    if (
      missing > 0 &&
      !window.confirm(
        `${missing} scene${missing === 1 ? ' has' : 's have'} no image yet — they will render as dark placeholder cards. Export anyway?`,
      )
    )
      return;
    setExporting(true);
    try {
      const audio = audioRef.current ?? (await getGalleryAudio(scenes[0].clipId));
      if (!audio) {
        toast('Audio for the voiceover clip is missing.', 'error');
        return;
      }
      const mp4 = await exportTimelineVideo(timeline, scenes, audio);
      const url = URL.createObjectURL(mp4);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(project?.name ?? 'video')}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Video exported.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (projects.length === 0)
    return (
      <div className="empty-state">
        <div className="empty-icon">🎞</div>
        <h2>No projects yet</h2>
        <p>The timeline is built from a project’s storyboard. Create a project and build its storyboard first.</p>
      </div>
    );

  const ready = !!timeline && !!scenes && scenes.length > 0;

  return (
    <>
      <div className="chip-row">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`chip${projectId === p.id ? ' active' : ''}`}
            onClick={() => setProjectId(p.id)}
          >
            📁 {p.name}
          </button>
        ))}
        <div className="chip-row-spacer" />
        {ready && (
          <>
            <button className="chip" onClick={resync}>
              🔄 Re-sync
            </button>
            <button className="chip" onClick={addVideo}>
              🎬 Add video
            </button>
            <button className="chip" onClick={addMusicFile}>
              🎵 Add music
            </button>
            <button className="chip" onClick={addOverlay}>
              🖼 Add overlay
            </button>
            <button className="chip" disabled={exporting} onClick={exportVideo}>
              {exporting ? 'Rendering…' : '⬇ Export mp4'}
            </button>
          </>
        )}
      </div>

      {scenes === null ? (
        <div className="spinner" />
      ) : scenes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎬</div>
          <h2>No storyboard yet</h2>
          <p>Build this project’s storyboard in the Storyboard tab, then come back to see it on the timeline.</p>
        </div>
      ) : timeline ? (
        <>
          {voiceClip && (
            <div className="vtag sb-meta">
              Seeded from <strong>{clipTitle(voiceClip)}</strong> · {timeline.outputWidth}×
              {timeline.outputHeight} @ {timeline.fps}fps · reorder / trim / split / delete clips,
              add video, then export
            </div>
          )}
          <TimelineEditor
            timeline={timeline}
            imageUrls={imageUrls}
            audioUrl={audioUrl}
            onChange={commit}
          />
        </>
      ) : (
        <div className="spinner" />
      )}

      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={onVideoFile}
      />
      <input
        ref={musicInput}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={onMusicFile}
      />
      <input
        ref={overlayInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onOverlayFile}
      />
    </>
  );
}
