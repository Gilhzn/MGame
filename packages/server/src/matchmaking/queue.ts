import type { PlayerLink } from '../match/link.js';

export interface QueueEntry {
  link: PlayerLink;
  mode: 'ladder' | 'training';
  enqueuedAt: number;
}

export interface MatchmakingOptions {
  /** Trophy window as a function of wait time — widens the longer you wait. */
  window?: (waitMs: number) => number;
  /** After this long alone in the ladder queue, a bot steps in. */
  botFallbackMs?: number;
}

const defaultWindow = (waitMs: number): number => 300 + Math.floor(waitMs / 1000) * 100;

export class MatchmakingQueue {
  private entries: QueueEntry[] = [];
  private readonly window: (waitMs: number) => number;
  readonly botFallbackMs: number;

  constructor(opts: MatchmakingOptions = {}) {
    this.window = opts.window ?? defaultWindow;
    this.botFallbackMs = opts.botFallbackMs ?? 8000;
  }

  join(link: PlayerLink, mode: 'ladder' | 'training', now: number): number {
    this.leave(link.profileId);
    this.entries.push({ link, mode, enqueuedAt: now });
    return this.entries.length;
  }

  leave(profileId: string): void {
    this.entries = this.entries.filter((e) => e.link.profileId !== profileId);
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Pair-off pass (FIFO priority): each waiting player matches the first
   * compatible opponent within the trophy window for the longer wait of the
   * two. Matched entries leave the queue.
   */
  sweep(now: number): Array<[QueueEntry, QueueEntry]> {
    const matches: Array<[QueueEntry, QueueEntry]> = [];
    const taken = new Set<QueueEntry>();
    for (let i = 0; i < this.entries.length; i++) {
      const a = this.entries[i]!;
      if (taken.has(a) || a.mode !== 'ladder') continue;
      for (let j = i + 1; j < this.entries.length; j++) {
        const b = this.entries[j]!;
        if (taken.has(b) || b.mode !== 'ladder') continue;
        const wait = Math.max(now - a.enqueuedAt, now - b.enqueuedAt);
        if (Math.abs(a.link.trophies - b.link.trophies) <= this.window(wait)) {
          taken.add(a);
          taken.add(b);
          matches.push([a, b]);
          break;
        }
      }
    }
    this.entries = this.entries.filter((e) => !taken.has(e));
    return matches;
  }

  /** Training-mode entries match a bot instantly; ladder entries after the fallback wait. */
  botCandidates(now: number): QueueEntry[] {
    const due = this.entries.filter(
      (e) => e.mode === 'training' || now - e.enqueuedAt >= this.botFallbackMs,
    );
    this.entries = this.entries.filter((e) => !due.includes(e));
    return due;
  }
}
