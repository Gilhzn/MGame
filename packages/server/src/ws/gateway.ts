import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { decode } from '@overlord/protocol';
import { verifyJwt } from '../auth/jwt.js';
import { createBotLink, ScriptedBotDriver } from '../bots/botController.js';
import type { LiveOpsConfigService } from '../liveops/configService.js';
import { Room } from '../match/room.js';
import { MatchmakingQueue } from '../matchmaking/queue.js';
import type { Repos } from '../persistence/types.js';
import type { Clock } from '../util/clock.js';
import { Session } from './session.js';

const HELLO_TIMEOUT_MS = 5000;
const SWEEP_INTERVAL_MS = 1000;

export interface GatewayOptions {
  httpServer: HttpServer;
  jwtSecret: string;
  repos: Repos;
  liveops: LiveOpsConfigService;
  clock: Clock;
}

/**
 * WebSocket front door: HELLO/JWT handshake, then routes messages to the
 * matchmaking queue or the player's room. Owns the matchmaking sweep timer
 * and room lifecycle.
 */
export class Gateway {
  readonly queue = new MatchmakingQueue();
  readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, Session>();
  private readonly wss: WebSocketServer;
  private sweepTimer: NodeJS.Timeout;

  constructor(private readonly opts: GatewayOptions) {
    this.wss = new WebSocketServer({ server: opts.httpServer });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  close(): void {
    clearInterval(this.sweepTimer);
    this.wss.close();
  }

  private onConnection(ws: WebSocket): void {
    let session: Session | null = null;
    const helloTimer = setTimeout(() => {
      if (!session) ws.close(4001, 'HELLO_TIMEOUT');
    }, HELLO_TIMEOUT_MS);
    helloTimer.unref?.();

    ws.on('message', (raw) => {
      void (async () => {
        const result = decode(raw.toString());
        if (!result.ok) return;
        const env = result.env;

        if (!session) {
          if (env.t !== 'HELLO') return;
          const claims = verifyJwt(
            (env.p as { token: string }).token,
            this.opts.jwtSecret,
            this.opts.clock.now(),
          );
          if (!claims) {
            ws.close(4003, 'BAD_TOKEN');
            return;
          }
          const profile = await this.opts.repos.profiles.byId(claims.sub);
          if (!profile) {
            ws.close(4004, 'NO_PROFILE');
            return;
          }
          const deck =
            (await this.opts.repos.decks.get(profile.id)) ??
            this.opts.liveops.get().unit_registry.slice(0, 8).map((u) => u.uid);
          session = new Session(ws, profile.id, profile.username, profile.trophies, deck);
          clearTimeout(helloTimer);
          this.sessions.set(profile.id, session);
          session.send('WELCOME', { profileId: profile.id, serverTime: this.opts.clock.now() });
          return;
        }

        if (!session.allowMessage(this.opts.clock.now())) {
          session.send('ERROR', { code: 'RATE_LIMITED', message: 'slow down' });
          return;
        }

        switch (env.t) {
          case 'PING':
            session.send('PONG', {
              t0: (env.p as { t0: number }).t0,
              serverTime: this.opts.clock.now(),
            });
            break;
          case 'QUEUE_JOIN': {
            if (session.state === 'in_room') break;
            session.state = 'queued';
            const position = this.queue.join(
              session,
              (env.p as { mode: 'ladder' | 'training' }).mode,
              this.opts.clock.now(),
            );
            session.send('QUEUED', { position });
            break;
          }
          case 'QUEUE_LEAVE':
            this.queue.leave(session.profileId);
            session.state = 'idle';
            break;
          default: {
            const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
            if (room) room.handleEnvelope(session.playerIndex, env);
            break;
          }
        }
      })();
    });

    ws.on('close', () => {
      if (!session) return;
      this.sessions.delete(session.profileId);
      this.queue.leave(session.profileId);
      const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
      room?.handleDisconnect(session.playerIndex);
    });
  }

  /** Matchmaking pass: pair ladder players, backfill lonely ones with bots. */
  sweep(): void {
    const now = this.opts.clock.now();
    for (const [a, b] of this.queue.sweep(now)) {
      this.createRoom(a.link as Session, b.link as Session);
    }
    for (const entry of this.queue.botCandidates(now)) {
      this.createBotRoom(entry.link as Session);
    }
  }

  private bindToRoom(session: Session, room: Room, playerIndex: 0 | 1): void {
    session.state = 'in_room';
    session.roomId = room.id;
    session.playerIndex = playerIndex;
  }

  private createRoom(a: Session, b: Session): Room {
    const seed = (this.opts.clock.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const room = new Room({
      seed,
      config: this.opts.liveops.get(),
      links: [a, b],
      repos: this.opts.repos,
      clock: this.opts.clock,
      onEnd: (r) => this.rooms.delete(r.id),
    });
    this.rooms.set(room.id, room);
    this.bindToRoom(a, room, 0);
    this.bindToRoom(b, room, 1);
    return room;
  }

  private createBotRoom(player: Session): Room {
    const config = this.opts.liveops.get();
    const seed = (this.opts.clock.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const bot = createBotLink(config);
    const room = new Room({
      seed,
      config,
      links: [player, bot],
      repos: this.opts.repos,
      clock: this.opts.clock,
      botDrivers: { 1: new ScriptedBotDriver(seed) },
      onEnd: (r) => this.rooms.delete(r.id),
    });
    this.rooms.set(room.id, room);
    this.bindToRoom(player, room, 0);
    return room;
  }
}
