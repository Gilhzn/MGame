namespace Overlord.CoreLogic;

/// <summary>
/// FNV-1a 64 over the wire view — mirror of viewHash in
/// packages/sim/src/hash.ts, pinned by shared/golden/hash_fixtures.json.
/// Used for HASH_REPORT desync detection (PRD 7.4): the client hashes its
/// replicated store exactly like the server hashes the culled view.
/// </summary>
public static class StateHasher
{
    private const ulong FnvOffset = 0xcbf29ce484222325UL;
    private const ulong FnvPrime = 0x100000001b3UL;

    private static ulong FoldInt32(ulong hash, int value)
    {
        var u = unchecked((uint)value);
        for (var i = 0; i < 4; i++)
        {
            hash ^= (byte)(u >> (i * 8));
            hash = unchecked(hash * FnvPrime);
        }
        return hash;
    }

    /// <summary>Entities MUST be in ascending id order.</summary>
    public static string ViewHash(IEnumerable<EntityState> entitiesSortedById)
    {
        var h = FnvOffset;
        foreach (var e in entitiesSortedById)
        {
            h = FoldInt32(h, e.Id);
            h = FoldInt32(h, e.X);
            h = FoldInt32(h, e.Y);
            h = FoldInt32(h, e.YawMdeg);
            h = FoldInt32(h, e.Hp);
        }
        return h.ToString("x16");
    }
}
