using Xunit;

namespace Overlord.CoreLogic.Tests;

public class ChestCountdownTests
{
    [Theory]
    [InlineData(9912, "02h:45m:12s")] // the PRD 4.2 example
    [InlineData(86400, "24h:00m:00s")]
    [InlineData(59, "00h:00m:59s")]
    [InlineData(3600, "01h:00m:00s")]
    public void FormatsAsHmsTicker(int seconds, string expected)
    {
        Assert.Equal(expected, ChestCountdown.Format(seconds));
    }

    [Fact]
    public void ZeroOrNegativeMeansOpenable()
    {
        Assert.Equal("OPEN!", ChestCountdown.Format(0));
        Assert.Equal("OPEN!", ChestCountdown.Format(-5));
    }
}

public class ElixirClockTests
{
    [Fact]
    public void ConvertsTenthsAndAffordability()
    {
        Assert.Equal(4, ElixirClock.WholePoints(47));
        Assert.True(ElixirClock.CanAfford(30, 3));
        Assert.False(ElixirClock.CanAfford(29, 3));
    }

    [Fact]
    public void DoubleElixirFillsTheBarTwiceAsFast()
    {
        var normal = ElixirClock.NextPointProgress(14, doubleElixir: false);
        var boosted = ElixirClock.NextPointProgress(14, doubleElixir: true);
        Assert.Equal(0.25f, normal, 3);
        Assert.Equal(0.5f, boosted, 3);
    }
}

public class GridModelTests
{
    [Fact]
    public void MirrorsTheSimGridRules()
    {
        Assert.True(GridModel.IsWalkableCell(5, 5));
        Assert.False(GridModel.IsWalkableCell(5, 11)); // river, non-bridge
        Assert.True(GridModel.IsWalkableCell(2, 11)); // bridge
        Assert.True(GridModel.IsWalkableCell(9, 12)); // bridge
        Assert.False(GridModel.IsWalkableCell(-1, 0));
        Assert.False(GridModel.IsWalkableCell(0, 24));

        Assert.True(GridModel.IsValidDeployCell(0, 6, 4));
        Assert.False(GridModel.IsValidDeployCell(0, 6, 14)); // enemy side
        Assert.True(GridModel.IsValidDeployCell(1, 6, 14));
        Assert.False(GridModel.IsValidDeployCell(1, 6, 4));

        Assert.True(GridModel.IsBushCell(0, 10));
        Assert.False(GridModel.IsBushCell(5, 10));
    }
}
