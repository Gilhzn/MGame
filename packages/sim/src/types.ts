export type PlayerIndex = 0 | 1;
export type WeaponSlot = 'alpha' | 'beta';

// ------------------------------------------------------------------ sim spec
// LiveOps floats are converted once, deterministically (Math.round), into the
// integer-only spec the sim consumes. See spec.ts.

export interface WeaponSpec {
  kind: 'HITSCAN' | 'PROJECTILE';
  damage: number;
  cooldownTicks: number;
  clipCapacity: number;
  reloadTicks: number;
  headshotMultPermille: number;
}

export interface UnitSpec {
  uid: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  rig: string;
  elixirCostTenths: number;
  moveSpeedMuPerTick: number;
  searchRadiusMu: number;
  attackRangeMu: number;
  attackCooldownTicks: number;
  attackDamage: number;
  hitpoints: number;
  hitboxRadiusMu: number;
  hitboxHeightMu: number;
  headRadiusMu: number;
  weaponAlpha: WeaponSpec;
  weaponBeta: WeaponSpec;
}

export interface TowerSpec {
  hitpoints: number;
  damage: number;
  cooldownTicks: number;
  rangeMu: number;
}

export interface SimSpec {
  configVersion: string;
  units: Record<string, UnitSpec>;
  towers: { king: TowerSpec; guard: TowerSpec };
  durationTicks: number;
  doubleElixirStartTick: number;
  startingElixirTenths: number;
}

// ----------------------------------------------------------------- sim state

export interface WeaponRuntime {
  clip: number;
  cooldownTicks: number;
  reloadTicks: number;
}

export interface Unit {
  id: number;
  uid: string;
  owner: PlayerIndex;
  x: number; // mu
  y: number; // mu
  yawMdeg: number;
  pitchMdeg: number;
  hp: number;
  maxHp: number;
  spawnTick: number;
  /** Server-internal only — never serialized to opponents (PRD 1.2 bluff). */
  possessedBy: string | null;
  targetId: number; // -1 = none
  attackCooldownTicks: number;
  anim: 'idle' | 'walk' | 'attack' | 'death';
  /** Waypoints (cell centers, mu) from the last A* plan; index advances as reached. */
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  repathCooldownTicks: number;
  weaponAlpha: WeaponRuntime;
  weaponBeta: WeaponRuntime;
}

export interface Tower {
  id: number;
  kind: 'king' | 'guard';
  owner: PlayerIndex;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackCooldownTicks: number;
}

export interface Projectile {
  id: number;
  owner: PlayerIndex;
  shooterId: number;
  x: number;
  y: number;
  z: number;
  dirX: number; // milli-normalized
  dirY: number;
  dirZ: number;
  speedMuPerTick: number;
  damage: number;
  headshotMultPermille: number;
  travelledMu: number;
}

/** One tick of per-entity transforms, kept for lag-compensated rewind. */
export interface HistoryFrame {
  tick: number;
  entries: Array<{ id: number; x: number; y: number }>;
}

export interface SimState {
  tick: number;
  rngState: number;
  seed: number;
  elixirTenths: [number, number];
  elixirAcc: [number, number];
  crowns: [number, number];
  nextEntityId: number;
  units: Unit[]; // always sorted by id
  towers: Tower[]; // always sorted by id
  projectiles: Projectile[]; // always sorted by id
  history: HistoryFrame[]; // ring, most recent last, len <= HISTORY_TICKS
  gameOver: boolean;
  winner: -1 | 0 | 1; // -1 = draw/undecided
}

// --------------------------------------------------------------- tick inputs

export interface SpawnInput {
  type: 'spawn';
  player: PlayerIndex;
  playerId: string;
  seq: number;
  cardId: string;
  cellX: number;
  cellY: number;
  possess: boolean;
}

export interface MoveInput {
  type: 'move';
  player: PlayerIndex;
  playerId: string;
  seq: number;
  unitId: number;
  moveX: number; // milli-normalized, world space
  moveY: number;
  yawMdeg: number;
  pitchMdeg: number;
}

export interface ShootInput {
  type: 'shoot';
  player: PlayerIndex;
  playerId: string;
  seq: number;
  unitId: number;
  weapon: WeaponSlot;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Authoritative rewind tick, already computed and clamped by the server. */
  rewindTick: number;
}

export type TickInput = SpawnInput | MoveInput | ShootInput;

// ---------------------------------------------------------------- sim events

export type SimEvent =
  | { type: 'spawn'; id: number; uid: string; owner: PlayerIndex }
  | { type: 'possessStart'; unitId: number; owner: PlayerIndex; playerId: string }
  | { type: 'possessEnd'; unitId: number; owner: PlayerIndex; playerId: string; reason: 'death' | 'match_end' }
  | { type: 'hit'; targetId: number; damage: number; headshot: boolean }
  | { type: 'death'; id: number }
  | { type: 'shot'; shooterId: number; weapon: WeaponSlot | 'ai' }
  | { type: 'towerDestroyed'; id: number; owner: PlayerIndex }
  | { type: 'spawnRejected'; player: PlayerIndex; seq: number; reason: string }
  | { type: 'gameOver'; winner: -1 | 0 | 1 };
