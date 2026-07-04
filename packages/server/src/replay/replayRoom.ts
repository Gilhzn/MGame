import type { LiveOpsConfig } from '@overlord/protocol';
import {
  buildSimSpec,
  createInitialState,
  framesToInputs,
  stateHash,
  step,
  type PlayerIndex,
  type ReplayFrame,
  type ReplayRecord,
  type SimSpec,
  type SimState,
} from '@overlord/sim';
import { buildStateDelta } from '../fog/culler.js';
import type { PlayerLink } from '../match/link.js';
import { startTickLoop, type TickLoopHandle } from '../match/tickLoop.js';

/**
 * Spectator playback (PRD 7.1): boots a clean arena with the recorded seed
 * and streams the input frames back through the very same simulation,
 * emitting STATE_DELTAs at 20Hz exactly like a live match — the client needs
 * zero replay-specific code. The final hash is verified against the record.
 */
export class ReplayRoom {
  readonly spec: SimSpec;
  readonly state: SimState;

  private readonly byTick = new Map<number, ReplayFrame[]>();
  private readonly record: ReplayRecord;
  private readonly spectator: PlayerLink;
  private readonly perspective: PlayerIndex;
  private prevSentIds: ReadonlySet<number> = new Set();
  private loop: TickLoopHandle | null = null;
  private done = false;

  /** Set after playback: does the re-simulation reproduce the recorded hash? */
  verified: boolean | null = null;

  constructor(args: {
    record: ReplayRecord;
    config: LiveOpsConfig;
    spectator: PlayerLink;
    /** Whose fog to replay — spectate through one player's eyes. */
    perspective?: PlayerIndex;
    autoLoop?: boolean;
    onEnd?: (room: ReplayRoom) => void;
  }) {
    this.record = args.record;
    this.spectator = args.spectator;
    this.perspective = args.perspective ?? 0;
    this.onEnd = args.onEnd;
    this.spec = buildSimSpec(args.config);
    this.state = createInitialState(args.record.seed, this.spec);
    for (const f of args.record.frames) {
      const list = this.byTick.get(f.tickId);
      if (list) list.push(f);
      else this.byTick.set(f.tickId, [f]);
    }

    this.spectator.send('MATCH_START', {
      tick0: 0,
      seed: this.record.seed,
      playerIndex: this.perspective,
      decks: [[], []] as unknown as [string[], string[]],
      configVersion: this.record.configVersion,
      durationTicks: this.record.durationTicks,
    } as never);

    if (args.autoLoop ?? true) this.loop = startTickLoop(() => this.runTick());
  }

  private readonly onEnd?: (room: ReplayRoom) => void;

  get isDone(): boolean {
    return this.done;
  }

  runTick(): void {
    if (this.done) return;
    const frames = this.byTick.get(this.state.tick);
    const inputs = frames
      ? framesToInputs(frames, (playerId) => (playerId === this.record.players[0] ? 0 : 1))
      : [];
    const events = step(this.state, this.spec, inputs);

    const { delta, sentIds } = buildStateDelta({
      state: this.state,
      spec: this.spec,
      viewer: this.perspective,
      events,
      prevSentIds: this.prevSentIds,
      lastProcessedInputSeq: 0,
      includeHash: this.state.tick % 20 === 0,
    });
    this.prevSentIds = sentIds;
    this.spectator.send('STATE_DELTA', delta, { tick: this.state.tick });

    if (this.state.gameOver || this.state.tick >= this.record.durationTicks) {
      this.done = true;
      this.loop?.stop();
      this.verified = stateHash(this.state) === this.record.finalHash;
      if (!this.verified) {
        console.warn(
          `[replay] hash mismatch for replay of match seed=${this.record.seed}: ` +
            `expected ${this.record.finalHash}, got ${stateHash(this.state)}`,
        );
      }
      this.onEnd?.(this);
    }
  }

  stop(): void {
    this.done = true;
    this.loop?.stop();
  }
}
