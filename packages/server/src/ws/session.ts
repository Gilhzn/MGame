import type { WebSocket } from 'ws';
import { encode, type PayloadOf, type PayloadSchemas } from '@overlord/protocol';
import type { PlayerLink } from '../match/link.js';

const RATE_LIMIT_PER_SECOND = 120;

export type SessionState = 'idle' | 'queued' | 'in_room';

/** One authenticated socket: seq numbering, rate limiting, room binding. */
export class Session implements PlayerLink {
  state: SessionState = 'idle';
  roomId: string | null = null;
  playerIndex: 0 | 1 = 0;

  private seq = 0;
  private windowStart = 0;
  private windowCount = 0;

  constructor(
    private readonly ws: WebSocket,
    readonly profileId: string,
    readonly username: string,
    readonly trophies: number,
    readonly deck: string[],
  ) {}

  readonly isBot = false;

  send<T extends keyof PayloadSchemas>(op: T, payload: PayloadOf<T>, opts?: { tick?: number }): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(encode(op, payload, { seq: this.seq++, tick: opts?.tick }));
  }

  /** Sliding-window rate limit; true = message allowed. */
  allowMessage(nowMs: number): boolean {
    if (nowMs - this.windowStart >= 1000) {
      this.windowStart = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    return this.windowCount <= RATE_LIMIT_PER_SECOND;
  }

  close(): void {
    this.ws.close();
  }
}
