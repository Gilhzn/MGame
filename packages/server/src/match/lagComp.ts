import { HISTORY_TICKS, TICK_MS } from '@overlord/sim';

/**
 * Map a client SHOOT timestamp (the client's estimate of server time when it
 * fired, from PING sync) onto a rewind tick, clamped to the 1-second history
 * buffer (PRD 2.1) and never into the future.
 */
export function rewindTickFor(
  clientTimeMs: number,
  matchStartMs: number,
  currentTick: number,
): number {
  const rawTick = Math.floor((clientTimeMs - matchStartMs) / TICK_MS);
  const oldest = Math.max(0, currentTick - (HISTORY_TICKS - 1));
  if (rawTick < oldest) return oldest;
  if (rawTick > currentTick) return currentTick;
  return rawTick;
}
