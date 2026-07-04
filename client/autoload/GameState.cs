using System;
using System.Collections.Generic;
using System.Linq;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// The replicated world: applies fog-culled STATE_DELTAs into the
/// interpolation buffer, tracks possession/prediction, and runs the
/// client half of desync detection (PRD 7.4) — when the server's embedded
/// view hash disagrees with ours, request a FULL_SNAPSHOT, purge, resume.
/// </summary>
public partial class GameState : Node
{
    public static GameState? Instance { get; private set; }

    public MatchStartDto? Match { get; private set; }
    public int PlayerIndex => Match?.PlayerIndex ?? 0;
    public int ElixirTenths { get; private set; }
    public bool DoubleElixir { get; private set; }
    public int ServerTick { get; private set; }
    public int PossessedUnitId { get; private set; } = -1;
    public readonly PredictionEngine Prediction = new();
    public readonly InterpolationBuffer Interpolation = new();

    /// <summary>Latest authoritative snapshot per entity id (already fog-culled server-side).</summary>
    public IReadOnlyDictionary<int, EntityDto> Entities => _entities;
    private readonly Dictionary<int, EntityDto> _entities = new();

    public event Action<StateDeltaDto>? DeltaApplied;
    public event Action<int>? PossessionStarted;
    public event Action<int, string>? PossessionEnded;
    public event Action<GameOverDto>? MatchEnded;

    private int _inputSeq;
    public int NextInputSeq() => ++_inputSeq;

    public override void _EnterTree()
    {
        Instance = this;
    }

    public override void _Ready()
    {
        var net = NetworkClient.Instance!;
        net.MatchStarted += OnMatchStart;
        net.StateDeltaReceived += OnDelta;
        net.FullSnapshotReceived += OnFullSnapshot;
        net.CorrectionReceived += OnCorrection;
        net.PossessConfirmed += OnPossessConfirm;
        net.PossessEnded += OnPossessEnd;
        net.GameOverReceived += over => MatchEnded?.Invoke(over);
    }

    private void OnMatchStart(MatchStartDto match)
    {
        Match = match;
        _entities.Clear();
        Interpolation.Clear();
        PossessedUnitId = -1;
        _inputSeq = 0;
    }

    private void OnDelta(StateDeltaDto delta)
    {
        ServerTick = delta.Tick;
        ElixirTenths = delta.Elixir;
        DoubleElixir = delta.DoubleElixir;

        foreach (var removed in delta.Removed) _entities.Remove(removed);
        // Deltas carry the full visible set, so replace rather than merge:
        // an entity that fell out of visibility must vanish (fog, PRD 2.2).
        _entities.Clear();
        foreach (var e in delta.Entities) _entities[e.Id] = e;

        Interpolation.AddSnapshot(
            delta.Tick,
            delta.Entities.Select(e => new EntityState(e.Id, e.X, e.Y, e.YawMdeg, e.Hp)));

        Prediction.AckThrough(delta.LastProcessedInputSeq);

        // Desync sentinel: entities arrive id-sorted from the culler.
        if (delta.StateHash is { } serverHash)
        {
            var ours = StateHasher.ViewHash(
                delta.Entities.Select(e => new EntityState(e.Id, e.X, e.Y, e.YawMdeg, e.Hp)));
            NetworkClient.Instance!.SendHashReport(delta.Tick, ours);
            if (ours != serverHash)
            {
                GD.PushWarning($"GameState: view-hash mismatch at tick {delta.Tick} — hard re-sync");
                NetworkClient.Instance!.SendResyncRequest();
            }
        }

        DeltaApplied?.Invoke(delta);
    }

    private void OnFullSnapshot(StateDeltaDto snapshot)
    {
        // Purge the local timeline and adopt the authoritative state within
        // one frame (PRD 7.4), then resume normal interpolation.
        _entities.Clear();
        Interpolation.Clear();
        OnDelta(snapshot);
    }

    private void OnCorrection(CorrectionDto corr)
    {
        if (corr.UnitId != PossessedUnitId) return;
        Prediction.ApplyCorrection(corr.LastInputSeq, new KernelTransform(corr.X, corr.Y));
    }

    private void OnPossessConfirm(int unitId)
    {
        PossessedUnitId = unitId;
        if (_entities.TryGetValue(unitId, out var e))
        {
            var unit = LiveOpsConfigService.Instance?.Config?.Unit(e.Uid);
            Prediction.Reset(new KernelTransform(e.X, e.Y), unit?.MoveSpeedMuPerTick ?? 160);
        }
        PossessionStarted?.Invoke(unitId);
    }

    private void OnPossessEnd(int unitId, string reason)
    {
        if (unitId == PossessedUnitId) PossessedUnitId = -1;
        PossessionEnded?.Invoke(unitId, reason);
    }
}
