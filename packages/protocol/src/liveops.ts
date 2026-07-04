import { z } from 'zod';

export const weaponConfigSchema = z.object({
  type: z.enum(['HITSCAN', 'PROJECTILE']),
  damage: z.number().int().min(0),
  fire_rate_seconds: z.number().positive(),
  clip_capacity: z.number().int().min(1),
  reload_seconds: z.number().min(0),
  headshot_multiplier: z.number().min(1),
});
export type WeaponConfig = z.infer<typeof weaponConfigSchema>;

export const unitConfigSchema = z.object({
  uid: z.string(),
  display_name: z.string().optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  rig: z.enum(['Heavy_Humanoid_Rig', 'Agile_Humanoid_Rig', 'Monstrous_Beast_Rig']),
  elixir_cost: z.number().int().min(1).max(10),
  ai_stats: z.object({
    move_speed: z.number().positive(),
    search_radius: z.number().positive(),
    attack_cooldown: z.number().positive(),
    damage: z.number().int().min(0),
    hitpoints: z.number().int().min(1),
  }),
  hitbox: z.object({
    radius: z.number().positive(),
    height: z.number().positive(),
    head_radius: z.number().positive(),
  }),
  possession_fps_stats: z.object({
    mouse_sensitivity_scale: z.number().positive(),
    weapon_alpha: weaponConfigSchema,
    weapon_beta: weaponConfigSchema,
  }),
});
export type UnitConfig = z.infer<typeof unitConfigSchema>;

export const chestMatrixSchema = z.object({
  unlock_duration_seconds: z.number().int().min(0),
  common_chance: z.number().min(0).max(100),
  rare_chance: z.number().min(0).max(100),
  epic_chance: z.number().min(0).max(100),
  legendary_chance: z.number().min(0).max(100),
  card_count: z.number().int().min(1).default(6),
  gold_min: z.number().int().min(0).default(20),
  gold_max: z.number().int().min(0).default(40),
});
export type ChestMatrix = z.infer<typeof chestMatrixSchema>;

export const towerConfigSchema = z.object({
  hitpoints: z.number().int().min(1),
  damage: z.number().int().min(0),
  attack_cooldown: z.number().positive(),
  range: z.number().positive(),
});
export type TowerConfig = z.infer<typeof towerConfigSchema>;

export const arenaConfigSchema = z.object({
  match_duration_seconds: z.number().int().min(30),
  double_elixir_final_seconds: z.number().int().min(0),
  starting_elixir: z.number().int().min(0).max(10),
  towers: z.object({ king: towerConfigSchema, guard: towerConfigSchema }),
});
export type ArenaConfig = z.infer<typeof arenaConfigSchema>;

export const liveOpsConfigSchema = z.object({
  liveops_version: z.string(),
  meta_progression_curves: z.object({
    card_upgrade_gold_costs: z.array(z.number().int().min(0)),
    cards_required_for_upgrade: z.array(z.number().int().min(0)),
  }),
  lootbox_drop_matrices: z.record(z.string(), chestMatrixSchema),
  arena_config: arenaConfigSchema,
  unit_registry: z.array(unitConfigSchema).min(1),
});
export type LiveOpsConfig = z.infer<typeof liveOpsConfigSchema>;

export function parseLiveOpsConfig(json: unknown): LiveOpsConfig {
  return liveOpsConfigSchema.parse(json);
}
