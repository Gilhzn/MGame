using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Visual proxy of one replicated entity. Position/yaw come from the
/// interpolation buffer (or the prediction engine for the possessed unit).
/// World mapping: sim mu → meters/1000; sim (x, y) → Godot (x, z).
/// </summary>
public partial class EntityView : Node3D
{
    public int EntityId { get; private set; }
    public string Uid { get; private set; } = "";
    public string Kind { get; private set; } = "unit";
    public int OwnerIndex { get; private set; }
    public int Hp { get; private set; }
    public int MaxHp { get; private set; }

    private Node3D? _rig;
    private Label3D? _hpLabel;

    public static EntityView Create(EntityDto dto, LiveOpsConfig config)
    {
        var view = new EntityView { Name = $"Entity_{dto.Id}" };
        view.EntityId = dto.Id;
        view.Uid = dto.Uid;
        view.Kind = dto.Kind;
        view.OwnerIndex = dto.Owner;
        view.MaxHp = dto.MaxHp;
        view.BuildVisual(dto, config);
        view.ApplySnapshot(dto.X, dto.Y, dto.YawMdeg, dto.Hp);
        return view;
    }

    private void BuildVisual(EntityDto dto, LiveOpsConfig config)
    {
        switch (dto.Kind)
        {
            case "unit":
            {
                var unit = config.Unit(dto.Uid);
                _rig = unit is not null
                    ? CharacterAssembler.Assemble(unit, dto.Owner)
                    : FallbackMesh(new CapsuleMesh { Radius = 0.4f, Height = 1.7f }, dto.Owner, 0.85f);
                break;
            }
            case "tower":
            {
                var isKing = dto.Uid == "tower_king";
                _rig = FallbackMesh(
                    new CylinderMesh { TopRadius = 0.7f, BottomRadius = 0.9f, Height = isKing ? 3f : 2.2f },
                    dto.Owner,
                    isKing ? 1.5f : 1.1f);
                break;
            }
            default:
                _rig = FallbackMesh(new SphereMesh { Radius = 0.12f, Height = 0.24f }, dto.Owner, 0.1f);
                break;
        }
        AddChild(_rig);

        if (dto.Kind != "projectile")
        {
            _hpLabel = new Label3D
            {
                Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
                Position = new Vector3(0, 2.4f, 0),
                FontSize = 48,
                Modulate = dto.Owner == 0 ? new Color(0.5f, 0.75f, 1f) : new Color(1f, 0.55f, 0.55f),
            };
            AddChild(_hpLabel);
        }
    }

    private Node3D FallbackMesh(Mesh mesh, int owner, float yOffset)
    {
        var color = owner == 0 ? new Color(0.15f, 0.35f, 0.75f) : new Color(0.75f, 0.15f, 0.15f);
        return new MeshInstance3D
        {
            Mesh = mesh,
            Position = new Vector3(0, yOffset, 0),
            MaterialOverride = new StandardMaterial3D { AlbedoColor = color },
        };
    }

    public Node3D? HeadMount => _rig is null ? null : CharacterAssembler.FindSocket(_rig, CharacterAssembler.SocketHead);

    public void ApplySnapshot(float xMu, float yMu, float yawMdeg, int hp)
    {
        Position = new Vector3(xMu / 1000f, 0, yMu / 1000f);
        if (Kind == "unit") RotationDegrees = new Vector3(0, -yawMdeg / 1000f, 0);
        Hp = hp;
        if (_hpLabel is not null) _hpLabel.Text = $"{hp}/{MaxHp}";
    }
}
