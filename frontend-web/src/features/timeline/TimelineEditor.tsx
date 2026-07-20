import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICEOVER_ASSET_ID } from './model/seed';
import {
  cropFromZoomPan,
  DEFAULT_MOTION,
  deleteClip,
  isOverlayTrack,
  MAX_ROTATION,
  MAX_ZOOM,
  maxTransitionDuration,
  MIN_CLIP,
  MIN_TRANSITION,
  moveClip,
  removeTrack,
  setClipFade,
  setClipTransition,
  setCrop,
  setMotion,
  setOverlayTransform,
  setRotation,
  setTrackAudio,
  splitClip,
  trimClip,
  zoomPanFromCrop,
} from './model/timelineOps';
import type { Clip, KenBurns, Timeline, Track, TrackType, TransitionStyle } from './model/types';
import { timelineDuration } from './model/types';

/** Lane display order (top → bottom) and labels. */
const LANE_ORDER: TrackType[] = ['video', 'photo', 'caption', 'audio'];
const LANE_LABEL: Record<TrackType, string> = {
  video: 'Video',
  photo: 'Photo',
  caption: 'Captions',
  audio: 'Audio',
};

/** Zoom bounds (pixels per timeline second) and the pointer-drag snap threshold in screen px. */
const MIN_PPS = 20;
const MAX_PPS = 400;
const DEFAULT_PPS = 70;
const SNAP_PX = 8;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function tickStep(total: number): number {
  if (total <= 15) return 2;
  if (total <= 40) return 5;
  if (total <= 90) return 10;
  return 15;
}

const isVisualType = (t: TrackType) => t === 'photo' || t === 'video';

/** Transient trim gesture state (committed on pointer-up). */
interface TrimDrag {
  clipId: string;
  edge: 'start' | 'end';
  startX: number;
  laneWidth: number;
  clipStart: number;
  startDuration: number;
  startInPoint: number;
  duration: number;
  inPoint: number;
}

/**
 * Interactive timeline (Greyvetro Studio Phase 5/6). Each track is a lane, each clip a bar. Base
 * visual clips can be selected, dragged to reorder, trimmed at either edge (snapping to nearby
 * clip edges/the playhead), split at the playhead, reframed (zoom/pan/tilt/motion), given a
 * crossfade from the clip before them, and deleted; the model stays contiguous (the base track is
 * a `concat`, or an `xfade` fold where transitions are set). A zoom control scales the ruler/lanes
 * (pixels-per-second) with independent horizontal scroll, labels pinned. Overlay (PiP/logo) tracks
 * — a photo/video track above the base zIndex, Phase 3c — float freely: one clip, end-trim only,
 * positioned/scaled via its own inspector, like music. Edits are pure (see model/timelineOps.ts)
 * and flow up via onChange for persistence + render; onUndo/onRedo drive the caller's history stack.
 */
