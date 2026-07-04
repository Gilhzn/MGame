import type { ChestMatrix } from '@overlord/protocol';
import type { LiveOpsConfigService } from '../liveops/configService.js';
import type { Repos } from '../persistence/types.js';
import type { Clock } from '../util/clock.js';

export type ChestOutcome =
  | { ok: true; rewards: { gold: number; cards: Array<{ cardId: string; count: number }> } }
  | { ok: false; code: string };

export type StartOutcome = { ok: true } | { ok: false; code: string };

/**
 * Time-locked chest slots (PRD 4.2 + 6): four slots, one unlocking at a time,
 * server-validated countdowns against the LiveOps drop matrices, rarity rolls
 * from the configured chances.
 */
export class ChestService {
  constructor(
    private readonly repos: Repos,
    private readonly liveops: LiveOpsConfigService,
    private readonly clock: Clock,
    /** Injectable for deterministic tests; only meta-RNG, never sim-RNG. */
    private readonly rng: () => number = Math.random,
  ) {}

  matrixFor(chestType: string): ChestMatrix | null {
    return this.liveops.get().lootbox_drop_matrices[`${chestType.toLowerCase()}_chest`] ?? null;
  }

  async start(profileId: string, slotIndex: number): Promise<StartOutcome> {
    const slots = await this.repos.chestSlots.list(profileId);
    const slot = slots.find((s) => s.slotIndex === slotIndex);
    if (!slot) return { ok: false, code: 'EMPTY_SLOT' };
    if (slot.isUnlocking) return { ok: false, code: 'ALREADY_UNLOCKING' };
    if (slots.some((s) => s.isUnlocking)) return { ok: false, code: 'ANOTHER_CHEST_UNLOCKING' };
    await this.repos.chestSlots.startUnlock(profileId, slotIndex, this.clock.now());
    return { ok: true };
  }

  async open(profileId: string, slotIndex: number): Promise<ChestOutcome> {
    const slots = await this.repos.chestSlots.list(profileId);
    const slot = slots.find((s) => s.slotIndex === slotIndex);
    if (!slot) return { ok: false, code: 'EMPTY_SLOT' };
    if (!slot.isUnlocking || slot.unlockStartTime === null) {
      return { ok: false, code: 'NOT_UNLOCKING' };
    }
    const matrix = this.matrixFor(slot.chestType);
    if (!matrix) return { ok: false, code: 'UNKNOWN_CHEST_TYPE' };

    const elapsedSec = Math.floor((this.clock.now() - slot.unlockStartTime) / 1000);
    if (elapsedSec < matrix.unlock_duration_seconds) return { ok: false, code: 'STILL_LOCKED' };

    const gold =
      matrix.gold_min + Math.floor(this.rng() * (matrix.gold_max - matrix.gold_min + 1));
    const cardCounts = new Map<string, number>();
    for (let i = 0; i < matrix.card_count; i++) {
      const cardId = this.rollCard(matrix);
      if (cardId) cardCounts.set(cardId, (cardCounts.get(cardId) ?? 0) + 1);
    }

    const cards = [...cardCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cardId, count]) => ({ cardId, count }));
    for (const c of cards) await this.repos.userCards.grant(profileId, c.cardId, c.count);
    await this.repos.profiles.applyEconomy(profileId, { gold });
    await this.repos.chestSlots.clear(profileId, slotIndex);
    return { ok: true, rewards: { gold, cards } };
  }

  private rollCard(matrix: ChestMatrix): string | null {
    const roll = this.rng() * 100;
    let rarity: 'common' | 'rare' | 'epic' | 'legendary';
    if (roll < matrix.common_chance) rarity = 'common';
    else if (roll < matrix.common_chance + matrix.rare_chance) rarity = 'rare';
    else if (roll < matrix.common_chance + matrix.rare_chance + matrix.epic_chance) rarity = 'epic';
    else rarity = 'legendary';

    const pool = this.liveops.get().unit_registry.filter((u) => u.rarity === rarity);
    const fallback = this.liveops.get().unit_registry.filter((u) => u.rarity === 'common');
    const pick = pool.length > 0 ? pool : fallback;
    if (pick.length === 0) return null;
    return pick[Math.floor(this.rng() * pick.length)]!.uid;
  }
}
