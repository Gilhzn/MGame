# Architecture

## The one decision everything hangs on

There is a **single canonical deterministic simulation, written once in TypeScript**
(`packages/sim`). The live server steps it at 20Hz; the replay engine re-steps it from
recorded inputs. The Godot client does **not** run the sim — it interpolates state
deltas ~100ms behind the server, and predicts only the possessed unit's movement using
a ~150-line C# mirror of the sim's movement kernel (kept honest by golden vectors, see
`docs/determinism.md`). This avoids the classic dual-language determinism trap while
still delivering latency-free FPS control (PRD 2.1).

## Server (packages/server)

```
HTTP  /auth/guest  /auth/link  /config  /profile /deck /chests /leaderboard /clans
WS    gateway → session (seq/ack, rate-limit) → matchmaking queue → room
room  = tickLoop(20Hz, drift-corrected) + inputBuffer + sim.step()
        ├─ reconciliation  (divergence > 0.15u → CORRECTION)
        ├─ lagComp         (SHOOT rewound ≤1s via sim/history)
        ├─ anticheat       (≥180°/tick yaw snap + headshot → drop + telemetry flag)
        ├─ fog culler      (per-player deltas; hidden entities never serialized)
        ├─ desync monitor  (hash every 20th delta; mismatch → FULL_SNAPSHOT)
        └─ replay recorder (ReplayFrame stream → replays table at GAME_OVER)
persistence: repository interfaces with in-memory (default/dev/test) and pg (Supabase) impls
```

The 20Hz loop uses accumulated-time `setTimeout` scheduling (never `setInterval`) so
tick N always fires as close as possible to `t0 + N*50ms` regardless of event-loop
jitter.

## Simulation (packages/sim)

Pure functions over `SimState`; no IO, no timers, no `Date`, no floats in state.
`step(state, tickInputs)` advances one tick: elixir regen → queued spawns → possession
inputs → AI (pathfinding on the 12x24 grid, deterministic A* tie-breaking) → combat
(hitscan + projectiles, `Headshot_Bone` head-sphere multiplier) → towers → deaths →
position history push (lag comp ring buffer) → state hash.

Arena model: rows 0–10 player-0 territory, rows 11–12 the river (crossable only at the
two bridge columns), rows 13–23 player-1 territory. Stealth bushes flank the river and
feed the fog-of-war visibility sets.

## Client (client/)

- `CoreLogic/` — plain net8.0 classlib, **no Godot references**: codec, interpolation
  buffer, prediction engine, movement kernel, elixir clock, chest countdown, FTUE state
  machine, state hasher. Tested with xunit headless.
- Godot layer — autoload singletons (`NetworkClient`, `GameState`, `AuthService`,
  `LiveOpsConfigService`, `AudioListenerSwitchManager`, `SceneRouter`), scenes (Lobby,
  Arena, FTUE, Deck, Shop, Clan, Leaderboard), and arena scripts (camera director,
  possession controller, card hand drag-drop, modular character assembler with
  `Socket_Head`/`Socket_Back`/`Socket_Hand_R` attachment points).

## Deliberate stubs (interfaces are real, transport is faked)

Google/Apple token verification (`OAuthVerifier`), remote asset-pack download
(`AssetStreamer` fetch), HRTF audio specifics (bus switch works, HRTF is a TODO),
3D art (placeholder rigs with correctly named bones/sockets), Supabase RLS (server
uses service-role; policies documented, not enforced).
