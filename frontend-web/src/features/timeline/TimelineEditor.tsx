import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICEOVER_ASSET_ID } from './model/seed';
import {
  cropFromZoomPan,
  deleteClip,
  MAX_ZOOM,
  MIN_CLIP,
  moveClip,
  removeTrack,
  setClipFade,
  setCrop,
  setTrackAudio,
  splitClip,
  trimClip,
  zoomPanFromCrop,
} from './model/timelineOps';
import { timelineDuration, type Clip, type Timeline, type Track, type TrackType } from './model/types';

/** Lane display order (top → bottom) and labels. */
const LANE_ORDER: TrackType[] = ['video', 'photo', 'caption', 'audio'];
const LANE_LABEL: Record<TrackType, string> = {
  video: 'Video',
  photo: 'Photo',
  caption: 'Captions',
  audio: 'Audio',
};

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
  startDuration: number;
  startInPoint: number;
  duration: number;
  inPoint: number;
}

/**
 * Interactive timeline (Greyvetro Studio Phase 5, Phase 2). Each track is a lane, each clip a
 * bar. Visual clips can be selected, dragged to reorder, trimmed at either edge, split at the
 * playhead, and deleted; the model stays contiguous (the base track is a concat). Edits are pure
 * (see model/timelineOps.ts) and flow up via onChange for persistence + render.
 */
