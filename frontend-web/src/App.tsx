import { useCallback, useEffect, useState } from 'react';
import { getUsage } from './core/api';
import type { Draft, GalleryItem, Preset, Usage } from './core/types';
import { useTheme } from './core/useTheme';
import { GalleryScreen } from './features/gallery/GalleryScreen';
import { PresetsScreen } from './features/presets/PresetsScreen';
import { Composer } from './features/tts/Composer';
import { UsageCard } from './features/usage/UsageCard';

type Tab = 'studio' | 'gallery' | 'presets';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'studio', icon: '🎙', label: 'Studio' },
  { id: 'gallery', icon: '🎧', label: 'Gallery' },
  { id: 'presets', icon: '🎚', label: 'Presets' },
];

const PAGE_META: Record<Tab, { title: string; subtitle: string }> = {
  studio: { title: 'Studio', subtitle: 'Turn your script into speech with ElevenLabs voices.' },
  gallery: { title: 'Gallery', subtitle: 'Takes you chose to keep, saved locally in this browser.' },
  presets: { title: 'Presets', subtitle: 'Saved voice + settings bundles, ready to re-apply.' },
};

export default function App() {
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<Tab>('studio');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const refreshUsage = useCallback(() => {
    getUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  useEffect(refreshUsage, [refreshUsage]);

  const loadIntoComposer = (
    source: GalleryItem | Preset,
    text?: string,
  ) => {
    setDraft({
      nonce: Date.now(),
      voiceId: source.voiceId,
      voiceName: source.voiceName,
      settings: {
        stability: source.stability,
        similarityBoost: source.similarityBoost,
        style: source.style,
        useSpeakerBoost: source.useSpeakerBoost,
        modelId: source.modelId,
      },
      text,
    });
    setTab('studio');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="mark">G</div>
          <div className="name">Greyvetro</div>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-item${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <UsageCard usage={usage} />
          <button className="theme-toggle" onClick={toggle}>
            {theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page-title">
          <h1>{PAGE_META[tab].title}</h1>
          <p>{PAGE_META[tab].subtitle}</p>
        </div>
        {/* Composer stays mounted so its state survives tab switches. */}
        <div style={{ display: tab === 'studio' ? undefined : 'none' }}>
          <Composer draft={draft} onGenerated={refreshUsage} />
        </div>
        {tab === 'gallery' && (
          <GalleryScreen
            onEditRegenerate={(item) => loadIntoComposer(item, item.text)}
            onUseSettings={(item) => loadIntoComposer(item)}
          />
        )}
        {tab === 'presets' && <PresetsScreen onUse={(p) => loadIntoComposer(p)} />}
      </main>
    </div>
  );
}
