import { useEffect, useRef, useState } from 'react';
import { generateScenes, generateSceneImage, renderVideo, transcribeAudio } from '../../core/api';
import { Icon } from '../../core/Icon';
import { useToast } from '../../core/toast';
import { slugify, type GalleryItem, type Project, type StoredScene } from '../../core/types';
import { getGalleryAudio, listGallery, updateGalleryItem } from '../gallery/galleryRepo';
import { listProjects } from '../projects/projectRepo';
import { compositeFrame } from './composite';
import {
  deleteScene,
  getSceneImage,
  listScenes,
  reorderScenes,
  replaceScenes,
  setSceneImage,
  updateScene,
} from './sceneRepo';
import { StoryboardPreview } from './StoryboardPreview';

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function StoryboardScreen() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [clips, setClips] = useState<GalleryItem[]>([]);
  const [clipId, setClipId] = useState('');
  const [scenes, setScenes] = useState<StoredScene[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listProjects().then((list) => {
      setProjects(list);
      setProjectId((id) => id ?? list[0]?.id ?? null);
    });
    listGallery().then(setClips);
  }, []);

  // Load the active project's storyboard + scene images.
  useEffect(() => {
    if (!projectId) {
      setScenes(null);
      return;
    }
    let cancelled = false;
    let urls: string[] = [];
    setScenes(null);
    listScenes(projectId).then(async (list) => {
      if (cancelled) return;
      setScenes(list);
      const map: Record<string, string> = {};
      for (const scene of list) {
        if (!scene.hasImage) continue;
        const blob = await getSceneImage(scene.id);
        if (blob) map[scene.id] = URL.createObjectURL(blob);
      }
      if (cancelled) {
        Object.values(map).forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urls = Object.values(map);
      setImageUrls(map);
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
      setImageUrls({});
    };
  }, [projectId]);

  const projectClips = clips.filter((c) => c.projectId === projectId);
  const voiceClipId = scenes?.length ? scenes[0].clipId : clipId || projectClips[0]?.id || '';
  const voiceClip = clips.find((c) => c.id === voiceClipId) ?? null;
  const clipTitle = (c: GalleryItem) => c.title || c.text.slice(0, 32) || 'Untitled';

  const generate = async () => {
    const clip = clips.find((c) => c.id === voiceClipId);
    if (!clip || !projectId || busy) return;
    if (scenes?.length && !window.confirm('Regenerate the storyboard? Current scenes and their images will be replaced.'))
      return;
    setBusy(true);
    try {
      let transcript = clip.transcript;
      if (!transcript) {
        const blob = await getGalleryAudio(clip.id);
        if (!blob) {
          toast('Audio for this clip is missing.', 'error');
          return;
        }
        transcript = await transcribeAudio(blob, `${slugify(clipTitle(clip))}.mp3`);
        await updateGalleryItem(clip.id, { transcript });
        setClips((list) => list.map((c) => (c.id === clip.id ? { ...c, transcript } : c)));
      }
      const proposed = await generateScenes(transcript);
      const stored = await replaceScenes(projectId, clip.id, proposed);
      Object.values(imageUrls).forEach((u) => URL.revokeObjectURL(u));
      setImageUrls({});
      setScenes(stored);
      toast(`Storyboard created — ${stored.length} scenes.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Storyboard generation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickImage = (sceneId: string) => {
    uploadFor.current = sceneId;
    fileInput.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sceneId = uploadFor.current;
    e.target.value = '';
    if (!file || !sceneId) return;
    await setSceneImage(sceneId, file);
    setImageUrls((map) => {
      if (map[sceneId]) URL.revokeObjectURL(map[sceneId]);
      return { ...map, [sceneId]: URL.createObjectURL(file) };
    });
    setScenes((list) => list?.map((s) => (s.id === sceneId ? { ...s, hasImage: true } : s)) ?? null);
  };

  const removeImage = async (sceneId: string) => {
    await setSceneImage(sceneId, undefined);
    setImageUrls((map) => {
      if (map[sceneId]) URL.revokeObjectURL(map[sceneId]);
      const { [sceneId]: _gone, ...rest } = map;
      return rest;
    });
    setScenes((list) => list?.map((s) => (s.id === sceneId ? { ...s, hasImage: false } : s)) ?? null);
  };

  const generateImage = async (scene: StoredScene): Promise<boolean> => {
    if (generatingIds.has(scene.id)) return false;
    setGeneratingIds((s) => new Set(s).add(scene.id));
    try {
      const blob = await generateSceneImage(scene.imagePrompt);
      await setSceneImage(scene.id, blob);
      setImageUrls((map) => {
        if (map[scene.id]) URL.revokeObjectURL(map[scene.id]);
        return { ...map, [scene.id]: URL.createObjectURL(blob) };
      });
      setScenes((list) => list?.map((s) => (s.id === scene.id ? { ...s, hasImage: true } : s)) ?? null);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Image generation failed.', 'error');
      return false;
    } finally {
      setGeneratingIds((s) => {
        const next = new Set(s);
        next.delete(scene.id);
        return next;
      });
    }
  };

  // Sequential with a short pause between calls — Gemini's free tier is rate-limited
  // per minute, and a burst of parallel image requests trips it immediately.
  const generateAllImages = async () => {
    if (!scenes || batchGenerating) return;
    const missing = scenes.filter((s) => !s.hasImage);
    if (missing.length === 0) return;
    setBatchGenerating(true);
    let ok = 0;
    for (let i = 0; i < missing.length; i++) {
      if (await generateImage(missing[i])) ok++;
      if (i < missing.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }
    setBatchGenerating(false);
    if (ok === missing.length) toast(`Generated ${ok} scene image${ok === 1 ? '' : 's'}.`);
    else if (ok > 0) toast(`Generated ${ok}/${missing.length} scene images — some failed.`, 'info');
    else toast('Image generation failed for all scenes.', 'error');
  };

  // Deleting a scene closes the timeline gap: the previous scene absorbs its slot
  // (or the next scene starts earlier if the first scene was removed).
  const removeScene = async (scene: StoredScene, index: number) => {
    if (!projectId || !scenes) return;
    await deleteScene(scene.id);
    const prev = scenes[index - 1];
    const next = scenes[index + 1];
    if (prev) await updateScene(prev.id, { end: scene.end });
    else if (next) await updateScene(next.id, { start: scene.start });
    if (imageUrls[scene.id]) URL.revokeObjectURL(imageUrls[scene.id]);
    setImageUrls(({ [scene.id]: _gone, ...rest }) => rest);
    setScenes(await listScenes(projectId));
    toast('Scene removed.', 'info');
  };

  const onDrop = async (targetIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex || !projectId || !scenes) return;
    const ids = scenes.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(targetIndex, 0, moved);
    setScenes(await reorderScenes(projectId, ids));
    toast('Scenes reordered — times re-anchored.', 'info');
  };

  const copyPrompt = async (scene: StoredScene, index: number) => {
    await navigator.clipboard.writeText(scene.imagePrompt);
    toast(`Scene ${index + 1} prompt copied.`);
  };

  const exportVideo = async () => {
    if (!scenes?.length || !voiceClip || exporting) return;
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
      const audio = await getGalleryAudio(voiceClip.id);
      if (!audio) {
        toast('Audio for the voiceover clip is missing.', 'error');
        return;
      }
      const payload = await Promise.all(
        scenes.map(async (s) => ({
          start: s.start,
          end: s.end,
          image: await compositeFrame(
            s.hasImage ? await getSceneImage(s.id) : null,
            s.narration,
            true, // captions burn-in
          ),
        })),
      );
      const mp4 = await renderVideo(audio, payload);
      const project = projects.find((p) => p.id === projectId);
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
        <div className="empty-icon">
          <Icon name="movie" />
        </div>
        <h2>No projects yet</h2>
        <p>A storyboard turns one project into one video. Create a project in the Gallery and save a voiceover take into it first.</p>
      </div>
    );

  return (
    <>
      <div className="chip-row">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`chip${projectId === p.id ? ' active' : ''}`}
            onClick={() => setProjectId(p.id)}
          >
            <Icon name="folder" /> {p.name}
          </button>
        ))}
        <div className="chip-row-spacer" />
        {scenes && scenes.length > 0 && (
          <>
            <button className="chip" disabled={busy} onClick={generate}>
              {busy ? (
                'Working…'
              ) : (
                <>
                  <Icon name="refresh" /> Regenerate
                </>
              )}
            </button>
            {scenes.some((s) => !s.hasImage) && (
              <button className="chip" disabled={batchGenerating} onClick={generateAllImages}>
                {batchGenerating ? (
                  'Generating…'
                ) : (
                  <>
                    <Icon name="auto_awesome" /> Generate images
                  </>
                )}
              </button>
            )}
            <button className="chip" onClick={() => setPreviewOpen(true)}>
              <Icon name="play_arrow" /> Preview
            </button>
            <button className="chip" disabled={exporting} onClick={exportVideo}>
              {exporting ? (
                'Rendering…'
              ) : (
                <>
                  <Icon name="download" /> Export mp4
                </>
              )}
            </button>
          </>
        )}
      </div>

      {scenes === null ? (
        <div className="spinner" />
      ) : scenes.length === 0 ? (
        projectClips.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="headphones" />
            </div>
            <h2>No clips in this project</h2>
            <p>Save a voiceover take into this project from the Studio, then come back to build its storyboard.</p>
          </div>
        ) : (
          <div className="sb-setup card">
            <h3>New storyboard</h3>
            <p className="field-hint">
              The voiceover is the master clock: it gets transcribed with word timestamps, then AI
              proposes timed scenes with image prompts.
            </p>
            <label className="field-label">
              Voiceover clip
              <select className="text-field" value={voiceClipId} onChange={(e) => setClipId(e.target.value)}>
                {projectClips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clipTitle(c)}
                  </option>
                ))}
              </select>
            </label>
            <button className="generate-btn" disabled={busy || !voiceClipId} onClick={generate}>
              {busy ? (
                'Transcribing & generating…'
              ) : (
                <>
                  <Icon name="movie" /> Generate storyboard
                </>
              )}
            </button>
          </div>
        )
      ) : (
        <div className="sb-list">
          {voiceClip && (
            <div className="vtag sb-meta">
              Voiceover: <strong>{clipTitle(voiceClip)}</strong> · {scenes.length} scenes · drag to
              reorder · click a slot to add its image
            </div>
          )}
          {scenes.map((scene, i) => (
            <div
              key={scene.id}
              className="card sb-scene"
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
            >
              <button
                className={`sb-thumb${imageUrls[scene.id] ? '' : ' empty'}`}
                title={scene.hasImage ? 'Replace image' : 'Add image'}
                onClick={() => pickImage(scene.id)}
              >
                {imageUrls[scene.id] ? (
                  <img src={imageUrls[scene.id]} alt={`Scene ${i + 1}`} />
                ) : (
                  <span>
                    <Icon name="add_a_photo" /> image
                  </span>
                )}
              </button>
              <div className="sb-body">
                <div className="sb-head mono">
                  Scene {i + 1} · {fmtTime(scene.start)}–{fmtTime(scene.end)}
                </div>
                <p className="scene-narration">“{scene.narration}”</p>
                <p className="scene-prompt">{scene.imagePrompt}</p>
              </div>
              <div className="sb-actions">
                <button
                  className="icon-btn"
                  title={scene.hasImage ? 'Regenerate image with AI' : 'Generate image with AI'}
                  disabled={generatingIds.has(scene.id)}
                  onClick={() => generateImage(scene)}
                >
                  <Icon name="auto_awesome" className={generatingIds.has(scene.id) ? 'icon-spin' : undefined} />
                </button>
                <button className="icon-btn" title="Copy image prompt" onClick={() => copyPrompt(scene, i)}>
                  <Icon name="content_copy" />
                </button>
                {scene.hasImage && (
                  <button className="icon-btn" title="Remove image" onClick={() => removeImage(scene.id)}>
                    <Icon name="hide_image" />
                  </button>
                )}
                <button className="icon-btn" title="Delete scene" onClick={() => removeScene(scene, i)}>
                  <Icon name="delete" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFile}
      />

      {previewOpen && scenes && voiceClip && (
        <StoryboardPreview
          scenes={scenes}
          imageUrls={imageUrls}
          clipId={voiceClip.id}
          title={clipTitle(voiceClip)}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
