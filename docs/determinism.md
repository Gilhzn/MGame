# Determinism Policy

The simulation in `packages/sim` must produce **bit-identical results** for the same
`(seed, liveops config, ordered input stream)` on every run. This is what makes
input-stream replays (PRD 7.1), desync detection (PRD 7.4), and server-side replay
verification possible.

## Rules

1. **Fixed-point integer math only** inside the sim core:
   - Positions/velocities: int32 **milli-units** (`1.0 world unit = 1000`).
   - Elixir: **tenths** (`cap 10 elixir = 100`).
   - Angles: **milli-degrees** (yaw `-180000..180000`, pitch clamped `±89000`).
   - Helpers live in `packages/sim/src/fixed.ts` (`fpMul`, `fpDiv`, `fpSqrt` — integer
     Newton's method — and vector ops). No `Math.sin/cos/sqrt` on floats in sim state.
2. **Single PRNG**: `mulberry32(seed)` (`packages/sim/src/prng.ts`). The PRNG state is
   part of `SimState`. Nothing else may generate randomness. `Date.now()` is banned.
3. **Canonical ordering**: entities live in arrays sorted by numeric id; per-tick inputs
   are sorted `(playerIndex, seq)` before application. No iteration over `Map`/`Set`.
4. **State hash**: FNV-1a 64-bit (as two uint32 lanes, hex-concatenated) over a canonical
   serialization: tick, elixir pools, then entities ordered by id with
   `(id, kind, owner, x, y, z, yaw, hp)`. Computed every tick; embedded in every 20th
   `STATE_DELTA` for client cross-checking.

## Cross-language contract (TS ⇄ C#)

The client predicts only the **possessed unit's movement**. The TS kernel
(`packages/sim/src/movementKernel.ts`) is mirrored by
`client/CoreLogic/MovementKernel.cs`. Both are pure integer functions:

```
stepPossessedMovement(input {moveX, moveY, yawMdeg}, transform {x, y, yawMdeg}, stats {speedMupt}) -> transform
```

`npm run golden` regenerates `shared/golden/movement_vectors.json` from the TS kernel;
`client/CoreLogic.Tests/MovementKernelGoldenTests.cs` asserts the C# port reproduces
every vector exactly. Any drift fails CI instead of causing live mispredictions.

## Replay verification

`runReplay(seed, config, frames)` reboots a clean sim and streams the recorded
`ReplayFrame`s. The final state hash must equal the hash recorded at `GAME_OVER`;
`packages/sim/src/replay.test.ts` and the server's end-to-end room test both assert it.
