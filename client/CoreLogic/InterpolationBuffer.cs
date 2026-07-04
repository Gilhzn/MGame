namespace Overlord.CoreLogic;

public readonly record struct EntityState(int Id, int X, int Y, int YawMdeg, int Hp);

public readonly record struct InterpolatedEntity(int Id, float X, float Y, float YawMdeg, int Hp);

/// <summary>
/// Jitter-free rendering of 20Hz authoritative snapshots (PRD phase 2): the
/// view runs a configurable delay (default 2 ticks = 100ms) behind the newest
/// snapshot and lerps between the two surrounding frames. Gaps larger than
/// the snap threshold (teleports, desync recovery) snap instead of gliding.
/// </summary>
public sealed class InterpolationBuffer
{
    private const int Capacity = 32;
    public const float DefaultDelayTicks = 2.0f;
    public const int SnapThresholdMu = 3000; // 3 world units

    private readonly List<(int Tick, Dictionary<int, EntityState> Entities)> _frames = new();

    public float DelayTicks { get; }

    public InterpolationBuffer(float delayTicks = DefaultDelayTicks)
    {
        DelayTicks = delayTicks;
    }

    public int NewestTick => _frames.Count > 0 ? _frames[^1].Tick : -1;

    public void AddSnapshot(int tick, IEnumerable<EntityState> entities)
    {
        if (_frames.Count > 0 && tick <= _frames[^1].Tick) return; // stale/duplicate
        var map = new Dictionary<int, EntityState>();
        foreach (var e in entities) map[e.Id] = e;
        _frames.Add((tick, map));
        while (_frames.Count > Capacity) _frames.RemoveAt(0);
    }

    /// <summary>Purge everything — desync hard re-sync (PRD 7.4).</summary>
    public void Clear() => _frames.Clear();

    /// <summary>
    /// Sample at (newest tick - delay). renderTickOffset lets the caller add
    /// sub-tick smoothing from frame time.
    /// </summary>
    public IReadOnlyList<InterpolatedEntity> Sample(float renderTickOffset = 0f)
    {
        var result = new List<InterpolatedEntity>();
        if (_frames.Count == 0) return result;
        var renderTick = _frames[^1].Tick - DelayTicks + renderTickOffset;

        var (beforeIdx, afterIdx) = (0, _frames.Count - 1);
        for (var i = 0; i < _frames.Count; i++)
        {
            if (_frames[i].Tick <= renderTick) beforeIdx = i;
        }
        afterIdx = Math.Min(beforeIdx + 1, _frames.Count - 1);

        var (t0, e0) = _frames[beforeIdx];
        var (t1, e1) = _frames[afterIdx];
        var span = t1 - t0;
        var alpha = span <= 0 ? 0f : Math.Clamp((renderTick - t0) / span, 0f, 1f);

        foreach (var (id, a) in e0)
        {
            if (e1.TryGetValue(id, out var b))
            {
                var dx = b.X - a.X;
                var dy = b.Y - a.Y;
                if (Math.Abs(dx) > SnapThresholdMu || Math.Abs(dy) > SnapThresholdMu)
                {
                    result.Add(new InterpolatedEntity(id, b.X, b.Y, b.YawMdeg, b.Hp));
                }
                else
                {
                    result.Add(new InterpolatedEntity(
                        id,
                        a.X + dx * alpha,
                        a.Y + dy * alpha,
                        LerpYaw(a.YawMdeg, b.YawMdeg, alpha),
                        b.Hp));
                }
            }
            else
            {
                result.Add(new InterpolatedEntity(id, a.X, a.Y, a.YawMdeg, a.Hp));
            }
        }
        // Entities that appear only in the newer frame pop in at their position.
        foreach (var (id, b) in e1)
        {
            if (!e0.ContainsKey(id)) result.Add(new InterpolatedEntity(id, b.X, b.Y, b.YawMdeg, b.Hp));
        }
        result.Sort((x, y) => x.Id.CompareTo(y.Id));
        return result;
    }

    private static float LerpYaw(int fromMdeg, int toMdeg, float alpha)
    {
        var d = (toMdeg - fromMdeg) % 360000;
        if (d > 180000) d -= 360000;
        if (d < -180000) d += 360000;
        return fromMdeg + d * alpha;
    }
}
