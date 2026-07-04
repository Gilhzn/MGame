import { inputsToFrames, type ReplayFrame, type ReplayRecord, type TickInput } from '@overlord/sim';

/** Accumulates the PRD 7.1 input stream for one match. */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];

  record(tick: number, inputs: readonly TickInput[]): void {
    if (inputs.length > 0) this.frames.push(...inputsToFrames(tick, inputs));
  }

  finalize(args: {
    seed: number;
    configVersion: string;
    players: [string, string];
    finalHash: string;
    durationTicks: number;
  }): ReplayRecord {
    return {
      seed: args.seed,
      configVersion: args.configVersion,
      players: args.players,
      frames: this.frames,
      finalHash: args.finalHash,
      durationTicks: args.durationTicks,
    };
  }
}
