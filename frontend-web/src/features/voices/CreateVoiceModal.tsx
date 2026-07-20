import { useEffect, useRef, useState } from 'react';
import { cloneVoice, getUsage } from '../../core/api';
import { Icon } from '../../core/Icon';
import type { Voice } from '../../core/types';

interface Sample {
  file: File;
  source: 'recording' | 'upload';
}

interface Props {
  onCreated: (voice: Voice) => void;
  onClose: () => void;
}

export function CreateVoiceModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canClone, setCanClone] = useState<boolean | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getUsage()
      .then((u) => setCanClone(u.canCloneVoices))
      .catch(() => setCanClone(null));
    return () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const ext = recorder.mimeType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: recorder.mimeType });
        setSamples((s) => [...s, { file, source: 'recording' }]);
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access was denied or is unavailable.');
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    // Snapshot NOW: the FileList is live and is emptied when the input's value is
    // reset, which happens before React runs a functional setState updater.
    const added = Array.from(list).map((file) => ({ file, source: 'upload' as const }));
    setSamples((s) => [...s, ...added]);
  };

  const clone = async () => {
    if (!name.trim() || samples.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const voice = await cloneVoice(name.trim(), description.trim(), samples.map((s) => s.file));
      onCreated(voice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create my voice</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          {canClone === false && (
            <div className="warn-banner">
              Your ElevenLabs plan can't clone voices — cloning requires a paid plan (Starter+).
              You can still try, but the request will fail.
            </div>
          )}
          <input
            className="text-field"
            placeholder="Voice name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="text-field"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="preset-actions">
            {!recording ? (
              <button className="chip" onClick={startRecording}>
                <Icon name="fiber_manual_record" /> Record a sample
              </button>
            ) : (
              <button className="chip danger" onClick={stopRecording}>
                <Icon name="stop" /> Stop recording
              </button>
            )}
            <button className="chip" onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" /> Upload audio
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".m4a,.mp3,.wav,.flac,.ogg,.webm,.aac,.mp4,audio/*,video/mp4"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {samples.length > 0 && (
            <div className="sample-list">
              {samples.map((s, i) => (
                <div key={i} className="sample-row">
                  <span className="mono">
                    <Icon name={s.source === 'recording' ? 'mic' : 'description'} /> {s.file.name}
                  </span>
                  <button
                    className="icon-btn"
                    title="Remove"
                    onClick={() => setSamples((list) => list.filter((_, j) => j !== i))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
          <button
            className="generate-btn"
            disabled={!name.trim() || samples.length === 0 || busy || recording}
            onClick={clone}
          >
            {busy ? 'Cloning…' : 'Clone voice'}
          </button>
        </div>
      </div>
    </div>
  );
}
