namespace Overlord.Client;

/// <summary>Card collection + active deck view (PRD 4.2 Card Deck Builder dock slot).</summary>
public partial class DeckController : MetaListScreen
{
    protected override string ScreenTitle => "Deck Builder";

    protected override async System.Threading.Tasks.Task Populate()
    {
        using var deckDoc = await GetJson("/deck");
        if (deckDoc is not null)
        {
            AddRow("— Active battle deck (8) —");
            foreach (var card in deckDoc.RootElement.GetProperty("deck").EnumerateArray())
            {
                AddRow($"  {card.GetString()}");
            }
        }
        using var profileDoc = await GetJson("/profile");
        if (profileDoc is not null)
        {
            AddRow("— Collection —");
            foreach (var card in profileDoc.RootElement.GetProperty("cards").EnumerateArray())
            {
                AddRow($"  {card.GetProperty("cardId").GetString()}  " +
                       $"lvl {card.GetProperty("cardLevel").GetInt32()}  " +
                       $"x{card.GetProperty("cardsCollected").GetInt32()}");
            }
        }
    }
}
