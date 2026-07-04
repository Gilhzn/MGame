import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLiveOpsConfig, type LiveOpsConfig } from '@overlord/protocol';
import { buildSimSpec } from './spec.js';
import type { PlayerIndex, SimSpec, SimState, Unit } from './types.js';

export function loadLiveOpsConfig(): LiveOpsConfig {
  const path = fileURLToPath(new URL('../../../config/liveops.json', import.meta.url));
  return parseLiveOpsConfig(JSON.parse(readFileSync(path, 'utf8')));
}

export function loadSpec(): SimSpec {
  return buildSimSpec(loadLiveOpsConfig());
}

/** Test-only direct unit injection (production spawns go through step()). */
export function injectUnit(
  state: SimState,
  spec: SimSpec,
  uid: string,
  owner: PlayerIndex,
  x: number,
  y: number,
  possessedBy: string | null = null,
): Unit {
  const uspec = spec.units[uid]!;
  const unit: Unit = {
    id: state.nextEntityId++,
    uid,
    owner,
    x,
    y,
    yawMdeg: 0,
    pitchMdeg: 0,
    hp: uspec.hitpoints,
    maxHp: uspec.hitpoints,
    spawnTick: state.tick,
    possessedBy,
    targetId: -1,
    attackCooldownTicks: 0,
    anim: 'idle',
    path: [],
    pathIndex: 0,
    repathCooldownTicks: 0,
    weaponAlpha: { clip: uspec.weaponAlpha.clipCapacity, cooldownTicks: 0, reloadTicks: 0 },
    weaponBeta: { clip: uspec.weaponBeta.clipCapacity, cooldownTicks: 0, reloadTicks: 0 },
  };
  state.units.push(unit);
  return unit;
}
