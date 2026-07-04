using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Direct control of the possessed unit (PRD 1.2 + 2.1): joystick/WASD moves
/// resolve against the camera yaw into a world-space vector (floats stay
/// local; only integers cross into the deterministic domain), predicted
/// locally through the shared movement kernel, and sent to the server at the
/// 20Hz input cadence. Dual-weapon fire feeds SHOOT with the lag-comp
/// timestamp from the synced server clock.
/// </summary>
public partial class PossessionController : Node
{
    private const double InputIntervalSeconds = 0.05; // one sim tick

    public CameraDirector? Camera { get; set; }

    private double _accumulator;
    private float _yawDeg;
    private float _pitchDeg;
    private double _sensitivity = 0.25;
    private UnitConfig? _unitConfig;

    public bool Active { get; private set; }
    public int UnitId { get; private set; } = -1;

    public void BeginPossession(int unitId, UnitConfig unitConfig)
    {
        UnitId = unitId;
        _unitConfig = unitConfig;
        _sensitivity = 0.25 * unitConfig.Possession.MouseSensitivityScale;
        _yawDeg = 0;
        _pitchDeg = 0;
        Active = true;
    }

    public void EndPossession()
    {
        Active = false;
        UnitId = -1;
        _unitConfig = null;
    }

    public override void _UnhandledInput(InputEvent @event)
    {
        if (!Active) return;
        // Right-hand look: drag (touch) or mouse motion pans the crosshair.
        if (@event is InputEventMouseMotion motion)
        {
            _yawDeg -= motion.Relative.X * (float)_sensitivity;
            _pitchDeg = Mathf.Clamp(_pitchDeg - motion.Relative.Y * (float)_sensitivity, -89f, 89f);
            Camera?.SetAim(_yawDeg, _pitchDeg);
        }
        else if (@event is InputEventScreenDrag drag && drag.Position.X > 360)
        {
            _yawDeg -= drag.Relative.X * (float)_sensitivity;
            _pitchDeg = Mathf.Clamp(_pitchDeg - drag.Relative.Y * (float)_sensitivity, -89f, 89f);
            Camera?.SetAim(_yawDeg, _pitchDeg);
        }
    }

    public override void _Process(double delta)
    {
        if (!Active) return;

        if (Input.IsActionJustPressed("fire_alpha")) Fire("alpha");
        if (Input.IsActionJustPressed("fire_beta")) Fire("beta");

        _accumulator += delta;
        if (_accumulator < InputIntervalSeconds) return;
        _accumulator -= InputIntervalSeconds;
        SendMoveInput();
    }

    private void SendMoveInput()
    {
        var game = GameState.Instance!;
        var net = NetworkClient.Instance!;
        if (game.PossessedUnitId != UnitId) return;

        // Local joystick axes → world space via camera yaw (float math is
        // fine here: only the resulting integers are deterministic inputs).
        var stick = Input.GetVector("move_left", "move_right", "move_up", "move_down");
        var yawRad = Mathf.DegToRad(_yawDeg);
        var forward = new Vector2(-Mathf.Sin(yawRad), -Mathf.Cos(yawRad));
        var right = new Vector2(-forward.Y, forward.X);
        var world = right * stick.X + forward * stick.Y;
        if (world.LengthSquared() > 1f) world = world.Normalized();

        // Sim axes: +Y is "north" toward the enemy for player 0. Godot -Z is
        // screen-forward; EntityView maps sim y → Godot z, so flip Z back.
        var moveX = (int)Mathf.Round(world.X * 1000f);
        var moveY = (int)Mathf.Round(-world.Y * 1000f);

        var seq = game.NextInputSeq();
        var predicted = game.Prediction.PredictInput(seq, new KernelInput(moveX, moveY));

        net.SendInput(new InputDto
        {
            UnitId = UnitId,
            CTick = game.ServerTick,
            Seq = seq,
            MoveX = moveX,
            MoveY = moveY,
            YawMdeg = YawMdeg(),
            PitchMdeg = (int)Mathf.Round(_pitchDeg * 1000f),
            PredictedX = predicted.X,
            PredictedY = predicted.Y,
        });
    }

    private int YawMdeg()
    {
        var wrapped = Mathf.Wrap(_yawDeg, -180f, 180f);
        return (int)Mathf.Round(wrapped * 1000f);
    }

    private void Fire(string weapon)
    {
        var game = GameState.Instance!;
        var net = NetworkClient.Instance!;
        if (game.PossessedUnitId != UnitId || Camera is null) return;

        // Aim ray from the FPS camera, converted to sim axes (x, y=worldZ, z=up).
        var basis = Camera.FpsCamera.GlobalTransform.Basis;
        var dir = -basis.Z;
        var t = game.Prediction.Transform;
        var eyeMu = _unitConfig is null ? 1500 : (int)(_unitConfig.HitboxDef.Height * 900);

        net.SendShoot(new ShootDto
        {
            UnitId = UnitId,
            Weapon = weapon,
            OriginX = t.X,
            OriginY = t.Y,
            OriginZ = eyeMu,
            DirX = (int)Mathf.Round(Mathf.Clamp(dir.X, -1f, 1f) * 1000f),
            DirY = (int)Mathf.Round(Mathf.Clamp(dir.Z, -1f, 1f) * 1000f),
            DirZ = (int)Mathf.Round(Mathf.Clamp(dir.Y, -1f, 1f) * 1000f),
            ClientTimeMs = net.ServerNowMs,
            Seq = game.NextInputSeq(),
        });
    }
}
