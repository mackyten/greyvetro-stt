import { useState } from 'react';
import { Icon } from '../../core/Icon';
import { useToast } from '../../core/toast';
import type { VoiceSettings } from '../../core/types';
import { addPreset, findMatchingPreset } from './presetRepo';

interface Props {
  voiceId: string;
  voiceName: string;
  settings: VoiceSettings;
  onSaved?: () => void;
  onClose: () => void;
}

/** Name prompt for saving the given voice + settings as a preset, with the duplicate guard. */
export function SavePresetModal({ voiceId, voiceName, settings, onSaved, onClose }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const savePreset = () => {
    if (!name.trim()) return;
    const existing = findMatchingPreset(voiceId, settings);
    if (existing) {
      setError(`These settings are already saved as “${existing.name}”.`);
      return;
    }
    addPreset(name.trim(), voiceId, voiceName, settings);
    toast(`Preset “${name.trim()}” saved.`);
    onSaved?.();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save as preset</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <p className="field-hint">
            Voice <strong>{voiceName}</strong> plus the current settings — no text.
          </p>
          <input
            className="text-field"
            placeholder="Preset name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && savePreset()}
            autoFocus
          />
          {error && <div className="error-banner">{error}</div>}
          <button className="generate-btn" disabled={!name.trim()} onClick={savePreset}>
            Save preset
          </button>
        </div>
      </div>
    </div>
  );
}
