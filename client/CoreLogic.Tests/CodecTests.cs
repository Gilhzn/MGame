using Xunit;

namespace Overlord.CoreLogic.Tests;

public class CodecTests
{
    [Fact]
    public void DecodesEnvelopesEncodedByTheTypeScriptCodec()
    {
        using var doc = Golden.Load("envelope_fixtures.json");
        foreach (var fixture in doc.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            var env = Codec.Decode(fixture.GetProperty("raw").GetString()!);
            Assert.NotNull(env);
            Assert.Equal(fixture.GetProperty("t").GetString(), env!.T);
            Assert.Equal(fixture.GetProperty("seq").GetInt32(), env.Seq);
            if (fixture.TryGetProperty("tick", out var tick)) Assert.Equal(tick.GetInt32(), env.Tick);
            if (fixture.TryGetProperty("ack", out var ack)) Assert.Equal(ack.GetInt32(), env.Ack);
        }
    }

    [Fact]
    public void SpawnCardFixturePayloadFieldsSurvive()
    {
        using var doc = Golden.Load("envelope_fixtures.json");
        foreach (var fixture in doc.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            if (fixture.GetProperty("t").GetString() != "SPAWN_CARD") continue;
            var env = Codec.Decode(fixture.GetProperty("raw").GetString()!)!;
            var spawn = Codec.Payload<SpawnCardDto>(env)!;
            Assert.Equal("unit_royal_archer", spawn.CardId);
            Assert.Equal(6, spawn.Cell.X);
            Assert.Equal(4, spawn.Cell.Y);
            Assert.True(spawn.Possess);
        }
    }

    [Fact]
    public void RoundTripsAnInputPayload()
    {
        var dto = new InputDto
        {
            UnitId = 9, CTick = 40, Seq = 11, MoveX = -707, MoveY = 707,
            YawMdeg = 135000, PitchMdeg = -4500, PredictedX = 2450, PredictedY = 10920,
        };
        var raw = Codec.Encode(Opcodes.Input, dto, seq: 12, ack: 40);
        var env = Codec.Decode(raw);
        Assert.NotNull(env);
        var back = Codec.Payload<InputDto>(env!)!;
        Assert.Equal(dto.UnitId, back.UnitId);
        Assert.Equal(dto.MoveX, back.MoveX);
        Assert.Equal(dto.PredictedY, back.PredictedY);
        Assert.Equal(40, env!.Ack);
    }

    [Fact]
    public void RejectsGarbage()
    {
        Assert.Null(Codec.Decode("{nope"));
        Assert.Null(Codec.Decode("{\"v\":2,\"t\":\"PING\",\"seq\":0,\"p\":{}}"));
    }
}
