import { randomUUID } from 'node:crypto';
import type {
  Envelope,
  InputPayload,
  LiveOpsConfig,
  ShootPayload,
  SpawnCardPayload,
} from '@overlord/protocol';
import {
  buildSimSpec,
  createInitialState,
  enemyTargets,
  eyeHeightMu,
  positionsAt,
  raycastTargets,
  stateHash,
  step,
  DIVERGENCE_THRESHOLD_MU,
  type PlayerIndex,
  type SimEvent,
  type SimSpec,
  type SimState,
  type TickInput,
} from '@overlord/sim';
import { RotationMonitor } from '../anticheat/rotationCheck.js';
import { buildStateDelta } from '../fog/culler.js';
import type { Repos } from '../persistence/types.js';
import { ReplayRecorder } from '../replay/recorder.js';
import type { Clock } from '../util/clock.js';
import { rewindTickFor } from './lagComp.js';
import type { PlayerLink } from './link.js';
import { startTickLoop, type TickLoopHandle } from './tickLoop.js';

const HASH_EVERY_TICKS = 20;
const HAND_SIZE = 4;

export interface BotDriver {
  decide(room: Room, playerIndex: PlayerIndex): SpawnCardPayload | null;
}

export interface RoomOptions {
  id?: string;
  seed: number;
  config: LiveOpsConfig;
  links: [PlayerLink, PlayerLink];
  repos: Repos;
  clock: Clock;
  /** Off in tests — drive with room.runTick() instead. */
  autoLoop?: boolean;
  botDrivers?: Partial<Record<PlayerIndex, BotDriver>>;
  onEnd?: (room: Room) => void;
}

interface PendingPrediction {
  seq: number;
  unitId: number;
  x: number;
  y: number;
}

export class Room {
  readonly id: string;
  readonly spec: SimSpec;
  readonly state: SimState;
  readonly links: [PlayerLink, PlayerLink];

  private readonly config: LiveOpsConfig;
  private readonly repos: Repos;
  private readonly clock: Clock;
  private readonly recorder = new ReplayRecorder();
  private readonly rotation = new RotationMonitor();
  private readonly botDrivers: Partial<Record<PlayerIndex, BotDriver>>;
  private readonly onEnd?: (room: Room) => void;
  private readonly autoLoop: boolean;

  private pendingInputs: TickInput[] = [];
  private hands: [string[], string[]];
  private queues: [string[], string[]];
  private ready: [boolean, boolean] = [false, false];
  private lastSentIds: [Set<number>, Set<number>] = [new Set(), new Set()];
  private lastProcessedInputSeq: [number, number] = [0, 0];
  private predictions: [PendingPrediction | null, PendingPrediction | null] = [null, null];
  private possessedUnitByPlayer: [number, number] = [-1, -1];
  private loop: TickLoopHandle | null = null;
  private started = false;
  private ended = false;
  private matchStartMs = 0;
  replayId: string | null = null;

