import { describe, expect, it } from 'vitest';
import { BRIDGE_COLS, RIVER_ROWS } from './constants.js';
import { isWalkableCell } from './grid.js';
import { findPath } from './pathfinding.js';

describe('pathfinding', () => {
  it('routes across the river only via bridges', () => {
    const path = findPath(5, 5, 5, 18);
    expect(path.length).toBeGreaterThanOrEqual(13);
    for (const cell of path) {
      expect(isWalkableCell(cell.x, cell.y)).toBe(true);
      if (RIVER_ROWS.includes(cell.y)) {
        expect(BRIDGE_COLS.includes(cell.x)).toBe(true);
      }
    }
    expect(path[path.length - 1]).toEqual({ x: 5, y: 18 });
  });

  it('is deterministic: identical calls return identical paths', () => {
    const a = findPath(0, 0, 11, 23);
    const b = findPath(0, 0, 11, 23);
    expect(a).toEqual(b);
  });

  it('returns an empty path when already at the goal', () => {
    expect(findPath(3, 3, 3, 3)).toEqual([]);
  });

  it('returns an empty path for unwalkable goals (river, non-bridge)', () => {
    expect(findPath(5, 5, 0, 11)).toEqual([]);
  });
});
