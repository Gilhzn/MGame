# Project Overlord — Hybrid RTS-FPS Battler

A mobile 1v1 hybrid: a Clash-Royale-style tactical grid layer (12x24 arena, elixir,
8-card decks) fused with a **possession mechanic** — at the moment a unit spawns, its
owner can drop into first-person control of it, with **zero network tell** to the
opponent that the unit is human-controlled.

Full product spec: [`docs/GAME_PRD_MASTER_PROMPT.md`](docs/GAME_PRD_MASTER_PROMPT.md).

## Repository layout

| Path | What |
|---|---|
| `packages/protocol` | Shared TS message envelope, opcodes, zod schemas, LiveOps types |
| `packages/sim` | Pure deterministic 20Hz simulation (fixed-point, no IO) — used by the live server **and** the replay engine |
| `packages/server` | Node.js WebSocket game server: auth, matchmaking, rooms, reconciliation, lag compensation, anti-cheat, fog-of-war, persistence |
| `client/` | Godot 4 (C#) mobile client — `CoreLogic/` is a Godot-free classlib tested headless with xunit |
| `shared/golden` | Cross-language golden test vectors (TS sim ⇄ C# movement kernel) |
| `config/liveops.json` | Central LiveOps config served over HTTP (`GET /config`) |
| `db/migrations` | PostgreSQL/Supabase schema (PRD schema verbatim in `0001`) |
| `tools/blender` | Blender 4.x procedural arena generator |
| `docs/` | Architecture, protocol, and determinism references |

## Quick start

```bash
npm install          # root — installs all workspaces
npm test             # vitest: sim + protocol + server suites
npm run dev:server   # start the game server (see packages/server/.env.example)

# Godot client core logic (no Godot editor needed):
dotnet build client/MGame.Client.sln
dotnet test client/CoreLogic.Tests
```

## Architecture in one paragraph

The **server is authoritative**: a drift-corrected 20Hz loop advances the deterministic
simulation in `packages/sim` (fixed-point int math, seeded mulberry32 PRNG, FNV-1a
running state hash). Clients interpolate fog-culled state deltas ~100ms behind the
server; only the *possessed* unit is client-side predicted, via a small C# movement
kernel kept bit-identical to the TS kernel through committed golden vectors. Shots are
lag-compensated against a 1-second rewind buffer. Matches record input streams
(`ReplayFrame`), so a replay is just: same seed + same inputs → identical simulation,
verified by state hash. Desync recovery = full snapshot push, purge, resume.

Details: [`docs/architecture.md`](docs/architecture.md),
[`docs/protocol.md`](docs/protocol.md), [`docs/determinism.md`](docs/determinism.md).

## Notes on PRD fidelity

- `db/migrations/0001_prd_schema.sql` and the Blender script are the PRD's own text.
- `config/liveops.json` keeps the PRD's `unit_royal_archer` entry and curves verbatim,
  extended with fields the simulation requires (`hitpoints`, `hitbox`, `rarity`, `rig`),
  seven more units to fill an 8-card deck, and tower/match settings under `arena_config`.
