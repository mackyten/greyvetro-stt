import { useState } from 'react';
import { useToast } from '../../core/toast';
import { settingsSummary, type Preset } from '../../core/types';
import { PresetEditorModal } from './PresetEditorModal';
import { deletePreset, loadPresets } from './presetRepo';

interface Props {
  onUse: (preset: Preset) => void;
}

export function PresetsScreen({ onUse }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Preset[]>(loadPresets);
  const [editing, setEditing] = useState<Preset | null>(null);

  const refresh = () => setItems(loadPresets());

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🎚</div>
        <h2>No presets yet</h2>
        <p>Save a voice + settings bundle from the Studio's voice-settings card, or from any gallery clip.</p>
      </div>
    );
  }

  return (
    <>
      <div className="masonry">
        {items.map((p) => (
          <div key={p.id} className="card gallery-card">
            <div>
              <div className="vname">{p.name}</div>
              <div className="vtag">{p.voiceName}</div>
            </div>
            <div className="vtag">
              {settingsSummary({
                stability: p.stability,
                similarityBoost: p.similarityBoost,
                style: p.style,
                useSpeakerBoost: p.useSpeakerBoost,
                modelId: p.modelId,
              })}
            </div>
            <div className="preset-actions">
              <button className="chip active" onClick={() => onUse(p)}>
                Use
              </button>
              <button className="chip" onClick={() => setEditing(p)}>
                Edit
              </button>
              <button
                className="chip danger"
                onClick={() => {
                  deletePreset(p.id);
                  refresh();
                  toast(`Preset “${p.name}” deleted.`, 'info');
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PresetEditorModal preset={editing} onSaved={refresh} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
