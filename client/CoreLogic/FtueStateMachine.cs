namespace Overlord.CoreLogic;

public enum FtuePhase
{
    /// <summary>Phase A: all menus locked; drag the pulsing card to (6,4).</summary>
    ForcedDeployment,

    /// <summary>Phase B: slow motion (TimeScale 0.05); finger prompt forces possession.</summary>
    ForcedPossession,

    /// <summary>Phase C: FPS view; pan to the target's head and fire Weapon Beta.</summary>
    ActionIntegration,

    /// <summary>Phase D: camera lerps back to sky view; time resumes.</summary>
    ReturnAndComplete,

    Complete,
}

/// <summary>
/// The FTUE scripted machine (PRD 4.3), pure and engine-free so it is unit
/// testable. The Godot FtueDirector renders prompts and feeds events in.
/// </summary>
public sealed class FtueStateMachine
{
    public const int RequiredCellX = 6;
    public const int RequiredCellY = 4;
    public const float SlowMotionTimeScale = 0.05f;

    public FtuePhase Phase { get; private set; } = FtuePhase.ForcedDeployment;

    /// <summary>Engine time scale the director must apply for the current phase.</summary>
    public float TimeScale => Phase == FtuePhase.ForcedPossession ? SlowMotionTimeScale : 1.0f;

    /// <summary>Everything except the scripted interaction is locked until completion.</summary>
    public bool InputsLocked => Phase != FtuePhase.Complete;

    /// <summary>Phase A: only a drop on exactly (6,4) advances.</summary>
    public bool OnCardDeployed(int cellX, int cellY)
    {
        if (Phase != FtuePhase.ForcedDeployment) return false;
        if (cellX != RequiredCellX || cellY != RequiredCellY) return false;
        Phase = FtuePhase.ForcedPossession;
        return true;
    }

    /// <summary>Phase B: the prolonged tap possessed the unit.</summary>
    public bool OnPossessionStarted()
    {
        if (Phase != FtuePhase.ForcedPossession) return false;
        Phase = FtuePhase.ActionIntegration;
        return true;
    }

    /// <summary>Phase C: the placeholder target died to Weapon Beta.</summary>
    public bool OnTargetKilled()
    {
        if (Phase != FtuePhase.ActionIntegration) return false;
        Phase = FtuePhase.ReturnAndComplete;
        return true;
    }

    /// <summary>Phase D: the camera finished lerping back to the sky view.</summary>
    public bool OnReturnFinished()
    {
        if (Phase != FtuePhase.ReturnAndComplete) return false;
        Phase = FtuePhase.Complete;
        return true;
    }
}
