import type { SimState } from './types.js';

// FNV-1a 64-bit over a canonical little-endian int32 stream. BigInt keeps the
// arithmetic exact; the result is a 16-hex-char string. Mirrored by
// client/CoreLogic/StateHasher.cs for the fog-culled view hash.

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function fnv1a64Init(): bigint {
  return FNV_OFFSET;
}

export function fnv1a64Int32(hash: bigint, value: number): bigint {
  // Two's-complement the int into a uint32, then fold 4 bytes LE.
  let v = value < 0 ? value + 0x100000000 : value;
  v = v >>> 0;
  for (let i = 0; i < 4; i++) {
    const byte = BigInt((v >>> (i * 8)) & 0xff);
    hash = ((hash ^ byte) * FNV_PRIME) & MASK64;
  }
  return hash;
}

export function fnv1a64String(hash: bigint, s: string): bigint {
  for (let i = 0; i < s.length; i++) {
    hash = ((hash ^ BigInt(s.charCodeAt(i) & 0xff)) * FNV_PRIME) & MASK64;
    hash = ((hash ^ BigInt((s.charCodeAt(i) >> 8) & 0xff)) * FNV_PRIME) & MASK64;
  }
  return hash;
}

export function fnv1a64Hex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}

/** Full-state hash: replay verification and desync diagnostics (PRD 7.4). */
export function stateHash(state: SimState): string {
  let h = fnv1a64Init();
  h = fnv1a64Int32(h, state.tick);
  h = fnv1a64Int32(h, state.rngState | 0);
  h = fnv1a64Int32(h, state.elixirTenths[0]);
  h = fnv1a64Int32(h, state.elixirTenths[1]);
  h = fnv1a64Int32(h, state.elixirAcc[0]);
  h = fnv1a64Int32(h, state.elixirAcc[1]);
  h = fnv1a64Int32(h, state.crowns[0]);
  h = fnv1a64Int32(h, state.crowns[1]);
  for (const t of state.towers) {
    h = fnv1a64Int32(h, t.id);
    h = fnv1a64Int32(h, t.x);
    h = fnv1a64Int32(h, t.y);
    h = fnv1a64Int32(h, t.hp);
  }
  for (const u of state.units) {
    h = fnv1a64Int32(h, u.id);
    h = fnv1a64String(h, u.uid);
    h = fnv1a64Int32(h, u.owner);
    h = fnv1a64Int32(h, u.x);
    h = fnv1a64Int32(h, u.y);
    h = fnv1a64Int32(h, u.yawMdeg);
    h = fnv1a64Int32(h, u.hp);
  }
  for (const p of state.projectiles) {
    h = fnv1a64Int32(h, p.id);
    h = fnv1a64Int32(h, p.x);
    h = fnv1a64Int32(h, p.y);
    h = fnv1a64Int32(h, p.z);
  }
  return fnv1a64Hex(h);
}

/**
 * Wire-level hash over the entities a specific player can see. The client
 * computes the same hash over its replicated store (HASH_REPORT); both sides
 * must iterate in ascending id order with these exact fields.
 */
export function viewHash(
  entities: ReadonlyArray<{ id: number; x: number; y: number; yawMdeg: number; hp: number }>,
): string {
  let h = fnv1a64Init();
  for (const e of entities) {
    h = fnv1a64Int32(h, e.id);
    h = fnv1a64Int32(h, e.x);
    h = fnv1a64Int32(h, e.y);
    h = fnv1a64Int32(h, e.yawMdeg);
    h = fnv1a64Int32(h, e.hp);
  }
  return fnv1a64Hex(h);
}
