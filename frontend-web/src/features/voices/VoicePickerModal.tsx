import { useEffect, useMemo, useState } from 'react';
import { getVoices } from '../../core/api';
import { voiceTagline, type Voice } from '../../core/types';
import { CreateVoiceModal } from './CreateVoiceModal';

interface Props {
  selectedId?: string;
  onSelect: (voice: Voice) => void;
  onClose: () => void;
}

type GenderFilter = 'all' | 'male' | 'female';

export function VoicePickerModal({ selectedId, onSelect, onClose }: Props) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const load = () => {
    setVoices(null);
    setError(null);
    getVoices()
      .then(setVoices)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!voices) return [];
    const q = search.trim().toLowerCase();
    return voices.filter((v) => {
      if (gender !== 'all' && v.labels['gender']?.toLowerCase() !== gender) return false;
      if (q && !v.name.toLowerCase().includes(q) && !voiceTagline(v).toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [voices, search, gender]);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Choose a voice</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn" title="Refresh voices" onClick={load}>
                ↻
              </button>
              <button className="icon-btn" title="Close" onClick={onClose}>
                ✕
              </button>
            </div>
          </div>
          <div className="modal-filters">
            <input
              type="search"
              placeholder="Search voices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {(['all', 'male', 'female'] as const).map((g) => (
              <button
                key={g}
                className={`chip${gender === g ? ' active' : ''}`}
                onClick={() => setGender(g)}
              >
                {g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
          <div className="modal-list">
            {error && (
              <div className="modal-empty">
                {error}
                <div style={{ marginTop: 10 }}>
                  <button className="chip" onClick={load}>
                    Retry
                  </button>
                </div>
              </div>
            )}
            {!error && !voices && <div className="spinner" />}
            {!error && voices && filtered.length === 0 && (
              <div className="modal-empty">No voices match your filters.</div>
            )}
            {filtered.map((v) => (
              <button
                key={v.id}
                className={`voice-row${v.id === selectedId ? ' selected' : ''}`}
                onClick={() => onSelect(v)}
              >
                <div className="voice-avatar">{v.name.charAt(0).toUpperCase()}</div>
                <div className="grow">
                  <div className="vname">{v.name}</div>
                  <div className="vtag">{voiceTagline(v)}</div>
                </div>
                {v.isCustom && <span className="badge">My voice</span>}
              </button>
            ))}
          </div>
          <div className="modal-footer">
            <button className="chip" onClick={() => setCreateOpen(true)}>
              ＋ Create my voice
            </button>
          </div>
        </div>
      </div>

      {createOpen && (
        <CreateVoiceModal
          onCreated={(v) => {
            setCreateOpen(false);
            onSelect(v);
          }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}
