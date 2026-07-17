import { sameSettings, type Preset, type VoiceSettings } from '../../core/types';

/** Preset persistence: a single JSON index in localStorage (no audio). */

const KEY = 'greyvetro-presets';

export function loadPresets(): Preset[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Preset[];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function save(items: Preset[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addPreset(
  name: string,
  voiceId: string,
  voiceName: string,
  settings: VoiceSettings,
): Preset {
  const preset: Preset = {
    id: Date.now().toString(),
    name,
    voiceId,
    voiceName,
    ...settings,
    createdAt: new Date().toISOString(),
  };
  save([preset, ...loadPresets()]);
  return preset;
}

/** Replace an existing preset (matched by id), preserving list order. */
export function updatePreset(preset: Preset): void {
  const items = loadPresets();
  const idx = items.findIndex((p) => p.id === preset.id);
  if (idx === -1) items.unshift(preset);
  else items[idx] = preset;
  save(items);
}

/** The first preset whose settings match, or null. `excludeId` skips the preset being edited. */
export function findMatchingPreset(
  voiceId: string,
  settings: VoiceSettings,
  excludeId?: string,
): Preset | null {
  return (
    loadPresets().find((p) => p.id !== excludeId && sameSettings(p, voiceId, settings)) ?? null
  );
}

export function deletePreset(id: string): void {
  save(loadPresets().filter((p) => p.id !== id));
}
