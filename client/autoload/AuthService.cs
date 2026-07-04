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

    public static string ServerHttpUrl =>
        OS.GetEnvironment("OVERLORD_SERVER") is { Length: > 0 } url ? url : "http://127.0.0.1:8080";

    private readonly System.Net.Http.HttpClient _http = new();

    public override void _EnterTree()
    {
        Instance = this;
    }

    public async Task<bool> EnsureAuthenticated()
    {
        if (LoadStoredToken()) return true;
        return await CreateGuestAccount();
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
