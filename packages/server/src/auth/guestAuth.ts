import { randomUUID } from 'node:crypto';
import type { LiveOpsConfig } from '@overlord/protocol';
import type { Clock } from '../util/clock.js';
import type { Repos } from '../persistence/types.js';
import { signJwt } from './jwt.js';

export interface GuestAuthResult {
  token: string;
  profileId: string;
  username: string;
}

/**
 * Silent onboarding (PRD 4.1 step 1): create a guest profile with a starter
 * collection + default deck and hand back a JWT. No screens, no forms.
 */
export async function createGuestAccount(
  repos: Repos,
  config: LiveOpsConfig,
  jwtSecret: string,
  clock: Clock,
): Promise<GuestAuthResult> {
  const profileId = randomUUID();
  const username = `Guest_${profileId.slice(0, 8)}`;

  await repos.profiles.create({
    id: profileId,
    username,
    trophies: 0,
    mmr: 1000,
    gold: 500,
    gems: 100,
    clanId: null,
    createdAt: new Date(clock.now()).toISOString(),
  });
  await repos.auth.addIdentity({ profileId, provider: 'guest', providerSubject: randomUUID() });

  // Starter collection: the first 8 registry units, which is also the default deck.
  const starterDeck = config.unit_registry.slice(0, 8).map((u) => u.uid);
  for (const uid of starterDeck) await repos.userCards.grant(profileId, uid, 1);
  await repos.decks.save(profileId, starterDeck);

  const token = signJwt({ sub: profileId, guest: true }, jwtSecret, clock.now());
  return { token, profileId, username };
}
