using Godot;

namespace Overlord.Client;

/// <summary>
/// Owns the two camera perspectives (PRD 1.2): the bird's-eye RTS rig and
/// the possessed FPS/TPS rig. Possession sweeps the camera down into the
/// unit's head socket; death snaps it back to the sky instantly.
/// </summary>
public partial class CameraDirector : Node3D
{
    private Camera3D _rtsCamera = null!;
    private Camera3D _fpsCamera = null!;
    private Node3D _fpsMount = null!;
    private Tween? _tween;

    public bool IsFps { get; private set; }
    public Camera3D FpsCamera => _fpsCamera;
    public Camera3D RtsCamera => _rtsCamera;

    /// <summary>Over-the-shoulder offset; Vector3.Zero = pure first person.</summary>
    public Vector3 TpsOffset { get; set; } = new(0.35f, 0.15f, 0.9f);

    public override void _Ready()
    {
        // Sky view: high orthographic angle over the 12x24 board.
        _rtsCamera = new Camera3D
        {
            Name = "RtsCamera",
            Projection = Camera3D.ProjectionType.Orthogonal,
            Size = 26f,
            Position = new Vector3(6f, 24f, 18f),
        };
        AddChild(_rtsCamera);
        _rtsCamera.LookAtFromPosition(_rtsCamera.Position, new Vector3(6f, 0f, 12f), Vector3.Up);

        _fpsMount = new Node3D { Name = "FpsMount" };
        AddChild(_fpsMount);
        _fpsCamera = new Camera3D { Name = "FpsCamera", Fov = 75f };
        _fpsMount.AddChild(_fpsCamera);

        _rtsCamera.MakeCurrent();
        AudioListenerSwitchManager.Instance?.SwitchToRts(_rtsCamera);
    }

    /// <summary>The swoop into the possessed unit (PRD 4.3 phase C uses the same path).</summary>
    public void TransitionToFps(EntityView unit, float durationSeconds = 0.45f)
    {
        var headMount = unit.HeadMount ?? unit;
        _tween?.Kill();

        _fpsMount.GlobalTransform = _rtsCamera.GlobalTransform;
        _fpsCamera.MakeCurrent();

        _tween = CreateTween().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
        _tween.TweenProperty(_fpsMount, "global_position", headMount.GlobalPosition + TpsOffset, durationSeconds);
        _tween.TweenCallback(Callable.From(() =>
        {
            // Hard-parent to the head socket so the camera rides the rig.
            _fpsMount.GetParent()?.RemoveChild(_fpsMount);
            headMount.AddChild(_fpsMount);
            _fpsMount.Position = TpsOffset;
            _fpsMount.Rotation = Vector3.Zero;
            AudioListenerSwitchManager.Instance?.SwitchToFps(headMount);
            IsFps = true;
        }));
    }

    /// <summary>Death: instant snap back to the tactical view (PRD 1.2).</summary>
    public void SnapToRts()
    {
        _tween?.Kill();
        DetachMount();
        _rtsCamera.MakeCurrent();
        AudioListenerSwitchManager.Instance?.SwitchToRts(_rtsCamera);
        IsFps = false;
    }

    /// <summary>FTUE phase D: smooth lerp back up to the sky, then a callback.</summary>
    public void LerpToRts(float durationSeconds, System.Action? onDone = null)
    {
        _tween?.Kill();
        var from = _fpsCamera.GlobalTransform;
        DetachMount();
        _fpsMount.GlobalTransform = from;
        _fpsCamera.MakeCurrent();

        _tween = CreateTween().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.InOut);
        _tween.TweenProperty(_fpsMount, "global_transform", _rtsCamera.GlobalTransform, durationSeconds);
        _tween.TweenCallback(Callable.From(() =>
        {
            _rtsCamera.MakeCurrent();
            AudioListenerSwitchManager.Instance?.SwitchToRts(_rtsCamera);
            IsFps = false;
            onDone?.Invoke();
        }));
    }

    /// <summary>Aim rotation driven by PossessionController (yaw/pitch in degrees).</summary>
    public void SetAim(float yawDeg, float pitchDeg)
    {
        if (!IsFps) return;
        _fpsMount.RotationDegrees = new Vector3(0, yawDeg, 0);
        _fpsCamera.RotationDegrees = new Vector3(pitchDeg, 0, 0);
    }

    private void DetachMount()
    {
        _fpsMount.GetParent()?.RemoveChild(_fpsMount);
        AddChild(_fpsMount);
    }
}