  constructor(opts: RoomOptions) {
    this.id = opts.id ?? randomUUID();
    this.config = opts.config;
    this.spec = buildSimSpec(opts.config);
    this.state = createInitialState(opts.seed, this.spec);
    this.links = opts.links;
    this.repos = opts.repos;
    this.clock = opts.clock;
    this.autoLoop = opts.autoLoop ?? true;
    this.botDrivers = opts.botDrivers ?? {};
    this.onEnd = opts.onEnd;
    this.hands = [opts.links[0].deck.slice(0, HAND_SIZE), opts.links[1].deck.slice(0, HAND_SIZE)];
    this.queues = [opts.links[0].deck.slice(HAND_SIZE), opts.links[1].deck.slice(HAND_SIZE)];

    for (const pi of [0, 1] as const) {
      const opponent = this.links[pi === 0 ? 1 : 0];
      this.links[pi].send('MATCH_FOUND', {
        roomId: this.id,
        opponent: { username: opponent.username, trophies: opponent.trophies },
      });
    }
    // Bots are always ready.
    if (this.links[0].isBot) this.ready[0] = true;
    if (this.links[1].isBot) this.ready[1] = true;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  hand(pi: PlayerIndex): readonly string[] {
    return this.hands[pi];
  }

  possessedUnitOf(pi: PlayerIndex): number {
    return this.possessedUnitByPlayer[pi];
  }

  handleEnvelope(pi: PlayerIndex, env: Envelope): void {
    if (this.ended) return;
    switch (env.t) {
      case 'READY':
        this.ready[pi] = true;
        this.maybeStart();
        break;
      case 'SPAWN_CARD':
        this.queueSpawn(pi, env.p as SpawnCardPayload, env.seq);
        break;
      case 'INPUT':
        this.queueInput(pi, env.p as InputPayload);
        break;
      case 'SHOOT':
        this.queueShoot(pi, env.p as ShootPayload);
        break;
      case 'RESYNC_REQUEST':
        this.sendFullSnapshot(pi);
        break;
      default:
        break;
    }
  }

  handleDisconnect(pi: PlayerIndex): void {
    if (this.ended) return;
    // Forfeit: the remaining player wins immediately.
    this.state.gameOver = true;
    this.state.winner = pi === 0 ? 1 : 0;
    void this.finish();
  }

  private maybeStart(): void {
    if (this.started || !this.ready[0] || !this.ready[1]) return;
    this.started = true;
    this.matchStartMs = this.clock.now();
    for (const pi of [0, 1] as const) {
      this.links[pi].send('MATCH_START', {
        tick0: 0,
        seed: this.state.seed,
        playerIndex: pi,
        decks: [this.links[0].deck, this.links[1].deck] as [string[], string[]],
        configVersion: this.spec.configVersion,
        durationTicks: this.spec.durationTicks,
      });
    }
    if (this.autoLoop) this.loop = startTickLoop(() => this.runTick());
  }

  /** Test hook: start without the realtime loop. */
  startManually(): void {
    this.maybeStart();
  }

  private queueSpawn(pi: PlayerIndex, p: SpawnCardPayload, seq: number): void {
    if (!this.started) return;
    if (!this.hands[pi].includes(p.cardId)) {
      this.links[pi].send('ERROR', { code: 'CARD_NOT_IN_HAND', message: p.cardId });
      return;
    }
    this.pendingInputs.push({
      type: 'spawn',
      player: pi,
      playerId: this.links[pi].profileId,
      seq,
      cardId: p.cardId,
      cellX: p.cell.x,
      cellY: p.cell.y,
      // Possession intent is consumed HERE and never rebroadcast (PRD 1.2).
      possess: p.possess,
    });
  }

  private queueInput(pi: PlayerIndex, p: InputPayload): void {
    if (!this.started) return;
    this.rotation.observeInput(p.unitId, p.yawMdeg, this.state.tick);
    this.predictions[pi] = { seq: p.seq, unitId: p.unitId, x: p.predictedX, y: p.predictedY };
    if (p.seq > this.lastProcessedInputSeq[pi]) this.lastProcessedInputSeq[pi] = p.seq;
    this.pendingInputs.push({
      type: 'move',
      player: pi,
      playerId: this.links[pi].profileId,
      seq: p.seq,
      unitId: p.unitId,
      moveX: p.moveX,
      moveY: p.moveY,
      yawMdeg: p.yawMdeg,
      pitchMdeg: p.pitchMdeg,
    });
  }

  private queueShoot(pi: PlayerIndex, p: ShootPayload): void {
    if (!this.started) return;
    const rewindTick = rewindTickFor(p.clientTimeMs, this.matchStartMs, this.state.tick);

    // Aimbot gate (PRD 2.2): after an inhuman rotation snap, pre-evaluate the
    // shot against the rewound world; a resulting headshot invalidates the
    // packet and raises telemetry instead of entering the simulation.
    if (this.rotation.isSuspicious(p.unitId, this.state.tick)) {
      const shooter = this.state.units.find((u) => u.id === p.unitId);
      if (shooter) {
        const rewound = positionsAt(this.state, rewindTick);
        const targets = enemyTargets(this.state, this.spec, shooter.owner, rewound);
        const hit = raycastTargets(
          shooter.x, shooter.y, eyeHeightMu(shooter, this.spec),
          p.dirX, p.dirY, p.dirZ,
          targets,
        );
        if (hit?.headshot) {
          void this.repos.telemetry.flag({
            profileId: this.links[pi].profileId,
            matchId: this.id,
            tick: this.state.tick,
            reason: 'AIMBOT_ROTATION_SNAP',
            payload: { unitId: p.unitId, targetId: hit.targetId },
          });
          return; // packet dropped
        }
      }
    }

    this.pendingInputs.push({
      type: 'shoot',
      player: pi,
      playerId: this.links[pi].profileId,
      seq: p.seq,
      unitId: p.unitId,
      weapon: p.weapon,
      originX: p.originX,
      originY: p.originY,
      originZ: p.originZ,
      dirX: p.dirX,
      dirY: p.dirY,
      dirZ: p.dirZ,
      rewindTick,
    });
  }

  /** One authoritative 50ms tick: drain inputs → step sim → fan out deltas. */
  runTick(): void {
    if (!this.started || this.ended) return;

    for (const pi of [0, 1] as const) {
      const driver = this.botDrivers[pi];
      if (driver) {
        const play = driver.decide(this, pi);
        if (play) this.queueSpawn(pi, play, this.state.tick + 1);
      }
    }

    const inputs = this.pendingInputs;
    this.pendingInputs = [];
    const tickBefore = this.state.tick;
    const events = step(this.state, this.spec, inputs);
    this.recorder.record(tickBefore, inputs);

    this.processEvents(events, inputs);
    this.reconcile();
    this.broadcastDeltas(events);

    if (this.state.gameOver) void this.finish();
  }

  private processEvents(events: readonly SimEvent[], inputs: readonly TickInput[]): void {
    const consumedSpawnInputs = new Set<TickInput>();
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          // Rotate the player's hand: played card to the back, next card drawn.
          const spawnInput = inputs.find(
            (i): i is Extract<TickInput, { type: 'spawn' }> =>
              i.type === 'spawn' && i.player === e.owner && i.cardId === e.uid &&
              !consumedSpawnInputs.has(i),
          );
          if (spawnInput) {
            consumedSpawnInputs.add(spawnInput);
            const hand = this.hands[e.owner];
            const idx = hand.indexOf(spawnInput.cardId);
            if (idx >= 0) {
              hand.splice(idx, 1);
              this.queues[e.owner].push(spawnInput.cardId);
              const next = this.queues[e.owner].shift();
              if (next) hand.push(next);
            }
          }
          break;
        }
        case 'possessStart':
          this.possessedUnitByPlayer[e.owner] = e.unitId;
          this.links[e.owner].send('POSSESS_CONFIRM', { unitId: e.unitId });
          break;
        case 'possessEnd':
          this.possessedUnitByPlayer[e.owner] = -1;
          this.rotation.forget(e.unitId);
          this.links[e.owner].send('POSSESS_END', { unitId: e.unitId, reason: e.reason });
          break;
        case 'spawnRejected':
          this.links[e.player].send('ERROR', { code: e.reason, message: `spawn seq ${e.seq}` });
          break;
        default:
          break;
      }
    }
  }

  /** Server reconciliation (PRD 2.1): divergence > 0.15u forces a correction. */
  private reconcile(): void {
    for (const pi of [0, 1] as const) {
      const pred = this.predictions[pi];
      if (!pred) continue;
      this.predictions[pi] = null;
      const unit = this.state.units.find((u) => u.id === pred.unitId);
      if (!unit || unit.possessedBy !== this.links[pi].profileId) continue;
      const dx = unit.x - pred.x;
      const dy = unit.y - pred.y;
      if (dx * dx + dy * dy > DIVERGENCE_THRESHOLD_MU * DIVERGENCE_THRESHOLD_MU) {
        this.links[pi].send('CORRECTION', {
          unitId: unit.id,
          tick: this.state.tick,
          x: unit.x,
          y: unit.y,
          yawMdeg: unit.yawMdeg,
          lastInputSeq: pred.seq,
        });
      }
    }
  }

  private broadcastDeltas(events: readonly SimEvent[]): void {
    for (const pi of [0, 1] as const) {
      const { delta, sentIds } = buildStateDelta({
        state: this.state,
        spec: this.spec,
        viewer: pi,
        events,
        prevSentIds: this.lastSentIds[pi],
        lastProcessedInputSeq: this.lastProcessedInputSeq[pi],
        includeHash: this.state.tick % HASH_EVERY_TICKS === 0,
      });
      this.lastSentIds[pi] = sentIds;
      this.links[pi].send('STATE_DELTA', delta, { tick: this.state.tick });
    }
  }

  private sendFullSnapshot(pi: PlayerIndex): void {
    const { delta } = buildStateDelta({
      state: this.state,
      spec: this.spec,
      viewer: pi,
      events: [],
      prevSentIds: new Set(),
      lastProcessedInputSeq: this.lastProcessedInputSeq[pi],
      includeHash: true,
    });
    this.links[pi].send('FULL_SNAPSHOT', { tick: this.state.tick, state: delta });
  }

  private async finish(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.loop?.stop();

    const finalHash = stateHash(this.state);
    const replay = this.recorder.finalize({
      seed: this.state.seed,
      configVersion: this.spec.configVersion,
      players: [this.links[0].profileId, this.links[1].profileId],
      finalHash,
      durationTicks: this.spec.durationTicks,
    });
    this.replayId = randomUUID();
    await this.repos.replays.insert(this.replayId, this.id, replay);

    const winner = this.state.winner;
    const winnerId = winner === -1 ? null : this.links[winner].profileId;
    await this.repos.matchHistory.insert({
      matchId: this.id,
      player1Id: this.links[0].profileId,
      player2Id: this.links[1].profileId,
      player1Score: this.state.crowns[0],
      player2Score: this.state.crowns[1],
      winnerId,
      replayDataUrl: `replay://${this.replayId}`,
    });

    for (const pi of [0, 1] as const) {
      const won = winner === pi;
      const trophyDelta = winner === -1 ? 0 : won ? 30 : -20;
      const gold = won ? 30 : 5;
      let chestType: string | undefined;
      if (!this.links[pi].isBot) {
        await this.repos.profiles.applyEconomy(this.links[pi].profileId, {
          trophies: trophyDelta,
          gold,
        });
        if (won) chestType = await this.tryGrantChest(this.links[pi].profileId);
      }
      this.links[pi].send('GAME_OVER', {
        winnerIndex: winner,
        crowns: [this.state.crowns[0], this.state.crowns[1]],
        trophyDelta,
        rewards: { gold, ...(chestType ? { chestType } : {}) },
        replayId: this.replayId,
      });
    }
    this.onEnd?.(this);
  }

  private async tryGrantChest(profileId: string): Promise<string | undefined> {
    const slots = await this.repos.chestSlots.list(profileId);
    const used = new Set(slots.map((s) => s.slotIndex));
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) {
        await this.repos.chestSlots.assign({
          profileId,
          slotIndex: i,
          chestType: 'Silver',
          unlockStartTime: null,
          isUnlocking: false,
        });
        return 'Silver';
      }
    }
    return undefined;
  }
}
