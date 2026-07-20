import { useState } from 'react';
import { generateScenes } from '../../core/api';
import { Icon } from '../../core/Icon';
import { useToast } from '../../core/toast';
import type { Scene, Transcript } from '../../core/types';

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

type View = 'text' | 'timings' | 'scenes';

interface Props {
  title: string;
  transcript: Transcript;
  onClose: () => void;
}

/** A clip's word-timestamped Scribe transcript, plus AI-proposed scene prompts. */
export function TranscriptModal({ title, transcript, onClose }: Props) {
  const toast = useToast();
  const [view, setView] = useState<View>('text');
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const words = transcript.words.filter((w) => w.type === 'word');
  const duration = transcript.words.length
    ? transcript.words[transcript.words.length - 1].end
    : 0;

  const copy = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    toast(message);
  };

  const showScenes = async () => {
    if (scenes) {
      setView('scenes');
      return;
    }
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateScenes(transcript);
      setScenes(result);
      setView('scenes');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scene generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Transcript — {title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body transcript-body">
          <div className="vtag">
            {transcript.languageCode && <>{transcript.languageCode.toUpperCase()} · </>}
            {words.length} words · <span className="mono">{fmtTime(duration)}</span>
            {scenes && <> · {scenes.length} scenes</>}
          </div>
          {view === 'text' && (
            <p className="transcript-scroll transcript-text">{transcript.text}</p>
          )}
          {view === 'timings' && (
            <div className="transcript-scroll">
              {words.map((w, i) => (
                <div key={i} className="word-timing">
                  <span className="mono">
                    {fmtTime(w.start)}–{fmtTime(w.end)}
                  </span>{' '}
                  {w.text}
                </div>
              ))}
            </div>
          )}
          {view === 'scenes' && scenes && (
            <div className="transcript-scroll">
              {scenes.map((s, i) => (
                <div key={i} className="scene-card">
                  <div className="scene-head">
                    <span className="mono">
                      {i + 1} · {fmtTime(s.start)}–{fmtTime(s.end)}
                    </span>
                    <button
                      className="chip"
                      title="Copy image prompt (paste into Flow)"
                      onClick={() => copy(s.imagePrompt, `Scene ${i + 1} prompt copied.`)}
                    >
                      <Icon name="content_copy" /> Copy prompt
                    </button>
                  </div>
                  <p className="scene-narration">“{s.narration}”</p>
                  <p className="scene-prompt">{s.imagePrompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer transcript-actions">
          {view !== 'text' && (
            <button className="chip" onClick={() => setView('text')}>
              Show text
            </button>
          )}
          {view === 'text' && (
            <>
              <button className="chip" onClick={() => copy(transcript.text, 'Transcript copied.')}>
                <Icon name="content_copy" /> Copy text
              </button>
              <button className="chip" onClick={() => setView('timings')}>
                Show word timings
              </button>
            </>
          )}
          <button className="chip" disabled={generating} onClick={showScenes}>
            {generating ? (
              'Generating scenes…'
            ) : (
              <>
                <Icon name="movie" /> Scene prompts
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