export function TimelineEditor({
  timeline,
  imageUrls,
  audioUrl,
  onChange,
}: {
  timeline: Timeline;
  imageUrls: Record<string, string>;
  audioUrl: string | null;
  onChange: (next: Timeline) => void;
}) {
  const total = Math.max(timelineDuration(timeline), 0.001);
  const [selected, setSelected] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [trim, setTrim] = useState<TrimDrag | null>(null);
  const [playing, setPlaying] = useState(false);
  const dragId = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<{ t0: number; p0: number } | null>(null);

  const ph = Math.min(playhead, total);

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

  // Flattened visual clips in play order (for the preview + guards).
  const visualClips = timeline.tracks
    .filter((t) => isVisualType(t.type))
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startTime - b.startTime);
  const visualCount = visualClips.length;

  const selectedClip = selected
    ? timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === selected) ?? null
    : null;
  const selectedIsVisual =
    !!selectedClip &&
    isVisualType(timeline.tracks.find((t) => t.clips.some((c) => c.id === selected))?.type ?? 'audio');
  const localPlayhead = selectedClip ? ph - selectedClip.startTime : 0;

  // A selected music clip (an audio clip that isn't the seeded voiceover) opens the audio inspector.
  const selTrack = selected
    ? timeline.tracks.find((t) => t.clips.some((c) => c.id === selected)) ?? null
    : null;
  const selMusic =
    selTrack && selectedClip && selTrack.type === 'audio' && selectedClip.sourceId !== VOICEOVER_ASSET_ID
      ? { track: selTrack, clip: selectedClip }
      : null;

  const canSplit =
    selectedIsVisual && localPlayhead > MIN_CLIP && localPlayhead < (selectedClip?.duration ?? 0) - MIN_CLIP;
  const canDelete = (selectedIsVisual && visualCount > 1) || !!selMusic;

  const onDelete = () => {
    if (!selected) return;
    if (selMusic) {
      stop();
      onChange(removeTrack(timeline, selMusic.track.id));
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

  // Frame shown in the preview: the visual clip under the playhead, plus any active caption. While
  // paused with a visual clip selected, the preview locks to that clip so reframe edits are WYSIWYG.
  const activeVisual = visualClips.find((c) => ph >= c.startTime && ph < c.startTime + c.duration)
    ?? visualClips[visualClips.length - 1];
  const previewClip = !playing && selectedIsVisual && selectedClip ? selectedClip : activeVisual;
  const activeCaption = timeline.tracks
    .find((t) => t.type === 'caption')
    ?.clips.find((c) => ph >= c.startTime && ph < c.startTime + c.duration)?.text;

  // Reflect a clip's crop/reframe in the preview as a CSS zoom into its pan-center (approximate —
  // the exact source-crop cover-fit happens at export; §4 preview is for feedback, not parity).
  const cropStyle = previewClip?.crop
    ? {
        transform: `scale(${(1 / previewClip.crop.width).toFixed(4)})`,
        transformOrigin: `${((previewClip.crop.x + previewClip.crop.width / 2) * 100).toFixed(2)}% ${((previewClip.crop.y + previewClip.crop.height / 2) * 100).toFixed(2)}%`,
      }
    : undefined;

  // Reframe inspector state for a selected visual clip (zoom + pan-center <-> the stored crop rect).
  const zoomPan = selectedIsVisual && selectedClip ? zoomPanFromCrop(selectedClip.crop) : null;
  const applyCrop = (zoom: number, panX: number, panY: number) => {
    if (!selectedClip) return;
    // Zoom back to 1 clears the crop (full frame); otherwise store the derived rect.
    onChange(setCrop(timeline, selectedClip.id, zoom <= 1.001 ? null : cropFromZoomPan(zoom, panX, panY)));
  };

  // Split / delete keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      if (e.key === 'Escape') setSelected(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && canDelete) {
        e.preventDefault();
        onDeleteRef.current();
      } else if ((e.key === 's' || e.key === 'S') && canSplit && selected) {
        e.preventDefault();
        stop();
        onChange(splitClip(timeline, selected, localPlayhead));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline, selected, canDelete, canSplit, localPlayhead, onChange, stop]);

  const timeFromEvent = (e: { clientX: number }, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    return Math.min(Math.max(((e.clientX - rect.left) / rect.width) * total, 0), total);
  };

  const onTrimPointerMove = (e: React.PointerEvent) => {
    if (!trim) return;
    const dt = ((e.clientX - trim.startX) / trim.laneWidth) * total;
    if (trim.edge === 'end') {
      setTrim({ ...trim, duration: Math.max(MIN_CLIP, trim.startDuration + dt) });
    } else {
      // Left edge: keep the right edge fixed — shrink/grow duration, move the source window.
      setTrim({
        ...trim,
        duration: Math.max(MIN_CLIP, trim.startDuration - dt),
        inPoint: Math.max(0, trim.startInPoint + dt),
      });
    }
  };

  const onTrimPointerUp = () => {
    if (trim) onChange(trimClip(timeline, trim.clipId, { inPoint: trim.inPoint, duration: trim.duration }));
    setTrim(null);
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
              {selMusic ? '🗑 Remove music' : '🗑 Delete'}
            </button>
          </div>
          <div className="tl-tools-meta mono">
            Playhead {ph.toFixed(1)}s / {total.toFixed(1)}s
            {selectedClip && (selectedIsVisual || selMusic) && (
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
              <button
                className="chip"
                disabled={!selectedClip.crop}
                onClick={() => onChange(setCrop(timeline, selectedClip.id, null))}
              >
                Reset framing
              </button>
            </div>
          ) : (
            <div className="tl-tools-hint">
              Click a clip to select · drag to reorder · drag an edge to trim · click the ruler to
              move the playhead, then Split (S) or Delete. Select a scene to reframe (zoom/pan); add
              music, select it to set volume/fades.
            </div>
          )}
        </div>
      </div>

      <div
        className="tl-ruler"
        onPointerDown={(e) => scrubTo(timeFromEvent(e, e.currentTarget))}
      >
        {ticks.map((t) => (
          <span key={t} className="tl-tick mono" style={{ left: `${(t / total) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
        <div className="tl-playhead" style={{ left: `${(ph / total) * 100}%` }} />
      </div>

      {tracks.map((track) => (
        <div key={track.id} className="tl-lane">
          <div className="tl-lane-label">{LANE_LABEL[track.type]}</div>
          <div
            className="tl-lane-track"
            onPointerDown={(e) => {
              // Only bare-track clicks (not on a clip) move the playhead.
              if (e.target === e.currentTarget) scrubTo(timeFromEvent(e, e.currentTarget));
            }}
          >
            <div className="tl-playhead" style={{ left: `${(ph / total) * 100}%` }} />
            {[...track.clips]
              .sort((a, b) => a.startTime - b.startTime)
              .map((clip, i) => (
                <ClipBar
                  key={clip.id}
                  clip={clip}
                  index={i}
                  track={track}
                  total={total}
                  thumb={imageUrls[clip.sourceId]}
                  selected={selected === clip.id}
                  dropTarget={dropTarget === clip.id}
                  trim={trim?.clipId === clip.id ? trim : null}
                  onSelect={() => setSelected(clip.id)}
                  onDragStart={() => {
                    if (isVisualType(track.type)) dragId.current = clip.id;
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
                    setSelected(clip.id);
                    const lane = (e.currentTarget as HTMLElement).closest('.tl-lane-track');
                    setTrim({
                      clipId: clip.id,
                      edge,
                      startX: e.clientX,
                      laneWidth: lane?.getBoundingClientRect().width ?? 1,
                      startDuration: clip.duration,
                      startInPoint: clip.inPoint,
                      duration: clip.duration,
                      inPoint: clip.inPoint,
                    });
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClipBar({
  clip,
  index,
  track,
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
  const visual = isVisualType(track.type);
  const music = track.type === 'audio' && clip.sourceId !== VOICEOVER_ASSET_ID;
  const editable = visual || music;
  const duration = trim ? trim.duration : clip.duration;
  const left = (clip.startTime / total) * 100;
  const width = (duration / total) * 100;
  const label =
    track.type === 'caption'
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
      className={`tl-clip tl-clip-${track.type}${music ? ' tl-clip-music' : ''}${selected ? ' selected' : ''}${dropTarget ? ' drop-target' : ''}${editable ? ' editable' : ''}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={`${label} · ${fmt(clip.startTime)}–${fmt(clip.startTime + duration)}`}
      draggable={visual}
      onClick={() => editable && onSelect()}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (visual) {
          e.preventDefault();
          onDragOver();
        }
      }}
      onDrop={(e) => {
        if (visual) {
          e.preventDefault();
          onDrop();
        }
      }}
    >
      {visual && thumb && <img src={thumb} alt="" />}
      <span className="tl-clip-label">{label}</span>
      {/* Stills/video trim at both edges; music only at the end (it stays anchored at t=0). */}
      {visual && selected && (
        <span className="tl-trim tl-trim-start" onPointerDown={(e) => onTrimStart('start', e)} />
      )}
      {editable && selected && (
        <span className="tl-trim tl-trim-end" onPointerDown={(e) => onTrimStart('end', e)} />
      )}
    </div>
  );
}
