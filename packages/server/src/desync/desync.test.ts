import { describe, expect, it } from 'vitest';
import type { LiveOpsConfig, StateDeltaPayload } from '@overlord/protocol';
import { FakeClock } from '../util/clock.js';
import { FakeLink, liveopsService, memoryRepos, seedProfile } from '../testHelpers.js';
import { Room } from '../match/room.js';
import { ReplayRoom } from '../replay/replayRoom.js';

const env = (t: string, seq: number, p: unknown) => ({ v: 1 as const, t: t as never, seq, p });

function shortConfig(): LiveOpsConfig {
  const config = structuredClone(liveopsService().get());
  config.arena_config.match_duration_seconds = 30;
  return config;
}

async function makeRoom(config = shortConfig()) {
  const repos = memoryRepos();
  const clock = new FakeClock(0);
  const deck = config.unit_registry.slice(0, 8).map((u) => u.uid);
  const p0 = new FakeLink(await seedProfile(repos, 'alice', deck), 'alice', deck);
  const p1 = new FakeLink(await seedProfile(repos, 'bob', deck), 'bob', deck);
  const room = new Room({ seed: 99, config, links: [p0, p1], repos, clock, autoLoop: false });
  room.handleEnvelope(0, env('READY', 0, {}));
  room.handleEnvelope(1, env('READY', 0, {}));
  return { repos, room, p0, p1 };
}

describe('desync monitor (PRD 7.4)', () => {
  it('a matching HASH_REPORT does not trigger a snapshot', async () => {
    const { room, p0 } = await makeRoom();
    for (let i = 0; i < 21; i++) room.runTick();

    const hashed = p0
      .all('STATE_DELTA')
      .map((m) => m.payload as StateDeltaPayload)
      .filter((d) => d.stateHash !== undefined)
      .at(-1)!;
    room.handleEnvelope(0, env('HASH_REPORT', 50, { tick: hashed.tick, hash: hashed.stateHash }));
    expect(p0.all('FULL_SNAPSHOT')).toHaveLength(0);
  });

  it('a mismatched HASH_REPORT triggers a FULL_SNAPSHOT hard re-sync', async () => {
    const { room, p0 } = await makeRoom();
    for (let i = 0; i < 21; i++) room.runTick();

    const hashed = p0
      .all('STATE_DELTA')
      .map((m) => m.payload as StateDeltaPayload)
      .filter((d) => d.stateHash !== undefined)
      .at(-1)!;
    room.handleEnvelope(0, env('HASH_REPORT', 50, { tick: hashed.tick, hash: 'deadbeefdeadbeef' }));

    const snapshots = p0.all('FULL_SNAPSHOT');
    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0]!.payload as { tick: number; state: StateDeltaPayload };
    expect(snap.state.entities.length).toBeGreaterThan(0); // towers at minimum
    expect(snap.state.stateHash).toBeDefined();
  });

  it('RESYNC_REQUEST always yields a snapshot', async () => {
    const { room, p1 } = await makeRoom();
    room.runTick();
    room.handleEnvelope(1, env('RESYNC_REQUEST', 5, {}));
    expect(p1.all('FULL_SNAPSHOT')).toHaveLength(1);
  });
});

describe('replay spectator room (PRD 7.1)', () => {
  it('re-simulates a recorded match, streams deltas, and verifies the final hash', async () => {
    const config = shortConfig();
    const { repos, room } = await makeRoom(config);

    room.handleEnvelope(0, env('SPAWN_CARD', 1, {
      cardId: 'unit_royal_archer', cell: { x: 5, y: 9 }, possess: false,
    }));
    room.handleEnvelope(1, env('SPAWN_CARD', 1, {
      cardId: 'unit_shadow_rogue', cell: { x: 6, y: 14 }, possess: false,
    }));
    for (let i = 0; i < 700 && !room.isEnded; i++) room.runTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(room.isEnded).toBe(true);

    const record = (await repos.replays.byId(room.replayId!))!;
    const spectator = new FakeLink('spec', 'spectator', []);
    const replayRoom = new ReplayRoom({ record, config, spectator, autoLoop: false });
    for (let i = 0; i < 700 && !replayRoom.isDone; i++) replayRoom.runTick();

    expect(replayRoom.isDone).toBe(true);
    expect(replayRoom.verified).toBe(true); // same seed + inputs → same hash
    expect(spectator.all('MATCH_START')).toHaveLength(1);
    expect(spectator.all('STATE_DELTA').length).toBeGreaterThan(500);
  });
});
