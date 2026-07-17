import { openDb, TIMELINE_STORE, txDone } from '../../core/db';
import type { Timeline } from './model/types';

/**
 * Timeline persistence (Greyvetro Studio Phase 5). One timeline document per project,
 * keyed by the timeline id (== project id in Phase 1). Browser-local, like the storyboard
 * scenes. Asset blobs are not duplicated here in Phase 1 — the photo frames are composited
 * from the scene images at export and the voiceover comes from the gallery store.
 */

interface TimelineRecord {
  id: string; // == Timeline.id == projectId
  doc: Timeline;
}

export async function saveTimeline(timeline: Timeline): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_STORE, 'readwrite');
  tx.objectStore(TIMELINE_STORE).put({ id: timeline.id, doc: timeline } satisfies TimelineRecord);
  await txDone(tx);
  db.close();
}

export async function getTimeline(id: string): Promise<Timeline | null> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_STORE, 'readonly');
  const req = tx.objectStore(TIMELINE_STORE).get(id);
  await txDone(tx);
  db.close();
  return (req.result as TimelineRecord | undefined)?.doc ?? null;
}

export async function deleteTimeline(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TIMELINE_STORE, 'readwrite');
  tx.objectStore(TIMELINE_STORE).delete(id);
  await txDone(tx);
  db.close();
}
