// Fixed-point integer math. 1.0 world unit = 1000 milli-units (mu).
// Every operation here must be mirrored exactly by client/CoreLogic/FixedMath.cs:
// division truncates toward zero (JS Math.trunc == C# integer division).

export const FP = 1000;

/** Truncate-toward-zero integer division — matches C# `a / b` for ints. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** (a * b) / FP with truncation. Operands must stay within safe-integer bounds. */
export function fpMul(a: number, b: number): number {
  return Math.trunc((a * b) / FP);
}

/** (a * FP) / b with truncation. */
export function fpDiv(a: number, b: number): number {
  return Math.trunc((a * FP) / b);
}

/**
 * Exact integer square root. Math.sqrt is IEEE-754 correctly rounded and thus
 * deterministic; the adjust loop removes any residual rounding at boundaries.
 */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** Length of a 2D vector in mu. dx,dy up to ~50k are safe (dx²+dy² < 2^53). */
export function vecLen(dx: number, dy: number): number {
  return isqrt(dx * dx + dy * dy);
}

export function vecLen3(dx: number, dy: number, dz: number): number {
  return isqrt(dx * dx + dy * dy + dz * dz);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
