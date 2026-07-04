namespace Overlord.Client;

/// <summary>Clan hub (PRD 4.2 dock).</summary>
public partial class ClanController : MetaListScreen
{
    protected override string ScreenTitle => "Clan Hub";

    protected override async System.Threading.Tasks.Task Populate()
    {
        using var doc = await GetJson("/clans/top");
        if (doc is null)
        {
            AddRow("Could not load clans.");
            return;
        }
        var any = false;
        foreach (var clan in doc.RootElement.GetProperty("clans").EnumerateArray())
        {
            any = true;
            AddRow($"{clan.GetProperty("clanName").GetString()}  " +
                   $"members {clan.GetProperty("memberCount").GetInt32()}  " +
                   $"trophies {clan.GetProperty("totalTrophies").GetInt32()}");
        }
        if (!any) AddRow("No clans yet — be the first to found one!");
    }
}
