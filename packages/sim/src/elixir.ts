import { ELIXIR_ACC_TARGET, ELIXIR_CAP_TENTHS, ELIXIR_GRANT_TENTHS } from './constants.js';
import type { PlayerIndex, SimSpec, SimState } from './types.js';

// PRD 1.1: 1 elixir per 2.8s (56 ticks), 2x accumulation speed during the
// final 60 seconds, hard cap of 10. The accumulator gains 1 per tick (2 in
// double-elixir time) and converts every 56 into one elixir point.

export function tickElixir(state: SimState, spec: SimSpec): void {
  const rate = state.tick >= spec.doubleElixirStartTick ? 2 : 1;
  for (const p of [0, 1] as const) {
    state.elixirAcc[p] += rate;
    if (state.elixirAcc[p] >= ELIXIR_ACC_TARGET) {
      state.elixirAcc[p] -= ELIXIR_ACC_TARGET;
      state.elixirTenths[p] = Math.min(
        ELIXIR_CAP_TENTHS,
        state.elixirTenths[p] + ELIXIR_GRANT_TENTHS,
      );
    }
  }
}

export function canAfford(state: SimState, player: PlayerIndex, costTenths: number): boolean {
  return state.elixirTenths[player] >= costTenths;
}

export function spendElixir(state: SimState, player: PlayerIndex, costTenths: number): void {
  state.elixirTenths[player] -= costTenths;
}

export function isDoubleElixir(state: SimState, spec: SimSpec): boolean {
  return state.tick >= spec.doubleElixirStartTick;
}
