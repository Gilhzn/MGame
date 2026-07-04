using Godot;

namespace Overlord.Client;

/// <summary>Scene navigation between the lobby dock destinations (PRD 4.2).</summary>
public partial class SceneRouter : Node
{
    public static SceneRouter? Instance { get; private set; }

    public const string Boot = "res://scenes/Boot.tscn";
    public const string Lobby = "res://scenes/Lobby.tscn";
    public const string Arena = "res://scenes/Arena.tscn";
    public const string Ftue = "res://scenes/Ftue.tscn";
    public const string Deck = "res://scenes/Deck.tscn";
    public const string Shop = "res://scenes/Shop.tscn";
    public const string Clan = "res://scenes/Clan.tscn";
    public const string Leaderboard = "res://scenes/Leaderboard.tscn";

    public override void _EnterTree()
    {
        Instance = this;
    }

    public void Go(string scenePath)
    {
        GetTree().CallDeferred(SceneTree.MethodName.ChangeSceneToFile, scenePath);
    }
}
