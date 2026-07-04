import type { SimState } from './types.js';

// Full-state snapshot for desync recovery (PRD 7.4) and diagnostics. SimState
// is plain JSON data by construction, so a structured clone via JSON is exact
// (all numbers are integers).

const SNAPSHOT_VERSION = 1;

export function serializeSnapshot(state: SimState): string {
  return JSON.stringify({ v: SNAPSHOT_VERSION, state });
}

export function deserializeSnapshot(raw: string): SimState {
  const parsed = JSON.parse(raw) as { v: number; state: SimState };
  if (parsed.v !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version ${parsed.v}`);
  }
  return parsed.state;
}

export function cloneState(state: SimState): SimState {
  return deserializeSnapshot(serializeSnapshot(state));
}
