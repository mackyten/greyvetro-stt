import { GALLERY_STORE, openDb, txDone } from '../../core/db';
import type { GalleryItem, VoiceSettings } from '../../core/types';

/** Gallery persistence: IndexedDB stores metadata + the audio Blob per item. */

interface GalleryRecord extends GalleryItem {
  audio: Blob;
}

export async function listGallery(): Promise<GalleryItem[]> {
  const db = await openDb();
  const tx = db.transaction(GALLERY_STORE, 'readonly');
  const req = tx.objectStore(GALLERY_STORE).getAll();
  await txDone(tx);
  db.close();
  const records = req.result as GalleryRecord[];
  return records
    .map(({ audio: _audio, ...meta }) => meta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addGalleryItem(
  text: string,
  voiceId: string,
  voiceName: string,
  settings: VoiceSettings,
  audio: Blob,
  projectId?: string,
  title?: string,
): Promise<GalleryItem> {
  const record: GalleryRecord = {
    id: Date.now().toString(),
    text,
    voiceId,
    voiceName,
    ...settings,
    createdAt: new Date().toISOString(),
    projectId,
    title,
    audio,
  };
  const db = await openDb();
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  tx.objectStore(GALLERY_STORE).put(record);
  await txDone(tx);
  db.close();
  const { audio: _audio, ...meta } = record;
  return meta;
}

/** Patch metadata (title, projectId, transcript, …) on an existing item, keeping its audio. */
export async function updateGalleryItem(
  id: string,
  patch: Partial<Pick<GalleryItem, 'title' | 'projectId' | 'transcript'>>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  const store = tx.objectStore(GALLERY_STORE);
  const req = store.get(id);
  req.onsuccess = () => {
    const record = req.result as GalleryRecord | undefined;
    if (record) store.put({ ...record, ...patch });
  };
  await txDone(tx);
  db.close();
}

export async function getGalleryAudio(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(GALLERY_STORE, 'readonly');
  const req = tx.objectStore(GALLERY_STORE).get(id);
  await txDone(tx);
  db.close();
  return (req.result as GalleryRecord | undefined)?.audio ?? null;
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(GALLERY_STORE, 'readwrite');
  tx.objectStore(GALLERY_STORE).delete(id);
  await txDone(tx);
  db.close();
}
