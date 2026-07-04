// Input sanity validation (PRD 2.2): a ≥180° yaw snap within a single tick is
// beyond human capability. The snap alone only arms suspicion; the packet is
// invalidated when it is accompanied by a critical headshot (the room
// pre-evaluates the shot against the rewound world before applying it).

export const MAX_HUMAN_YAW_DELTA_PER_TICK_MDEG = 180000;
const SUSPICION_WINDOW_TICKS = 2;

/** Wrap-aware absolute yaw delta in milli-degrees, result in [0, 180000]. */
export function yawDeltaMdeg(fromMdeg: number, toMdeg: number): number {
  let d = (toMdeg - fromMdeg) % 360000;
  if (d > 180000) d -= 360000;
  if (d < -180000) d += 360000;
  return Math.abs(d);
}

export class RotationMonitor {
  private lastYawByUnit = new Map<number, { yaw: number; tick: number }>();
  private suspiciousUntil = new Map<number, number>();

  observeInput(unitId: number, yawMdeg: number, tick: number): void {
    const last = this.lastYawByUnit.get(unitId);
    if (last && tick - last.tick <= 1) {
      if (yawDeltaMdeg(last.yaw, yawMdeg) >= MAX_HUMAN_YAW_DELTA_PER_TICK_MDEG) {
        this.suspiciousUntil.set(unitId, tick + SUSPICION_WINDOW_TICKS);
      }
    }
    this.lastYawByUnit.set(unitId, { yaw: yawMdeg, tick });
  }

  isSuspicious(unitId: number, tick: number): boolean {
    const until = this.suspiciousUntil.get(unitId);
    return until !== undefined && tick <= until;
  }

  forget(unitId: number): void {
    this.lastYawByUnit.delete(unitId);
    this.suspiciousUntil.delete(unitId);
  }
}
