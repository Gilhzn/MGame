import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal HS256 JWT — no external dependency, synchronous, easily testable.

export interface JwtClaims {
  sub: string; // profile id
  guest: boolean;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  nowMs: number,
  ttlSeconds = 60 * 60 * 24,
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(nowMs / 1000);
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  const sig = hmac(secret, `${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string, nowMs: number): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = hmac(secret, `${header}.${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtClaims;
  } catch {
    return null;
  }
  if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
  if (claims.exp * 1000 <= nowMs) return null;
  return claims;
}
