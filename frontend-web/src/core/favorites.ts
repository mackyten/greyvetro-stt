const KEY = 'greyvetro-favorite-voices';

function readAll(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeAll(ids: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}

export function favoriteVoiceIds(): Set<string> {
  return readAll();
}

/** Flips the voice's favorite state and persists it. */
export function toggleFavoriteVoice(id: string): Set<string> {
  const ids = readAll();
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  writeAll(ids);
  return ids;
}
