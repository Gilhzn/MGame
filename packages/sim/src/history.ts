import { HISTORY_TICKS } from './constants.js';
import type { SimState } from './types.js';

// Lag compensation ring (PRD 2.1): the last second (20 ticks) of unit and
// tower transforms. Shots rewind against this before raycasting.

export function pushHistory(state: SimState): void {
  const entries: Array<{ id: number; x: number; y: number }> = [];
  for (const t of state.towers) entries.push({ id: t.id, x: t.x, y: t.y });
  for (const u of state.units) entries.push({ id: u.id, x: u.x, y: u.y });
  state.history.push({ tick: state.tick, entries });
  while (state.history.length > HISTORY_TICKS) state.history.shift();
}

/**
 * Positions as of `tick`, clamped to buffer depth. Entities that did not
 * exist then are absent (a shot cannot rewind-hit a unit not yet spawned).
 * Falls back to current positions when no history exists yet.
 */
export function positionsAt(
  state: SimState,
  tick: number,
): ReadonlyMap<number, { x: number; y: number }> {
  const map = new Map<number, { x: number; y: number }>();
  let frame = state.history.length > 0 ? state.history[0]! : undefined;
  for (const f of state.history) {
    if (f.tick <= tick) frame = f;
    else break;
  }
  if (!frame) {
    for (const t of state.towers) map.set(t.id, { x: t.x, y: t.y });
    for (const u of state.units) map.set(u.id, { x: u.x, y: u.y });
    return map;
  }
  for (const e of frame.entries) map.set(e.id, { x: e.x, y: e.y });
  return map;
}
