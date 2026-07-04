import { enemyTargets, applyDamage, eyeHeightMu, raycastTargets } from './combat.js';
import { PROJECTILE_SPEED_MU_PER_TICK } from './constants.js';
import { idiv } from './fixed.js';
import { positionsAt } from './history.js';
import { stepPossessedMovement } from './movementKernel.js';
import type { MoveInput, ShootInput, SimEvent, SimSpec, SimState, Unit, WeaponSpec } from './types.js';

function findPossessedUnit(state: SimState, unitId: number, playerId: string): Unit | null {
  for (const u of state.units) {
    if (u.id === unitId) return u.possessedBy === playerId ? u : null;
  }
  return null;
}

export function applyMoveInput(state: SimState, spec: SimSpec, input: MoveInput): void {
  const unit = findPossessedUnit(state, input.unitId, input.playerId);
  if (!unit) return;
  const uspec = spec.units[unit.uid]!;
  const next = stepPossessedMovement(
    { moveX: input.moveX, moveY: input.moveY },
    { x: unit.x, y: unit.y },
    uspec.moveSpeedMuPerTick,
  );
  unit.x = next.x;
  unit.y = next.y;
  unit.yawMdeg = input.yawMdeg;
  unit.pitchMdeg = input.pitchMdeg;
  unit.anim = input.moveX !== 0 || input.moveY !== 0 ? 'walk' : 'idle';
}

export function applyShootInput(state: SimState, spec: SimSpec, input: ShootInput, events: SimEvent[]): void {
  const unit = findPossessedUnit(state, input.unitId, input.playerId);
  if (!unit) return;
  const uspec = spec.units[unit.uid]!;
  const wspec: WeaponSpec = input.weapon === 'alpha' ? uspec.weaponAlpha : uspec.weaponBeta;
  const w = input.weapon === 'alpha' ? unit.weaponAlpha : unit.weaponBeta;

  if (w.cooldownTicks > 0 || w.reloadTicks > 0) return;
  if (w.clip <= 0) {
    w.reloadTicks = wspec.reloadTicks;
    return;
  }
  w.clip--;
  w.cooldownTicks = wspec.cooldownTicks;
  if (w.clip === 0) w.reloadTicks = wspec.reloadTicks;

  // The server never trusts the client origin: shots leave the authoritative
  // unit position at eye height. Only the aim direction comes from the client.
  const ox = unit.x;
  const oy = unit.y;
  const oz = eyeHeightMu(unit, spec);
  events.push({ type: 'shot', shooterId: unit.id, weapon: input.weapon });

  if (wspec.kind === 'HITSCAN') {
    // Lag compensation (PRD 2.1): hit-test against the rewound world.
    const rewound = positionsAt(state, input.rewindTick);
    const targets = enemyTargets(state, spec, unit.owner, rewound);
    const hit = raycastTargets(ox, oy, oz, input.dirX, input.dirY, input.dirZ, targets);
    if (hit) {
      const mult = hit.headshot ? wspec.headshotMultPermille : 1000;
      applyDamage(state, hit.targetId, idiv(wspec.damage * mult, 1000), hit.headshot, events);
    }
  } else {
    state.projectiles.push({
      id: state.nextEntityId++,
      owner: unit.owner,
      shooterId: unit.id,
      x: ox,
      y: oy,
      z: oz,
      dirX: input.dirX,
      dirY: input.dirY,
      dirZ: input.dirZ,
      speedMuPerTick: PROJECTILE_SPEED_MU_PER_TICK,
      damage: wspec.damage,
      headshotMultPermille: wspec.headshotMultPermille,
      travelledMu: 0,
    });
  }
}

/** Per-tick weapon timers, for every unit (possessed or not — the bluff keeps state identical). */
export function tickWeaponTimers(unit: Unit, spec: SimSpec): void {
  const uspec = spec.units[unit.uid]!;
  const pairs: Array<[typeof unit.weaponAlpha, WeaponSpec]> = [
    [unit.weaponAlpha, uspec.weaponAlpha],
    [unit.weaponBeta, uspec.weaponBeta],
  ];
  for (const [w, ws] of pairs) {
    if (w.cooldownTicks > 0) w.cooldownTicks--;
    if (w.reloadTicks > 0) {
      w.reloadTicks--;
      if (w.reloadTicks === 0) w.clip = ws.clipCapacity;
    }
  }
}
