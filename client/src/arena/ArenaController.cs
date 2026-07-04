using System.Collections.Generic;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// The battle scene root: builds the 12x24 board (mirroring the Blender
/// palette), spawns/updates EntityViews from the interpolation buffer,
/// routes possession events into the camera + controller, and wires the
/// card hand to SPAWN_CARD.
/// </summary>
public partial class ArenaController : Node3D
{
    private readonly Dictionary<int, EntityView> _views = new();
    private CameraDirector _camera = null!;
    private PossessionController _possession = null!;
    private CardHandUI _hand = null!;
    private Label _statusLabel = null!;
    private double _frameAccumulator;

    public override void _Ready()
    {
        BuildBoard();

        _camera = new CameraDirector { Name = "CameraDirector" };
        AddChild(_camera);

        _possession = new PossessionController { Name = "PossessionController", Camera = _camera };
        AddChild(_possession);

        var ui = new CanvasLayer { Name = "UI" };
        AddChild(ui);
        _hand = new CardHandUI { Name = "CardHand" };
        _hand.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        ui.AddChild(_hand);
        _statusLabel = new Label { Name = "Status", Position = new Vector2(10, 10) };
        ui.AddChild(_statusLabel);

        _hand.ScreenToCell = ScreenToCell;
        _hand.CardDropRequested += (cardId, x, y, possess) =>
            NetworkClient.Instance?.SendSpawnCard(cardId, x, y, possess);

        var game = GameState.Instance!;
        game.DeltaApplied += OnDelta;
        game.PossessionStarted += OnPossessionStarted;
        game.PossessionEnded += OnPossessionEnded;
        game.MatchEnded += OnGameOver;

        // The deck arrives with MATCH_START (which follows our READY).
        NetworkClient.Instance!.MatchStarted += OnMatchStarted;
        if (game.Match is { } match) SetupHand(match);

        NetworkClient.Instance?.SendReady();
    }

    public override void _ExitTree()
    {
        if (NetworkClient.Instance is { } net) net.MatchStarted -= OnMatchStarted;
    }

    private void OnMatchStarted(MatchStartDto match)
    {
        SetupHand(match);
    }

    private void SetupHand(MatchStartDto match)
    {
        if (LiveOpsConfigService.Instance?.Config is { } config)
        {
            _hand.Setup(match.Decks[match.PlayerIndex], config);
        }
    }

    private void BuildBoard()
    {
        // Same palette as tools/blender/generate_arena.py.
        var blue = new StandardMaterial3D { AlbedoColor = new Color(0.15f, 0.35f, 0.75f) };
        var red = new StandardMaterial3D { AlbedoColor = new Color(0.75f, 0.15f, 0.15f) };
        var river = new StandardMaterial3D { AlbedoColor = new Color(0.25f, 0.25f, 0.25f) };
        var bridge = new StandardMaterial3D { AlbedoColor = new Color(0.45f, 0.35f, 0.2f) };
        var bush = new StandardMaterial3D { AlbedoColor = new Color(0.1f, 0.45f, 0.15f) };

        var board = new Node3D { Name = "Board" };
        AddChild(board);
        for (var x = 0; x < GridModel.GridW; x++)
        {
            for (var y = 0; y < GridModel.GridH; y++)
            {
                var mat = GridModel.IsRiverRow(y)
                    ? (GridModel.IsBridgeCol(x) ? bridge : river)
                    : GridModel.IsBushCell(x, y)
                        ? bush
                        : y <= GridModel.P0HomeMaxRow ? blue : red;
                board.AddChild(new MeshInstance3D
                {
                    Mesh = new BoxMesh { Size = new Vector3(0.95f, 0.1f, 0.95f) },
                    Position = new Vector3(x + 0.5f, -0.05f, y + 0.5f),
                    MaterialOverride = mat,
                });
            }
        }

        var sun = new DirectionalLight3D { Rotation = new Vector3(-0.9f, 0.4f, 0) };
        AddChild(sun);
    }

