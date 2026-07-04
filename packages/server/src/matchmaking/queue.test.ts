import { describe, expect, it } from 'vitest';
import { MatchmakingQueue } from './queue.js';
import { FakeLink, liveopsService } from '../testHelpers.js';

const deck = liveopsService().get().unit_registry.slice(0, 8).map((u) => u.uid);

function link(name: string, trophies: number): FakeLink {
  return new FakeLink(`id-${name}`, name, deck, trophies);
}

describe('matchmaking queue', () => {
  it('pairs two ladder players inside the trophy window', () => {
    const q = new MatchmakingQueue();
    q.join(link('a', 1000), 'ladder', 0);
    q.join(link('b', 1200), 'ladder', 0);
    const matches = q.sweep(0);
    expect(matches).toHaveLength(1);
    expect(q.size).toBe(0);
  });

  it('does not pair players too far apart, then widens with wait time', () => {
    const q = new MatchmakingQueue();
    q.join(link('a', 0), 'ladder', 0);
    q.join(link('b', 2000), 'ladder', 0);
    expect(q.sweep(0)).toHaveLength(0);
    // After 17s the window is 300 + 17*100 = 2000 → matchable.
    expect(q.sweep(17_000)).toHaveLength(1);
  });

  it('training mode goes straight to a bot', () => {
    const q = new MatchmakingQueue();
    q.join(link('a', 0), 'training', 0);
    expect(q.sweep(0)).toHaveLength(0);
    expect(q.botCandidates(0)).toHaveLength(1);
    expect(q.size).toBe(0);
  });

  it('lonely ladder players get a bot after the fallback wait', () => {
    const q = new MatchmakingQueue({ botFallbackMs: 8000 });
    q.join(link('a', 0), 'ladder', 0);
    expect(q.botCandidates(7999)).toHaveLength(0);
    expect(q.botCandidates(8000)).toHaveLength(1);
  });

  it('re-joining replaces the previous entry; leave removes it', () => {
    const q = new MatchmakingQueue();
    const a = link('a', 0);
    q.join(a, 'ladder', 0);
    q.join(a, 'ladder', 5);
    expect(q.size).toBe(1);
    q.leave(a.profileId);
    expect(q.size).toBe(0);
  });
});
