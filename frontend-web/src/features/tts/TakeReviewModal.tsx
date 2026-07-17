import { useEffect } from 'react';
import { autoTitle, slugify } from '../../core/types';
import { AudioPlayer } from './AudioPlayer';

interface Props {
  url: string;
  text: string;
  voiceName: string;
  projectName: string;
  generating: boolean;
  onSave: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

/** Decision point after generating: save the take to a project, regenerate, or discard.
 *  Closing keeps the take unsaved (reopen via the "Review take" button in the rail). */
export function TakeReviewModal({
  url,
  text,
  voiceName,
  projectName,
  generating,
  onSave,
  onRegenerate,
  onDiscard,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const snippet = text.length > 90 ? `${text.slice(0, 90).trimEnd()}…` : text;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Review take</h2>
          <button className="icon-btn" title="Close (keeps the take)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="field-hint">
            “{snippet}” · {voiceName}
          </p>
          <AudioPlayer src={url} downloadName={`${slugify(autoTitle(text))}.mp3`} />
          <div className="preset-actions">
            <button className="chip active" disabled={generating} onClick={onSave}>
              💾 Save to {projectName}
            </button>
            <button className="chip" disabled={generating} onClick={onRegenerate}>
              ↻ {generating ? 'Generating…' : 'Regenerate'}
            </button>
            <button className="chip danger" disabled={generating} onClick={onDiscard}>
              Discard
            </button>
          </div>
          <p className="field-hint">
            Closing keeps the take unsaved — reopen it with “Review take” next to Generate.
          </p>
        </div>
      </div>
    </div>
  );
}
