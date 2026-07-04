import { describe, expect, it } from 'vitest';
import { Router } from '../http/router.js';
import { ChestService } from '../meta/chestService.js';
import { registerRoutes } from '../routes/registerRoutes.js';
import { FakeClock } from '../util/clock.js';
import { FakeOAuthVerifier } from './oauthLink.js';
import { signJwt, verifyJwt } from './jwt.js';
import { liveopsService, memoryRepos } from '../testHelpers.js';

const SECRET = 'test-secret';

function makeApp() {
  const repos = memoryRepos();
  const clock = new FakeClock(1_000_000);
  const liveops = liveopsService();
  const chests = new ChestService(repos, liveops, clock, () => 0.5);
  const router = new Router(SECRET, clock);
  registerRoutes(router, {
    repos, liveops, chests,
    verifier: new FakeOAuthVerifier(),
    jwtSecret: SECRET,
    clock,
  });
  return { repos, clock, router };
}

describe('jwt', () => {
  it('round-trips claims and rejects tampering/expiry', () => {
    const token = signJwt({ sub: 'abc', guest: true }, SECRET, 0, 60);
    expect(verifyJwt(token, SECRET, 30_000)?.sub).toBe('abc');
    expect(verifyJwt(token, SECRET, 61_000)).toBeNull(); // expired
    expect(verifyJwt(token + 'x', SECRET, 0)).toBeNull(); // bad signature
    expect(verifyJwt(token, 'other-secret', 0)).toBeNull();
  });
});

describe('silent guest onboarding (PRD 4.1)', () => {
  it('POST /auth/guest creates a profile, starter cards, default deck, and a working JWT', async () => {
    const { repos, router } = makeApp();
    const res = await router.dispatch('POST', '/auth/guest', undefined);
    expect(res.status).toBe(201);
    const body = res.body as { token: string; profileId: string; username: string };
    expect(body.username).toMatch(/^Guest_/);

    const profile = await repos.profiles.byId(body.profileId);
    expect(profile?.gold).toBe(500);
    expect(profile?.gems).toBe(100);
    expect(await repos.decks.get(body.profileId)).toHaveLength(8);
    expect(await repos.userCards.list(body.profileId)).toHaveLength(8);

    // The token authenticates follow-up requests.
    const me = await router.dispatch('GET', '/profile', undefined, `Bearer ${body.token}`);
    expect(me.status).toBe(200);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const { router } = makeApp();
    expect((await router.dispatch('GET', '/profile', undefined)).status).toBe(401);
    expect((await router.dispatch('GET', '/deck', undefined, 'Bearer nope')).status).toBe(401);
  });
});

describe('OAuth account linking & merge (PRD 4.1 step 2)', () => {
  it('links a Google identity to the guest profile without touching progress', async () => {
    const { repos, router } = makeApp();
    const guest = (await router.dispatch('POST', '/auth/guest', undefined)).body as {
      token: string; profileId: string;
    };
    await repos.profiles.applyEconomy(guest.profileId, { gold: 123 });

    const res = await router.dispatch(
      'POST', '/auth/link',
      { provider: 'google', idToken: 'fake:google-user-1' },
      `Bearer ${guest.token}`,
    );
    expect(res.status).toBe(200);
    expect((res.body as { kind: string }).kind).toBe('linked');

    const identities = await repos.auth.identitiesByProfile(guest.profileId);
    expect(identities.map((i) => i.provider).sort()).toEqual(['google', 'guest']);
    // Progress untouched by the merge routine.
    expect((await repos.profiles.byId(guest.profileId))?.gold).toBe(623);
    expect(await repos.userCards.list(guest.profileId)).toHaveLength(8);
  });

  it('an identity already on another profile logs into THAT profile instead', async () => {
    const { router } = makeApp();
    const a = (await router.dispatch('POST', '/auth/guest', undefined)).body as {
      token: string; profileId: string;
    };
    await router.dispatch(
      'POST', '/auth/link',
      { provider: 'apple', idToken: 'fake:apple-user-9' },
      `Bearer ${a.token}`,
    );

    const b = (await router.dispatch('POST', '/auth/guest', undefined)).body as {
      token: string; profileId: string;
    };
    const res = await router.dispatch(
      'POST', '/auth/link',
      { provider: 'apple', idToken: 'fake:apple-user-9' },
      `Bearer ${b.token}`,
    );
    const body = res.body as { kind: string; profileId: string; token: string };
    expect(body.kind).toBe('logged_in');
    expect(body.profileId).toBe(a.profileId);
    expect(verifyJwt(body.token, SECRET, 1_000_000)?.sub).toBe(a.profileId);
  });

  it('rejects invalid provider tokens', async () => {
    const { router } = makeApp();
    const guest = (await router.dispatch('POST', '/auth/guest', undefined)).body as { token: string };
    const res = await router.dispatch(
      'POST', '/auth/link',
      { provider: 'google', idToken: 'not-fake-prefixed' },
      `Bearer ${guest.token}`,
    );
    expect(res.status).toBe(400);
  });
});
