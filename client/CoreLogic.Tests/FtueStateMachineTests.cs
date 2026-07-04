using Xunit;

namespace Overlord.CoreLogic.Tests;

public class FtueStateMachineTests
{
    [Fact]
    public void HappyPathWalksAllFourPhases()
    {
        var ftue = new FtueStateMachine();
        Assert.Equal(FtuePhase.ForcedDeployment, ftue.Phase);
        Assert.True(ftue.InputsLocked);
        Assert.Equal(1.0f, ftue.TimeScale);

        Assert.True(ftue.OnCardDeployed(6, 4));
        Assert.Equal(FtuePhase.ForcedPossession, ftue.Phase);
        Assert.Equal(0.05f, ftue.TimeScale); // slow-motion (PRD 4.3 phase B)

        Assert.True(ftue.OnPossessionStarted());
        Assert.Equal(FtuePhase.ActionIntegration, ftue.Phase);
        Assert.Equal(1.0f, ftue.TimeScale);

        Assert.True(ftue.OnTargetKilled());
        Assert.Equal(FtuePhase.ReturnAndComplete, ftue.Phase);

        Assert.True(ftue.OnReturnFinished());
        Assert.Equal(FtuePhase.Complete, ftue.Phase);
        Assert.False(ftue.InputsLocked);
    }

    [Fact]
    public void OnlyTheScriptedCellAdvancesPhaseA()
    {
        var ftue = new FtueStateMachine();
        Assert.False(ftue.OnCardDeployed(5, 4));
        Assert.False(ftue.OnCardDeployed(6, 5));
        Assert.Equal(FtuePhase.ForcedDeployment, ftue.Phase);
        Assert.True(ftue.OnCardDeployed(6, 4));
    }

    [Fact]
    public void OutOfOrderEventsAreIgnored()
    {
        var ftue = new FtueStateMachine();
        Assert.False(ftue.OnPossessionStarted());
        Assert.False(ftue.OnTargetKilled());
        Assert.False(ftue.OnReturnFinished());
        Assert.Equal(FtuePhase.ForcedDeployment, ftue.Phase);
    }
}
