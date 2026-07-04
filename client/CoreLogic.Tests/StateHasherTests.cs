using Xunit;

namespace Overlord.CoreLogic.Tests;

public class StateHasherTests
{
    [Fact]
    public void HashFixturesFromTypeScriptReproduceExactly()
    {
        using var doc = Golden.Load("hash_fixtures.json");
        foreach (var fixture in doc.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            var entities = new List<EntityState>();
            foreach (var e in fixture.GetProperty("entities").EnumerateArray())
            {
                entities.Add(new EntityState(
                    e.GetProperty("id").GetInt32(),
                    e.GetProperty("x").GetInt32(),
                    e.GetProperty("y").GetInt32(),
                    e.GetProperty("yawMdeg").GetInt32(),
                    e.GetProperty("hp").GetInt32()));
            }
            Assert.Equal(fixture.GetProperty("hash").GetString(), StateHasher.ViewHash(entities));
        }
    }
}
