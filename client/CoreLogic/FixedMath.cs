namespace Overlord.CoreLogic;

/// <summary>
/// Fixed-point integer math, the exact mirror of packages/sim/src/fixed.ts
/// (docs/determinism.md). C# integer division truncates toward zero, which
/// matches the TS side's Math.trunc-based idiv.
/// </summary>
public static class FixedMath
{
    public const int Fp = 1000;

    /// <summary>Exact integer square root (floor). Math.Sqrt is IEEE-754
    /// correctly rounded; the adjust loop removes boundary rounding.</summary>
    public static long ISqrt(long n)
    {
        if (n <= 0) return 0;
        var r = (long)Math.Floor(Math.Sqrt(n));
        while (r * r > n) r--;
        while ((r + 1) * (r + 1) <= n) r++;
        return r;
    }

    public static int VecLen(int dx, int dy) => (int)ISqrt((long)dx * dx + (long)dy * dy);

    public static int VecLen3(int dx, int dy, int dz) =>
        (int)ISqrt((long)dx * dx + (long)dy * dy + (long)dz * dz);

    public static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;
}
