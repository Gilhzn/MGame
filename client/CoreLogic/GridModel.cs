namespace Overlord.CoreLogic;

/// <summary>Arena grid model — mirror of packages/sim/src/grid.ts + constants.ts.</summary>
public static class GridModel
{
    public const int GridW = 12;
    public const int GridH = 24;
    public const int P0HomeMaxRow = 10;
    public const int P1HomeMinRow = 13;

    private static readonly int[] RiverRows = { 11, 12 };
    private static readonly int[] BridgeCols = { 2, 3, 8, 9 };

    public static readonly (int X, int Y)[] BushCells =
    {
        (0, 10), (1, 10), (10, 10), (11, 10),
        (0, 13), (1, 13), (10, 13), (11, 13),
    };

    public static bool InBounds(int cellX, int cellY) =>
        cellX >= 0 && cellX < GridW && cellY >= 0 && cellY < GridH;

    public static bool IsRiverRow(int cellY) => Array.IndexOf(RiverRows, cellY) >= 0;

    public static bool IsBridgeCol(int cellX) => Array.IndexOf(BridgeCols, cellX) >= 0;

    public static bool IsWalkableCell(int cellX, int cellY)
    {
        if (!InBounds(cellX, cellY)) return false;
        if (IsRiverRow(cellY) && !IsBridgeCol(cellX)) return false;
        return true;
    }

    public static bool IsValidDeployCell(int player, int cellX, int cellY)
    {
        if (!IsWalkableCell(cellX, cellY)) return false;
        return player == 0 ? cellY <= P0HomeMaxRow : cellY >= P1HomeMinRow;
    }

    public static bool IsBushCell(int cellX, int cellY)
    {
        foreach (var (x, y) in BushCells)
        {
            if (x == cellX && y == cellY) return true;
        }
        return false;
    }
}
