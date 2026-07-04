import type { LiveOpsConfig } from '@overlord/protocol';
import { stateHash } from './hash.js';
import { buildSimSpec } from './spec.js';
import { createInitialState, step } from './simulation.js';
import type { PlayerIndex, SimState, TickInput } from './types.js';

// Input-stream replay engine (PRD 7.1). Matches are recorded as the exact
// inputs the sim applied; replaying = same seed + same config + same inputs.

/** PRD 7.1 frame shape, with extension fields the full input set requires. */
export interface ReplayFrame {
  tickId: number;
  playerId: string;
  inputEventCode: 1 | 2 | 3 | 4; // 1 = Spawn, 2 = Possess, 3 = Move, 4 = Shoot
  payload: {
    vectorX?: number;
    vectorY?: number;
    vectorZ?: number;
    entityId?: string;
    gridX?: number;
    gridY?: number;
    cardId?: string;
    seq?: number;
    yawMdeg?: number;
    pitchMdeg?: number;
    weapon?: 'alpha' | 'beta';
    rewindTick?: number;
  };
}

export interface ReplayRecord {
  seed: number;
  configVersion: string;
  players: [string, string]; // playerId of player 0, player 1
  frames: ReplayFrame[];
  finalHash: string;
  durationTicks: number;
}

/** Convert the inputs applied on one tick into PRD replay frames. */
export function inputsToFrames(tick: number, inputs: readonly TickInput[]): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  for (const input of inputs) {
    if (input.type === 'spawn') {
      frames.push({
        tickId: tick,
        playerId: input.playerId,
        inputEventCode: 1,
        payload: { gridX: input.cellX, gridY: input.cellY, cardId: input.cardId, seq: input.seq },
      });
      if (input.possess) {
        frames.push({
          tickId: tick,
          playerId: input.playerId,
          inputEventCode: 2,
          payload: { seq: input.seq },
        });
      }
    } else if (input.type === 'move') {
      frames.push({
        tickId: tick,
        playerId: input.playerId,
        inputEventCode: 3,
        payload: {
          entityId: String(input.unitId),
          vectorX: input.moveX,
          vectorY: input.moveY,
          yawMdeg: input.yawMdeg,
          pitchMdeg: input.pitchMdeg,
          seq: input.seq,
        },
      });
    } else {
      frames.push({
        tickId: tick,
        playerId: input.playerId,
        inputEventCode: 4,
        payload: {
          entityId: String(input.unitId),
          vectorX: input.dirX,
          vectorY: input.dirY,
          vectorZ: input.dirZ,
          weapon: input.weapon,
          rewindTick: input.rewindTick,
          seq: input.seq,
        },
      });
    }
  }
  return frames;
}

/** Rebuild TickInputs for one tick from replay frames (possess frames merge into their spawn). */
export function framesToInputs(
  frames: readonly ReplayFrame[],
  playerIndexOf: (playerId: string) => PlayerIndex,
): TickInput[] {
  const inputs: TickInput[] = [];
  for (const f of frames) {
    const player = playerIndexOf(f.playerId);
    const p = f.payload;
    switch (f.inputEventCode) {
      case 1:
        inputs.push({
          type: 'spawn',
          player,
          playerId: f.playerId,
          seq: p.seq ?? 0,
          cardId: p.cardId ?? '',
          cellX: p.gridX ?? 0,
          cellY: p.gridY ?? 0,
          possess: false,
        });
        break;
      case 2: {
        // Possession rides the spawn from the same player+seq on this tick.
        for (const input of inputs) {
          if (input.type === 'spawn' && input.playerId === f.playerId && input.seq === (p.seq ?? 0)) {
            input.possess = true;
          }
        }
        break;
      }
      case 3:
        inputs.push({
          type: 'move',
          player,
          playerId: f.playerId,
          seq: p.seq ?? 0,
          unitId: Number(p.entityId ?? -1),
          moveX: p.vectorX ?? 0,
          moveY: p.vectorY ?? 0,
          yawMdeg: p.yawMdeg ?? 0,
          pitchMdeg: p.pitchMdeg ?? 0,
        });
        break;
      case 4:
        inputs.push({
          type: 'shoot',
          player,
          playerId: f.playerId,
          seq: p.seq ?? 0,
          unitId: Number(p.entityId ?? -1),
          weapon: p.weapon ?? 'alpha',
          originX: 0,
          originY: 0,
          originZ: 0,
          dirX: p.vectorX ?? 0,
          dirY: p.vectorY ?? 0,
          dirZ: p.vectorZ ?? 0,
          rewindTick: p.rewindTick ?? 0,
        });
        break;
    }
  }
  return inputs;
}

export interface ReplayResult {
  state: SimState;
  finalHash: string;
  perTickHashes: string[];
}

/**
 * Boot a clean arena, seed identically, and stream the frames back through
 * the simulation (PRD 7.1). Runs until game over or `durationTicks`.
 */
export function runReplay(
  seed: number,
  config: LiveOpsConfig,
  players: [string, string],
  frames: readonly ReplayFrame[],
  opts?: { collectHashes?: boolean; maxTicks?: number },
): ReplayResult {
  const spec = buildSimSpec(config);
  const state = createInitialState(seed, spec);
  const playerIndexOf = (playerId: string): PlayerIndex => (playerId === players[0] ? 0 : 1);

  const byTick = new Map<number, ReplayFrame[]>();
  let lastTick = 0;
  for (const f of frames) {
    const list = byTick.get(f.tickId);
    if (list) list.push(f);
    else byTick.set(f.tickId, [f]);
    if (f.tickId > lastTick) lastTick = f.tickId;
  }

  const maxTicks = opts?.maxTicks ?? spec.durationTicks;
  const perTickHashes: string[] = [];
  while (!state.gameOver && state.tick < maxTicks) {
    const tickFrames = byTick.get(state.tick);
    const inputs = tickFrames ? framesToInputs(tickFrames, playerIndexOf) : [];
    step(state, spec, inputs);
    if (opts?.collectHashes) perTickHashes.push(stateHash(state));
  }
  return { state, finalHash: stateHash(state), perTickHashes };
}
