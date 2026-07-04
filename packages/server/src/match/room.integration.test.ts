import { describe, expect, it } from 'vitest';
import type { LiveOpsConfig, StateDeltaPayload } from '@overlord/protocol';
import { runReplay } from '@overlord/sim';
import { FakeClock } from '../util/clock.js';
import { FakeLink, liveopsService, memoryRepos, seedProfile } from '../testHelpers.js';
import { Room } from './room.js';

const env = (t: string, seq: number, p: unknown) => ({ v: 1 as const, t: t as never, seq, p });

function shortConfig(): LiveOpsConfig {
  const config = structuredClone(liveopsService().get());
  config.arena_config.match_duration_seconds = 30; // 600 ticks
  config.arena_config.double_elixir_final_seconds = 10;
  return config;
}

async function makeRoom(config = shortConfig()) {
  const repos = memoryRepos();
  const clock = new FakeClock(1_000_000);
  const deck = config.unit_registry.slice(0, 8).map((u) => u.uid);
  const p0Id = await seedProfile(repos, 'alice', deck);
  const p1Id = await seedProfile(repos, 'bob', deck);
  const p0 = new FakeLink(p0Id, 'alice', deck);
  const p1 = new FakeLink(p1Id, 'bob', deck);
  const room = new Room({
    seed: 0xdecade,
    config,
    links: [p0, p1],
    repos,
    clock,
    autoLoop: false,
  });
  room.handleEnvelope(0, env('READY', 0, {}));
  room.handleEnvelope(1, env('READY', 0, {}));
  const tick = () => {
    room.runTick();
    clock.advance(50);
  };
  return { repos, clock, room, p0, p1, tick };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('room end-to-end (spawn → possess → move → shoot → win)', () => {
  it('runs the full possession loop with the bluff, reconciliation, anti-cheat, and rewards', async () => {
    const { repos, clock, room, p0, p1, tick } = await makeRoom();

    expect(p0.all('MATCH_START')).toHaveLength(1);
    expect(p1.all('MATCH_START')).toHaveLength(1);

    // --- Spawn + possess (hold & release) ---
    room.handleEnvelope(0, env('SPAWN_CARD', 1, {
      cardId: 'unit_shadow_rogue', cell: { x: 2, y: 10 }, possess: true,
    }));
    tick();

    const confirm = p0.last('POSSESS_CONFIRM');
    expect(confirm).toBeDefined();
    const unitId = (confirm!.payload as { unitId: number }).unitId;
    expect(room.possessedUnitOf(0)).toBe(unitId);

    // --- The bluff (PRD 1.2): the opponent's wire data is indistinguishable ---
    expect(p1.all('POSSESS_CONFIRM')).toHaveLength(0);
    const oppDelta = p1.last('STATE_DELTA')!.payload as StateDeltaPayload;
    const seenUnit = oppDelta.entities.find((e) => e.id === unitId);
    expect(seenUnit).toBeDefined();
    expect(seenUnit!.kind).toBe('unit');
    expect('possessedBy' in seenUnit!).toBe(false);
    expect(JSON.stringify(oppDelta)).not.toContain('possess');

    // --- Prediction agrees → no correction ---
    const own = () =>
      (p0.last('STATE_DELTA')!.payload as StateDeltaPayload).entities.find((e) => e.id === unitId)!;
    const before = own();
    // shadow rogue speed 4.2 → 210 mu/tick
    room.handleEnvelope(0, env('INPUT', 2, {
      unitId, cTick: room.state.tick, seq: 1, moveX: 0, moveY: 1000,
      yawMdeg: 0, pitchMdeg: 0,
      predictedX: before.x, predictedY: before.y + 210,
    }));
    tick();
    expect(p0.all('CORRECTION')).toHaveLength(0);
    expect(own().y).toBe(before.y + 210);

    // --- Bad prediction → CORRECTION with authoritative transform ---
    const pos = own();
    room.handleEnvelope(0, env('INPUT', 3, {
      unitId, cTick: room.state.tick, seq: 2, moveX: 0, moveY: 1000,
      yawMdeg: 0, pitchMdeg: 0,
      predictedX: pos.x + 500, predictedY: pos.y,
    }));
    tick();
    const correction = p0.last('CORRECTION');
    expect(correction).toBeDefined();
    expect((correction!.payload as { x: number; y: number }).y).toBe(pos.y + 210);

    // --- Enemy appears; aimbot-like snap + headshot is dropped and flagged ---
    room.handleEnvelope(1, env('SPAWN_CARD', 1, {
      cardId: 'unit_royal_archer', cell: { x: 2, y: 13 }, possess: false,
    }));
    tick();
    const enemyId = room.state.units.find((u) => u.owner === 1)!.id;
    const enemyHp = () => room.state.units.find((u) => u.id === enemyId)?.hp;
    const fullHp = enemyHp()!;

    room.handleEnvelope(0, env('INPUT', 4, {
      unitId, cTick: room.state.tick, seq: 3, moveX: 0, moveY: 0,
      yawMdeg: -90000, pitchMdeg: 0, predictedX: own().x, predictedY: own().y,
    }));
    tick();
    room.handleEnvelope(0, env('INPUT', 5, {
      unitId, cTick: room.state.tick, seq: 4, moveX: 0, moveY: 0,
      yawMdeg: 90000, pitchMdeg: 0, predictedX: own().x, predictedY: own().y,
    }));
    const dyToHead = 13500 - room.state.units.find((u) => u.id === unitId)!.y;
    room.handleEnvelope(0, env('SHOOT', 6, {
      unitId, weapon: 'alpha',
      originX: 0, originY: 0, originZ: 0,
      dirX: 0, dirY: 1000, dirZ: Math.round((80 * 1000) / dyToHead),
      clientTimeMs: clock.now(), seq: 5,
    }));
    tick();
    expect(enemyHp()).toBe(fullHp); // packet dropped
    const flags = await repos.telemetry.byProfile(p0.profileId);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.reason).toBe('AIMBOT_ROTATION_SNAP');

    // --- After the suspicion window, the same shot lands as a headshot ---
    tick();
    tick();
    room.handleEnvelope(0, env('SHOOT', 7, {
      unitId, weapon: 'alpha',
      originX: 0, originY: 0, originZ: 0,
      dirX: 0, dirY: 1000, dirZ: Math.round((80 * 1000) / dyToHead),
      clientTimeMs: clock.now(), seq: 6,
    }));
    p0.clear();
    p1.clear();
    tick();
    const hpAfter = enemyHp();
    expect(hpAfter).toBeDefined();
    expect(hpAfter!).toBeLessThan(fullHp);

    // Weapon masking: owner sees 'alpha', opponent sees 'ai'.
    const p0Events = (p0.last('STATE_DELTA')!.payload as StateDeltaPayload).events;
    const p1Events = (p1.last('STATE_DELTA')!.payload as StateDeltaPayload).events;
    const p0Shot = p0Events.find((e) => e.type === 'shot' && e.shooterId === unitId);
    const p1Shot = p1Events.find((e) => e.type === 'shot' && e.shooterId === unitId);
    expect(p0Shot && p0Shot.type === 'shot' ? p0Shot.weapon : null).toBe('alpha');
    expect(p1Shot && p1Shot.type === 'shot' ? p1Shot.weapon : null).toBe('ai');

    // --- Force the endgame: weaken p1's towers so alice's AI push wins ---
    for (const t of room.state.towers) {
      if (t.owner === 1) t.hp = 10;
    }
    room.handleEnvelope(0, env('SPAWN_CARD', 8, {
      cardId: 'unit_royal_archer', cell: { x: 2, y: 10 }, possess: false,
    }));
    for (let i = 0; i < 600 && !room.isEnded; i++) tick();
    await settle();

    expect(room.isEnded).toBe(true);
    const over0 = p0.last('GAME_OVER')!.payload as {
      winnerIndex: number; trophyDelta: number; rewards: { gold: number; chestType?: string };
    };
    expect(over0.winnerIndex).toBe(0);
    expect(over0.trophyDelta).toBe(30);
    expect(over0.rewards.chestType).toBe('Silver');

    const alice = await repos.profiles.byId(p0.profileId);
    expect(alice!.trophies).toBe(30);
    const slots = await repos.chestSlots.list(p0.profileId);
    expect(slots).toHaveLength(1);
    const history = await repos.matchHistory.byProfile(p0.profileId, 10);
    expect(history).toHaveLength(1);
    expect(history[0]!.winnerId).toBe(p0.profileId);
  });

  it('records a replay whose re-simulation reproduces the exact final hash', async () => {
    const config = shortConfig();
    const { repos, room, tick } = await makeRoom(config);

    room.handleEnvelope(0, env('SPAWN_CARD', 1, {
      cardId: 'unit_royal_archer', cell: { x: 5, y: 9 }, possess: false,
    }));
    room.handleEnvelope(1, env('SPAWN_CARD', 1, {
      cardId: 'unit_iron_knight', cell: { x: 6, y: 14 }, possess: false,
    }));
    for (let i = 0; i < 700 && !room.isEnded; i++) tick();
    await settle();

    expect(room.isEnded).toBe(true);
    expect(room.replayId).toBeTruthy();
    const record = await repos.replays.byId(room.replayId!);
    expect(record).toBeTruthy();

    const replayed = runReplay(record!.seed, config, record!.players, record!.frames, {
      maxTicks: record!.durationTicks,
    });
    expect(replayed.finalHash).toBe(record!.finalHash);
  });

  it('a disconnect forfeits the match to the opponent', async () => {
    const { room, p1, tick } = await makeRoom();
    tick();
    room.handleDisconnect(0);
    await settle();
    expect(room.isEnded).toBe(true);
    const over = p1.last('GAME_OVER')!.payload as { winnerIndex: number };
    expect(over.winnerIndex).toBe(1);
  });
});
