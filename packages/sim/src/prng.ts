// mulberry32 — the sim's only randomness source (docs/determinism.md rule 2).
// State is a plain uint32 stored inside SimState so snapshots/replays carry it.

export function nextUint32(state: number): { value: number; state: number } {
  let s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return { value: (t ^ (t >>> 14)) >>> 0, state: s };
}

/** Uniform-ish integer in [0, n). Modulo bias is acceptable for gameplay. */
export function nextInt(state: number, n: number): { value: number; state: number } {
  const r = nextUint32(state);
  return { value: r.value % n, state: r.state };
}
