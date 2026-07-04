import { describe, expect, it } from 'vitest';
import { computeVisibility } from './fog.js';
import { createInitialState } from './simulation.js';
import { injectUnit, loadSpec } from './testHelpers.js';

describe('network fog of war (PRD 2.2)', () => {
  it('an enemy in a stealth bush is hidden until an observer comes close', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    // Bush cell (0,10), center (500, 10500) — enemy rogue lurking.
    const lurker = injectUnit(state, spec, 'unit_shadow_rogue', 1, 500, 10500);
    // Friendly observer 5 units away: inside normal sight, outside bush reveal.
    const scout = injectUnit(state, spec, 'unit_swift_scout', 0, 500, 5500);

    expect(computeVisibility(state, 0).has(lurker.id)).toBe(false);

    scout.y = 8500; // 2 units away ≤ 2.5 reveal range
    expect(computeVisibility(state, 0).has(lurker.id)).toBe(true);
  });

  it('an enemy behind a tower is occluded; stepping aside reveals it', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    // Enemy guard tower at (2500,19500) sits between observer and target.
    const hidden = injectUnit(state, spec, 'unit_iron_knight', 1, 2500, 21000);
    injectUnit(state, spec, 'unit_swift_scout', 0, 2500, 15000);

    expect(computeVisibility(state, 0).has(hidden.id)).toBe(false);

    hidden.x = 4500; // sightline now clears the tower disc
    expect(computeVisibility(state, 0).has(hidden.id)).toBe(true);
  });

  it('an enemy beyond every observer sight range is hidden', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    const far = injectUnit(state, spec, 'unit_iron_knight', 1, 500, 23500);
    // Only the fixed towers observe for player 0; the far corner is out of range.
    expect(computeVisibility(state, 0).has(far.id)).toBe(false);
  });

  it('own units are never part of the enemy-visibility computation', () => {
    const spec = loadSpec();
    const state = createInitialState(1, spec);
    // A p0 unit on the west bridge — within sight of p1's guard tower.
    const own = injectUnit(state, spec, 'unit_royal_archer', 0, 2500, 12500);
    // Own entities are always sent by the culler; computeVisibility only lists enemies.
    expect(computeVisibility(state, 0).has(own.id)).toBe(false);
    expect(computeVisibility(state, 1).has(own.id)).toBe(true); // enemy of player 1, in tower sight
  });
});
