using Godot;

namespace Overlord.Client;

/// <summary>
/// Cold boot (PRD 4.1): silent guest auth → LiveOps config fetch → lobby.
/// The player never sees a login form.
/// </summary>
public partial class BootController : Control
{
    private Label _status = null!;

    public override void _Ready()
    {
        _status = new Label
        {
            Text = "Connecting...",
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        _status.SetAnchorsPreset(LayoutPreset.Center);
        AddChild(_status);
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
