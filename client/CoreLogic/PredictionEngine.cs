namespace Overlord.CoreLogic;

/// <summary>
/// Client-side prediction for the possessed unit (PRD 2.1). Inputs are
/// applied locally at once for latency-free control and buffered by seq;
/// server CORRECTIONs rebase the transform and replay the still-pending
/// inputs on top, so the view converges to the authoritative state without
/// eating the player's in-flight movement.
/// </summary>
public sealed class PredictionEngine
{
    private readonly List<(int Seq, KernelInput Input)> _pending = new();
    private int _speedMuPerTick;

    public KernelTransform Transform { get; private set; }

    public int PendingCount => _pending.Count;

    public void Reset(KernelTransform spawn, int speedMuPerTick)
    {
        Transform = spawn;
        _speedMuPerTick = speedMuPerTick;
        _pending.Clear();
    }

    /// <summary>Apply an input locally and buffer it. Returns the predicted transform.</summary>
    public KernelTransform PredictInput(int seq, KernelInput input)
    {
        Transform = MovementKernel.StepPossessedMovement(input, Transform, _speedMuPerTick);
        _pending.Add((seq, input));
        return Transform;
    }

    /// <summary>Regular delta path: the server has processed inputs up to seq.</summary>
    public void AckThrough(int seq)
    {
        _pending.RemoveAll(p => p.Seq <= seq);
    }

    /// <summary>
    /// CORRECTION path: adopt the authoritative transform for lastInputSeq,
    /// then re-apply every pending input after it.
    /// </summary>
    public void ApplyCorrection(int lastInputSeq, KernelTransform authoritative)
    {
        _pending.RemoveAll(p => p.Seq <= lastInputSeq);
        Transform = authoritative;
        foreach (var (_, input) in _pending)
        {
            Transform = MovementKernel.StepPossessedMovement(input, Transform, _speedMuPerTick);
        }
    }
}
