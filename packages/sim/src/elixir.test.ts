import { describe, expect, it } from 'vitest';
import { ELIXIR_CAP_TENTHS } from './constants.js';
import { createInitialState, step } from './simulation.js';
import { loadSpec } from './testHelpers.js';

describe('elixir (PRD 1.1)', () => {
  it('grants the first point after exactly 56 ticks (2.8s)', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const start = state.elixirTenths[0];
    for (let t = 0; t < 55; t++) step(state, spec, []);
    expect(state.elixirTenths[0]).toBe(start);
    step(state, spec, []);
    expect(state.elixirTenths[0]).toBe(start + 10);
  });

  it('caps at 10 elixir', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    for (let t = 0; t < 56 * 12; t++) step(state, spec, []);
    expect(state.elixirTenths[0]).toBe(ELIXIR_CAP_TENTHS);
    expect(state.elixirTenths[1]).toBe(ELIXIR_CAP_TENTHS);
  });

  it('regenerates at 2x during the final 60 seconds', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    // Jump to the double-elixir window with an empty pool.
    state.tick = spec.doubleElixirStartTick;
    state.elixirTenths[0] = 0;
    state.elixirAcc[0] = 0;
    for (let t = 0; t < 28; t++) step(state, spec, []);
    expect(state.elixirTenths[0]).toBe(10); // 56/2 = 28 ticks per point
  });
});
