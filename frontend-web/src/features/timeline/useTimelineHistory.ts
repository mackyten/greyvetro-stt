import { useCallback, useReducer, useRef } from 'react';
import type { Timeline } from './model/types';

/** Cap on undo depth — Timeline documents are lightweight JSON (blobs live in IndexedDB), so this
 * is generous headroom rather than a real memory concern. */
const HISTORY_LIMIT = 100;

/**
 * Undo/redo for the Timeline editor (Phase 6). State lives in refs, not `useState`, and mutations
 * happen synchronously in the methods below (not inside a `setState` updater) — React 18 Strict
 * Mode double-invokes updater functions to surface impure ones, which would silently double-push
 * history entries if the past/future arrays were mutated there. A reducer dispatch just forces the
 * re-render once the refs are already updated.
 */
export function useTimelineHistory() {
  const present = useRef<Timeline | null>(null);
  const past = useRef<Timeline[]>([]);
  const future = useRef<Timeline[]>([]);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Stable identities (empty deps — these only touch refs) so callers can safely list them in
  // effect dependency arrays without the custom hook's returned object looking unstable.

  /** Load a fresh document (initial seed, project switch) — resets undo/redo entirely. */
  const load = useCallback((next: Timeline | null) => {
    present.current = next;
    past.current = [];
    future.current = [];
    forceRender();
  }, []);

  /** Commit an edit: push the current document to the past, clear the redo stack. */
  const set = useCallback((next: Timeline) => {
    if (present.current) {
      past.current.push(present.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    future.current = [];
    present.current = next;
    forceRender();
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    if (present.current) future.current.push(present.current);
    present.current = past.current.pop()!;
    forceRender();
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    if (present.current) past.current.push(present.current);
    present.current = future.current.pop()!;
    forceRender();
  }, []);

  return {
    timeline: present.current,
    load,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
