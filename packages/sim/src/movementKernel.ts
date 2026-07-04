import { idiv, vecLen } from './fixed.js';
import { isWalkableCell } from './grid.js';
import { GRID_H, GRID_W } from './constants.js';

// ============================================================================
// THE CROSS-LANGUAGE CONTRACT (docs/determinism.md).
// This function is mirrored byte-for-byte in behavior by
// client/CoreLogic/MovementKernel.cs and pinned by shared/golden/
// movement_vectors.json. Any change here REQUIRES regenerating the golden
// vectors (`npm run golden`) and porting the change to the C# side.
// ============================================================================

export interface KernelInput {
  moveX: number; // world-space, milli-normalized (-1000..1000)
  moveY: number;
}

export interface KernelTransform {
  x: number; // mu
  y: number; // mu
}

const MIN_MU = 50; // keep hitbox centers off the exact arena border

/**
 * Advance a possessed unit by one 50ms tick. Movement input is world-space
 * (the client resolves joystick+camera into world axes with local floats;
 * only the resulting integer vector enters the deterministic domain).
 * Axis-separated collision: try X then Y so walls slide instead of stick.
 */
export function stepPossessedMovement(
  input: KernelInput,
  t: KernelTransform,
  speedMuPerTick: number,
): KernelTransform {
  let mx = input.moveX;
  let my = input.moveY;

  // Clamp magnitude to 1000 so diagonal input is not faster.
  const mag = vecLen(mx, my);
  if (mag > 1000) {
    mx = idiv(mx * 1000, mag);
    my = idiv(my * 1000, mag);
  }

  const dx = idiv(mx * speedMuPerTick, 1000);
  const dy = idiv(my * speedMuPerTick, 1000);

  let nx = t.x;
  let ny = t.y;

  const candX = clampMu(nx + dx, GRID_W);
  if (isWalkableCell(idiv(candX, 1000), idiv(ny, 1000))) nx = candX;

  const candY = clampMu(ny + dy, GRID_H);
  if (isWalkableCell(idiv(nx, 1000), idiv(candY, 1000))) ny = candY;

  return { x: nx, y: ny };
}

function clampMu(v: number, cells: number): number {
  const max = cells * 1000 - MIN_MU;
  return v < MIN_MU ? MIN_MU : v > max ? max : v;
}
