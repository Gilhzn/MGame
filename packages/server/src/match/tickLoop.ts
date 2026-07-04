import { TICK_MS } from '@overlord/sim';

export interface TickLoopHandle {
  stop(): void;
}

/**
 * Drift-corrected 20Hz scheduler: tick N is aimed at t0 + N*50ms using
 * re-armed setTimeouts (never setInterval, which accumulates drift under
 * event-loop pressure). Late ticks fire immediately but the schedule stays
 * anchored to t0, so the loop catches back up instead of slowing down.
 */
export function startTickLoop(onTick: () => void, intervalMs: number = TICK_MS): TickLoopHandle {
  const t0 = Date.now();
  let n = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const schedule = (): void => {
    if (stopped) return;
    n++;
    const target = t0 + n * intervalMs;
    timer = setTimeout(() => {
      if (stopped) return;
      onTick();
      schedule();
    }, Math.max(0, target - Date.now()));
  };

  schedule();
  return {
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
