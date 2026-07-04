import { FP } from './fixed.js';

export const TICK_RATE = 20;
export const TICK_MS = 50;

// Arena: 12 columns (x) by 24 rows (y). 1 cell = 1 world unit = 1000 mu.
export const GRID_W = 12;
export const GRID_H = 24;
export const CELL_MU = FP;

// Player 0 home: rows 0-10. River: rows 11-12. Player 1 home: rows 13-23.
export const P0_HOME_MAX_ROW = 10;
export const P1_HOME_MIN_ROW = 13;
export const RIVER_ROWS: readonly number[] = [11, 12];
export const BRIDGE_COLS: readonly number[] = [2, 3, 8, 9]; // two 2-wide bridges

// Stealth bushes hug the river banks at the flanks (PRD 2.2 fog of war).
export const BUSH_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 10], [1, 10], [10, 10], [11, 10],
  [0, 13], [1, 13], [10, 13], [11, 13],
];

// Elixir (PRD 1.1): 1 point per 2.8s = 56 ticks; 2x speed in the final 60s;
// cap 10. Stored in tenths, so a grant is 10 tenths.
export const ELIXIR_ACC_TARGET = 56;
export const ELIXIR_GRANT_TENTHS = 10;
export const ELIXIR_CAP_TENTHS = 100;

// Netcode (PRD 2.1)
export const DIVERGENCE_THRESHOLD_MU = 150; // 0.15 units
export const HISTORY_TICKS = 20; // 1 second of rewind for lag compensation

// Fog of war sight model
export const UNIT_SIGHT_RANGE_MU = 10 * FP;
export const TOWER_SIGHT_RANGE_MU = 9 * FP;
export const BUSH_REVEAL_RANGE_MU = 2500; // 2.5 units to reveal a bushed entity
export const TOWER_OCCLUSION_RADIUS_MU = 1200; // sightline blocker disc

// Combat
export const MAX_SHOT_RANGE_MU = 40 * FP;
export const PROJECTILE_SPEED_MU_PER_TICK = 750; // 15 units/s
export const EYE_HEIGHT_RATIO_PERMILLE = 900; // shot origin at 90% of unit height

// Tower layout: [cellCenterXmu, cellCenterYmu] per player.
export const TOWER_LAYOUT: ReadonlyArray<{
  kind: 'king' | 'guard';
  owner: 0 | 1;
  x: number;
  y: number;
}> = [
  { kind: 'king', owner: 0, x: 5500, y: 1500 },
  { kind: 'guard', owner: 0, x: 2500, y: 4500 },
  { kind: 'guard', owner: 0, x: 9500, y: 4500 },
  { kind: 'king', owner: 1, x: 5500, y: 22500 },
  { kind: 'guard', owner: 1, x: 2500, y: 19500 },
  { kind: 'guard', owner: 1, x: 9500, y: 19500 },
];

export const TOWER_HITBOX = { radiusMu: 900, heightMu: 3000, headRadiusMu: 0 };
