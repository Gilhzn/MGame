import {
  EYE_HEIGHT_RATIO_PERMILLE,
  GRID_H,
  GRID_W,
  MAX_SHOT_RANGE_MU,
  TOWER_HITBOX,
} from './constants.js';
import { idiv, vecLen3 } from './fixed.js';
import type { PlayerIndex, SimEvent, SimSpec, SimState, Tower, Unit } from './types.js';

export interface RayTarget {
  id: number;
  x: number;
  y: number;
  radiusMu: number;
  heightMu: number;
  headRadiusMu: number; // 0 = no head hitbox (towers)
}

export interface RayHit {
  targetId: number;
  headshot: boolean;
  distMu: number;
}

interface SphereHit {
  distMu: number;
}

// Ray vs sphere, all fixed-point. dir must be milli-normalized.
function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  radiusMu: number,
  maxRangeMu: number,
): SphereHit | null {
  const rx = cx - ox;
  const ry = cy - oy;
  const rz = cz - oz;
  const s = idiv(rx * dx + ry * dy + rz * dz, 1000); // projection along ray, mu
  if (s < 0 || s > maxRangeMu) return null;
  const relSq = rx * rx + ry * ry + rz * rz;
  const closestSq = relSq - s * s;
  if (closestSq > radiusMu * radiusMu) return null;
  return { distMu: s };
}

/**
 * Cast a ray against a target set. Bodies are approximated by three stacked
 * spheres; the head (`Headshot_Bone`, PRD 1.2) is a dedicated sphere at the
 * top of the hitbox and wins when both intersect. Nearest target by hit
 * distance; ties break toward the lowest id (targets are iterated id-sorted).
 */
export function raycastTargets(
  ox: number, oy: number, oz: number,
  dirX: number, dirY: number, dirZ: number,
  targets: readonly RayTarget[],
  maxRangeMu: number = MAX_SHOT_RANGE_MU,
): RayHit | null {
  const len = vecLen3(dirX, dirY, dirZ);
  if (len === 0) return null;
  const dx = idiv(dirX * 1000, len);
  const dy = idiv(dirY * 1000, len);
  const dz = idiv(dirZ * 1000, len);

  let best: RayHit | null = null;
  for (const t of targets) {
    let candidate: RayHit | null = null;

    if (t.headRadiusMu > 0) {
      const headZ = t.heightMu - t.headRadiusMu;
      const head = raySphere(ox, oy, oz, dx, dy, dz, t.x, t.y, headZ, t.headRadiusMu, maxRangeMu);
      if (head) candidate = { targetId: t.id, headshot: true, distMu: head.distMu };
    }

    if (!candidate) {
      const r = t.radiusMu;
      const centers = [r, idiv(t.heightMu, 2), t.heightMu - r];
      for (const cz of centers) {
        const body = raySphere(ox, oy, oz, dx, dy, dz, t.x, t.y, cz, r, maxRangeMu);
        if (body && (!candidate || body.distMu < candidate.distMu)) {
          candidate = { targetId: t.id, headshot: false, distMu: body.distMu };
        }
      }
    }

    if (candidate && (!best || candidate.distMu < best.distMu)) best = candidate;
  }
  return best;
}

export function unitRayTarget(u: Unit, spec: SimSpec): RayTarget {
  const s = spec.units[u.uid]!;
  return {
    id: u.id,
    x: u.x,
    y: u.y,
    radiusMu: s.hitboxRadiusMu,
    heightMu: s.hitboxHeightMu,
    headRadiusMu: s.headRadiusMu,
  };
}

export function towerRayTarget(t: Tower): RayTarget {
  return {
    id: t.id,
    x: t.x,
    y: t.y,
    radiusMu: TOWER_HITBOX.radiusMu,
    heightMu: TOWER_HITBOX.heightMu,
    headRadiusMu: TOWER_HITBOX.headRadiusMu,
  };
}

/** Enemy units + towers of `shooterOwner`, id-sorted, with position overrides. */
export function enemyTargets(
  state: SimState,
  spec: SimSpec,
  shooterOwner: PlayerIndex,
  positions?: ReadonlyMap<number, { x: number; y: number }>,
): RayTarget[] {
  const out: RayTarget[] = [];
  for (const t of state.towers) {
    if (t.owner === shooterOwner) continue;
    const target = towerRayTarget(t);
    const p = positions?.get(t.id);
    if (p) {
      target.x = p.x;
      target.y = p.y;
    }
    out.push(target);
  }
  for (const u of state.units) {
    if (u.owner === shooterOwner) continue;
    const target = unitRayTarget(u, spec);
    const p = positions?.get(u.id);
    if (positions) {
      if (!p) continue; // did not exist at the rewound tick
      target.x = p.x;
      target.y = p.y;
    }
    out.push(target);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

export function eyeHeightMu(u: Unit, spec: SimSpec): number {
  return idiv(spec.units[u.uid]!.hitboxHeightMu * EYE_HEIGHT_RATIO_PERMILLE, 1000);
}

export function applyDamage(
  state: SimState,
  targetId: number,
  damage: number,
  headshot: boolean,
  events: SimEvent[],
): void {
  for (const u of state.units) {
    if (u.id === targetId) {
      u.hp -= damage;
      events.push({ type: 'hit', targetId, damage, headshot });
      return;
    }
  }
  for (const t of state.towers) {
    if (t.id === targetId) {
      t.hp -= damage;
      events.push({ type: 'hit', targetId, damage, headshot });
      return;
    }
  }
}

/** Advance projectiles one tick: sweep-test against enemies, cull at bounds. */
export function stepProjectiles(state: SimState, spec: SimSpec, events: SimEvent[]): void {
  const survivors: typeof state.projectiles = [];
  for (const p of state.projectiles) {
    const targets = enemyTargets(state, spec, p.owner);
    const hit = raycastTargets(p.x, p.y, p.z, p.dirX, p.dirY, p.dirZ, targets, p.speedMuPerTick);
    if (hit) {
      const mult = hit.headshot ? p.headshotMultPermille : 1000;
      applyDamage(state, hit.targetId, idiv(p.damage * mult, 1000), hit.headshot, events);
      continue;
    }
    p.x += idiv(p.dirX * p.speedMuPerTick, 1000);
    p.y += idiv(p.dirY * p.speedMuPerTick, 1000);
    p.z += idiv(p.dirZ * p.speedMuPerTick, 1000);
    p.travelledMu += p.speedMuPerTick;
    const out =
      p.z < 0 ||
      p.x < 0 || p.x > GRID_W * 1000 ||
      p.y < 0 || p.y > GRID_H * 1000 ||
      p.travelledMu > MAX_SHOT_RANGE_MU;
    if (!out) survivors.push(p);
  }
  state.projectiles = survivors;
}
