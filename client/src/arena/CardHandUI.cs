using System;
using System.Collections.Generic;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// The 4-card active hand (PRD 1.1): drag a card onto valid home territory
/// to deploy. The "Hold &amp; Release" gesture (PRD 1.2) — holding the drag for
/// a beat before releasing — flags possession intent, which the server
/// consumes silently.
/// </summary>
public partial class CardHandUI : Control
{
    public const float HoldToPossessSeconds = 0.35f;

    /// <summary>cardId, cellX, cellY, possess</summary>
    public event Action<string, int, int, bool>? CardDropRequested;

    public Func<Vector2, (int CellX, int CellY)?>? ScreenToCell { get; set; }

    private readonly List<Button> _slots = new();
    private readonly List<string> _hand = new();
    private readonly Queue<string> _queue = new();
    private LiveOpsConfig? _config;

    private int _dragIndex = -1;
    private double _holdSeconds;
    private Label? _elixirLabel;

    public IReadOnlyList<string> Hand => _hand;

    public override void _Ready()
    {
        var row = new HBoxContainer
        {
            Name = "HandRow",
            AnchorsPreset = (int)LayoutPreset.BottomWide,
        };
        row.OffsetTop = -140;
        AddChild(row);

        for (var i = 0; i < 4; i++)
        {
            var idx = i;
            var button = new Button
            {
                CustomMinimumSize = new Vector2(150, 120),
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
            };
            button.ButtonDown += () => OnCardPressed(idx);
            button.ButtonUp += OnCardReleased;
            row.AddChild(button);
            _slots.Add(button);
        }

        _elixirLabel = new Label
        {
            Name = "ElixirLabel",
            AnchorsPreset = (int)LayoutPreset.BottomLeft,
            Position = new Vector2(10, -170),
        };
        AddChild(_elixirLabel);
    }

    public void Setup(IEnumerable<string> deck, LiveOpsConfig config)
    {
        _config = config;
        _hand.Clear();
        _queue.Clear();
        var i = 0;
        foreach (var card in deck)
        {
            if (i < 4) _hand.Add(card);
            else _queue.Enqueue(card);
            i++;
        }
        Refresh();
    }

    /// <summary>Mirror of the server's hand rotation on an accepted spawn.</summary>
    public void OnCardPlayed(string cardId)
    {
        var idx = _hand.IndexOf(cardId);
        if (idx < 0) return;
        _hand.RemoveAt(idx);
        _queue.Enqueue(cardId);
        if (_queue.Count > 0) _hand.Add(_queue.Dequeue());
        Refresh();
    }

    public override void _Process(double delta)
    {
        if (_dragIndex >= 0) _holdSeconds += delta;
        if (_elixirLabel is not null && GameState.Instance is { } game)
        {
            var points = ElixirClock.WholePoints(game.ElixirTenths);
            _elixirLabel.Text = game.DoubleElixir ? $"Elixir: {points}/10 (x2!)" : $"Elixir: {points}/10";
        }
        RefreshAffordability();
    }

    private void OnCardPressed(int index)
    {
        if (index >= _hand.Count) return;
        _dragIndex = index;
        _holdSeconds = 0;
    }

    private void OnCardReleased()
    {
        if (_dragIndex < 0 || _dragIndex >= _hand.Count)
        {
            _dragIndex = -1;
            return;
        }
        var cardId = _hand[_dragIndex];
        var possess = _holdSeconds >= HoldToPossessSeconds; // Hold & Release
        _dragIndex = -1;

        var cell = ScreenToCell?.Invoke(GetViewport().GetMousePosition());
        if (cell is null) return;
        var playerIndex = GameState.Instance?.PlayerIndex ?? 0;
        if (!GridModel.IsValidDeployCell(playerIndex, cell.Value.CellX, cell.Value.CellY)) return;

        CardDropRequested?.Invoke(cardId, cell.Value.CellX, cell.Value.CellY, possess);
    }

    private void Refresh()
    {
        for (var i = 0; i < _slots.Count; i++)
        {
            if (i < _hand.Count)
            {
                var unit = _config?.Unit(_hand[i]);
                _slots[i].Text = unit is null
                    ? _hand[i]
                    : $"{unit.DisplayName}\n({unit.ElixirCost})";
                _slots[i].Visible = true;
            }
            else
            {
                _slots[i].Visible = false;
            }
        }
    }

    private void RefreshAffordability()
    {
        if (_config is null || GameState.Instance is null) return;
        for (var i = 0; i < _hand.Count && i < _slots.Count; i++)
        {
            var unit = _config.Unit(_hand[i]);
            _slots[i].Disabled = unit is not null &&
                !ElixirClock.CanAfford(GameState.Instance.ElixirTenths, unit.ElixirCost);
        }
    }
}
