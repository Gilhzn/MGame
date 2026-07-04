import type { PayloadOf, PayloadSchemas } from '@overlord/protocol';

/**
 * A player's outbound channel plus the identity/loadout the room needs.
 * Implemented by ws sessions, bots, and in-process test fakes.
 */
export interface PlayerLink {
  profileId: string;
  username: string;
  trophies: number;
  deck: string[]; // 8 card uids
  isBot: boolean;
  send<T extends keyof PayloadSchemas>(op: T, payload: PayloadOf<T>, opts?: { tick?: number }): void;
}
