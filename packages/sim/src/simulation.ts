import { tickTowerAI, tickUnitAI } from './ai.js';
import { stepProjectiles } from './combat.js';
import { TOWER_LAYOUT } from './constants.js';
import { canAfford, spendElixir, tickElixir } from './elixir.js';
import { cellCenterMu, isValidDeployCell } from './grid.js';
import { pushHistory } from './history.js';
import { applyMoveInput, applyShootInput, tickWeaponTimers } from './possession.js';
import type {
  PlayerIndex,
  SimEvent,
  SimSpec,
  SimState,
  SpawnInput,
  TickInput,
  Unit,
} from './types.js';

export function createInitialState(seed: number, spec: SimSpec): SimState {
  const state: SimState = {
    tick: 0,
    rngState: seed >>> 0,
    seed: seed >>> 0,
    elixirTenths: [spec.startingElixirTenths, spec.startingElixirTenths],
    elixirAcc: [0, 0],
    crowns: [0, 0],
    nextEntityId: 1,
    units: [],
    towers: [],
    projectiles: [],
    history: [],
    gameOver: false,
    winner: -1,
  };
  for (const t of TOWER_LAYOUT) {
    const tspec = spec.towers[t.kind];
    state.towers.push({
      id: state.nextEntityId++,
      kind: t.kind,
      owner: t.owner,
      x: t.x,
      y: t.y,
      hp: tspec.hitpoints,
      maxHp: tspec.hitpoints,
      attackCooldownTicks: 0,
    });
  }
  return state;
}

const INPUT_TYPE_ORDER = { spawn: 0, move: 1, shoot: 2 } as const;

/** Canonical input order (docs/determinism.md rule 3): type, then player, then seq. */
export function sortTickInputs(inputs: readonly TickInput[]): TickInput[] {
  return [...inputs].sort((a, b) => {
    const t = INPUT_TYPE_ORDER[a.type] - INPUT_TYPE_ORDER[b.type];
    if (t !== 0) return t;
    if (a.player !== b.player) return a.player - b.player;
    return a.seq - b.seq;
  });
}

function applySpawn(state: SimState, spec: SimSpec, input: SpawnInput, events: SimEvent[]): void {
  const uspec = spec.units[input.cardId];
  if (!uspec) {
    events.push({ type: 'spawnRejected', player: input.player, seq: input.seq, reason: 'UNKNOWN_CARD' });
    return;
  }
  if (!isValidDeployCell(input.player, input.cellX, input.cellY)) {
    events.push({ type: 'spawnRejected', player: input.player, seq: input.seq, reason: 'INVALID_CELL' });
    return;
  }
  if (!canAfford(state, input.player, uspec.elixirCostTenths)) {
    events.push({ type: 'spawnRejected', player: input.player, seq: input.seq, reason: 'NOT_ENOUGH_ELIXIR' });
    return;
  }
  spendElixir(state, input.player, uspec.elixirCostTenths);

  const center = cellCenterMu(input.cellX, input.cellY);
  const unit: Unit = {
    id: state.nextEntityId++,
    uid: uspec.uid,
    owner: input.player,
    x: center.x,
    y: center.y,
    yawMdeg: input.player === 0 ? 90000 : -90000, // face the enemy side
    pitchMdeg: 0,
    hp: uspec.hitpoints,
    maxHp: uspec.hitpoints,
    spawnTick: state.tick,
    // Possession is only granted at the creation timestamp (PRD 1.2).
    possessedBy: input.possess ? input.playerId : null,
    targetId: -1,
    attackCooldownTicks: 0,
    anim: 'idle',
    path: [],
    pathIndex: 0,
    repathCooldownTicks: 0,
    weaponAlpha: { clip: uspec.weaponAlpha.clipCapacity, cooldownTicks: 0, reloadTicks: 0 },
    weaponBeta: { clip: uspec.weaponBeta.clipCapacity, cooldownTicks: 0, reloadTicks: 0 },
  };
  state.units.push(unit); // ids are monotonic, so push preserves id order
  events.push({ type: 'spawn', id: unit.id, uid: unit.uid, owner: unit.owner });
  if (unit.possessedBy) {
    events.push({ type: 'possessStart', unitId: unit.id, owner: unit.owner, playerId: input.playerId });
  }
}

function cleanupDeaths(state: SimState, events: SimEvent[]): void {
  const survivors: Unit[] = [];
  for (const u of state.units) {
    if (u.hp > 0) {
      survivors.push(u);
      continue;
    }
    events.push({ type: 'death', id: u.id });
    if (u.possessedBy) {
      events.push({
        type: 'possessEnd',
        unitId: u.id,
        owner: u.owner,
        playerId: u.possessedBy,
        reason: 'death',
      });
    }
  }
  state.units = survivors;

  const towerSurvivors: typeof state.towers = [];
  for (const t of state.towers) {
    if (t.hp > 0) {
      towerSurvivors.push(t);
      continue;
    }
    events.push({ type: 'towerDestroyed', id: t.id, owner: t.owner });
    const scorer: PlayerIndex = t.owner === 0 ? 1 : 0;
    state.crowns[scorer] += t.kind === 'king' ? 3 : 1;
    if (t.kind === 'king' && !state.gameOver) {
      state.gameOver = true;
      state.winner = scorer;
    }
  }
  state.towers = towerSurvivors;
}

/**
 * Advance the simulation one 50ms tick. Mutates `state`, returns the events
 * produced. Deterministic for a given (state, spec, inputs).
 */
export function step(state: SimState, spec: SimSpec, inputs: readonly TickInput[]): SimEvent[] {
  if (state.gameOver) return [];
  const events: SimEvent[] = [];

  tickElixir(state, spec);

  for (const input of sortTickInputs(inputs)) {
    if (input.type === 'spawn') applySpawn(state, spec, input, events);
    else if (input.type === 'move') applyMoveInput(state, spec, input);
    else applyShootInput(state, spec, input, events);
  }

  // Unit updates in id order; snapshot the list so mid-tick spawns from
  // projectile logic (none today) can never change iteration.
  for (const unit of [...state.units]) {
    tickWeaponTimers(unit, spec);
    if (unit.attackCooldownTicks > 0) unit.attackCooldownTicks--;
    if (!unit.possessedBy) tickUnitAI(state, spec, unit, events);
  }

  for (const tower of state.towers) tickTowerAI(state, spec, tower, events);

  stepProjectiles(state, spec, events);

  cleanupDeaths(state, events);

  if (!state.gameOver && state.tick + 1 >= spec.durationTicks) {
    state.gameOver = true;
    state.winner =
      state.crowns[0] > state.crowns[1] ? 0 : state.crowns[1] > state.crowns[0] ? 1 : -1;
  }
  if (state.gameOver) events.push({ type: 'gameOver', winner: state.winner });

  pushHistory(state);
  state.tick++;
  return events;
}
