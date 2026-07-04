using System.Net.Http;
using System.Text.Json;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Main dashboard (PRD 4.2): top bar (name/trophies/gold/gems/settings),
/// center 3D card showcase + BATTLE button, chest trays with live countdown
/// tickers, bottom navigation dock (Shop / Deck / Lobby / Clan / Leaderboard).
/// </summary>
public partial class LobbyController : Control
{
    private Label _topBar = null!;
    private readonly Label[] _chestLabels = new Label[4];
    private ChestSlotDto[] _chestSlots = System.Array.Empty<ChestSlotDto>();
    private double _refreshTimer;

    private sealed class ChestSlotDto
    {
        public int SlotIndex { get; set; }
        public string ChestType { get; set; } = "";
        public bool IsUnlocking { get; set; }
        public int RemainingSeconds { get; set; }
        public double FetchedAt { get; set; }
    }

    public override void _Ready()
    {
        BuildUi();
        _ = RefreshProfile();
        _ = RefreshChests();

        var net = NetworkClient.Instance!;
        net.MatchStarted += OnMatchStarted;
        if (!net.IsLive) net.Connect();
    }

    public override void _ExitTree()
    {
        if (NetworkClient.Instance is { } net) net.MatchStarted -= OnMatchStarted;
    }

    private void OnMatchStarted(MatchStartDto _)
    {
        SceneRouter.Instance?.Go(SceneRouter.Arena);
    }

    private void BuildUi()
    {
        var root = new VBoxContainer();
        root.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(root);

        // ---- Top bar widget ----
        _topBar = new Label { Text = "..." };
        root.AddChild(_topBar);

        // ---- Center: 3D showcase viewport + BATTLE ----
        var center = new SubViewportContainer
        {
            Stretch = true,
            SizeFlagsVertical = SizeFlags.ExpandFill,
            CustomMinimumSize = new Vector2(0, 420),
        };
        var viewport = new SubViewport { OwnWorld3D = true };
        center.AddChild(viewport);
        root.AddChild(center);
        BuildShowcase(viewport);

        var battle = new Button
        {
            Text = "BATTLE",
            CustomMinimumSize = new Vector2(0, 96),
        };
        battle.Pressed += () =>
        {
            battle.Text = "Searching...";
            battle.Disabled = true;
            NetworkClient.Instance?.SendQueueJoin("ladder");
        };
        root.AddChild(battle);

        var training = new Button { Text = "Training (vs Bot)", CustomMinimumSize = new Vector2(0, 48) };
        training.Pressed += () => NetworkClient.Instance?.SendQueueJoin("training");
        root.AddChild(training);

        // ---- Chest progression trays ----
        var chests = new HBoxContainer();
        root.AddChild(chests);
        for (var i = 0; i < 4; i++)
        {
            var idx = i;
            var box = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            _chestLabels[i] = new Label { Text = "-", HorizontalAlignment = HorizontalAlignment.Center };
            var open = new Button { Text = "Start/Open" };
            open.Pressed += () => _ = ChestAction(idx);
            box.AddChild(_chestLabels[i]);
            box.AddChild(open);
            chests.AddChild(box);
        }

        // ---- Bottom navigation dock ----
        var dock = new HBoxContainer();
        root.AddChild(dock);
        AddDockButton(dock, "Shop", SceneRouter.Shop);
        AddDockButton(dock, "Deck", SceneRouter.Deck);
        AddDockButton(dock, "Lobby", SceneRouter.Lobby);
        AddDockButton(dock, "Clan", SceneRouter.Clan);
        AddDockButton(dock, "Ranks", SceneRouter.Leaderboard);
    }

