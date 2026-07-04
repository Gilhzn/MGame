import { describe, expect, it } from 'vitest';
import { stepPossessedMovement } from './movementKernel.js';

describe('possessed movement kernel (cross-language contract)', () => {
  it('moves at the configured speed for full forward input', () => {
    const next = stepPossessedMovement({ moveX: 0, moveY: 1000 }, { x: 5500, y: 5500 }, 160);
    expect(next).toEqual({ x: 5500, y: 5660 });
  });

  it('normalizes diagonal input so it is not faster', () => {
    const next = stepPossessedMovement({ moveX: 1000, moveY: 1000 }, { x: 5500, y: 5500 }, 160);
    // 1000/√2 ≈ 707 per axis → 160*707/1000 = 113 (truncated)
    expect(next.x - 5500).toBe(113);
    expect(next.y - 5500).toBe(113);
  });

  it('cannot walk into a non-bridge river cell', () => {
    // Cell (5,10) is the bank; (5,11) is river and 5 is not a bridge column.
    const next = stepPossessedMovement({ moveX: 0, moveY: 1000 }, { x: 5500, y: 10950 }, 160);
    expect(next.y).toBe(10950); // blocked
  });

  it('can cross the river on a bridge column', () => {
    const next = stepPossessedMovement({ moveX: 0, moveY: 1000 }, { x: 2500, y: 10950 }, 160);
    expect(next.y).toBe(11110);
  });

  it('clamps to arena bounds', () => {
    const next = stepPossessedMovement({ moveX: -1000, moveY: 0 }, { x: 80, y: 5500 }, 160);
    expect(next.x).toBe(50);
  });

  it('zero input is a no-op', () => {
    const next = stepPossessedMovement({ moveX: 0, moveY: 0 }, { x: 5500, y: 5500 }, 160);
    expect(next).toEqual({ x: 5500, y: 5500 });
  });
});
