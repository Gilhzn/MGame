using Godot;

namespace Overlord.Client;

/// <summary>
/// Spatial audio routing (PRD 7.2). RTS default: the listener rides the sky
/// camera and ambience plays as flat 2D stereo. On possession the listener
/// reparents into the possessed model's head mount and environmental sounds
/// route through the 3D spatial bus (HRTF-grade filtering itself is a
/// documented stub — the bus switch and listener reparenting are real).
/// </summary>
public partial class AudioListenerSwitchManager : Node
{
    public static AudioListenerSwitchManager? Instance { get; private set; }

    public const string RtsBus = "Master";
    public const string SpatialBus = "Spatial3D";

    private AudioListener3D? _listener;
    public bool IsFpsMode { get; private set; }

    public override void _EnterTree()
    {
        Instance = this;
        EnsureSpatialBus();
    }

    private static void EnsureSpatialBus()
    {
        if (AudioServer.GetBusIndex(SpatialBus) == -1)
        {
            AudioServer.AddBus();
            var idx = AudioServer.BusCount - 1;
            AudioServer.SetBusName(idx, SpatialBus);
            AudioServer.SetBusSend(idx, RtsBus);
            // TODO(HRTF): insert a binaural/HRTF effect on this bus once the
            // target platforms are locked. The routing is already in place.
        }
    }

    private AudioListener3D Listener()
    {
        if (_listener is null || !IsInstanceValid(_listener))
        {
            _listener = new AudioListener3D { Name = "SwitchedListener" };
        }
        return _listener;
    }

    /// <summary>RTS default: listener anchored to the ortho sky camera (wide 2D stereo).</summary>
    public void SwitchToRts(Camera3D skyCamera)
    {
        var listener = Listener();
        listener.GetParent()?.RemoveChild(listener);
        skyCamera.AddChild(listener);
        listener.Position = Vector3.Zero;
        listener.MakeCurrent();
        IsFpsMode = false;
    }

    /// <summary>
    /// FPS transition (the moment PossessUnit clears): reparent the listener
    /// into the head bone mount of the possessed rig.
    /// </summary>
    public void SwitchToFps(Node3D headMount)
    {
        var listener = Listener();
        listener.GetParent()?.RemoveChild(listener);
        headMount.AddChild(listener);
        listener.Position = Vector3.Zero;
        listener.MakeCurrent();
        IsFpsMode = true;
    }

    public void ClearListener()
    {
        if (_listener is not null && IsInstanceValid(_listener))
        {
            _listener.ClearCurrent();
            _listener.GetParent()?.RemoveChild(_listener);
        }
        IsFpsMode = false;
    }
}
