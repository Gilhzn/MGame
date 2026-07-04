namespace Overlord.Client;

/// <summary>Global leaderboards (PRD 4.2 dock).</summary>
public partial class LeaderboardController : MetaListScreen
{
    protected override string ScreenTitle => "Global Leaderboard";

    protected override async System.Threading.Tasks.Task Populate()
    {
        using var doc = await GetJson("/leaderboard");
        if (doc is null) return;
        foreach (var row in doc.RootElement.GetProperty("leaderboard").EnumerateArray())
        {
            AddRow($"#{row.GetProperty("rank").GetInt32()}  " +
                   $"{row.GetProperty("username").GetString()}  " +
                   $"trophies {row.GetProperty("trophies").GetInt32()}");
        }
    }
}
