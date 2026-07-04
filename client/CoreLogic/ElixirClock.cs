namespace Overlord.CoreLogic;

/// <summary>
/// Client-side elixir presentation (PRD 1.1). The server value (tenths) in
/// each STATE_DELTA is authoritative; this converts it for the HUD and
/// predicts the intra-grant progress bar (1 point per 56 ticks, 2x in the
/// double-elixir window).
/// </summary>
public static class ElixirClock
{
    public const int RegenTicks = 56;
    public const int CapTenths = 100;

    public static int WholePoints(int tenths) => tenths / 10;

    public static bool CanAfford(int tenths, int cardCost) => tenths >= cardCost * 10;

    /// <summary>Fraction [0,1) toward the next elixir point.</summary>
    public static float NextPointProgress(int ticksSinceGrant, bool doubleElixir)
    {
        if (ticksSinceGrant < 0) return 0f;
        var effective = doubleElixir ? ticksSinceGrant * 2 : ticksSinceGrant;
        return Math.Min(0.999f, effective / (float)RegenTicks);
    }
}

/// <summary>Chest tray countdown ticker formatting (PRD 4.2: "02h:45m:12s").</summary>
public static class ChestCountdown
{
    public static string Format(int remainingSeconds)
    {
        if (remainingSeconds <= 0) return "OPEN!";
        var h = remainingSeconds / 3600;
        var m = remainingSeconds % 3600 / 60;
        var s = remainingSeconds % 60;
        return $"{h:00}h:{m:00}m:{s:00}s";
    }
}
