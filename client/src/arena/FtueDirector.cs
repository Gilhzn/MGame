using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Renders the FTUE scripted machine (PRD 4.3) over the arena: locks inputs,
/// shows the animated finger prompt, applies the slow-motion time scale, and
/// feeds gameplay events into the pure FtueStateMachine.
/// </summary>
public partial class FtueDirector : CanvasLayer
{
    public readonly FtueStateMachine Machine = new();

    private Label _prompt = null!;
    private ColorRect _fingerHint = null!;
    private CameraDirector? _camera;

    public void Bind(CameraDirector camera)
    {
        _camera = camera;
    }

    public override void _Ready()
    {
        _prompt = new Label
        {
            Name = "FtuePrompt",
            Position = new Vector2(40, 200),
            Size = new Vector2(640, 120),
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        AddChild(_prompt);

        _fingerHint = new ColorRect
        {
            Name = "FingerHint",
            Color = new Color(1f, 1f, 1f, 0.5f),
            Size = new Vector2(48, 48),
        };
        AddChild(_fingerHint);
        UpdatePresentation();
    }

    public override void _Process(double delta)
    {
        // Pulse the finger prompt.
        var pulse = 0.35f + 0.3f * Mathf.Sin((float)Time.GetTicksMsec() / 220f);
        _fingerHint.Color = new Color(1f, 1f, 1f, pulse);
    }

    public void NotifyCardDeployed(int cellX, int cellY)
    {
        if (Machine.OnCardDeployed(cellX, cellY)) UpdatePresentation();
    }

    public void NotifyPossessionStarted()
    {
        if (Machine.OnPossessionStarted()) UpdatePresentation();
    }

    public void NotifyTargetKilled()
    {
        if (Machine.OnTargetKilled())
        {
            UpdatePresentation();
            // Phase D: smooth lerp back to the sky, then restore time.
            _camera?.LerpToRts(1.2f, () =>
            {
                if (Machine.OnReturnFinished()) UpdatePresentation();
            });
        }
    }

    private void UpdatePresentation()
    {
        Engine.TimeScale = Machine.TimeScale;
        switch (Machine.Phase)
        {
            case FtuePhase.ForcedDeployment:
                _prompt.Text = $"Drag your card to the glowing tile ({FtueStateMachine.RequiredCellX}, {FtueStateMachine.RequiredCellY})!";
                _fingerHint.Visible = true;
                break;
            case FtuePhase.ForcedPossession:
                _prompt.Text = "Hold your finger on the unit to TAKE CONTROL...";
                _fingerHint.Visible = true;
                break;
            case FtuePhase.ActionIntegration:
                _prompt.Text = "Pan to the target's HEAD and fire Weapon Beta!";
                _fingerHint.Visible = true;
                break;
            case FtuePhase.ReturnAndComplete:
                _prompt.Text = "Perfect headshot!";
                _fingerHint.Visible = false;
                break;
            case FtuePhase.Complete:
                _prompt.Text = "";
                _fingerHint.Visible = false;
                QueueFree(); // hand back normal control loops
                break;
        }
    }
}
