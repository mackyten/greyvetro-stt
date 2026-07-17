/** Shared IndexedDB access for the gallery + projects + scenes stores. */

const DB_NAME = 'greyvetro-tts';
const VERSION = 3;

export const GALLERY_STORE = 'gallery';
export const PROJECT_STORE = 'projects';
export const SCENE_STORE = 'scenes';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GALLERY_STORE))
        db.createObjectStore(GALLERY_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PROJECT_STORE))
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SCENE_STORE))
        db.createObjectStore(SCENE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
