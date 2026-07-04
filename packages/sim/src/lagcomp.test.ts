import { describe, expect, it } from 'vitest';
import { pushHistory, positionsAt } from './history.js';
import { HISTORY_TICKS } from './constants.js';
import { applyShootInput } from './possession.js';
import { createInitialState } from './simulation.js';
import { injectUnit, loadSpec } from './testHelpers.js';
import type { ShootInput, SimEvent } from './types.js';

const P0 = 'p0';

describe('lag compensation rewind (PRD 2.1)', () => {
  function setup() {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    const target = injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    // Tick 0: target directly ahead. Then it strafes 3 units to the right.
    pushHistory(state);
    state.tick = 1;
    target.x = 8500;
    pushHistory(state);
    state.tick = 2;
    return { spec, state, shooter, target };
  }

  const aheadShot = (unitId: number, rewindTick: number): ShootInput => ({
    type: 'shoot', player: 0, playerId: P0, seq: 1, unitId, weapon: 'alpha',
    originX: 0, originY: 0, originZ: 0,
    dirX: 0, dirY: 1000, dirZ: 0,
    rewindTick,
  });

  it('a late shot aimed at the OLD position hits when rewound to that tick', () => {
    const { spec, state, shooter, target } = setup();
    const events: SimEvent[] = [];
    applyShootInput(state, spec, aheadShot(shooter.id, 0), events);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit?.type).toBe('hit');
    if (hit?.type === 'hit') expect(hit.targetId).toBe(target.id);
  });

  it('the same aim misses the (moved) unit at the current tick — the ray flies past it into the king tower', () => {
    const { spec, state, shooter, target } = setup();
    const events: SimEvent[] = [];
    applyShootInput(state, spec, aheadShot(shooter.id, 1), events);
    expect(events.some((e) => e.type === 'hit' && e.targetId === target.id)).toBe(false);
  });

  it('the buffer never holds more than 1 second (20 ticks) of frames', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500);
    for (let t = 0; t < 50; t++) {
      pushHistory(state);
      state.tick++;
    }
    expect(state.history.length).toBe(HISTORY_TICKS);
    // Asking for tick 0 clamps to the oldest retained frame (tick 30).
    const oldest = state.history[0]!;
    expect(oldest.tick).toBe(50 - HISTORY_TICKS);
    const positions = positionsAt(state, 0);
    expect(positions.size).toBeGreaterThan(0);
  });

  it('rewind cannot hit a unit that did not exist at the rewound tick', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    pushHistory(state); // tick 0 history: only shooter + towers
    state.tick = 1;
    const lateSpawn = injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500); // spawns later
    pushHistory(state);
    state.tick = 2;

    const events: SimEvent[] = [];
    applyShootInput(state, spec, aheadShot(shooter.id, 0), events);
    expect(events.some((e) => e.type === 'hit' && e.targetId === lateSpawn.id)).toBe(false);
  });
});
