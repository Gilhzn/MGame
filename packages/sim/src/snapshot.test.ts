import { describe, expect, it } from 'vitest';
import { stateHash } from './hash.js';
import { cloneState, deserializeSnapshot, serializeSnapshot } from './snapshot.js';
import { createInitialState, step } from './simulation.js';
import { injectUnit, loadSpec } from './testHelpers.js';

describe('snapshot (PRD 7.4 hard re-sync)', () => {
  it('serialize → deserialize preserves the exact state hash', () => {
    const spec = loadSpec();
    const state = createInitialState(42, spec);
    injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500);
    injectUnit(state, spec, 'unit_iron_knight', 1, 6500, 18500);
    for (let t = 0; t < 100; t++) step(state, spec, []);

    const restored = deserializeSnapshot(serializeSnapshot(state));
    expect(stateHash(restored)).toBe(stateHash(state));
  });

  it('a restored state continues identically to the original', () => {
    const spec = loadSpec();
    const state = createInitialState(42, spec);
    injectUnit(state, spec, 'unit_shadow_rogue', 0, 2500, 9500);
    injectUnit(state, spec, 'unit_flame_mage', 1, 9500, 14500);
    for (let t = 0; t < 50; t++) step(state, spec, []);

    const fork = cloneState(state);
    for (let t = 0; t < 50; t++) {
      step(state, spec, []);
      step(fork, spec, []);
      expect(stateHash(fork)).toBe(stateHash(state));
    }
  });

  it('rejects unknown snapshot versions', () => {
    expect(() => deserializeSnapshot('{"v":99,"state":{}}')).toThrow(/version/);
  });
});