    private static void AddDockButton(HBoxContainer dock, string label, string scene)
    {
        var b = new Button { Text = label, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        b.Pressed += () => SceneRouter.Instance?.Go(scene);
        dock.AddChild(b);
    }

    /// <summary>The favorite-card idle showcase in its own 3D world (PRD 4.2).</summary>
    private static void BuildShowcase(SubViewport viewport)
    {
        var config = LiveOpsConfigService.Instance?.Config;
        var favorite = config?.UnitRegistry.Count > 0 ? config.UnitRegistry[0] : null;
        if (favorite is null) return;

        var rig = CharacterAssembler.Assemble(favorite, 0);
        viewport.AddChild(rig);
        var cam = new Camera3D { Position = new Vector3(0, 1.4f, 2.6f) };
        viewport.AddChild(cam);
        cam.LookAtFromPosition(cam.Position, new Vector3(0, 1.0f, 0), Vector3.Up);
        viewport.AddChild(new DirectionalLight3D { Rotation = new Vector3(-0.8f, 0.3f, 0) });

        // Idle turntable.
        var tween = rig.CreateTween().SetLoops();
        tween.TweenProperty(rig, "rotation:y", Mathf.Tau, 8.0);
    }

    private async System.Threading.Tasks.Task RefreshProfile()
    {
        var auth = AuthService.Instance!;
        try
        {
            var res = await auth.Send(auth.AuthorizedRequest(HttpMethod.Get, "/profile"));
            if (!res.IsSuccessStatusCode) return;
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            var p = doc.RootElement.GetProperty("profile");
            _topBar.Text =
                $"{p.GetProperty("username").GetString()}   " +
                $"🏆 {p.GetProperty("trophies").GetInt32()}   " +
                $"💰 {p.GetProperty("gold").GetInt32()}   " +
                $"💎 {p.GetProperty("gems").GetInt32()}";
        }
        catch (System.Exception e)
        {
            GD.PushWarning($"Lobby: profile refresh failed: {e.Message}");
        }
    }

    private async System.Threading.Tasks.Task RefreshChests()
    {
        var auth = AuthService.Instance!;
        try
        {
            var res = await auth.Send(auth.AuthorizedRequest(HttpMethod.Get, "/chests"));
            if (!res.IsSuccessStatusCode) return;
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            var list = new System.Collections.Generic.List<ChestSlotDto>();
            foreach (var s in doc.RootElement.GetProperty("slots").EnumerateArray())
            {
                list.Add(new ChestSlotDto
                {
                    SlotIndex = s.GetProperty("slotIndex").GetInt32(),
                    ChestType = s.GetProperty("chestType").GetString() ?? "",
                    IsUnlocking = s.GetProperty("isUnlocking").GetBoolean(),
                    RemainingSeconds = s.GetProperty("remainingSeconds").GetInt32(),
                    FetchedAt = Time.GetTicksMsec() / 1000.0,
                });
            }
            _chestSlots = list.ToArray();
        }
        catch (System.Exception e)
        {
            GD.PushWarning($"Lobby: chest refresh failed: {e.Message}");
        }
    }

    private async System.Threading.Tasks.Task ChestAction(int slotIndex)
    {
        var auth = AuthService.Instance!;
        foreach (var slot in _chestSlots)
        {
            if (slot.SlotIndex != slotIndex) continue;
            var action = slot.IsUnlocking ? "open" : "start";
            await auth.Send(auth.AuthorizedRequest(HttpMethod.Post, $"/chests/{slotIndex}/{action}"));
            await RefreshChests();
            await RefreshProfile();
            return;
        }
    }

    public override void _Process(double delta)
    {
        _refreshTimer += delta;
        if (_refreshTimer >= 1.0)
        {
            _refreshTimer = 0;
            UpdateChestTickers();
        }
    }

    private void UpdateChestTickers()
    {
        var now = Time.GetTicksMsec() / 1000.0;
        for (var i = 0; i < 4; i++) _chestLabels[i].Text = "-";
        foreach (var slot in _chestSlots)
        {
            if (slot.SlotIndex is < 0 or > 3) continue;
            var remaining = slot.IsUnlocking
                ? slot.RemainingSeconds - (int)(now - slot.FetchedAt)
                : slot.RemainingSeconds;
            _chestLabels[slot.SlotIndex].Text = slot.IsUnlocking
                ? $"{slot.ChestType}\n{ChestCountdown.Format(remaining)}"
                : $"{slot.ChestType}\n(tap to start)";
        }
    }
}
