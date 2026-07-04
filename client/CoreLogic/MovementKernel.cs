namespace Overlord.CoreLogic;

public readonly record struct KernelInput(int MoveX, int MoveY);

public readonly record struct KernelTransform(int X, int Y);

/// <summary>
/// THE CROSS-LANGUAGE CONTRACT — bit-exact mirror of
/// packages/sim/src/movementKernel.ts, pinned by
/// shared/golden/movement_vectors.json (MovementKernelGoldenTests).
/// Any change must be made on the TS side first, golden vectors regenerated
/// (npm run golden), and ported here verbatim.
/// </summary>
public static class MovementKernel
{
    private const int MinMu = 50;

    public static KernelTransform StepPossessedMovement(
        KernelInput input,
        KernelTransform t,
        int speedMuPerTick)
    {
        var mx = input.MoveX;
        var my = input.MoveY;

        var mag = FixedMath.VecLen(mx, my);
        if (mag > 1000)
        {
            mx = mx * 1000 / mag;
            my = my * 1000 / mag;
        }

        var dx = mx * speedMuPerTick / 1000;
        var dy = my * speedMuPerTick / 1000;

        var nx = t.X;
        var ny = t.Y;

        var candX = ClampMu(nx + dx, GridModel.GridW);
        if (GridModel.IsWalkableCell(candX / 1000, ny / 1000)) nx = candX;

        var candY = ClampMu(ny + dy, GridModel.GridH);
        if (GridModel.IsWalkableCell(nx / 1000, candY / 1000)) ny = candY;

        return new KernelTransform(nx, ny);
    }

    private static int ClampMu(int v, int cells)
    {
        var max = cells * 1000 - MinMu;
        return v < MinMu ? MinMu : v > max ? max : v;
    }
}