    private (int CellX, int CellY)? ScreenToCell(Vector2 screenPos)
    {
        var camera = GetViewport().GetCamera3D();
        if (camera is null) return null;
        var from = camera.ProjectRayOrigin(screenPos);
        var dir = camera.ProjectRayNormal(screenPos);
        if (Mathf.Abs(dir.Y) < 0.0001f) return null;
        var t = -from.Y / dir.Y; // intersect ground plane y=0
        if (t < 0) return null;
        var hit = from + dir * t;
        var cell = (CellX: (int)Mathf.Floor(hit.X), CellY: (int)Mathf.Floor(hit.Z));
        return GridModel.InBounds(cell.CellX, cell.CellY) ? cell : null;
    }

    private void OnDelta(StateDeltaDto delta)
    {
        var config = LiveOpsConfigService.Instance?.Config;
        if (config is null) return;

        // Reconcile views with the (fog-culled) authoritative entity set.
        var seen = new HashSet<int>();
        foreach (var dto in delta.Entities)
        {
            seen.Add(dto.Id);
            if (!_views.TryGetValue(dto.Id, out var view))
            {
                view = EntityView.Create(dto, config);
                _views[dto.Id] = view;
                AddChild(view);
            }
        }
        var stale = new List<int>();
        foreach (var (id, _) in _views)
        {
            if (!seen.Contains(id)) stale.Add(id);
        }
        foreach (var id in stale)
        {
            _views[id].QueueFree();
            _views.Remove(id);
        }

        foreach (var evJson in delta.Events)
        {
            var type = evJson.GetProperty("type").GetString();
            if (type == "spawn" &&
                evJson.GetProperty("owner").GetInt32() == GameState.Instance!.PlayerIndex &&
                evJson.GetProperty("uid").GetString() is { } uid)
            {
                _hand.OnCardPlayed(uid);
            }
        }
    }

    public override void _Process(double delta)
    {
        var game = GameState.Instance;
        if (game is null) return;

        _frameAccumulator += delta;
        var subTick = (float)(_frameAccumulator / 0.05) % 1f;

        foreach (var e in game.Interpolation.Sample(subTick))
        {
            if (!_views.TryGetValue(e.Id, out var view)) continue;
            if (e.Id == game.PossessedUnitId)
            {
                // The possessed unit renders from local prediction, not interpolation.
                var t = game.Prediction.Transform;
                view.ApplySnapshot(t.X, t.Y, 0, e.Hp);
            }
            else
            {
                view.ApplySnapshot(e.X, e.Y, e.YawMdeg, e.Hp);
            }
        }

        _statusLabel.Text = $"tick {game.ServerTick}";
    }

    private void OnPossessionStarted(int unitId)
    {
        var config = LiveOpsConfigService.Instance?.Config;
        if (config is null || !_views.TryGetValue(unitId, out var view)) return;
        var unit = config.Unit(view.Uid);
        if (unit is null) return;

        _possession.BeginPossession(unitId, unit);
        _camera.TransitionToFps(view);
    }

    private void OnPossessionEnded(int unitId, string reason)
    {
        _possession.EndPossession();
        _camera.SnapToRts(); // HP hit 0 → instant snap back (PRD 1.2)
    }

    private void OnGameOver(GameOverDto over)
    {
        var mine = GameState.Instance!.PlayerIndex;
        var verdict = over.WinnerIndex == -1 ? "DRAW" : over.WinnerIndex == mine ? "VICTORY!" : "DEFEAT";
        _statusLabel.Text = $"{verdict}  crowns {string.Join('-', over.Crowns)}  ({over.TrophyDelta:+#;-#;0} trophies)";
        GetTree().CreateTimer(4.0).Timeout += () => SceneRouter.Instance?.Go(SceneRouter.Lobby);
    }
}
