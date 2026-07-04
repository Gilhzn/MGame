using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Runtime modular character assembly (PRD 5.2). Units are built from a base
/// rig (placeholder primitives standing in for Heavy_Humanoid_Rig /
/// Agile_Humanoid_Rig / Monstrous_Beast_Rig) plus attachment sockets
/// (Socket_Head, Socket_Back, Socket_Hand_R) that cosmetics, weapon meshes,
/// and the FPS camera mount bind onto. Swapping the primitives for real
/// skinned rigs only changes BuildBaseRig.
/// </summary>
public static class CharacterAssembler
{
    public const string SocketHead = "Socket_Head";
    public const string SocketBack = "Socket_Back";
    public const string SocketHandR = "Socket_Hand_R";

    public static Node3D Assemble(UnitConfig unit, int owner)
    {
        var root = new Node3D { Name = $"Rig_{unit.Uid}" };
        var height = (float)unit.HitboxDef.Height;
        var radius = (float)unit.HitboxDef.Radius;

        BuildBaseRig(root, unit.Rig, height, radius, owner);

        // Attachment sockets at rig-appropriate anchor points.
        var head = new Node3D { Name = SocketHead, Position = new Vector3(0, height - (float)unit.HitboxDef.HeadRadius, 0) };
        var back = new Node3D { Name = SocketBack, Position = new Vector3(0, height * 0.65f, -radius) };
        var handR = new Node3D { Name = SocketHandR, Position = new Vector3(radius, height * 0.55f, 0) };
        root.AddChild(head);
        root.AddChild(back);
        root.AddChild(handR);

        AttachHeadCosmetic(head, unit, owner);
        AttachWeapon(handR, radius);

        return root;
    }

    private static void BuildBaseRig(Node3D root, string rig, float height, float radius, int owner)
    {
        var body = new MeshInstance3D
        {
            Name = "Body",
            Mesh = new CapsuleMesh { Radius = radius, Height = height },
            Position = new Vector3(0, height / 2f, 0),
        };
        var color = owner == 0 ? new Color(0.15f, 0.35f, 0.75f) : new Color(0.75f, 0.15f, 0.15f);
        if (rig == "Monstrous_Beast_Rig") color = color.Darkened(0.25f);
        if (rig == "Heavy_Humanoid_Rig") color = color.Lightened(0.1f);
        body.MaterialOverride = new StandardMaterial3D { AlbedoColor = color };
        root.AddChild(body);

        // The Headshot_Bone hitbox visualization (PRD 1.2) — the sphere the
        // server actually tests sits at the same offset in sim/combat.ts.
        var headBone = new MeshInstance3D
        {
            Name = "Headshot_Bone",
            Mesh = new SphereMesh { Radius = radius * 0.45f, Height = radius * 0.9f },
            Position = new Vector3(0, height * 0.92f, 0),
            MaterialOverride = new StandardMaterial3D { AlbedoColor = color.Lightened(0.35f) },
        };
        root.AddChild(headBone);
    }

    private static void AttachHeadCosmetic(Node3D socket, UnitConfig unit, int owner)
    {
        // Placeholder for e.g. Knight_Helmet_V3 — a rarity-tinted band.
        var tint = unit.Rarity switch
        {
            "legendary" => new Color(1f, 0.78f, 0.1f),
            "epic" => new Color(0.65f, 0.3f, 0.85f),
            "rare" => new Color(0.25f, 0.65f, 0.95f),
            _ => new Color(0.6f, 0.6f, 0.6f),
        };
        socket.AddChild(new MeshInstance3D
        {
            Name = "Helmet",
            Mesh = new TorusMesh { InnerRadius = 0.12f, OuterRadius = 0.2f },
            MaterialOverride = new StandardMaterial3D { AlbedoColor = owner >= 0 ? tint : tint },
        });
    }

    private static void AttachWeapon(Node3D socket, float radius)
    {
        socket.AddChild(new MeshInstance3D
        {
            Name = "Weapon",
            Mesh = new BoxMesh { Size = new Vector3(0.08f, 0.08f, 0.6f) },
            Position = new Vector3(0, 0, -0.2f),
            MaterialOverride = new StandardMaterial3D { AlbedoColor = new Color(0.2f, 0.2f, 0.22f) },
        });
    }

    public static Node3D? FindSocket(Node3D rig, string socketName) =>
        rig.GetNodeOrNull<Node3D>(socketName);
}
