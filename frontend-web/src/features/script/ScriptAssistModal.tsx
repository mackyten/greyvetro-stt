import { useState } from 'react';
import { generateScript } from '../../core/api';

const LENGTHS = [30, 60, 90, 120];

interface Props {
  onResult: (script: string) => void;
  onClose: () => void;
}

/** "Write with AI": topic (+ optional instructions) → voiceover script into the composer. */
export function ScriptAssistModal({ onResult, onClose }: Props) {
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(60);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const script = await generateScript(topic.trim(), instructions.trim() || undefined, targetSeconds);
      onResult(script);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Write script with AI</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="field-label">
            Topic
            <textarea
              className="text-field assist-topic"
              placeholder="What should the video be about?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              autoFocus
            />
          </label>
          <label className="field-label">
            Style / instructions <span className="vtag">(optional)</span>
            <input
              className="text-field"
              placeholder="e.g. upbeat, aimed at beginners, end with a question"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <div className="field-label">
            Length
            <div className="preset-actions" style={{ marginTop: 6 }}>
              {LENGTHS.map((s) => (
                <button
                  key={s}
                  className={`chip${targetSeconds === s ? ' active' : ''}`}
                  onClick={() => setTargetSeconds(s)}
                >
                  ~{s}s
                </button>
              ))}
            </div>
          </div>
          {error && <div className="error-banner">{error}</div>}
        </div>
        <div className="modal-footer">
          <button
            className="generate-btn"
            disabled={!topic.trim() || generating}
            onClick={generate}
          >
            {generating ? 'Writing…' : '✨ Write script'}
          </button>
        </div>
      </div>
    </div>
  );
}
