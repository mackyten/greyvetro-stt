import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoredScene } from '../../core/types';
import { getGalleryAudio } from '../gallery/galleryRepo';

interface Props {
  scenes: StoredScene[];
  imageUrls: Record<string, string>;
  clipId: string;
  title: string;
  onClose: () => void;
}

/**
 * Browser-side "render preview": plays the voiceover and swaps the displayed
 * scene image at scene boundaries — no video decode needed.
 */
export function StoryboardPreview({ scenes, imageUrls, clipId, title, onClose }: Props) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let url: string | null = null;
    getGalleryAudio(clipId).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [clipId]);

  // The active scene is the last one whose start we've passed (scenes are ordered).
  const active = useMemo(() => {
    let current = scenes[0] ?? null;
    for (const scene of scenes) {
      if (position >= scene.start) current = scene;
      else break;
    }
    return current;
  }, [scenes, position]);

  const activeIndex = active ? scenes.indexOf(active) : -1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sb-preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Preview — {title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="preview-stage">
            {active && imageUrls[active.id] ? (
              <img src={imageUrls[active.id]} alt={`Scene ${activeIndex + 1}`} />
            ) : (
              <div className="preview-placeholder">
                <span>🎬</span>
                <span>
                  Scene {activeIndex + 1}
                  {active && !active.hasImage ? ' — no image yet' : ''}
                </span>
              </div>
            )}
          </div>
          {active && <p className="preview-caption">“{active.narration}”</p>}
          <div className="preview-strip">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                className={`preview-dot${s.id === active?.id ? ' active' : ''}`}
                title={`Scene ${i + 1}`}
                onClick={() => {
                  if (audioRef.current) audioRef.current.currentTime = s.start;
                  setPosition(s.start);
                }}
              />
            ))}
          </div>
          {audioUrl ? (
            <audio
              ref={audioRef}
              className="preview-audio"
              src={audioUrl}
              controls
              autoPlay
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            />
          ) : (
            <div className="spinner" />
          )}
        </div>
      </div>
    </div>
  );
}
