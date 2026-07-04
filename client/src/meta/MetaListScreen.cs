using System.Net.Http;
using System.Text.Json;
using Godot;

namespace Overlord.Client;

/// <summary>Shared scaffold for the REST-backed list screens in the bottom dock (PRD 4.2).</summary>
public abstract partial class MetaListScreen : Control
{
    protected VBoxContainer List = null!;
    protected Label Title = null!;

    protected abstract string ScreenTitle { get; }

    public override void _Ready()
    {
        var root = new VBoxContainer();
        root.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(root);

        Title = new Label { Text = ScreenTitle };
        root.AddChild(Title);

        var back = new Button { Text = "< Back to Lobby" };
        back.Pressed += () => SceneRouter.Instance?.Go(SceneRouter.Lobby);
        root.AddChild(back);

        var scroll = new ScrollContainer { SizeFlagsVertical = SizeFlags.ExpandFill };
        root.AddChild(scroll);
        List = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        scroll.AddChild(List);

        _ = Populate();
    }

    protected abstract System.Threading.Tasks.Task Populate();

    protected void AddRow(string text)
    {
        List.AddChild(new Label { Text = text });
    }

    protected static async System.Threading.Tasks.Task<JsonDocument?> GetJson(string path)
    {
        var auth = AuthService.Instance!;
        try
        {
            var res = await auth.Send(auth.AuthorizedRequest(HttpMethod.Get, path));
            if (!res.IsSuccessStatusCode) return null;
            return JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        }
        catch
        {
            return null;
        }
    }
}

