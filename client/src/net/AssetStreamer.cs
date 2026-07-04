using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;

namespace Overlord.Client;

/// <summary>
/// Asset streaming pipeline (PRD 7.3). Local storage keeps only UI
/// translations (incl. RTL Hebrew/Arabic fonts), base rigs, and tutorial
/// layers; arenas / premium models / hi-fi audio live in remote packs
/// fetched during matchmaking. Local pack loading uses Godot's threaded
/// ResourceLoader; the remote CDN download is a documented stub behind
/// IRemotePackSource so the interface is real and testable.
/// </summary>
public partial class AssetStreamer : Node
{
    public interface IRemotePackSource
    {
        /// <summary>Downloads a .pck to a local path; returns null on failure.</summary>
        Task<string?> FetchPack(string packName);
    }

    /// <summary>Dev source: looks for packs pre-placed under user://packs/.</summary>
    public sealed class LocalOnlyPackSource : IRemotePackSource
    {
        public Task<string?> FetchPack(string packName)
        {
            var path = $"user://packs/{packName}.pck";
            return Task.FromResult(FileAccess.FileExists(path) ? path : null);
        }
    }

    public IRemotePackSource PackSource { get; set; } = new LocalOnlyPackSource();

    private readonly HashSet<string> _loadedPacks = new();
    private readonly Dictionary<string, string> _pendingResources = new();

    public event Action<string, Resource?>? ResourceReady;

    /// <summary>Kick off a threaded load of a local (or already-mounted) resource.</summary>
    public void RequestResource(string resPath)
    {
        if (_pendingResources.ContainsKey(resPath)) return;
        var err = ResourceLoader.LoadThreadedRequest(resPath);
        if (err != Error.Ok)
        {
            GD.PushWarning($"AssetStreamer: load request failed for {resPath}: {err}");
            ResourceReady?.Invoke(resPath, null);
            return;
        }
        _pendingResources[resPath] = resPath;
    }

    public override void _Process(double delta)
    {
        if (_pendingResources.Count == 0) return;
        var done = new List<string>();
        foreach (var path in _pendingResources.Keys)
        {
            var status = ResourceLoader.LoadThreadedGetStatus(path);
            if (status == ResourceLoader.ThreadLoadStatus.Loaded)
            {
                done.Add(path);
                ResourceReady?.Invoke(path, ResourceLoader.LoadThreadedGet(path));
            }
            else if (status is ResourceLoader.ThreadLoadStatus.Failed or ResourceLoader.ThreadLoadStatus.InvalidResource)
            {
                done.Add(path);
                ResourceReady?.Invoke(path, null);
            }
        }
        foreach (var path in done) _pendingResources.Remove(path);
    }

    /// <summary>Fetch + mount a remote pack during the matchmaking sequence (PRD 7.3).</summary>
    public async Task<bool> EnsurePack(string packName)
    {
        if (_loadedPacks.Contains(packName)) return true;
        var localPath = await PackSource.FetchPack(packName);
        if (localPath is null)
        {
            GD.Print($"AssetStreamer: pack '{packName}' unavailable — using local placeholders");
            return false;
        }
        var mounted = ProjectSettings.LoadResourcePack(localPath);
        if (mounted) _loadedPacks.Add(packName);
        return mounted;
    }
}
