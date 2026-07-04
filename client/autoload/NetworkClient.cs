using System;
using System.Text.Json;
using Godot;
using Overlord.CoreLogic;

namespace Overlord.Client;

/// <summary>
/// The WebSocket pump: encodes/decodes protocol envelopes, keeps seq/ack
/// counters, estimates server time from PING/PONG (feeds SHOOT lag-comp
/// timestamps), and fans messages out as C# events.
/// </summary>
public partial class NetworkClient : Node
{
    public static NetworkClient? Instance { get; private set; }

    public event Action? Connected;
    public event Action? Disconnected;
    public event Action<MatchStartDto>? MatchStarted;
    public event Action<StateDeltaDto>? StateDeltaReceived;
    public event Action<CorrectionDto>? CorrectionReceived;
    public event Action<StateDeltaDto>? FullSnapshotReceived;
    public event Action<int>? PossessConfirmed;
    public event Action<int, string>? PossessEnded;
    public event Action<GameOverDto>? GameOverReceived;
    public event Action<string, string>? ErrorReceived;

    private WebSocketPeer? _ws;
    private bool _helloSent;
    private int _seq;
    private int _lastPeerSeq = -1;
    private double _pingTimer;
    private long _serverTimeOffsetMs;

    private const double PingIntervalSeconds = 2.0;

    public bool IsLive => _ws?.GetReadyState() == WebSocketPeer.State.Open && _helloSent;

    /// <summary>Best-estimate server clock, used for SHOOT clientTimeMs (PRD 2.1).</summary>
    public long ServerNowMs => NowMs() + _serverTimeOffsetMs;

    private static long NowMs() => (long)Time.GetTicksMsec();

    public static string ServerWsUrl
    {
        get
        {
            var http = AuthService.ServerHttpUrl;
            return http.Replace("https://", "wss://").Replace("http://", "ws://");
        }
    }

    public override void _EnterTree()
    {
        Instance = this;
    }

    public Error Connect()
    {
        _ws = new WebSocketPeer();
        _helloSent = false;
        _seq = 0;
        _lastPeerSeq = -1;
        return _ws.ConnectToUrl(ServerWsUrl);
    }

    public override void _Process(double delta)
    {
        if (_ws is null) return;
        _ws.Poll();
        var state = _ws.GetReadyState();

        if (state == WebSocketPeer.State.Open)
        {
            if (!_helloSent && AuthService.Instance?.Token is { } token)
            {
                Send(Opcodes.Hello, new { token });
                _helloSent = true;
            }

            _pingTimer += delta;
            if (_pingTimer >= PingIntervalSeconds && _helloSent)
            {
                _pingTimer = 0;
                Send(Opcodes.Ping, new { t0 = NowMs() });
            }

            while (_ws.GetAvailablePacketCount() > 0)
            {
                var raw = _ws.GetPacket().GetStringFromUtf8();
                HandleMessage(raw);
            }
        }
        else if (state == WebSocketPeer.State.Closed)
        {
            _ws = null;
            _helloSent = false;
            Disconnected?.Invoke();
        }
    }

    private void HandleMessage(string raw)
    {
        var env = Codec.Decode(raw);
        if (env is null) return;
        if (env.Seq > _lastPeerSeq) _lastPeerSeq = env.Seq;

        switch (env.T)
        {
            case Opcodes.Welcome:
                Connected?.Invoke();
                break;
            case Opcodes.Pong:
            {
                var t0 = env.P.GetProperty("t0").GetInt64();
                var serverTime = env.P.GetProperty("serverTime").GetInt64();
                var rtt = NowMs() - t0;
                _serverTimeOffsetMs = serverTime + rtt / 2 - NowMs();
                break;
            }
            case Opcodes.MatchStart:
                if (Codec.Payload<MatchStartDto>(env) is { } start) MatchStarted?.Invoke(start);
                break;
            case Opcodes.StateDelta:
                if (Codec.Payload<StateDeltaDto>(env) is { } deltaDto) StateDeltaReceived?.Invoke(deltaDto);
                break;
            case Opcodes.Correction:
                if (Codec.Payload<CorrectionDto>(env) is { } corr) CorrectionReceived?.Invoke(corr);
                break;
            case Opcodes.FullSnapshot:
            {
                // The snapshot body is a full culled view shaped like a delta.
                var stateEl = env.P.GetProperty("state");
                var snap = stateEl.Deserialize<StateDeltaDto>(Codec.Options);
                if (snap is not null) FullSnapshotReceived?.Invoke(snap);
                break;
            }
            case Opcodes.PossessConfirm:
                if (Codec.Payload<PossessDto>(env) is { } pc) PossessConfirmed?.Invoke(pc.UnitId);
                break;
            case Opcodes.PossessEnd:
                if (Codec.Payload<PossessDto>(env) is { } pe) PossessEnded?.Invoke(pe.UnitId, pe.Reason ?? "death");
                break;
            case Opcodes.GameOver:
                if (Codec.Payload<GameOverDto>(env) is { } over) GameOverReceived?.Invoke(over);
                break;
            case Opcodes.Error:
            {
                var code = env.P.GetProperty("code").GetString() ?? "UNKNOWN";
                var message = env.P.GetProperty("message").GetString() ?? "";
                ErrorReceived?.Invoke(code, message);
                break;
            }
        }
    }

    public void Send(string op, object payload, int? tick = null)
    {
        if (_ws is null || _ws.GetReadyState() != WebSocketPeer.State.Open) return;
        _ws.SendText(Codec.Encode(op, payload, _seq++, ack: _lastPeerSeq >= 0 ? _lastPeerSeq : null, tick: tick));
    }

    // ---- gameplay send helpers ----

    public void SendQueueJoin(string mode = "ladder") => Send(Opcodes.QueueJoin, new { mode });

    public void SendReady() => Send(Opcodes.Ready, new { });

    public void SendSpawnCard(string cardId, int cellX, int cellY, bool possess) =>
        Send(Opcodes.SpawnCard, new SpawnCardDto
        {
            CardId = cardId,
            Cell = new SpawnCardDto.CellDto { X = cellX, Y = cellY },
            Possess = possess,
        });

    public void SendInput(InputDto input) => Send(Opcodes.Input, input);

    public void SendShoot(ShootDto shoot) => Send(Opcodes.Shoot, shoot);

    public void SendHashReport(int tick, string hash) => Send(Opcodes.HashReport, new { tick, hash });

    public void SendResyncRequest() => Send(Opcodes.ResyncRequest, new { });
}
