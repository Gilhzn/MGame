import { applyDamage } from './combat.js';
import { idiv, isqrt } from './fixed.js';
import { cellCenterMu, cellOfMu } from './grid.js';
import { findPath } from './pathfinding.js';
import { stepPossessedMovement } from './movementKernel.js';
import type { SimEvent, SimSpec, SimState, Tower, Unit } from './types.js';

const REPATH_TICKS = 10;

// Deterministic 8-direction facing for AI units (yaw feeds the state hash, so
// no float trig). Math convention: 0 = +X, CCW positive, milli-degrees.
export function facing8Mdeg(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax * 1000 > ay * 2414) return dx > 0 ? 0 : 180000; // within 22.5° of ±X
  if (ay * 1000 > ax * 2414) return dy > 0 ? 90000 : -90000;
  if (dx > 0) return dy > 0 ? 45000 : -45000;
  return dy > 0 ? 135000 : -135000;
}

function distMu(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return isqrt(dx * dx + dy * dy);
}

interface Acquired {
  id: number;
  x: number;
  y: number;
  radiusMu: number;
}

/** Nearest enemy unit within aggro radius, else nearest enemy tower. Ties → lowest id. */
function acquireTarget(state: SimState, spec: SimSpec, unit: Unit): Acquired | null {
  const uspec = spec.units[unit.uid]!;
  let best: Acquired | null = null;
  let bestDist = uspec.searchRadiusMu;
  for (const e of state.units) {
    if (e.owner === unit.owner) continue;
    const d = distMu(unit.x, unit.y, e.x, e.y);
    if (d < bestDist || (d === bestDist && best !== null && e.id < best.id)) {
      best = { id: e.id, x: e.x, y: e.y, radiusMu: spec.units[e.uid]!.hitboxRadiusMu };
      bestDist = d;
    }
  }
  if (best) return best;

  let bestTower: Tower | null = null;
  let towerDist = Infinity;
  for (const t of state.towers) {
    if (t.owner === unit.owner) continue;
    const d = distMu(unit.x, unit.y, t.x, t.y);
    if (d < towerDist || (d === towerDist && bestTower !== null && t.id < bestTower.id)) {
      bestTower = t;
      towerDist = d;
    }
  }
  return bestTower ? { id: bestTower.id, x: bestTower.x, y: bestTower.y, radiusMu: 900 } : null;
}

function moveAlongPath(unit: Unit, uspec: { moveSpeedMuPerTick: number }, goalX: number, goalY: number): void {
  const from = cellOfMu(unit.x, unit.y);
  const goal = cellOfMu(goalX, goalY);

  const lastGoal = unit.path.length > 0 ? unit.path[unit.path.length - 1]! : null;
  const goalChanged = !lastGoal || cellOfMu(lastGoal.x, lastGoal.y).x !== goal.x || cellOfMu(lastGoal.x, lastGoal.y).y !== goal.y;
  if (unit.repathCooldownTicks <= 0 || goalChanged || unit.pathIndex >= unit.path.length) {
    const cells = findPath(from.x, from.y, goal.x, goal.y);
    unit.path = cells.map((c) => cellCenterMu(c.x, c.y));
    unit.pathIndex = 0;
    unit.repathCooldownTicks = REPATH_TICKS;
  }

  // Steer at the next waypoint, or directly at the goal when in the same cell.
  let wx = goalX;
  let wy = goalY;
  if (unit.pathIndex < unit.path.length) {
    const wp = unit.path[unit.pathIndex]!;
    wx = wp.x;
    wy = wp.y;
    if (distMu(unit.x, unit.y, wx, wy) <= uspec.moveSpeedMuPerTick) unit.pathIndex++;
  }

  const dx = wx - unit.x;
  const dy = wy - unit.y;
  const len = isqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const moveX = idiv(dx * 1000, len);
  const moveY = idiv(dy * 1000, len);
  const next = stepPossessedMovement({ moveX, moveY }, { x: unit.x, y: unit.y }, uspec.moveSpeedMuPerTick);
  unit.x = next.x;
  unit.y = next.y;
  unit.yawMdeg = facing8Mdeg(dx, dy);
}

/** Fixed AI behavior pattern (PRD 1.2): aggro → engage at range → uniform cadence. */
export function tickUnitAI(state: SimState, spec: SimSpec, unit: Unit, events: SimEvent[]): void {
  const uspec = spec.units[unit.uid]!;
  if (unit.repathCooldownTicks > 0) unit.repathCooldownTicks--;

  const target = acquireTarget(state, spec, unit);
  if (!target) {
    unit.anim = 'idle';
    unit.targetId = -1;
    return;
  }
  unit.targetId = target.id;

  const gap = distMu(unit.x, unit.y, target.x, target.y) - target.radiusMu;
  if (gap <= uspec.attackRangeMu) {
    unit.anim = 'attack';
    unit.yawMdeg = facing8Mdeg(target.x - unit.x, target.y - unit.y);
    if (unit.attackCooldownTicks === 0) {
      applyDamage(state, target.id, uspec.attackDamage, false, events);
      events.push({ type: 'shot', shooterId: unit.id, weapon: 'ai' });
      unit.attackCooldownTicks = uspec.attackCooldownTicks;
    }
  } else {
    unit.anim = 'walk';
    moveAlongPath(unit, uspec, target.x, target.y);
  }
}

export function tickTowerAI(state: SimState, spec: SimSpec, tower: Tower, events: SimEvent[]): void {
  const tspec = spec.towers[tower.kind];
  if (tower.attackCooldownTicks > 0) {
    tower.attackCooldownTicks--;
    return;
  }
  let best: Unit | null = null;
  let bestDist = tspec.rangeMu;
  for (const u of state.units) {
    if (u.owner === tower.owner) continue;
    const d = distMu(tower.x, tower.y, u.x, u.y);
    if (d < bestDist || (d === bestDist && best !== null && u.id < best.id)) {
      best = u;
      bestDist = d;
    }
  }
  if (best) {
    applyDamage(state, best.id, tspec.damage, false, events);
    events.push({ type: 'shot', shooterId: tower.id, weapon: 'ai' });
    tower.attackCooldownTicks = tspec.cooldownTicks;
  }
}
