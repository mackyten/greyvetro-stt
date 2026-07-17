import { useEffect, useRef, useState } from 'react';
import { generateSpeech } from '../../core/api';
import { useToast } from '../../core/toast';
import {
  autoTitle,
  DEFAULT_MODEL_ID,
  defaultSettings,
  MODELS,
  voiceTagline,
  type Draft,
  type Preset,
  type Voice,
  type VoiceSettings,
} from '../../core/types';
import { addGalleryItem } from '../gallery/galleryRepo';
import { ProjectSelect } from '../projects/ProjectSelect';
import { loadPresets } from '../presets/presetRepo';
import { SavePresetModal } from '../presets/SavePresetModal';
import { VoicePickerModal } from '../voices/VoicePickerModal';
import { TakeReviewModal } from './TakeReviewModal';

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function SettingSlider({ label, value, onChange }: SliderProps) {
  return (
    <div className="slider-row">
      <div className="slider-head">
        <span>{label}</span>
        <span className="val">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

/** Minimal Voice built from stored id + name (gallery items / presets). */
function voiceFromDraft(d: Draft): Voice {
  return { id: d.voiceId, name: d.voiceName, description: '', isCustom: false, labels: {} };
}

interface Props {
  draft: Draft | null;
  onGenerated: () => void;
}

/** An unsaved generated take, held in memory until the user decides to keep it. */
interface Take {
  blob: Blob;
  url: string;
  text: string;
  voiceId: string;
  voiceName: string;
  settings: VoiceSettings;
}

export function Composer({ draft, onGenerated }: Props) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<Voice | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetMenu, setPresetMenu] = useState<Preset[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [project, setProject] = useState<{ id: string | null; name: string }>({
    id: null,
    name: 'Unsorted',
  });
  const appliedNonce = useRef(0);

  // Keyed on the URL (not the take object) — saving reuses the same URL and must not revoke it.
  const takeUrl = take?.url;
  useEffect(() => {
    return () => {
      if (takeUrl) URL.revokeObjectURL(takeUrl);
    };
  }, [takeUrl]);

  // Apply an incoming draft (gallery "Edit & regenerate" / "Use these settings", preset "Use").
  useEffect(() => {
    if (!draft || draft.nonce === appliedNonce.current) return;
    appliedNonce.current = draft.nonce;
    setVoice(voiceFromDraft(draft));
    setSettings(draft.settings);
    if (draft.text !== undefined) setText(draft.text);
    setSettingsOpen(true);
    setError(null);
  }, [draft]);

  const applyPreset = (p: Preset) => {
    setVoice({ id: p.voiceId, name: p.voiceName, description: '', isCustom: false, labels: {} });
    setSettings({
      stability: p.stability,
      similarityBoost: p.similarityBoost,
      style: p.style,
      useSpeakerBoost: p.useSpeakerBoost,
      modelId: p.modelId ?? DEFAULT_MODEL_ID,
    });
    setPresetMenu(null);
    toast(`Preset “${p.name}” applied.`);
  };

  // Generation only produces an in-memory take — nothing is stored until the user saves it.
  const generate = async () => {
    if (!voice || !text.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const blob = await generateSpeech(text.trim(), voice.id, settings);
      setTake({
        blob,
        url: URL.createObjectURL(blob),
        text: text.trim(),
        voiceId: voice.id,
        voiceName: voice.name,
        settings,
      });
      setReviewOpen(true);
      onGenerated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const saveTake = async () => {
    if (!take) return;
    await addGalleryItem(
      take.text,
      take.voiceId,
      take.voiceName,
      take.settings,
      take.blob,
      project.id ?? undefined,
      autoTitle(take.text),
    );
    setTake(null);
    setReviewOpen(false);
    toast(`Saved to ${project.name}.`);
  };

  const discardTake = () => {
    setTake(null);
    setReviewOpen(false);
    toast('Take discarded.', 'info');
  };

  return (
    <>
      <div className="composer">
        <div className="card editor">
          <ProjectSelect onChange={(id, name) => setProject({ id, name })} />
          <textarea
            placeholder="Type or paste the script you want to hear…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="editor-meta mono">{text.length.toLocaleString()} characters</div>
        </div>

        <div className="rail">
          <div className="card">
            <h3>Voice</h3>
            <button className="voice-button" onClick={() => setPickerOpen(true)}>
              <div className="voice-avatar">
                {voice ? voice.name.charAt(0).toUpperCase() : '?'}
              </div>
              <div>
                <div className="vname">{voice ? voice.name : 'Choose a voice'}</div>
                <div className="vtag">
                  {voice ? voiceTagline(voice) || 'Selected voice' : 'Browse premade & cloned voices'}
                </div>
              </div>
            </button>
          </div>

          <div className="card">
            <h3
              style={{ cursor: 'pointer', userSelect: 'none', marginBottom: settingsOpen ? 12 : 0 }}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              Voice settings {settingsOpen ? '▾' : '▸'}
            </h3>
            {settingsOpen && (
              <>
                <div className="slider-row">
                  <div className="slider-head">
                    <span>Model</span>
                  </div>
                  <select
                    className="text-field"
                    value={settings.modelId ?? DEFAULT_MODEL_ID}
                    onChange={(e) => setSettings((s) => ({ ...s, modelId: e.target.value }))}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    {MODELS.find((m) => m.id === (settings.modelId ?? DEFAULT_MODEL_ID))?.hint}
                  </p>
                </div>
                <div className="slider-row">
                  <div className="slider-head">
                    <span>Delivery</span>
                  </div>
                  <div className="preset-actions" style={{ marginTop: 0 }}>
                    <button
                      className="chip"
                      title="Stability 0.25 · Style 0.60"
                      onClick={() => setSettings((s) => ({ ...s, stability: 0.25, style: 0.6 }))}
                    >
                      ⚡ Energetic
                    </button>
                    <button
                      className="chip"
                      title="Stability 0.50 · Style 0.15"
                      onClick={() => setSettings((s) => ({ ...s, stability: 0.5, style: 0.15 }))}
                    >
                      Neutral
                    </button>
                    <button
                      className="chip"
                      title="Stability 0.85 · Style 0"
                      onClick={() => setSettings((s) => ({ ...s, stability: 0.85, style: 0 }))}
                    >
                      🌙 Calm
                    </button>
                  </div>
                </div>
                <SettingSlider
                  label="Stability"
                  value={settings.stability}
                  onChange={(v) => setSettings((s) => ({ ...s, stability: v }))}
                />
                <SettingSlider
                  label="Similarity"
                  value={settings.similarityBoost}
                  onChange={(v) => setSettings((s) => ({ ...s, similarityBoost: v }))}
                />
                <SettingSlider
                  label="Style"
                  value={settings.style}
                  onChange={(v) => setSettings((s) => ({ ...s, style: v }))}
                />
                <div className="switch-row">
                  <span>Speaker boost</span>
                  <button
                    className={`switch${settings.useSpeakerBoost ? ' on' : ''}`}
                    role="switch"
                    aria-checked={settings.useSpeakerBoost}
                    onClick={() =>
                      setSettings((s) => ({ ...s, useSpeakerBoost: !s.useSpeakerBoost }))
                    }
                  />
                </div>
                <p className="field-hint" style={{ marginTop: 10 }}>
                  Energetic read: lower Stability (~0.3), raise Style (~0.5+). Flat read: the
                  opposite.
                </p>
                <div className="preset-actions">
                  <button
                    className="chip"
                    disabled={!voice}
                    title={voice ? undefined : 'Choose a voice first'}
                    onClick={() => setSavePresetOpen(true)}
                  >
                    Save as preset
                  </button>
                  <div className="preset-menu-anchor">
                    <button
                      className="chip"
                      onClick={() => setPresetMenu((m) => (m ? null : loadPresets()))}
                    >
                      Apply preset ▾
                    </button>
                    {presetMenu && (
                      <div className="preset-menu">
                        {presetMenu.length === 0 && (
                          <div className="preset-menu-empty">No presets yet</div>
                        )}
                        {presetMenu.map((p) => (
                          <button key={p.id} className="preset-menu-item" onClick={() => applyPreset(p)}>
                            <span className="pname">{p.name}</span>
                            <span className="pvoice">{p.voiceName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button
            className="generate-btn"
            disabled={!voice || !text.trim() || generating}
            onClick={generate}
          >
            {generating ? 'Generating…' : 'Generate speech'}
          </button>

          {take && !reviewOpen && (
            <button className="chip review-pill" onClick={() => setReviewOpen(true)}>
              ▶ Review take · unsaved
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <VoicePickerModal
          selectedId={voice?.id}
          onSelect={(v) => {
            setVoice(v);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {take && reviewOpen && (
        <TakeReviewModal
          url={take.url}
          text={take.text}
          voiceName={take.voiceName}
          projectName={project.name}
          generating={generating}
          onSave={saveTake}
          onRegenerate={generate}
          onDiscard={discardTake}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {savePresetOpen && voice && (
        <SavePresetModal
          voiceId={voice.id}
          voiceName={voice.name}
          settings={settings}
          onClose={() => setSavePresetOpen(false)}
        />
      )}
    </>
  );
}
