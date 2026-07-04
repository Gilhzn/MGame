import type { LiveOpsConfig, UnitConfig, WeaponConfig } from '@overlord/protocol';
import { FP } from './fixed.js';
import { TICK_RATE } from './constants.js';
import type { SimSpec, TowerSpec, UnitSpec, WeaponSpec } from './types.js';

// Single deterministic float→int conversion point. After this, the sim never
// touches a float (docs/determinism.md rule 1).

function weaponSpec(w: WeaponConfig): WeaponSpec {
  return {
    kind: w.type,
    damage: w.damage,
    cooldownTicks: Math.max(1, Math.round(w.fire_rate_seconds * TICK_RATE)),
    clipCapacity: w.clip_capacity,
    reloadTicks: Math.max(1, Math.round(w.reload_seconds * TICK_RATE)),
    headshotMultPermille: Math.round(w.headshot_multiplier * 1000),
  };
}

function unitSpec(u: UnitConfig): UnitSpec {
  const searchRadiusMu = Math.round(u.ai_stats.search_radius * FP);
  return {
    uid: u.uid,
    rarity: u.rarity,
    rig: u.rig,
    elixirCostTenths: u.elixir_cost * 10,
    moveSpeedMuPerTick: Math.max(1, Math.round((u.ai_stats.move_speed * FP) / TICK_RATE)),
    searchRadiusMu,
    // AI units engage at 60% of their aggro radius.
    attackRangeMu: Math.max(FP, Math.trunc((searchRadiusMu * 600) / 1000)),
    attackCooldownTicks: Math.max(1, Math.round(u.ai_stats.attack_cooldown * TICK_RATE)),
    attackDamage: u.ai_stats.damage,
    hitpoints: u.ai_stats.hitpoints,
    hitboxRadiusMu: Math.round(u.hitbox.radius * FP),
    hitboxHeightMu: Math.round(u.hitbox.height * FP),
    headRadiusMu: Math.round(u.hitbox.head_radius * FP),
    weaponAlpha: weaponSpec(u.possession_fps_stats.weapon_alpha),
    weaponBeta: weaponSpec(u.possession_fps_stats.weapon_beta),
  };
}

function towerSpec(t: { hitpoints: number; damage: number; attack_cooldown: number; range: number }): TowerSpec {
  return {
    hitpoints: t.hitpoints,
    damage: t.damage,
    cooldownTicks: Math.max(1, Math.round(t.attack_cooldown * TICK_RATE)),
    rangeMu: Math.round(t.range * FP),
  };
}

export function buildSimSpec(config: LiveOpsConfig): SimSpec {
  const units: Record<string, UnitSpec> = {};
  for (const u of config.unit_registry) units[u.uid] = unitSpec(u);
  const arena = config.arena_config;
  const durationTicks = arena.match_duration_seconds * TICK_RATE;
  return {
    configVersion: config.liveops_version,
    units,
    towers: { king: towerSpec(arena.towers.king), guard: towerSpec(arena.towers.guard) },
    durationTicks,
    doubleElixirStartTick: durationTicks - arena.double_elixir_final_seconds * TICK_RATE,
    startingElixirTenths: arena.starting_elixir * 10,
  };
}
