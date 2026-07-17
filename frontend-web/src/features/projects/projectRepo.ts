import { GALLERY_STORE, openDb, PROJECT_STORE, SCENE_STORE, txDone } from '../../core/db';
import type { GalleryItem, Project } from '../../core/types';

export async function listProjects(): Promise<Project[]> {
  const db = await openDb();
  const tx = db.transaction(PROJECT_STORE, 'readonly');
  const req = tx.objectStore(PROJECT_STORE).getAll();
  await txDone(tx);
  db.close();
  return (req.result as Project[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addProject(name: string): Promise<Project> {
  const project: Project = {
    id: Date.now().toString(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  const db = await openDb();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  tx.objectStore(PROJECT_STORE).put(project);
  await txDone(tx);
  db.close();
  return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  const store = tx.objectStore(PROJECT_STORE);
  const req = store.get(id);
  req.onsuccess = () => {
    const project = req.result as Project | undefined;
    if (project) store.put({ ...project, name: name.trim() });
  };
  await txDone(tx);
  db.close();
}

/** Delete a project; its clips are kept and moved to "Unsorted". Its storyboard scenes are removed. */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([PROJECT_STORE, GALLERY_STORE, SCENE_STORE], 'readwrite');
  tx.objectStore(PROJECT_STORE).delete(id);
  const gallery = tx.objectStore(GALLERY_STORE);
  const req = gallery.getAll();
  req.onsuccess = () => {
    for (const record of req.result as (GalleryItem & { audio: Blob })[]) {
      if (record.projectId === id) {
        gallery.put({ ...record, projectId: undefined });
      }
    }
  };
  const scenes = tx.objectStore(SCENE_STORE);
  const sceneReq = scenes.getAll();
  sceneReq.onsuccess = () => {
    for (const record of sceneReq.result as { id: string; projectId: string }[]) {
      if (record.projectId === id) scenes.delete(record.id);
    }
  };
  await txDone(tx);
  db.close();
}
