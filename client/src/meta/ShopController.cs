namespace Overlord.Client;

/// <summary>Shop: surfaces the LiveOps chest matrices as the storefront (PRD 6).</summary>
public partial class ShopController : MetaListScreen
{
    protected override string ScreenTitle => "Shop";

    protected override System.Threading.Tasks.Task Populate()
    {
        var config = LiveOpsConfigService.Instance?.Config;
        if (config is not null)
        {
            foreach (var (name, matrix) in config.LootboxDropMatrices)
            {
                AddRow($"{name}: unlocks in {matrix.UnlockDurationSeconds / 3600}h, " +
                       $"legendary {matrix.LegendaryChance}%");
            }
        }
        return System.Threading.Tasks.Task.CompletedTask;
    }
}
