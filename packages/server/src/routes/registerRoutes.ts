import { randomUUID } from 'node:crypto';
import { createGuestAccount } from '../auth/guestAuth.js';
import { linkOAuthIdentity, type OAuthProvider, type OAuthVerifier } from '../auth/oauthLink.js';
import type { LiveOpsConfigService } from '../liveops/configService.js';
import type { ChestService } from '../meta/chestService.js';
import type { Repos } from '../persistence/types.js';
import { json, Router } from '../http/router.js';
import type { Clock } from '../util/clock.js';

export interface RouteDeps {
  repos: Repos;
  liveops: LiveOpsConfigService;
  chests: ChestService;
  verifier: OAuthVerifier;
  jwtSecret: string;
  clock: Clock;
}

export function registerRoutes(router: Router, deps: RouteDeps): void {
  const { repos, liveops, chests, verifier, jwtSecret, clock } = deps;

  // ---- Auth (PRD 4.1) ----
  router.add('POST', '/auth/guest', async () => {
    const result = await createGuestAccount(repos, liveops.get(), jwtSecret, clock);
    return json(201, result);
  });

  router.add(
    'POST',
    '/auth/link',
    async (req) => {
      const body = req.body as { provider?: OAuthProvider; idToken?: string } | undefined;
      if (!body?.provider || !body.idToken || !['google', 'apple'].includes(body.provider)) {
        return json(400, { error: 'BAD_REQUEST' });
      }
      const result = await linkOAuthIdentity(
        repos, verifier, req.profileId!, body.provider, body.idToken, jwtSecret, clock,
      );
      if (result.kind === 'error') return json(400, { error: result.code });
      return json(200, result);
    },
    { auth: true },
  );

  // ---- LiveOps config (PRD 6) ----
  router.add('GET', '/config', async () => json(200, liveops.get()));

  // ---- Profile & collection ----
  router.add(
    'GET',
    '/profile',
    async (req) => {
      const profile = await repos.profiles.byId(req.profileId!);
      if (!profile) return json(404, { error: 'NOT_FOUND' });
      const cards = await repos.userCards.list(req.profileId!);
      return json(200, { profile, cards });
    },
    { auth: true },
  );

  router.add(
    'POST',
    '/cards/:cardId/upgrade',
    async (req) => {
      const cardId = req.params['cardId']!;
      const card = await repos.userCards.get(req.profileId!, cardId);
      if (!card) return json(404, { error: 'CARD_NOT_OWNED' });

      const curves = liveops.get().meta_progression_curves;
      const goldCost = curves.card_upgrade_gold_costs[card.cardLevel];
      const cardsNeeded = curves.cards_required_for_upgrade[card.cardLevel];
      if (goldCost === undefined || cardsNeeded === undefined) {
        return json(400, { error: 'MAX_LEVEL' });
      }
      if (card.cardsCollected < cardsNeeded) return json(400, { error: 'NOT_ENOUGH_CARDS' });
      const profile = await repos.profiles.byId(req.profileId!);
      if (!profile || profile.gold < goldCost) return json(400, { error: 'NOT_ENOUGH_GOLD' });

      await repos.profiles.applyEconomy(req.profileId!, { gold: -goldCost });
      await repos.userCards.upgrade(req.profileId!, cardId, cardsNeeded);
      return json(200, { cardId, newLevel: card.cardLevel + 1 });
    },
    { auth: true },
  );

  // ---- Deck builder (PRD 1.1: 8-card deck) ----
  router.add(
    'GET',
    '/deck',
    async (req) => json(200, { deck: (await repos.decks.get(req.profileId!)) ?? [] }),
    { auth: true },
  );

  router.add(
    'PUT',
    '/deck',
    async (req) => {
      const body = req.body as { cards?: string[] } | undefined;
      const cards = body?.cards;
      if (!Array.isArray(cards) || cards.length !== 8 || new Set(cards).size !== 8) {
        return json(400, { error: 'DECK_MUST_BE_8_UNIQUE_CARDS' });
      }
      const registry = new Set(liveops.get().unit_registry.map((u) => u.uid));
      const owned = new Set((await repos.userCards.list(req.profileId!)).map((c) => c.cardId));
      for (const c of cards) {
        if (!registry.has(c)) return json(400, { error: 'UNKNOWN_CARD', card: c });
        if (!owned.has(c)) return json(400, { error: 'CARD_NOT_OWNED', card: c });
      }
      await repos.decks.save(req.profileId!, cards);
      return json(200, { deck: cards });
    },
    { auth: true },
  );

  // ---- Chests (PRD 4.2 + 6) ----
  router.add(
    'GET',
    '/chests',
    async (req) => {
      const slots = await repos.chestSlots.list(req.profileId!);
      const now = clock.now();
      return json(200, {
        slots: slots.map((s) => {
          const matrix = chests.matrixFor(s.chestType);
          const duration = matrix?.unlock_duration_seconds ?? 0;
          const remaining =
            s.isUnlocking && s.unlockStartTime !== null
              ? Math.max(0, duration - Math.floor((now - s.unlockStartTime) / 1000))
              : duration;
          return { ...s, remainingSeconds: remaining };
        }),
      });
    },
    { auth: true },
  );

  router.add(
    'POST',
    '/chests/:slot/start',
    async (req) => {
      const result = await chests.start(req.profileId!, Number(req.params['slot']));
      return result.ok ? json(200, { ok: true }) : json(400, { error: result.code });
    },
    { auth: true },
  );

  router.add(
    'POST',
    '/chests/:slot/open',
    async (req) => {
      const result = await chests.open(req.profileId!, Number(req.params['slot']));
      return result.ok ? json(200, result.rewards) : json(400, { error: result.code });
    },
    { auth: true },
  );

  // ---- Leaderboard ----
  router.add('GET', '/leaderboard', async () => {
    const top = await repos.profiles.topByTrophies(100);
    return json(200, {
      leaderboard: top.map((p, i) => ({
        rank: i + 1,
        username: p.username,
        trophies: p.trophies,
        clanId: p.clanId,
      })),
    });
  });

  // ---- Clans (PRD 3) ----
  router.add(
    'POST',
    '/clans',
    async (req) => {
      const body = req.body as { name?: string; requiredTrophies?: number } | undefined;
      if (!body?.name || body.name.length < 3) return json(400, { error: 'BAD_CLAN_NAME' });
      if (await repos.clans.byName(body.name)) return json(409, { error: 'NAME_TAKEN' });
      const profile = await repos.profiles.byId(req.profileId!);
      if (!profile) return json(404, { error: 'NOT_FOUND' });
      if (profile.clanId) return json(400, { error: 'ALREADY_IN_CLAN' });

      const clan = {
        id: randomUUID(),
        clanName: body.name,
        badgeId: 1,
        totalTrophies: profile.trophies,
        requiredTrophies: body.requiredTrophies ?? 0,
        memberCount: 1,
      };
      await repos.clans.create(clan);
      await repos.profiles.setClan(profile.id, clan.id);
      return json(201, { clan });
    },
    { auth: true },
  );

  router.add('GET', '/clans/top', async () => json(200, { clans: await repos.clans.top(50) }));

  router.add('GET', '/clans/:id', async (req) => {
    const clan = await repos.clans.byId(req.params['id']!);
    return clan ? json(200, { clan }) : json(404, { error: 'NOT_FOUND' });
  });

  router.add(
    'POST',
    '/clans/:id/join',
    async (req) => {
      const clan = await repos.clans.byId(req.params['id']!);
      if (!clan) return json(404, { error: 'NOT_FOUND' });
      const profile = await repos.profiles.byId(req.profileId!);
      if (!profile) return json(404, { error: 'NOT_FOUND' });
      if (profile.clanId) return json(400, { error: 'ALREADY_IN_CLAN' });
      if (profile.trophies < clan.requiredTrophies) return json(400, { error: 'NOT_ENOUGH_TROPHIES' });
      await repos.profiles.setClan(profile.id, clan.id);
      await repos.clans.adjustMembers(clan.id, 1);
      return json(200, { ok: true });
    },
    { auth: true },
  );

  router.add(
    'POST',
    '/clans/:id/leave',
    async (req) => {
      const profile = await repos.profiles.byId(req.profileId!);
      if (!profile || profile.clanId !== req.params['id']) return json(400, { error: 'NOT_IN_CLAN' });
      await repos.profiles.setClan(profile.id, null);
      await repos.clans.adjustMembers(req.params['id']!, -1);
      return json(200, { ok: true });
    },
    { auth: true },
  );

  // ---- Match history & replays (PRD 7.1) ----
  router.add(
    'GET',
    '/match-history',
    async (req) => json(200, { matches: await repos.matchHistory.byProfile(req.profileId!, 20) }),
    { auth: true },
  );

  router.add('GET', '/replays/:id', async (req) => {
    const replay = await repos.replays.byId(req.params['id']!);
    return replay ? json(200, { replay }) : json(404, { error: 'NOT_FOUND' });
  });
}
