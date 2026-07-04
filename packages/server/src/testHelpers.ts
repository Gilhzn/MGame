import { randomUUID } from 'node:crypto';
import type { PayloadOf, PayloadSchemas } from '@overlord/protocol';
import type { PlayerLink } from './match/link.js';
import { createMemoryRepos } from './persistence/memory.js';
import type { Repos } from './persistence/types.js';
import { LiveOpsConfigService } from './liveops/configService.js';

export interface SentMessage {
  op: string;
  payload: unknown;
  tick?: number;
}

/** In-process PlayerLink that records everything sent to it. */
export class FakeLink implements PlayerLink {
  readonly messages: SentMessage[] = [];
  readonly isBot = false;

  constructor(
    readonly profileId: string,
    readonly username: string,
    readonly deck: string[],
    readonly trophies = 0,
  ) {}

  send<T extends keyof PayloadSchemas>(op: T, payload: PayloadOf<T>, opts?: { tick?: number }): void {
    this.messages.push({ op, payload, tick: opts?.tick });
  }

  all(op: string): SentMessage[] {
    return this.messages.filter((m) => m.op === op);
  }

  last(op: string): SentMessage | undefined {
    const list = this.all(op);
    return list[list.length - 1];
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export function liveopsService(): LiveOpsConfigService {
  return new LiveOpsConfigService();
}

export async function seedProfile(
  repos: Repos,
  username: string,
  deck: string[],
): Promise<string> {
  const id = randomUUID();
  await repos.profiles.create({
    id,
    username,
    trophies: 0,
    mmr: 1000,
    gold: 500,
    gems: 100,
    clanId: null,
    createdAt: new Date(0).toISOString(),
  });
  for (const c of deck) await repos.userCards.grant(id, c, 1);
  await repos.decks.save(id, deck);
  return id;
}

export function memoryRepos(): Repos {
  return createMemoryRepos();
}
