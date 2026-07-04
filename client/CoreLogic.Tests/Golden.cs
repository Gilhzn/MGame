using System.Text.Json;

namespace Overlord.CoreLogic.Tests;

internal static class Golden
{
    public static JsonDocument Load(string name)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "golden", name);
        return JsonDocument.Parse(File.ReadAllText(path));
    }
}
