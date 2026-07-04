import { describe, expect, it } from 'vitest';
import { rewindTickFor } from './lagComp.js';

describe('lag compensation clamping (PRD 2.1)', () => {
  const START = 100_000;

  it('maps a timestamp onto its tick when within the buffer', () => {
    expect(rewindTickFor(START + 500, START, 15)).toBe(10); // 500ms → tick 10
  });

  it('clamps to the 1-second history depth', () => {
    // 5 seconds late at tick 200 → oldest retained tick is 181.
    expect(rewindTickFor(START + 5_000, START, 200)).toBe(181);
    expect(rewindTickFor(START, START, 200)).toBe(181);
  });

  it('never rewinds into the future', () => {
    expect(rewindTickFor(START + 999_999, START, 50)).toBe(50);
  });
});