export function TimelineEditor({
  timeline,
  imageUrls,
  audioUrl,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  timeline: Timeline;
  imageUrls: Record<string, string>;
  audioUrl: string | null;
  onChange: (next: Timeline) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const total = Math.max(timelineDuration(timeline), 0.001);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [trim, setTrim] = useState<TrimDrag | null>(null);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PPS);
  const dragId = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ t0: number; p0: number } | null>(null);

  const ph = Math.min(playhead, total);
  const pxWidth = Math.max(320, total * pxPerSecond);

  const zoomBy = (factor: number) =>
    setPxPerSecond((p) => Math.min(MAX_PPS, Math.max(MIN_PPS, p * factor)));
  const zoomToFit = () => {
    const width = scrollRef.current?.clientWidth ?? 800;
    setPxPerSecond(Math.min(MAX_PPS, Math.max(MIN_PPS, width / total)));
  };

  // Playback: a rAF clock advances the playhead (master), the voiceover follows, and the frame
  // preview swaps stills as `ph` moves. Video clips show their poster in preview (motion is an
  // export-only concern this phase). Manual scrubs/edits stop playback.
  const stop = useCallback(() => {
    setPlaying(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    clockRef.current = null;
    audioElRef.current?.pause();
  }, []);

  useEffect(() => stop, [stop]);

  const togglePlay = () => {
    if (playing) {
      stop();
      return;
    }
    const startAt = ph >= total ? 0 : ph;
    setPlayhead(startAt);
    const audio = audioElRef.current;
    if (audio) {
      try {
        audio.currentTime = startAt;
      } catch {
        /* metadata not ready yet — play() will start from 0 */
      }
      void audio.play().catch(() => {});
    }
    clockRef.current = { t0: performance.now(), p0: startAt };
    setPlaying(true);
    const tick = () => {
      const c = clockRef.current;
      if (!c) return;
      const np = c.p0 + (performance.now() - c.t0) / 1000;
      if (np >= total) {
        setPlayhead(total);
        stop();
        return;
      }
      setPlayhead(np);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const scrubTo = (t: number) => {
    stop();
    setPlayhead(t);
  };

  const tracks = [...timeline.tracks].sort(
    (a, b) => LANE_ORDER.indexOf(a.type) - LANE_ORDER.indexOf(b.type),
  );
  const overlay = (trackId: string) => isOverlayTrack(timeline, trackId);

  // Flattened BASE visual clips in play order (drives the background preview + the "keep at least
  // one" guard). Overlay (PiP/logo) clips are excluded — they composite on top, not as the frame.
  const visualClips = timeline.tracks
    .filter((t) => isVisualType(t.type) && !overlay(t.id))
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startTime - b.startTime);
  const visualCount = visualClips.length;

  const selectedClip = selected
    ? timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === selected) ?? null
    : null;
  const selTrack = selected
    ? timeline.tracks.find((t) => t.clips.some((c) => c.id === selected)) ?? null
    : null;
  const selectedIsVisual = !!selectedClip && !!selTrack && isVisualType(selTrack.type) && !overlay(selTrack.id);
  const localPlayhead = selectedClip ? ph - selectedClip.startTime : 0;

  // A selected music clip (an audio clip that isn't the seeded voiceover) opens the audio inspector.
  const selMusic =
    selTrack && selectedClip && selTrack.type === 'audio' && selectedClip.sourceId !== VOICEOVER_ASSET_ID
      ? { track: selTrack, clip: selectedClip }
      : null;
  // A selected overlay (PiP/logo) clip opens the position/scale inspector.
  const selOverlay =
    selTrack && selectedClip && isVisualType(selTrack.type) && overlay(selTrack.id)
      ? { track: selTrack, clip: selectedClip }
      : null;

  // A selected transition boundary (Phase 6) opens the transition inspector.
  const transitionClip = selectedTransition
    ? timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedTransition) ?? null
    : null;
  const transitionMax = selectedTransition ? maxTransitionDuration(timeline, selectedTransition) : 0;

  const canSplit =
    selectedIsVisual && localPlayhead > MIN_CLIP && localPlayhead < (selectedClip?.duration ?? 0) - MIN_CLIP;
  const canDelete = (selectedIsVisual && visualCount > 1) || !!selMusic || !!selOverlay;

  const onDelete = () => {
    if (!selected) return;
    if (selMusic) {
      stop();
      onChange(removeTrack(timeline, selMusic.track.id));
      setSelected(null);
    } else if (selOverlay) {
      stop();
      onChange(removeTrack(timeline, selOverlay.track.id));
      setSelected(null);
    } else if (selectedIsVisual && visualCount > 1) {
      stop();
      onChange(deleteClip(timeline, selected));
      setSelected(null);
    }
  };
  // Keep the key handler calling the latest onDelete without re-subscribing on every render.
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const selectClip = (id: string) => {
    setSelectedTransition(null);
    setSelected(id);
  };
  const selectTransition = (id: string) => {
    setSelected(null);
    setSelectedTransition(id);
  };

  // Frame shown in the preview: the base visual clip under the playhead, plus any active caption.
  // While paused with a base clip selected, the preview locks to that clip so reframe edits are
  // WYSIWYG. Overlay (PiP/logo) clips active at the playhead composite on top, positioned/scaled.
  const activeVisual = visualClips.find((c) => ph >= c.startTime && ph < c.startTime + c.duration)
    ?? visualClips[visualClips.length - 1];
  const previewClip = !playing && selectedIsVisual && selectedClip ? selectedClip : activeVisual;
  const activeCaption = timeline.tracks
    .find((t) => t.type === 'caption')
    ?.clips.find((c) => ph >= c.startTime && ph < c.startTime + c.duration)?.text;
  const activeOverlays = timeline.tracks
    .filter((t) => isVisualType(t.type) && overlay(t.id))
    .flatMap((t) => t.clips)
    .filter((c) => ph >= c.startTime && ph < c.startTime + c.duration);

  // Reflect a clip's crop/reframe + tilt (or, for a motion clip, the Ken Burns keyframe lerped to
  // the current playhead position within it) in the preview via CSS — approximate, the exact
  // source-crop cover-fit + auto-zoomed rotation/zoompan happens at export; §4 preview is for
  // feedback, not pixel parity. Motion takes precedence, mirroring the compiler (ZoompanChain
  // ignores static Crop/Rotation on an animated clip).
  const previewTransform: string[] = [];
  let transformOriginPct = { x: 50, y: 50 };
  if (previewClip?.motion) {
    const localT =
      previewClip.duration > 0
        ? Math.min(Math.max((ph - previewClip.startTime) / previewClip.duration, 0), 1)
        : 0;
    const { from, to } = previewClip.motion;
    const zoom = from.zoom + (to.zoom - from.zoom) * localT;
    const panX = from.panX + (to.panX - from.panX) * localT;
    const panY = from.panY + (to.panY - from.panY) * localT;
    if (zoom > 1.001) previewTransform.push(`scale(${zoom.toFixed(4)})`);
    transformOriginPct = { x: panX * 100, y: panY * 100 };
  } else {
    if (previewClip?.crop) previewTransform.push(`scale(${(1 / previewClip.crop.width).toFixed(4)})`);
    if (previewClip?.rotation) previewTransform.push(`rotate(${previewClip.rotation}deg)`);
    if (previewClip?.crop)
      transformOriginPct = {
        x: (previewClip.crop.x + previewClip.crop.width / 2) * 100,
        y: (previewClip.crop.y + previewClip.crop.height / 2) * 100,
      };
  }
  const cropStyle = previewTransform.length
    ? {
        transform: previewTransform.join(' '),
        transformOrigin: `${transformOriginPct.x.toFixed(2)}% ${transformOriginPct.y.toFixed(2)}%`,
      }
    : undefined;

  // Reframe inspector state for a selected visual clip (zoom + pan-center <-> the stored crop rect).
  const zoomPan = selectedIsVisual && selectedClip ? zoomPanFromCrop(selectedClip.crop) : null;
  const applyCrop = (zoom: number, panX: number, panY: number) => {
    if (!selectedClip) return;
    // Zoom back to 1 clears the crop (full frame); otherwise store the derived rect.
    onChange(setCrop(timeline, selectedClip.id, zoom <= 1.001 ? null : cropFromZoomPan(zoom, panX, panY)));
  };
  const applyRotation = (degrees: number) => {
    if (!selectedClip) return;
    onChange(setRotation(timeline, selectedClip.id, degrees));
  };
  const applyMotion = (patch: { from?: Partial<KenBurns>; to?: Partial<KenBurns> }) => {
    if (!selectedClip?.motion) return;
    onChange(
      setMotion(timeline, selectedClip.id, {
        from: { ...selectedClip.motion.from, ...patch.from },
        to: { ...selectedClip.motion.to, ...patch.to },
      }),
    );
  };
  const applyOverlayTransform = (patch: { position?: { x: number; y: number }; scale?: number }) => {
    if (!selOverlay) return;
    onChange(setOverlayTransform(timeline, selOverlay.clip.id, patch));
  };
  const applyTransition = (style: TransitionStyle, duration: number) => {
    if (!transitionClip) return;
    onChange(setClipTransition(timeline, transitionClip.id, { style, duration }));
  };

  // Split / delete / undo-redo keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      if (e.key === 'Escape') {
        setSelected(null);
        setSelectedTransition(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && canDelete) {
        e.preventDefault();
        onDeleteRef.current();
      } else if ((e.key === 's' || e.key === 'S') && canSplit && selected) {
        e.preventDefault();
        stop();
        onChange(splitClip(timeline, selected, localPlayhead));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        stop();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else if (canUndo) onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline, selected, canDelete, canSplit, localPlayhead, onChange, stop, canUndo, canRedo, onUndo, onRedo]);

  const timeFromEvent = (e: { clientX: number }, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    return Math.min(Math.max(((e.clientX - rect.left) / rect.width) * total, 0), total);
  };

  // Snap candidates for a trim drag: timeline bounds, the playhead, and every OTHER clip's start/
  // end across all tracks. Returns the nearest candidate within the pixel threshold, else null.
  const snapCandidate = (t: number, excludeClipId: string): number | null => {
    const thresholdSec = SNAP_PX / pxPerSecond;
    const candidates = [0, total, ph];
    for (const track of timeline.tracks)
      for (const c of track.clips) {
        if (c.id === excludeClipId) continue;
        candidates.push(c.startTime, c.startTime + c.duration);
      }
    let best: number | null = null;
    let bestDist = thresholdSec;
    for (const c of candidates) {
      const d = Math.abs(c - t);
      if (d <= bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  };

  const onTrimPointerMove = (e: React.PointerEvent) => {
    if (!trim) return;
    const dt = ((e.clientX - trim.startX) / trim.laneWidth) * total;
    const rawEdge = trim.edge === 'end' ? trim.clipStart + trim.startDuration + dt : trim.clipStart + dt;
    const snapped = snapCandidate(rawEdge, trim.clipId);
    setSnapGuide(snapped);
    const edge = snapped ?? rawEdge;

    if (trim.edge === 'end') {
      setTrim({ ...trim, duration: Math.max(MIN_CLIP, edge - trim.clipStart) });
    } else {
      // Left edge: keep the right edge fixed — shrink/grow duration, move the source window.
      const snappedDt = edge - trim.clipStart;
      setTrim({
        ...trim,
        duration: Math.max(MIN_CLIP, trim.startDuration - snappedDt),
        inPoint: Math.max(0, trim.startInPoint + snappedDt),
      });
    }
  };

  const onTrimPointerUp = () => {
    if (trim) onChange(trimClip(timeline, trim.clipId, { inPoint: trim.inPoint, duration: trim.duration }));
    setTrim(null);
    setSnapGuide(null);
  };

  const step = tickStep(total);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += step) ticks.push(t);

  return (
    <div className="tl card" onPointerMove={onTrimPointerMove} onPointerUp={onTrimPointerUp}>
      <audio ref={audioElRef} src={audioUrl ?? undefined} preload="auto" />
      <div className="tl-head">
        <div className="tl-preview" aria-hidden>
          {previewClip && imageUrls[previewClip.sourceId] ? (
            <img src={imageUrls[previewClip.sourceId]} alt="" style={cropStyle} />
          ) : (
            <div className="tl-preview-empty">🎬</div>
          )}
          {activeOverlays.map((c) =>
            imageUrls[c.sourceId] ? (
              <img
                key={c.id}
                className="tl-preview-overlay"
                src={imageUrls[c.sourceId]}
                alt=""
                style={{
                  left: `${(c.position?.x ?? 0) * 100}%`,
                  top: `${(c.position?.y ?? 0) * 100}%`,
                  width: `${(c.scale ?? 0.3) * 100}%`,
                }}
              />
            ) : null,
          )}
          {activeCaption && <div className="tl-preview-caption">{activeCaption}</div>}
        </div>

        <div className="tl-tools">
          <div className="tl-tools-row">
            <button className="chip" onClick={togglePlay}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              className="chip"
              disabled={!canSplit}
              onClick={() => {
                if (selected) {
                  stop();
                  onChange(splitClip(timeline, selected, localPlayhead));
                }
              }}
            >
              ✂ Split
            </button>
            <button className="chip" disabled={!canDelete} onClick={onDelete}>
              {selMusic ? '🗑 Remove music' : selOverlay ? '🗑 Remove overlay' : '🗑 Delete'}
            </button>
            <button className="chip" disabled={!canUndo} onClick={() => { stop(); onUndo(); }}>
              ↩ Undo
            </button>
            <button className="chip" disabled={!canRedo} onClick={() => { stop(); onRedo(); }}>
              ↪ Redo
            </button>
          </div>
          <div className="tl-tools-row">
            <button className="chip" onClick={() => zoomBy(1 / 1.4)}>
              🔍−
            </button>
            <span className="mono tl-zoom-label">{Math.round(pxPerSecond)}px/s</span>
            <button className="chip" onClick={() => zoomBy(1.4)}>
              🔍+
            </button>
            <button className="chip" onClick={zoomToFit}>
              Fit
            </button>
          </div>
          <div className="tl-tools-meta mono">
            Playhead {ph.toFixed(1)}s / {total.toFixed(1)}s
            {selectedClip && (selectedIsVisual || selMusic || selOverlay) && (
              <> · selected {selectedClip.duration.toFixed(1)}s</>
            )}
          </div>

          {selMusic ? (
            <div className="tl-audio-inspector">
              <label>
                Vol
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selMusic.track.volume ?? 1}
                  onChange={(e) =>
                    onChange(setTrackAudio(timeline, selMusic.track.id, { volume: Number(e.target.value) }))
                  }
                />
                <span className="mono">{Math.round((selMusic.track.volume ?? 1) * 100)}%</span>
              </label>
              <label className="tl-check">
                <input
                  type="checkbox"
                  checked={!!selMusic.track.muted}
                  onChange={(e) =>
                    onChange(setTrackAudio(timeline, selMusic.track.id, { muted: e.target.checked }))
                  }
                />
                Mute
              </label>
              <label>
                Fade in
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={selMusic.clip.fadeIn ?? 0}
                  onChange={(e) =>
                    onChange(setClipFade(timeline, selMusic.clip.id, { fadeIn: Math.max(0, Number(e.target.value)) }))
                  }
                />
              </label>
              <label>
                Fade out
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={selMusic.clip.fadeOut ?? 0}
                  onChange={(e) =>
                    onChange(setClipFade(timeline, selMusic.clip.id, { fadeOut: Math.max(0, Number(e.target.value)) }))
                  }
                />
              </label>
            </div>
          ) : zoomPan && selectedClip?.motion ? (
            <div className="tl-transform-inspector">
              <div className="tl-motion-keyframe">
                <span className="tl-motion-label">Start</span>
                <label>
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={selectedClip.motion.from.zoom}
                    onChange={(e) => applyMotion({ from: { zoom: Number(e.target.value) } })}
                  />
                  <span className="mono">{selectedClip.motion.from.zoom.toFixed(2)}×</span>
                </label>
                <label>
                  Pan X
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={selectedClip.motion.from.panX}
                    onChange={(e) => applyMotion({ from: { panX: Number(e.target.value) } })}
                  />
                </label>
                <label>
                  Pan Y
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={selectedClip.motion.from.panY}
                    onChange={(e) => applyMotion({ from: { panY: Number(e.target.value) } })}
                  />
                </label>
              </div>
              <div className="tl-motion-keyframe">
                <span className="tl-motion-label">End</span>
                <label>
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={selectedClip.motion.to.zoom}
                    onChange={(e) => applyMotion({ to: { zoom: Number(e.target.value) } })}
                  />
                  <span className="mono">{selectedClip.motion.to.zoom.toFixed(2)}×</span>
                </label>
                <label>
                  Pan X
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={selectedClip.motion.to.panX}
                    onChange={(e) => applyMotion({ to: { panX: Number(e.target.value) } })}
                  />
                </label>
                <label>
                  Pan Y
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={selectedClip.motion.to.panY}
                    onChange={(e) => applyMotion({ to: { panY: Number(e.target.value) } })}
                  />
                </label>
              </div>
              <button className="chip" onClick={() => onChange(setMotion(timeline, selectedClip.id, null))}>
                Remove motion
              </button>
            </div>
          ) : zoomPan && selectedClip ? (
            <div className="tl-transform-inspector">
              <label>
                Zoom
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={zoomPan.zoom}
                  onChange={(e) => applyCrop(Number(e.target.value), zoomPan.panX, zoomPan.panY)}
                />
                <span className="mono">{zoomPan.zoom.toFixed(2)}×</span>
              </label>
              <label>
                Pan X
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={zoomPan.panX}
                  disabled={zoomPan.zoom <= 1.001}
                  onChange={(e) => applyCrop(zoomPan.zoom, Number(e.target.value), zoomPan.panY)}
                />
              </label>
              <label>
                Pan Y
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={zoomPan.panY}
                  disabled={zoomPan.zoom <= 1.001}
                  onChange={(e) => applyCrop(zoomPan.zoom, zoomPan.panX, Number(e.target.value))}
                />
              </label>
              <label>
                Tilt
                <input
                  type="range"
                  min={-MAX_ROTATION}
                  max={MAX_ROTATION}
                  step={1}
                  value={selectedClip.rotation ?? 0}
                  onChange={(e) => applyRotation(Number(e.target.value))}
                />
                <span className="mono">{(selectedClip.rotation ?? 0).toFixed(0)}°</span>
              </label>
              <button
                className="chip"
                disabled={!selectedClip.crop && !selectedClip.rotation}
                onClick={() => {
                  onChange(setCrop(timeline, selectedClip.id, null));
                  applyRotation(0);
                }}
              >
                Reset framing
              </button>
              <button className="chip" onClick={() => onChange(setMotion(timeline, selectedClip.id, DEFAULT_MOTION))}>
                🎥 Add motion
              </button>
            </div>
          ) : selOverlay ? (
            <div className="tl-transform-inspector">
              <label>
                Pos X
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={selOverlay.clip.position?.x ?? 0}
                  onChange={(e) => applyOverlayTransform({ position: { x: Number(e.target.value), y: selOverlay.clip.position?.y ?? 0 } })}
                />
              </label>
              <label>
                Pos Y
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={selOverlay.clip.position?.y ?? 0}
                  onChange={(e) => applyOverlayTransform({ position: { x: selOverlay.clip.position?.x ?? 0, y: Number(e.target.value) } })}
                />
              </label>
              <label>
                Size
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.02}
                  value={selOverlay.clip.scale ?? 0.3}
                  onChange={(e) => applyOverlayTransform({ scale: Number(e.target.value) })}
                />
                <span className="mono">{Math.round((selOverlay.clip.scale ?? 0.3) * 100)}%</span>
              </label>
            </div>
          ) : transitionClip ? (
            <div className="tl-transition-inspector">
              {transitionMax < MIN_TRANSITION ? (
                <span className="tl-tools-hint">These clips are too short to fit a transition.</span>
              ) : (
                <>
                  <div className="tl-transition-styles">
                    <button
                      className={`chip${(transitionClip.transitionIn?.style ?? 'dissolve') === 'dissolve' && transitionClip.transitionIn ? ' active' : ''}`}
                      onClick={() =>
                        applyTransition('dissolve', transitionClip.transitionIn?.duration ?? Math.min(0.5, transitionMax))
                      }
                    >
                      Dissolve
                    </button>
                    <button
                      className={`chip${transitionClip.transitionIn?.style === 'fadeToBlack' ? ' active' : ''}`}
                      onClick={() =>
                        applyTransition('fadeToBlack', transitionClip.transitionIn?.duration ?? Math.min(0.5, transitionMax))
                      }
                    >
                      Fade to black
                    </button>
                  </div>
                  <label>
                    Duration
                    <input
                      type="range"
                      min={MIN_TRANSITION}
                      max={transitionMax}
                      step={0.05}
                      value={Math.min(transitionClip.transitionIn?.duration ?? Math.min(0.5, transitionMax), transitionMax)}
                      onChange={(e) =>
                        applyTransition(transitionClip.transitionIn?.style ?? 'dissolve', Number(e.target.value))
                      }
                    />
                    <span className="mono">
                      {Math.min(transitionClip.transitionIn?.duration ?? Math.min(0.5, transitionMax), transitionMax).toFixed(2)}s
                    </span>
                  </label>
                  <button
                    className="chip"
                    disabled={!transitionClip.transitionIn}
                    onClick={() => onChange(setClipTransition(timeline, transitionClip.id, null))}
                  >
                    Remove transition
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="tl-tools-hint">
              Click a clip to select · drag to reorder · drag an edge to trim (snaps to nearby
              edges/playhead) · click the ruler to move the playhead, then Split (S) or Delete ·
              Cmd/Ctrl+Z to undo. Select a scene to reframe (zoom/pan/tilt) or add Ken Burns motion;
              click the boundary between two clips for a transition; add music or an overlay, select
              it to adjust.
            </div>
          )}
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-labels">
          <div className="tl-ruler-spacer" />
          {tracks.map((track) => (
            <div key={track.id} className="tl-lane-label">
              {overlay(track.id) ? '🖼 Overlay' : LANE_LABEL[track.type]}
            </div>
          ))}
        </div>

        <div className="tl-scroll" ref={scrollRef}>
          <div
            className="tl-ruler"
            style={{ width: pxWidth }}
            onPointerDown={(e) => scrubTo(timeFromEvent(e, e.currentTarget))}
          >
            {ticks.map((t) => (
              <span key={t} className="tl-tick mono" style={{ left: `${(t / total) * 100}%` }}>
                {fmt(t)}
              </span>
            ))}
            <div className="tl-playhead" style={{ left: `${(ph / total) * 100}%` }} />
          </div>

          {tracks.map((track) => {
            const base = isVisualType(track.type) && !overlay(track.id);
            const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
            return (
              <div
                key={track.id}
                className="tl-lane-track"
                style={{ width: pxWidth }}
                onPointerDown={(e) => {
                  // Only bare-track clicks (not on a clip/badge) move the playhead.
                  if (e.target === e.currentTarget) scrubTo(timeFromEvent(e, e.currentTarget));
                }}
              >
                <div className="tl-playhead" style={{ left: `${(ph / total) * 100}%` }} />
                {snapGuide != null && trim?.clipId && sortedClips.some((c) => c.id === trim.clipId) && (
                  <div className="tl-snap-guide" style={{ left: `${(snapGuide / total) * 100}%` }} />
                )}
                {sortedClips.map((clip, i) => (
                  <ClipBar
                    key={clip.id}
                    clip={clip}
                    index={i}
                    track={track}
                    overlay={overlay(track.id)}
                    total={total}
                    thumb={imageUrls[clip.sourceId]}
                    selected={selected === clip.id}
                    dropTarget={dropTarget === clip.id}
                    trim={trim?.clipId === clip.id ? trim : null}
                    onSelect={() => selectClip(clip.id)}
                    onDragStart={() => {
                      if (isVisualType(track.type) && !overlay(track.id)) dragId.current = clip.id;
                    }}
                    onDragOver={() => {
                      if (dragId.current && dragId.current !== clip.id) setDropTarget(clip.id);
                    }}
                    onDrop={() => {
                      if (dragId.current && dragId.current !== clip.id) {
                        stop();
                        onChange(moveClip(timeline, dragId.current, clip.id));
                      }
                      dragId.current = null;
                      setDropTarget(null);
                    }}
                    onTrimStart={(edge, e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      stop();
                      selectClip(clip.id);
                      const lane = (e.currentTarget as HTMLElement).closest('.tl-lane-track');
                      setTrim({
                        clipId: clip.id,
                        edge,
                        startX: e.clientX,
                        laneWidth: lane?.getBoundingClientRect().width ?? 1,
                        clipStart: clip.startTime,
                        startDuration: clip.duration,
                        startInPoint: clip.inPoint,
                        duration: clip.duration,
                        inPoint: clip.inPoint,
                      });
                    }}
                  />
                ))}
                {base &&
                  sortedClips.slice(1).map((clip) => {
                    const max = maxTransitionDuration(timeline, clip.id);
                    if (max < MIN_TRANSITION) return null;
                    return (
                      <button
                        key={`xf-${clip.id}`}
                        type="button"
                        className={`tl-transition-badge${clip.transitionIn ? ' active' : ''}${selectedTransition === clip.id ? ' selected' : ''}`}
                        style={{ left: `${(clip.startTime / total) * 100}%` }}
                        title={
                          clip.transitionIn
                            ? `${clip.transitionIn.style === 'fadeToBlack' ? 'Fade to black' : 'Dissolve'} · ${clip.transitionIn.duration.toFixed(2)}s`
                            : 'Add a transition'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          selectTransition(clip.id);
                        }}
                      >
                        ⤭
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClipBar({
  clip,
  index,
  track,
  overlay,
  total,
  thumb,
  selected,
  dropTarget,
  trim,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onTrimStart,
}: {
  clip: Clip;
  index: number;
  track: Track;
  /** True when this clip's track is an overlay (PiP/logo) layer, not the base concat. */
  overlay: boolean;
  total: number;
  thumb?: string;
  selected: boolean;
  dropTarget: boolean;
  trim: TrimDrag | null;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onTrimStart: (edge: 'start' | 'end', e: React.PointerEvent) => void;
}) {
  // Part of the contiguous base concat (reorderable, trims both edges) — as opposed to an
  // overlay clip, which floats freely and only trims its end (like music).
  const base = isVisualType(track.type) && !overlay;
  const music = track.type === 'audio' && clip.sourceId !== VOICEOVER_ASSET_ID;
  const editable = base || overlay || music;
  const duration = trim ? trim.duration : clip.duration;
  const left = (clip.startTime / total) * 100;
  const width = (duration / total) * 100;
  const label = overlay
    ? '🖼 Overlay'
    : track.type === 'caption'
      ? clip.text ?? ''
      : track.type === 'audio'
        ? music
          ? '🎵 Music'
          : 'Voiceover'
        : track.type === 'video'
          ? `🎬 Video ${index + 1}`
          : `Scene ${index + 1}`;

  return (
    <div
      className={`tl-clip tl-clip-${track.type}${music ? ' tl-clip-music' : ''}${overlay ? ' tl-clip-overlay' : ''}${selected ? ' selected' : ''}${dropTarget ? ' drop-target' : ''}${editable ? ' editable' : ''}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={`${label} · ${fmt(clip.startTime)}–${fmt(clip.startTime + duration)}`}
      draggable={base}
      onClick={() => editable && onSelect()}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (base) {
          e.preventDefault();
          onDragOver();
        }
      }}
      onDrop={(e) => {
        if (base) {
          e.preventDefault();
          onDrop();
        }
      }}
    >
      {(base || overlay) && thumb && <img src={thumb} alt="" />}
      <span className="tl-clip-label">{label}</span>
      {/* Stills/video trim at both edges; music/overlay only at the end (anchored at t=0). */}
      {base && selected && (
        <span className="tl-trim tl-trim-start" onPointerDown={(e) => onTrimStart('start', e)} />
      )}
      {editable && selected && (
        <span className="tl-trim tl-trim-end" onPointerDown={(e) => onTrimStart('end', e)} />
      )}
    </div>
  );
}
