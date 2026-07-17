import { openDb, SCENE_STORE, txDone } from '../../core/db';
import type { Scene, StoredScene } from '../../core/types';

/** Storyboard persistence: IndexedDB stores scene metadata + the image Blob per scene. */

interface SceneRecord extends Omit<StoredScene, 'hasImage'> {
  image?: Blob;
}

function toMeta({ image: _image, ...meta }: SceneRecord): StoredScene {
  return { ...meta, hasImage: !!_image };
}

export async function listScenes(projectId: string): Promise<StoredScene[]> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readonly');
  const req = tx.objectStore(SCENE_STORE).getAll();
  await txDone(tx);
  db.close();
  return (req.result as SceneRecord[])
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => a.order - b.order)
    .map(toMeta);
}

/** Replace a project's storyboard with freshly generated scenes (drops any images). */
export async function replaceScenes(
  projectId: string,
  clipId: string,
  scenes: Scene[],
): Promise<StoredScene[]> {
  const records: SceneRecord[] = scenes.map((s, i) => ({
    ...s,
    id: `${Date.now()}-${i}`,
    projectId,
    clipId,
    order: i,
  }));
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  const store = tx.objectStore(SCENE_STORE);
  const req = store.getAll();
  req.onsuccess = () => {
    for (const old of req.result as SceneRecord[]) {
      if (old.projectId === projectId) store.delete(old.id);
    }
    for (const record of records) store.put(record);
  };
  await txDone(tx);
  db.close();
  return records.map(toMeta);
}

export async function updateScene(
  id: string,
  patch: Partial<Pick<StoredScene, 'narration' | 'imagePrompt' | 'start' | 'end'>>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  const store = tx.objectStore(SCENE_STORE);
  const req = store.get(id);
  req.onsuccess = () => {
    const record = req.result as SceneRecord | undefined;
    if (record) store.put({ ...record, ...patch });
  };
  await txDone(tx);
  db.close();
}

export async function deleteScene(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  tx.objectStore(SCENE_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export async function getSceneImage(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readonly');
  const req = tx.objectStore(SCENE_STORE).get(id);
  await txDone(tx);
  db.close();
  return (req.result as SceneRecord | undefined)?.image ?? null;
}

export async function setSceneImage(id: string, image: Blob | undefined): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  const store = tx.objectStore(SCENE_STORE);
  const req = store.get(id);
  req.onsuccess = () => {
    const record = req.result as SceneRecord | undefined;
    if (!record) return;
    const { image: _old, ...rest } = record;
    store.put(image ? { ...rest, image } : rest);
  };
  await txDone(tx);
  db.close();
}

/**
 * Reorder a project's scenes and re-anchor times: each scene keeps its duration,
 * narration, prompt, and image; start times are recomputed so the new order stays
 * contiguous from 0.
 */
export async function reorderScenes(
  projectId: string,
  orderedIds: string[],
): Promise<StoredScene[]> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  const store = tx.objectStore(SCENE_STORE);
  const req = store.getAll();
  const updated: SceneRecord[] = [];
  req.onsuccess = () => {
    const byId = new Map(
      (req.result as SceneRecord[])
        .filter((s) => s.projectId === projectId)
        .map((s) => [s.id, s]),
    );
    let cursor = 0;
    orderedIds.forEach((id, i) => {
      const record = byId.get(id);
      if (!record) return;
      const duration = record.end - record.start;
      const next: SceneRecord = { ...record, order: i, start: cursor, end: cursor + duration };
      cursor += duration;
      store.put(next);
      updated.push(next);
    });
  };
  await txDone(tx);
  db.close();
  return updated.map(toMeta);
}

/** Remove all scenes belonging to a project (used when the project is deleted). */
export async function deleteScenesForProject(projectId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SCENE_STORE, 'readwrite');
  const store = tx.objectStore(SCENE_STORE);
  const req = store.getAll();
  req.onsuccess = () => {
    for (const record of req.result as SceneRecord[]) {
      if (record.projectId === projectId) store.delete(record.id);
    }
  };
  await txDone(tx);
  db.close();
}
