import { describe, expect, it } from 'vitest';
import { stateHash } from './hash.js';
import { inputsToFrames, runReplay, type ReplayFrame } from './replay.js';
import { buildSimSpec } from './spec.js';
import { createInitialState, step } from './simulation.js';
import { loadLiveOpsConfig } from './testHelpers.js';
import type { TickInput } from './types.js';

const P0 = 'alice';
const P1 = 'bob';

function liveInputs(tick: number): TickInput[] {
  const inputs: TickInput[] = [];
  if (tick === 5) {
    inputs.push({
      type: 'spawn', player: 0, playerId: P0, seq: 1,
      cardId: 'unit_frost_gunner', cellX: 4, cellY: 8, possess: true,
    });
  }
  if (tick === 8) {
    inputs.push({
      type: 'spawn', player: 1, playerId: P1, seq: 1,
      cardId: 'unit_stone_golem', cellX: 7, cellY: 15, possess: false,
    });
  }
  if (tick > 10 && tick < 200 && tick % 2 === 0) {
    inputs.push({
      type: 'move', player: 0, playerId: P0, seq: tick,
      unitId: 7, moveX: 300, moveY: 1000, yawMdeg: 60000, pitchMdeg: -2000,
    });
  }
  if (tick === 60 || tick === 120) {
    inputs.push({
      type: 'shoot', player: 0, playerId: P0, seq: tick,
      unitId: 7, weapon: 'beta',
      originX: 0, originY: 0, originZ: 0,
      dirX: 200, dirY: 1000, dirZ: -50,
      rewindTick: tick - 4,
    });
  }
  return inputs;
}

describe('input-stream replay engine (PRD 7.1)', () => {
  it('recorded frames replayed on a clean arena reproduce the exact final hash', () => {
    const config = loadLiveOpsConfig();
    const spec = buildSimSpec(config);
    const state = createInitialState(0x5eed1, spec);

    const frames: ReplayFrame[] = [];
    const TICKS = 400;
    for (let t = 0; t < TICKS; t++) {
      const inputs = liveInputs(t);
      frames.push(...inputsToFrames(t, inputs));
      step(state, spec, inputs);
    }
    const liveHash = stateHash(state);

    const replay = runReplay(state.seed, config, [P0, P1], frames, { maxTicks: TICKS });
    expect(replay.finalHash).toBe(liveHash);
    expect(replay.state.tick).toBe(state.tick);
    expect(replay.state.units.length).toBe(state.units.length);
  });

  it('a tampered frame produces a different final hash', () => {
    const config = loadLiveOpsConfig();
    const spec = buildSimSpec(config);
    const state = createInitialState(777, spec);

    const frames: ReplayFrame[] = [];
    const TICKS = 120;
    for (let t = 0; t < TICKS; t++) {
      const inputs = liveInputs(t);
      frames.push(...inputsToFrames(t, inputs));
      step(state, spec, inputs);
    }
    const liveHash = stateHash(state);

    const tampered = frames.map((f) =>
      f.inputEventCode === 1 ? { ...f, payload: { ...f.payload, gridX: 5 } } : f,
    );
    const replay = runReplay(777, config, [P0, P1], tampered, { maxTicks: TICKS });
    expect(replay.finalHash).not.toBe(liveHash);
  });

  it('possession survives the frame round-trip (spawn + possess frames merge)', () => {
    const inputs: TickInput[] = [
      {
        type: 'spawn', player: 0, playerId: P0, seq: 9,
        cardId: 'unit_royal_archer', cellX: 6, cellY: 4, possess: true,
      },
    ];
    const frames = inputsToFrames(3, inputs);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.inputEventCode).toBe(1);
    expect(frames[1]!.inputEventCode).toBe(2);
  });
});
