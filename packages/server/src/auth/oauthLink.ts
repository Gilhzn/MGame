import type { Clock } from '../util/clock.js';
import type { Repos } from '../persistence/types.js';
import { signJwt } from './jwt.js';

export type OAuthProvider = 'google' | 'apple';

export interface VerifiedIdentity {
  subject: string;
  email?: string;
}

/**
 * Verifies a provider ID token and returns the stable subject. Real Google/
 * Apple verification (JWKS fetch + signature check) is intentionally stubbed
 * behind this interface — see docs/architecture.md "Deliberate stubs".
 */
export interface OAuthVerifier {
  verify(provider: OAuthProvider, idToken: string): Promise<VerifiedIdentity | null>;
}

/** Test/dev verifier: accepts tokens of the form `fake:<subject>`. */
export class FakeOAuthVerifier implements OAuthVerifier {
  async verify(_provider: OAuthProvider, idToken: string): Promise<VerifiedIdentity | null> {
    if (!idToken.startsWith('fake:')) return null;
    return { subject: idToken.slice('fake:'.length) };
  }
}

export type LinkResult =
  | { kind: 'linked'; profileId: string }
  | { kind: 'logged_in'; profileId: string; token: string }
  | { kind: 'error'; code: string };

/**
 * Account hardening (PRD 4.1 step 2): attach a Google/Apple identity to the
 * current guest profile WITHOUT touching its metadata or card inventory. If
 * the identity already belongs to a profile, this is a login to that profile
 * instead (the merge routine re-points credentials, never deletes progress).
 */
export async function linkOAuthIdentity(
  repos: Repos,
  verifier: OAuthVerifier,
  currentProfileId: string,
  provider: OAuthProvider,
  idToken: string,
  jwtSecret: string,
  clock: Clock,
): Promise<LinkResult> {
  const verified = await verifier.verify(provider, idToken);
  if (!verified) return { kind: 'error', code: 'INVALID_PROVIDER_TOKEN' };

  const existing = await repos.auth.identity(provider, verified.subject);
  if (existing) {
    if (existing.profileId === currentProfileId) return { kind: 'linked', profileId: currentProfileId };
    const token = signJwt({ sub: existing.profileId, guest: false }, jwtSecret, clock.now());
    return { kind: 'logged_in', profileId: existing.profileId, token };
  }

  await repos.auth.addIdentity({
    profileId: currentProfileId,
    provider,
    providerSubject: verified.subject,
  });
  return { kind: 'linked', profileId: currentProfileId };
}
