import { openDb, TIMELINE_ASSET_STORE, txDone } from '../../core/db';
import type { MediaType } from './model/types';

/**
 * Blob storage for timeline media the user brings in (uploaded video, later audio/images),
 * keyed by asset id. Separate from the timeline document (which holds only metadata) and from
 * the storyboard scene images. `projectId` is kept for future per-project cleanup.
 */
interface AssetRecord {
  id: string;
  projectId: string;
  type: MediaType;
  blob: Blob;
  duration?: number;
  width?: number;
  height?: number;
}

export async function saveAsset(record: AssetRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_ASSET_STORE, 'readwrite');
  tx.objectStore(TIMELINE_ASSET_STORE).put(record);
  await txDone(tx);
  db.close();
}

export async function getAsset(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_ASSET_STORE, 'readonly');
  const req = tx.objectStore(TIMELINE_ASSET_STORE).get(id);
  await txDone(tx);
  db.close();
  return (req.result as AssetRecord | undefined)?.blob ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_ASSET_STORE, 'readwrite');
  tx.objectStore(TIMELINE_ASSET_STORE).delete(id);
  await txDone(tx);
  db.close();
}
