import {
  BRIDGE_COLS,
  BUSH_CELLS,
  GRID_H,
  GRID_W,
  P0_HOME_MAX_ROW,
  P1_HOME_MIN_ROW,
  RIVER_ROWS,
} from './constants.js';
import { idiv } from './fixed.js';
import type { PlayerIndex } from './types.js';

export function inBounds(cellX: number, cellY: number): boolean {
  return cellX >= 0 && cellX < GRID_W && cellY >= 0 && cellY < GRID_H;
}

export function isRiverRow(cellY: number): boolean {
  return RIVER_ROWS.includes(cellY);
}

export function isBridgeCol(cellX: number): boolean {
  return BRIDGE_COLS.includes(cellX);
}

/** Units can stand anywhere except non-bridge river cells. */
export function isWalkableCell(cellX: number, cellY: number): boolean {
  if (!inBounds(cellX, cellY)) return false;
  if (isRiverRow(cellY) && !isBridgeCol(cellX)) return false;
  return true;
}

/** Cards may only be deployed on walkable cells of the player's own territory (PRD 1.1). */
export function isValidDeployCell(player: PlayerIndex, cellX: number, cellY: number): boolean {
  if (!isWalkableCell(cellX, cellY)) return false;
  return player === 0 ? cellY <= P0_HOME_MAX_ROW : cellY >= P1_HOME_MIN_ROW;
}

export function isBushCell(cellX: number, cellY: number): boolean {
  for (const [bx, by] of BUSH_CELLS) {
    if (bx === cellX && by === cellY) return true;
  }
  return false;
}

export function cellOfMu(xMu: number, yMu: number): { x: number; y: number } {
  return { x: idiv(xMu, 1000), y: idiv(yMu, 1000) };
}

export function cellCenterMu(cellX: number, cellY: number): { x: number; y: number } {
  return { x: cellX * 1000 + 500, y: cellY * 1000 + 500 };
}
