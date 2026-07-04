using System.Text.Json;
using System.Text.Json.Serialization;

namespace Overlord.CoreLogic;

/// <summary>Wire opcodes — mirror of packages/protocol/src/opcodes.ts.</summary>
public static class Opcodes
{
    // Client → server
    public const string Hello = "HELLO";
    public const string QueueJoin = "QUEUE_JOIN";
    public const string QueueLeave = "QUEUE_LEAVE";
    public const string Ready = "READY";
    public const string SpawnCard = "SPAWN_CARD";
    public const string Input = "INPUT";
    public const string Shoot = "SHOOT";
    public const string HashReport = "HASH_REPORT";
    public const string ResyncRequest = "RESYNC_REQUEST";
    public const string Ping = "PING";

    // Server → client
    public const string Welcome = "WELCOME";
    public const string Queued = "QUEUED";
    public const string MatchFound = "MATCH_FOUND";
    public const string MatchStart = "MATCH_START";
    public const string StateDelta = "STATE_DELTA";
    public const string Correction = "CORRECTION";
    public const string FullSnapshot = "FULL_SNAPSHOT";
    public const string PossessConfirm = "POSSESS_CONFIRM";
    public const string PossessEnd = "POSSESS_END";
    public const string GameOver = "GAME_OVER";
    public const string Pong = "PONG";
    public const string Error = "ERROR";
}

public sealed class Envelope
{
    [JsonPropertyName("v")] public int V { get; set; } = 1;
    [JsonPropertyName("t")] public string T { get; set; } = "";
    [JsonPropertyName("seq")] public int Seq { get; set; }
    [JsonPropertyName("ack")] public int? Ack { get; set; }
    [JsonPropertyName("tick")] public int? Tick { get; set; }
    [JsonPropertyName("p")] public JsonElement P { get; set; }
}

// ---- payload DTOs (camelCase wire names via the serializer options) ----

public sealed class EntityDto
{
    public int Id { get; set; }
    public string Kind { get; set; } = "unit";
    public string Uid { get; set; } = "";
    public int Owner { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
    public int YawMdeg { get; set; }
    public int Hp { get; set; }
    public int MaxHp { get; set; }
    public string Anim { get; set; } = "idle";
}

public sealed class StateDeltaDto
{
    public int Tick { get; set; }
    public List<EntityDto> Entities { get; set; } = new();
    public List<int> Removed { get; set; } = new();
    public List<JsonElement> Events { get; set; } = new();
    public int Elixir { get; set; }
    public bool DoubleElixir { get; set; }
    public int LastProcessedInputSeq { get; set; }
    public string? StateHash { get; set; }
}

public sealed class MatchStartDto
{
    public int Tick0 { get; set; }
    public long Seed { get; set; }
    public int PlayerIndex { get; set; }
    public List<List<string>> Decks { get; set; } = new();
    public string ConfigVersion { get; set; } = "";
    public int DurationTicks { get; set; }
}

public sealed class CorrectionDto
{
    public int UnitId { get; set; }
    public int Tick { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
    public int YawMdeg { get; set; }
    public int LastInputSeq { get; set; }
}

public sealed class PossessDto
{
    public int UnitId { get; set; }
    public string? Reason { get; set; }
}

public sealed class GameOverDto
{
    public int WinnerIndex { get; set; }
    public List<int> Crowns { get; set; } = new();
    public int TrophyDelta { get; set; }
    public RewardsDto Rewards { get; set; } = new();
    public string? ReplayId { get; set; }

    public sealed class RewardsDto
    {
        public int Gold { get; set; }
        public string? ChestType { get; set; }
    }
}

public sealed class SpawnCardDto
{
    public string CardId { get; set; } = "";
    public CellDto Cell { get; set; } = new();
    public bool Possess { get; set; }

    public sealed class CellDto
    {
        public int X { get; set; }
        public int Y { get; set; }
    }
}

public sealed class InputDto
{
    public int UnitId { get; set; }
    public int CTick { get; set; }
    public int Seq { get; set; }
    public int MoveX { get; set; }
    public int MoveY { get; set; }
    public int YawMdeg { get; set; }
    public int PitchMdeg { get; set; }
    public int PredictedX { get; set; }
    public int PredictedY { get; set; }
}

public sealed class ShootDto
{
    public int UnitId { get; set; }
    public string Weapon { get; set; } = "alpha";
    public int OriginX { get; set; }
    public int OriginY { get; set; }
    public int OriginZ { get; set; }
    public int DirX { get; set; }
    public int DirY { get; set; }
    public int DirZ { get; set; }
    public long ClientTimeMs { get; set; }
    public int Seq { get; set; }
}

/// <summary>JSON codec — mirror of packages/protocol/src/codec.ts.</summary>
public static class Codec
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Encode(string op, object payload, int seq, int? ack = null, int? tick = null)
    {
        var env = new Envelope
        {
            T = op,
            Seq = seq,
            Ack = ack,
            Tick = tick,
            P = JsonSerializer.SerializeToElement(payload, Options),
        };
        return JsonSerializer.Serialize(env, Options);
    }

    public static Envelope? Decode(string raw)
    {
        try
        {
            var env = JsonSerializer.Deserialize<Envelope>(raw, Options);
            if (env is null || env.V != 1 || string.IsNullOrEmpty(env.T)) return null;
            return env;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static T? Payload<T>(Envelope env) => env.P.Deserialize<T>(Options);
}
