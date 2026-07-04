using Godot;

namespace Overlord.Client;

/// <summary>
/// Cold boot (PRD 4.1): silent guest auth → LiveOps config fetch → lobby.
/// The player never sees a login form.
/// </summary>
public partial class BootController : Control
{
    private Label _status = null!;
    private LineEdit _serverField = null!;

    public override void _Ready()
    {
        var box = new VBoxContainer();
        box.SetAnchorsPreset(LayoutPreset.Center);
        box.CustomMinimumSize = new Vector2(480, 0);
        AddChild(box);

        _status = new Label
        {
            Text = "Connecting...",
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        box.AddChild(_status);

        // Device-testing escape hatch: point the client at any server.
        _serverField = new LineEdit
        {
            Text = AuthService.ServerHttpUrl,
            PlaceholderText = "http://<server-ip>:8080",
        };
        box.AddChild(_serverField);
        var apply = new Button { Text = "Set server & reconnect" };
        apply.Pressed += () =>
        {
            AuthService.SetServerUrl(_serverField.Text);
            _status.Text = "Reconnecting...";
            _ = Boot();
        };
        box.AddChild(apply);

        _ = Boot();
    }

    private async System.Threading.Tasks.Task Boot()
    {
        var auth = AuthService.Instance!;
        if (!await auth.EnsureAuthenticated())
        {
            _status.Text = "Cannot reach server. Retrying in 3s...";
            GetTree().CreateTimer(3.0).Timeout += () => _ = Boot();
            return;
        }

        _status.Text = "Loading config...";
        await LiveOpsConfigService.Instance!.Fetch();

        NetworkClient.Instance!.Connect();
        _status.Text = $"Welcome, {auth.Username}!";
        SceneRouter.Instance!.Go(SceneRouter.Lobby);
    }
}
