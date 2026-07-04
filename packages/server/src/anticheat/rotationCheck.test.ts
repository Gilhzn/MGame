import { describe, expect, it } from 'vitest';
import { RotationMonitor, yawDeltaMdeg } from './rotationCheck.js';

describe('rotation sanity (PRD 2.2)', () => {
  it('computes wrap-aware yaw deltas', () => {
    expect(yawDeltaMdeg(0, 90000)).toBe(90000);
    expect(yawDeltaMdeg(170000, -170000)).toBe(20000); // across the wrap
    expect(yawDeltaMdeg(-90000, 90000)).toBe(180000);
    expect(yawDeltaMdeg(0, 179000)).toBe(179000);
  });

  it('flags a 180° snap within one tick as suspicious', () => {
    const m = new RotationMonitor();
    m.observeInput(7, 0, 100);
    m.observeInput(7, 180000, 101);
    expect(m.isSuspicious(7, 101)).toBe(true);
    expect(m.isSuspicious(7, 103)).toBe(true); // window
    expect(m.isSuspicious(7, 104)).toBe(false); // expired
  });

  it('accepts a 179° flick', () => {
    const m = new RotationMonitor();
    m.observeInput(7, 0, 100);
    m.observeInput(7, 179000, 101);
    expect(m.isSuspicious(7, 101)).toBe(false);
  });

  it('a 180° turn spread over several ticks is human', () => {
    const m = new RotationMonitor();
    m.observeInput(7, 0, 100);
    m.observeInput(7, 90000, 105);
    m.observeInput(7, 180000, 110);
    expect(m.isSuspicious(7, 110)).toBe(false);
  });
});
