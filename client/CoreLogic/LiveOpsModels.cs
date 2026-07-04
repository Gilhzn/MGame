using System.Text.Json;
using System.Text.Json.Serialization;

namespace Overlord.CoreLogic;

// Typed view of config/liveops.json (PRD 6) — snake_case on the wire.

public sealed class LiveOpsConfig
{
    [JsonPropertyName("liveops_version")] public string LiveopsVersion { get; set; } = "";
    [JsonPropertyName("meta_progression_curves")] public ProgressionCurves MetaProgressionCurves { get; set; } = new();
    [JsonPropertyName("lootbox_drop_matrices")] public Dictionary<string, ChestMatrix> LootboxDropMatrices { get; set; } = new();
    [JsonPropertyName("arena_config")] public ArenaConfig Arena { get; set; } = new();
    [JsonPropertyName("unit_registry")] public List<UnitConfig> UnitRegistry { get; set; } = new();

    public static LiveOpsConfig Parse(string json) =>
        JsonSerializer.Deserialize<LiveOpsConfig>(json)
        ?? throw new JsonException("empty liveops config");

    public UnitConfig? Unit(string uid) => UnitRegistry.Find(u => u.Uid == uid);
}

public sealed class ProgressionCurves
{
    [JsonPropertyName("card_upgrade_gold_costs")] public List<int> CardUpgradeGoldCosts { get; set; } = new();
    [JsonPropertyName("cards_required_for_upgrade")] public List<int> CardsRequiredForUpgrade { get; set; } = new();
}

public sealed class ChestMatrix
{
    [JsonPropertyName("unlock_duration_seconds")] public int UnlockDurationSeconds { get; set; }
    [JsonPropertyName("common_chance")] public double CommonChance { get; set; }
    [JsonPropertyName("rare_chance")] public double RareChance { get; set; }
    [JsonPropertyName("epic_chance")] public double EpicChance { get; set; }
    [JsonPropertyName("legendary_chance")] public double LegendaryChance { get; set; }
    [JsonPropertyName("card_count")] public int CardCount { get; set; }
    [JsonPropertyName("gold_min")] public int GoldMin { get; set; }
    [JsonPropertyName("gold_max")] public int GoldMax { get; set; }
}

public sealed class ArenaConfig
{
    [JsonPropertyName("match_duration_seconds")] public int MatchDurationSeconds { get; set; }
    [JsonPropertyName("double_elixir_final_seconds")] public int DoubleElixirFinalSeconds { get; set; }
    [JsonPropertyName("starting_elixir")] public int StartingElixir { get; set; }
}

public sealed class UnitConfig
{
    [JsonPropertyName("uid")] public string Uid { get; set; } = "";
    [JsonPropertyName("display_name")] public string DisplayName { get; set; } = "";
    [JsonPropertyName("rarity")] public string Rarity { get; set; } = "common";
    [JsonPropertyName("rig")] public string Rig { get; set; } = "Agile_Humanoid_Rig";
    [JsonPropertyName("elixir_cost")] public int ElixirCost { get; set; }
    [JsonPropertyName("ai_stats")] public AiStats Ai { get; set; } = new();
    [JsonPropertyName("hitbox")] public Hitbox HitboxDef { get; set; } = new();
    [JsonPropertyName("possession_fps_stats")] public PossessionStats Possession { get; set; } = new();

    /// <summary>Movement kernel speed: mirror of spec.ts moveSpeedMuPerTick.</summary>
    public int MoveSpeedMuPerTick => Math.Max(1, (int)Math.Round(Ai.MoveSpeed * 1000 / 20));

    public sealed class AiStats
    {
        [JsonPropertyName("move_speed")] public double MoveSpeed { get; set; }
        [JsonPropertyName("search_radius")] public double SearchRadius { get; set; }
        [JsonPropertyName("attack_cooldown")] public double AttackCooldown { get; set; }
        [JsonPropertyName("damage")] public int Damage { get; set; }
        [JsonPropertyName("hitpoints")] public int Hitpoints { get; set; }
    }

    public sealed class Hitbox
    {
        [JsonPropertyName("radius")] public double Radius { get; set; }
        [JsonPropertyName("height")] public double Height { get; set; }
        [JsonPropertyName("head_radius")] public double HeadRadius { get; set; }
    }

    public sealed class PossessionStats
    {
        [JsonPropertyName("mouse_sensitivity_scale")] public double MouseSensitivityScale { get; set; }
        [JsonPropertyName("weapon_alpha")] public Weapon WeaponAlpha { get; set; } = new();
        [JsonPropertyName("weapon_beta")] public Weapon WeaponBeta { get; set; } = new();
    }

    public sealed class Weapon
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "HITSCAN";
        [JsonPropertyName("damage")] public int Damage { get; set; }
        [JsonPropertyName("fire_rate_seconds")] public double FireRateSeconds { get; set; }
        [JsonPropertyName("clip_capacity")] public int ClipCapacity { get; set; }
        [JsonPropertyName("reload_seconds")] public double ReloadSeconds { get; set; }
        [JsonPropertyName("headshot_multiplier")] public double HeadshotMultiplier { get; set; }
    }
}
