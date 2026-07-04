using Xunit;

namespace Overlord.CoreLogic.Tests;

public class InterpolationBufferTests
{
    private static EntityState E(int id, int x, int y, int yaw = 0, int hp = 100) =>
        new(id, x, y, yaw, hp);

    [Fact]
    public void LerpsBetweenTheTwoFramesAroundTheRenderTick()
    {
        var buf = new InterpolationBuffer(delayTicks: 2f);
        buf.AddSnapshot(10, new[] { E(1, 1000, 0) });
        buf.AddSnapshot(11, new[] { E(1, 2000, 0) });
        buf.AddSnapshot(12, new[] { E(1, 3000, 0) });

        // Render tick = 12 - 2 = 10 → exactly at frame 10.
        var at10 = buf.Sample()[0];
        Assert.Equal(1000f, at10.X, 3);

        // Halfway between frames 10 and 11.
        var at105 = buf.Sample(renderTickOffset: 0.5f)[0];
        Assert.Equal(1500f, at105.X, 3);
    }

    [Fact]
    public void SnapsInsteadOfGlidingAcrossTeleports()
    {
        var buf = new InterpolationBuffer(delayTicks: 1f);
        buf.AddSnapshot(1, new[] { E(1, 1000, 1000) });
        buf.AddSnapshot(2, new[] { E(1, 20000, 22000) }); // way past the snap threshold
        var e = buf.Sample(0.5f)[0];
        Assert.Equal(20000f, e.X, 3);
        Assert.Equal(22000f, e.Y, 3);
    }

    [Fact]
    public void IgnoresStaleAndDuplicateSnapshots()
    {
        var buf = new InterpolationBuffer();
        buf.AddSnapshot(5, new[] { E(1, 100, 100) });
        buf.AddSnapshot(5, new[] { E(1, 999, 999) });
        buf.AddSnapshot(4, new[] { E(1, 888, 888) });
        Assert.Equal(5, buf.NewestTick);
        Assert.Equal(100f, buf.Sample()[0].X, 3);
    }

    [Fact]
    public void YawInterpolatesAcrossTheWrapBoundary()
    {
        var buf = new InterpolationBuffer(delayTicks: 1f);
        buf.AddSnapshot(1, new[] { E(1, 0, 0, yaw: 170000) });
        buf.AddSnapshot(2, new[] { E(1, 0, 0, yaw: -170000) });
        var e = buf.Sample(0.5f)[0];
        // Short way around: 170° + 10° = 180°, not the long way back through 0.
        Assert.Equal(180000f, Math.Abs(e.YawMdeg), 3);
    }

    [Fact]
    public void ClearPurgesEverythingForDesyncRecovery()
    {
        var buf = new InterpolationBuffer();
        buf.AddSnapshot(1, new[] { E(1, 100, 100) });
        buf.Clear();
        Assert.Empty(buf.Sample());
        Assert.Equal(-1, buf.NewestTick);
    }
}
