import { useEffect, useMemo, useRef, useState } from 'react';
import { getVoices } from '../../core/api';
import { favoriteVoiceIds, toggleFavoriteVoice } from '../../core/favorites';
import { Icon } from '../../core/Icon';
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(favoriteVoiceIds);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const toggleFavorite = (e: React.MouseEvent | React.KeyboardEvent, id: string) => {
    e.stopPropagation();
    setFavorites(toggleFavoriteVoice(id));
  };

  // Stop whatever preview clip is playing when the picker unmounts (voice
  // selected, or the modal is closed) — pause() doesn't fire 'ended', so this
  // never fights with the previewId cleared there.
  useEffect(() => () => previewAudioRef.current?.pause(), []);

  const togglePreview = (v: Voice) => {
    if (!v.previewUrl) return;
    previewAudioRef.current?.pause();
    if (previewId === v.id) {
      setPreviewId(null);
      return;
    }
    const audio = new Audio(v.previewUrl);
    previewAudioRef.current = audio;
    audio.addEventListener('ended', () => setPreviewId(null));
    audio.play().catch(() => setPreviewId(null));
    setPreviewId(v.id);
  };

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
    const matches = voices.filter((v) => {
      if (gender !== 'all' && v.labels['gender']?.toLowerCase() !== gender) return false;
      if (favoritesOnly && !favorites.has(v.id)) return false;
      if (q && !v.name.toLowerCase().includes(q) && !voiceTagline(v).toLowerCase().includes(q))
        return false;
      return true;
    });
    // Favorited voices float to the top; stable sort preserves order within each group.
    return [...matches].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [voices, search, gender, favorites, favoritesOnly]);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Choose a voice</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn" title="Refresh voices" onClick={load}>
                <Icon name="refresh" />
              </button>
              <button className="icon-btn" title="Close" onClick={onClose}>
                <Icon name="close" />
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
            <button
              className={`chip favorite-chip${favoritesOnly ? ' active' : ''}`}
              onClick={() => setFavoritesOnly((f) => !f)}
            >
              <Icon name={favoritesOnly ? 'star' : 'star_border'} /> Favorites
            </button>
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
                <span
                  className={`icon-btn favorite-btn${favorites.has(v.id) ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={favorites.has(v.id) ? 'Remove from favorites' : 'Add to favorites'}
                  onClick={(e) => toggleFavorite(e, v.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleFavorite(e, v.id);
                    }
                  }}
                >
                  <Icon name={favorites.has(v.id) ? 'star' : 'star_border'} />
                </span>
                {v.previewUrl && (
                  <span
                    className={`icon-btn${previewId === v.id ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    title={previewId === v.id ? 'Stop preview' : 'Preview voice'}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreview(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePreview(v);
                      }
                    }}
                  >
                    <Icon name={previewId === v.id ? 'stop' : 'play_arrow'} />
                  </span>
                )}
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
