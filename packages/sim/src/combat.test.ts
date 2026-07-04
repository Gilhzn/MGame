import { describe, expect, it } from 'vitest';
import { idiv } from './fixed.js';
import { applyShootInput } from './possession.js';
import { createInitialState } from './simulation.js';
import { injectUnit, loadSpec } from './testHelpers.js';
import type { ShootInput, SimEvent } from './types.js';

const P0 = 'p0';

function shoot(unitId: number, weapon: 'alpha' | 'beta', dir: [number, number, number], rewindTick = 0): ShootInput {
  return {
    type: 'shoot', player: 0, playerId: P0, seq: 1, unitId, weapon,
    originX: 0, originY: 0, originZ: 0,
    dirX: dir[0], dirY: dir[1], dirZ: dir[2],
    rewindTick,
  };
}

describe('combat & Headshot_Bone (PRD 1.2)', () => {
  it('hitscan headshot applies the headshot multiplier', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    const target = injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    // Eye z 1530, head center z 1520 → flat forward shot intersects the head sphere.
    const events: SimEvent[] = [];
    applyShootInput(state, spec, shoot(shooter.id, 'alpha', [0, 1000, 0]), events);

    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    if (hit?.type !== 'hit') return;
    expect(hit.targetId).toBe(target.id);
    expect(hit.headshot).toBe(true);
    // alpha damage 28 × 1.5 headshot = 42
    const alpha = spec.units['unit_royal_archer']!.weaponAlpha;
    expect(hit.damage).toBe(idiv(alpha.damage * alpha.headshotMultPermille, 1000));
    expect(target.hp).toBe(target.maxHp - hit.damage);
  });

  it('a low shot hits the body without the multiplier', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    const target = injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    const events: SimEvent[] = [];
    applyShootInput(state, spec, shoot(shooter.id, 'alpha', [0, 1000, -300]), events);

    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    if (hit?.type !== 'hit') return;
    expect(hit.targetId).toBe(target.id);
    expect(hit.headshot).toBe(false);
    expect(hit.damage).toBe(spec.units['unit_royal_archer']!.weaponAlpha.damage);
  });

  it('weapon beta (projectile) spawns a projectile instead of instant damage', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    const events: SimEvent[] = [];
    applyShootInput(state, spec, shoot(shooter.id, 'beta', [0, 1000, 0]), events);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(state.projectiles).toHaveLength(1);
    expect(shooter.weaponBeta.clip).toBe(0); // clip capacity 1 → empty, reloading
    expect(shooter.weaponBeta.reloadTicks).toBeGreaterThan(0);
  });

  it('respects fire cooldown: second immediate shot is dropped', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const shooter = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, P0);
    const target = injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    const events: SimEvent[] = [];
    applyShootInput(state, spec, shoot(shooter.id, 'alpha', [0, 1000, 0]), events);
    applyShootInput(state, spec, shoot(shooter.id, 'alpha', [0, 1000, 0]), events);
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(target.hp).toBe(target.maxHp - 42);
  });

  it('non-possessed units cannot be driven by shoot inputs', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const aiUnit = injectUnit(state, spec, 'unit_royal_archer', 0, 5500, 5500, null);
    injectUnit(state, spec, 'unit_royal_archer', 1, 5500, 8500);

    const events: SimEvent[] = [];
    applyShootInput(state, spec, shoot(aiUnit.id, 'alpha', [0, 1000, 0]), events);
    expect(events).toHaveLength(0);
  });
});
