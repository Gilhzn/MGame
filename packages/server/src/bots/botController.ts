import { randomUUID } from 'node:crypto';
import type { LiveOpsConfig, SpawnCardPayload } from '@overlord/protocol';
import { nextInt, type PlayerIndex } from '@overlord/sim';
import type { PlayerLink } from '../match/link.js';
import type { BotDriver, Room } from '../match/room.js';

/** Outbound sink for a bot — server-driven, so messages are discarded. */
export function createBotLink(config: LiveOpsConfig, name = 'TrainingBot'): PlayerLink {
  return {
    profileId: `bot-${randomUUID()}`,
    username: name,
    trophies: 0,
    deck: config.unit_registry.slice(0, 8).map((u) => u.uid),
    isBot: true,
    send: () => {},
  };
}

/**
 * Low-tier scripted opponent (PRD 4.3 phase D): every couple of seconds,
 * plays a random affordable card from its hand at a seeded-random cell on its
 * own territory. All randomness flows through mulberry32 so training matches
 * replay exactly.
 */
export class ScriptedBotDriver implements BotDriver {
  private rngState: number;
  private nextPlayTick = 40;

  constructor(seed: number, private readonly cadenceTicks = 40) {
    this.rngState = (seed ^ 0xb07b07) >>> 0;
  }

  private roll(n: number): number {
    const r = nextInt(this.rngState, n);
    this.rngState = r.state;
    return r.value;
  }

  decide(room: Room, playerIndex: PlayerIndex): SpawnCardPayload | null {
    if (room.state.tick < this.nextPlayTick) return null;
    const hand = room.hand(playerIndex);
    if (hand.length === 0) return null;

    const cardId = hand[this.roll(hand.length)]!;
    const uspec = room.spec.units[cardId];
    if (!uspec || room.state.elixirTenths[playerIndex] < uspec.elixirCostTenths) return null;

    this.nextPlayTick = room.state.tick + this.cadenceTicks;
    const x = this.roll(12);
    const y = playerIndex === 0 ? 3 + this.roll(7) : 14 + this.roll(7);
    return { cardId, cell: { x, y }, possess: false };
  }
}
