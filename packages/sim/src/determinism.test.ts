import { describe, expect, it } from 'vitest';
import { stateHash } from './hash.js';
import { createInitialState, step } from './simulation.js';
import { loadSpec } from './testHelpers.js';
import type { TickInput } from './types.js';

const P0 = 'player-zero';
const P1 = 'player-one';

/** A scripted 30-second match with spawns, possession, movement, and shots. */
function scriptedInputs(tick: number, possessedUnitId: number): TickInput[] {
  const inputs: TickInput[] = [];
  if (tick === 10) {
    inputs.push({
      type: 'spawn', player: 0, playerId: P0, seq: 1,
      cardId: 'unit_royal_archer', cellX: 5, cellY: 5, possess: false,
    });
  }
  if (tick === 12) {
    inputs.push({
      type: 'spawn', player: 1, playerId: P1, seq: 1,
      cardId: 'unit_iron_knight', cellX: 6, cellY: 18, possess: false,
    });
  }
  if (tick === 30) {
    inputs.push({
      type: 'spawn', player: 0, playerId: P0, seq: 2,
      cardId: 'unit_shadow_rogue', cellX: 2, cellY: 9, possess: true,
    });
  }
  if (tick > 30 && tick < 300) {
    inputs.push({
      type: 'move', player: 0, playerId: P0, seq: tick,
      unitId: possessedUnitId, moveX: 0, moveY: 1000,
      yawMdeg: 90000, pitchMdeg: 0,
    });
    if (tick % 40 === 0) {
      inputs.push({
        type: 'shoot', player: 0, playerId: P0, seq: tick,
        unitId: possessedUnitId, weapon: 'alpha',
        originX: 0, originY: 0, originZ: 0,
        dirX: 0, dirY: 1000, dirZ: 0,
        rewindTick: Math.max(0, tick - 3),
      });
    }
  }
  return inputs;
}

function runScripted(ticks: number, permute: boolean): string[] {
  const spec = loadSpec();
  const state = createInitialState(0xc0ffee, spec);
  const hashes: string[] = [];
  // The rogue spawns after 6 towers (ids 1-6) + archer (7) + knight (8) → id 9.
  const possessedUnitId = 9;
  for (let t = 0; t < ticks; t++) {
    let inputs = scriptedInputs(t, possessedUnitId);
    if (permute) inputs = [...inputs].reverse();
    step(state, spec, inputs);
    hashes.push(stateHash(state));
  }
  return hashes;
}

describe('determinism', () => {
  it('same seed + same inputs → identical per-tick hashes', () => {
    const a = runScripted(600, false);
    const b = runScripted(600, false);
    expect(a).toEqual(b);
  });

  it('input arrival order within a tick does not matter (canonical sort)', () => {
    const a = runScripted(600, false);
    const b = runScripted(600, true);
    expect(a).toEqual(b);
  });

  it('different seeds diverge only through PRNG-dependent systems (state hash includes rng)', () => {
    const spec = loadSpec();
    const s1 = createInitialState(1, spec);
    const s2 = createInitialState(2, spec);
    step(s1, spec, []);
    step(s2, spec, []);
    expect(stateHash(s1)).not.toEqual(stateHash(s2));
  });
});
