using Xunit;

namespace Overlord.CoreLogic.Tests;

public class PredictionEngineTests
{
    private const int Speed = 210; // shadow rogue

    [Fact]
    public void PredictsLocallyAndDrainsOnAck()
    {
        var engine = new PredictionEngine();
        engine.Reset(new KernelTransform(2500, 10500), Speed);

        engine.PredictInput(1, new KernelInput(0, 1000));
        engine.PredictInput(2, new KernelInput(0, 1000));
        Assert.Equal(10920, engine.Transform.Y);
        Assert.Equal(2, engine.PendingCount);

        engine.AckThrough(2);
        Assert.Equal(0, engine.PendingCount);
        Assert.Equal(10920, engine.Transform.Y); // ack does not move the view
    }

    [Fact]
    public void CorrectionRebasesAndReplaysPendingInputs()
    {
        var engine = new PredictionEngine();
        engine.Reset(new KernelTransform(2500, 10500), Speed);

        engine.PredictInput(1, new KernelInput(1000, 0));
        engine.PredictInput(2, new KernelInput(1000, 0));
        engine.PredictInput(3, new KernelInput(1000, 0));

        // Server disagrees about input 1's outcome (e.g. collision divergence).
        engine.ApplyCorrection(1, new KernelTransform(2600, 10500));

        // Inputs 2 and 3 replay on the corrected base: 2600 + 2*210.
        Assert.Equal(new KernelTransform(3020, 10500), engine.Transform);
        Assert.Equal(2, engine.PendingCount);
    }

    [Fact]
    public void ConvergesWithAnAuthoritativeSimRunningTheSameKernel()
    {
        var engine = new PredictionEngine();
        var server = new KernelTransform(5500, 5500);
        engine.Reset(server, Speed);

        var inputs = new[]
        {
            new KernelInput(1000, 0), new KernelInput(707, 707), new KernelInput(0, 1000),
            new KernelInput(-1000, 250), new KernelInput(0, -1000), new KernelInput(333, 999),
        };
        for (var seq = 0; seq < inputs.Length; seq++)
        {
            engine.PredictInput(seq, inputs[seq]);
            server = MovementKernel.StepPossessedMovement(inputs[seq], server, Speed);
        }
        Assert.Equal(server, engine.Transform); // zero divergence, no corrections needed
    }
}
