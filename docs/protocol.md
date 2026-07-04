# Network Protocol

JSON messages over a single WebSocket. The codec is isolated in
`packages/protocol/src/codec.ts` so a binary encoding can be swapped in later without
touching game logic.

## Envelope

```jsonc
{ "v": 1, "t": "<opcode>", "seq": 12, "ack": 40, "tick": 812, "p": { /* payload */ } }
```

- `seq` — monotonic per sender per connection.
- `ack` — highest contiguous `seq` received from the peer (optional).
- `tick` — simulation tick the message pertains to (optional).

## Client → Server

| Opcode | Payload | Notes |
|---|---|---|
| `HELLO` | `{token}` | First message after connect; JWT from `/auth/guest` |
| `QUEUE_JOIN` | `{mode: 'ladder'\|'training'}` | Enter matchmaking |
| `QUEUE_LEAVE` | `{}` | |
| `READY` | `{}` | Client finished loading the arena |
| `SPAWN_CARD` | `{cardId, cell:{x,y}, possess:boolean}` | `possess` is consumed server-side and **never rebroadcast** — the opponent cannot distinguish a possessed unit (PRD 1.2, "the bluff") |
| `INPUT` | `{unitId, cTick, seq, moveX, moveY, yawMdeg, pitchMdeg, predictedX, predictedY}` | Possessed-unit input; `predicted*` lets the server measure divergence |
| `SHOOT` | `{unitId, weapon:'alpha'\|'beta', originX,originY,originZ, dirX,dirY,dirZ, clientTimeMs, seq}` | Lag-compensated against ≤1s rewind buffer |
| `HASH_REPORT` | `{tick, hash}` | Client's replicated-state hash for desync detection |
| `RESYNC_REQUEST` | `{}` | Ask for a `FULL_SNAPSHOT` |
| `PING` | `{t0}` | |

## Server → Client

| Opcode | Payload | Notes |
|---|---|---|
| `WELCOME` | `{profileId, serverTime}` | Auth accepted |
| `QUEUED` | `{position}` | |
| `MATCH_FOUND` | `{roomId, opponent:{username, trophies}}` | |
| `MATCH_START` | `{tick0, seed, playerIndex, decks, configVersion, durationTicks}` | `seed` is the match PRNG seed (needed for replays; not secret once the match ends) |
| `STATE_DELTA` | `{tick, entities:[...], removed:[ids], events:[...], elixir, doubleElixir, lastProcessedInputSeq, stateHash?}` | **Per-player fog-culled** (PRD 2.2): hidden entities are never serialized. `stateHash` present every 20th tick |
| `CORRECTION` | `{unitId, tick, x, y, yawMdeg, lastInputSeq}` | Sent when predicted vs authoritative position diverges > 0.15 units |
| `FULL_SNAPSHOT` | `{tick, state}` | Desync recovery (PRD 7.4): client purges local timeline and resumes |
| `POSSESS_CONFIRM` | `{unitId}` | Sent only to the possessing player |
| `POSSESS_END` | `{unitId, reason:'death'\|'match_end'}` | Camera snaps back to RTS view |
| `GAME_OVER` | `{winnerIndex, crowns:[p1,p2], trophyDelta, rewards:{gold, chestType?}, replayId}` | |
| `PONG` | `{t0, serverTime}` | |
| `ERROR` | `{code, message}` | e.g. `NOT_ENOUGH_ELIXIR`, `INVALID_CELL`, `RATE_LIMITED` |

## Entity wire format (inside STATE_DELTA)

```jsonc
{ "id": 17, "kind": "unit"|"tower"|"projectile", "uid": "unit_royal_archer",
  "owner": 0, "x": 5500, "y": 12250, "yawMdeg": 90000, "hp": 320, "maxHp": 320,
  "anim": "walk"|"attack"|"idle"|"death" }
```

Coordinates are fixed-point milli-units (see `docs/determinism.md`). There is **no
field that reveals possession** — AI and possessed units serialize identically.

## Sequences

- **Spawn+possess:** client sends `SPAWN_CARD{possess:true}` → server validates elixir +
  cell, spawns unit, replies `POSSESS_CONFIRM` to the owner only; the unit appears in
  both players' `STATE_DELTA` identically.
- **Prediction loop:** client applies `INPUT` locally at once, buffers it, sends it;
  each `STATE_DELTA` carries `lastProcessedInputSeq`, and the client re-applies pending
  inputs on top of the authoritative transform; a `CORRECTION` forces a rebase.
- **Desync:** client sends `HASH_REPORT` when `STATE_DELTA.stateHash` is present and its
  own replicated hash differs → server responds `FULL_SNAPSHOT`.
