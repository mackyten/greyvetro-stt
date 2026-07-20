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
  // The document as of the start of an in-progress continuous drag (a range input's onChange fires
  // once per tick) — captured once by the first `setLive` call in the gesture, consumed by the next
  // `commitLive`/`set`/`undo`/`redo` as the single "before" snapshot for the whole gesture, so a
  // slider drag becomes one undo step instead of many.
  const dragBaseline = useRef<Timeline | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Stable identities (empty deps — these only touch refs) so callers can safely list them in
  // effect dependency arrays without the custom hook's returned object looking unstable.

  /** Push `dragBaseline` (if any, and if it actually differs from the current present) onto `past`
   * as one history entry, then clear it. Called before every other history-mutating operation so a
   * pending live drag is never silently lost or skipped over (e.g. a keyboard-only slider nudge
   * that never gets a pointerup to call `commitLive`). */
  const flushLive = () => {
    const baseline = dragBaseline.current;
    dragBaseline.current = null;
    if (baseline === null || baseline === present.current) return;
    past.current.push(baseline);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
  };

  /** Load a fresh document (initial seed, project switch) — resets undo/redo entirely. */
  const load = useCallback((next: Timeline | null) => {
    present.current = next;
    past.current = [];
    future.current = [];
    dragBaseline.current = null;
    forceRender();
  }, []);

  /** Commit a discrete edit: push the current document to the past, clear the redo stack. */
  const set = useCallback((next: Timeline) => {
    flushLive();
    if (present.current) {
      past.current.push(present.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    future.current = [];
    present.current = next;
    forceRender();
  }, []);

  /** Apply one tick of a continuous drag gesture (a slider's onChange): updates the visible
   * document immediately but does NOT push a history entry — `commitLive` does that once, when the
   * gesture ends, so dragging a slider end-to-end is a single undo step. */
  const setLive = useCallback((next: Timeline) => {
    if (dragBaseline.current === null) dragBaseline.current = present.current;
    present.current = next;
    forceRender();
  }, []);

  /** End a live-drag gesture (pointerup), coalescing every `setLive` tick since it started into one
   * history entry. A no-op if nothing actually changed (e.g. a click that didn't move the slider). */
  const commitLive = useCallback(() => {
    flushLive();
  }, []);

  const undo = useCallback(() => {
    flushLive();
    if (past.current.length === 0) return;
    if (present.current) future.current.push(present.current);
    present.current = past.current.pop()!;
    forceRender();
  }, []);

  const redo = useCallback(() => {
    flushLive();
    if (future.current.length === 0) return;
    if (present.current) past.current.push(present.current);
    present.current = future.current.pop()!;
    forceRender();
  }, []);

  return {
    timeline: present.current,
    load,
    set,
    setLive,
    commitLive,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
