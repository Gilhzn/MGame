import { describe, expect, it } from 'vitest';
import { FakeClock } from '../util/clock.js';
import { ChestService } from './chestService.js';
import { liveopsService, memoryRepos, seedProfile } from '../testHelpers.js';

const SILVER_SECONDS = 10800;

async function setup(rng: () => number = () => 0.5) {
  const repos = memoryRepos();
  const clock = new FakeClock(0);
  const liveops = liveopsService();
  const chests = new ChestService(repos, liveops, clock, rng);
  const deck = liveops.get().unit_registry.slice(0, 8).map((u) => u.uid);
  const profileId = await seedProfile(repos, 'chester', deck);
  await repos.chestSlots.assign({
    profileId, slotIndex: 0, chestType: 'Silver', unlockStartTime: null, isUnlocking: false,
  });
  return { repos, clock, chests, profileId };
}

describe('time-locked chests (PRD 4.2 + 6)', () => {
  it('cannot open before the full unlock duration has elapsed', async () => {
    const { clock, chests, profileId } = await setup();
    expect(await chests.start(profileId, 0)).toEqual({ ok: true });

    clock.advance((SILVER_SECONDS - 1) * 1000);
    const early = await chests.open(profileId, 0);
    expect(early).toEqual({ ok: false, code: 'STILL_LOCKED' });

    clock.advance(1000);
    const done = await chests.open(profileId, 0);
    expect(done.ok).toBe(true);
  });

  it('opening grants gold and cards, then frees the slot', async () => {
    const { repos, clock, chests, profileId } = await setup(() => 0.0);
    await chests.start(profileId, 0);
    clock.advance(SILVER_SECONDS * 1000);

    const before = (await repos.profiles.byId(profileId))!.gold;
    const result = await chests.open(profileId, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // rng()=0 → minimum gold, all commons.
    expect(result.rewards.gold).toBe(20);
    const total = result.rewards.cards.reduce((n, c) => n + c.count, 0);
    expect(total).toBe(6); // silver card_count
    expect((await repos.profiles.byId(profileId))!.gold).toBe(before + 20);
    expect(await repos.chestSlots.list(profileId)).toHaveLength(0);
  });

  it('only one chest may unlock at a time', async () => {
    const { repos, chests, profileId } = await setup();
    await repos.chestSlots.assign({
      profileId, slotIndex: 1, chestType: 'Gold', unlockStartTime: null, isUnlocking: false,
    });
    await chests.start(profileId, 0);
    expect(await chests.start(profileId, 1)).toEqual({ ok: false, code: 'ANOTHER_CHEST_UNLOCKING' });
  });

  it('cannot open a chest that was never started', async () => {
    const { chests, profileId } = await setup();
    expect(await chests.open(profileId, 0)).toEqual({ ok: false, code: 'NOT_UNLOCKING' });
  });

  it('high rolls yield rarer cards', async () => {
    // rng always 0.995 → legendary bucket for mega (30+45+20=95 < 99.5).
    const repos = memoryRepos();
    const clock = new FakeClock(0);
    const liveops = liveopsService();
    const chests = new ChestService(repos, liveops, clock, () => 0.995);
    const deck = liveops.get().unit_registry.slice(0, 8).map((u) => u.uid);
    const profileId = await seedProfile(repos, 'whale', deck);
    await repos.chestSlots.assign({
      profileId, slotIndex: 0, chestType: 'Mega', unlockStartTime: null, isUnlocking: false,
    });
    await chests.start(profileId, 0);
    clock.advance(86400 * 1000);
    const result = await chests.open(profileId, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rewards.cards.every((c) => c.cardId === 'unit_swift_scout')).toBe(true);
  });
});
