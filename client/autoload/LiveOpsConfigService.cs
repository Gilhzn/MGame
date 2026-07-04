using System;
using System.Net.Http;
using System.Threading.Tasks;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// Fetches the single centralized LiveOps JSON over HTTP at app start
/// (PRD 6), caching the last good copy locally so the game still boots
/// offline with slightly stale tuning.
/// </summary>
public partial class LiveOpsConfigService : Node
{
    private const string CachePath = "user://liveops_cache.json";

    public static LiveOpsConfigService? Instance { get; private set; }

    public LiveOpsConfig? Config { get; private set; }

    private readonly System.Net.Http.HttpClient _http = new();

    public override void _EnterTree()
    {
        Instance = this;
    }

    public async Task<bool> Fetch()
    {
        try
        {
            var body = await _http.GetStringAsync($"{AuthService.ServerHttpUrl}/config");
            Config = LiveOpsConfig.Parse(body);
            using var f = FileAccess.Open(CachePath, FileAccess.ModeFlags.Write);
            f?.StoreString(body);
            GD.Print($"LiveOps: fetched version {Config.LiveopsVersion}");
            return true;
        }
        catch (Exception e)
        {
            GD.PushWarning($"LiveOps: fetch failed ({e.Message}); trying cache");
            return LoadCache();
        }
    }

    private bool LoadCache()
    {
        if (!FileAccess.FileExists(CachePath)) return false;
        using var f = FileAccess.Open(CachePath, FileAccess.ModeFlags.Read);
        if (f is null) return false;
        try
        {
            Config = LiveOpsConfig.Parse(f.GetAsText());
            return true;
        }
        catch
        {
            return false;
        }
    }
}
