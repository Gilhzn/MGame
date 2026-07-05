using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Godot;

namespace Overlord.Client;

/// <summary>
/// Silent onboarding (PRD 4.1): on boot, reuse the device token from secure
/// local storage; if absent, hit POST /auth/guest and store the JWT. The
/// player never sees a login screen. OAuth account linking calls
/// POST /auth/link (server-side verification is stubbed behind an interface).
/// </summary>
public partial class AuthService : Node
{
    private const string TokenPath = "user://device_token.json";

    public static AuthService? Instance { get; private set; }

    public string? Token { get; private set; }
    public string? ProfileId { get; private set; }
    public string? Username { get; private set; }

    private const string ServerUrlPath = "user://server_url.txt";
    private static string? _serverUrlOverride;
    private static string? _discoveredUrl;

    /// <summary>
    /// The Run Server workflow commits the live tunnel URL here; the client
    /// fetches it at boot and connects with zero configuration.
    /// </summary>
    private const string DiscoveryUrl =
        "https://raw.githubusercontent.com/Gilhzn/MGame/claude/hybrid-rts-fps-prd-jpnymh/server_url.txt";

    /// <summary>Priority: user-saved override → auto-discovered public server → env var → localhost.</summary>
    public static string ServerHttpUrl =>
        _serverUrlOverride
        ?? _discoveredUrl
        ?? (OS.GetEnvironment("OVERLORD_SERVER") is { Length: > 0 } url ? url : "http://127.0.0.1:8080");

    /// <summary>Fetch the current public server URL. No-op when the user set one manually.</summary>
    public async Task DiscoverServer()
    {
        if (_serverUrlOverride is not null) return;
        try
        {
            var raw = (await _http.GetStringAsync(DiscoveryUrl)).Trim();
            if (raw.StartsWith("http"))
            {
                _discoveredUrl = raw.TrimEnd('/');
                GD.Print($"AuthService: discovered public server {_discoveredUrl}");
            }
        }
        catch (Exception e)
        {
            GD.PushWarning($"AuthService: server discovery failed: {e.Message}");
        }
    }

    /// <summary>Persist a server address entered on the Boot screen (device testing).</summary>
    public static void SetServerUrl(string url)
    {
        _serverUrlOverride = url.TrimEnd('/');
        using var f = FileAccess.Open(ServerUrlPath, FileAccess.ModeFlags.Write);
        f?.StoreString(_serverUrlOverride);
    }

    private static void LoadServerUrlOverride()
    {
        if (!FileAccess.FileExists(ServerUrlPath)) return;
        using var f = FileAccess.Open(ServerUrlPath, FileAccess.ModeFlags.Read);
        var saved = f?.GetAsText().Trim();
        // A saved localhost address can never be right on a device and would
        // block auto-discovery forever — ignore it.
        if (!string.IsNullOrEmpty(saved) && !saved.Contains("127.0.0.1") && !saved.Contains("localhost"))
        {
            _serverUrlOverride = saved;
        }
    }

    private readonly System.Net.Http.HttpClient _http = new();

    public override void _EnterTree()
    {
        Instance = this;
        LoadServerUrlOverride();
    }

    public async Task<bool> EnsureAuthenticated()
    {
        // A stored token is only good if THIS server recognizes it — the test
        // server is ephemeral (fresh DB per session), so always validate.
        if (LoadStoredToken() && await TokenIsValid()) return true;
        return await CreateGuestAccount();
    }

    private async Task<bool> TokenIsValid()
    {
        try
        {
            var res = await Send(AuthorizedRequest(HttpMethod.Get, "/profile"));
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private bool LoadStoredToken()
    {
        if (!FileAccess.FileExists(TokenPath)) return false;
        using var f = FileAccess.Open(TokenPath, FileAccess.ModeFlags.Read);
        if (f is null) return false;
        try
        {
            var doc = JsonDocument.Parse(f.GetAsText());
            Token = doc.RootElement.GetProperty("token").GetString();
            ProfileId = doc.RootElement.GetProperty("profileId").GetString();
            Username = doc.RootElement.GetProperty("username").GetString();
            // A token minted by a different server is useless; the guest flow
            // will mint a fresh one if this fails downstream.
            return !string.IsNullOrEmpty(Token);
        }
        catch (Exception e)
        {
            GD.PushWarning($"AuthService: stored token unreadable: {e.Message}");
            return false;
        }
    }

    private async Task<bool> CreateGuestAccount()
    {
        try
        {
            var res = await _http.PostAsync($"{ServerHttpUrl}/auth/guest", new StringContent("", Encoding.UTF8, "application/json"));
            if (!res.IsSuccessStatusCode) return false;
            var body = await res.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(body);
            Token = doc.RootElement.GetProperty("token").GetString();
            ProfileId = doc.RootElement.GetProperty("profileId").GetString();
            Username = doc.RootElement.GetProperty("username").GetString();

            using var f = FileAccess.Open(TokenPath, FileAccess.ModeFlags.Write);
            f?.StoreString(body);
            return true;
        }
        catch (Exception e)
        {
            GD.PushError($"AuthService: guest auth failed: {e.Message}");
            return false;
        }
    }

    /// <summary>Account hardening (PRD 4.1 step 2) — settings panel entry point.</summary>
    public async Task<bool> LinkAccount(string provider, string idToken)
    {
        if (Token is null) return false;
        try
        {
            var payload = JsonSerializer.Serialize(new { provider, idToken });
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{ServerHttpUrl}/auth/link")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            req.Headers.Add("Authorization", $"Bearer {Token}");
            var res = await _http.SendAsync(req);
            return res.IsSuccessStatusCode;
        }
        catch (Exception e)
        {
            GD.PushError($"AuthService: link failed: {e.Message}");
            return false;
        }
    }

    public HttpRequestMessage AuthorizedRequest(HttpMethod method, string path, string? jsonBody = null)
    {
        var req = new HttpRequestMessage(method, $"{ServerHttpUrl}{path}");
        if (Token is not null) req.Headers.Add("Authorization", $"Bearer {Token}");
        if (jsonBody is not null) req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        return req;
    }

    public Task<HttpResponseMessage> Send(HttpRequestMessage req) => _http.SendAsync(req);
}
