import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decode, encode } from './codec.js';
import { parseLiveOpsConfig } from './liveops.js';

describe('codec', () => {
  it('round-trips a SPAWN_CARD envelope', () => {
    const raw = encode(
      'SPAWN_CARD',
      { cardId: 'unit_royal_archer', cell: { x: 6, y: 4 }, possess: true },
      { seq: 3, tick: 120 },
    );
    const result = decode(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.t).toBe('SPAWN_CARD');
    expect(result.env.seq).toBe(3);
    expect(result.env.tick).toBe(120);
    expect(result.env.p).toEqual({
      cardId: 'unit_royal_archer',
      cell: { x: 6, y: 4 },
      possess: true,
    });
  });

  it('rejects malformed JSON', () => {
    expect(decode('{nope')).toEqual({ ok: false, error: 'MALFORMED_JSON' });
  });

  it('rejects unknown opcodes', () => {
    const result = decode(JSON.stringify({ v: 1, t: 'HAXX', seq: 0, p: {} }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('UNKNOWN_OPCODE');
  });

  it('rejects out-of-range payload values', () => {
    const raw = encode(
      'SPAWN_CARD',
      { cardId: 'x', cell: { x: 6, y: 4 }, possess: false },
      { seq: 0 },
    );
    const tampered = raw.replace('"y":4', '"y":99');
    const result = decode(tampered);
    expect(result).toEqual({ ok: false, error: 'BAD_PAYLOAD:SPAWN_CARD' });
  });

  it('rejects INPUT with superhuman pitch', () => {
    const result = decode(
      JSON.stringify({
        v: 1,
        t: 'INPUT',
        seq: 1,
        p: {
          unitId: 1,
          cTick: 10,
          seq: 1,
          moveX: 0,
          moveY: 1000,
          yawMdeg: 0,
          pitchMdeg: 200000,
          predictedX: 0,
          predictedY: 0,
        },
      }),
    );
    expect(result).toEqual({ ok: false, error: 'BAD_PAYLOAD:INPUT' });
  });
});

describe('liveops config', () => {
  it('parses the committed config/liveops.json', () => {
    const path = fileURLToPath(new URL('../../../config/liveops.json', import.meta.url));
    const config = parseLiveOpsConfig(JSON.parse(readFileSync(path, 'utf8')));
    expect(config.liveops_version).toBe('2026.07.04.01');
    expect(config.unit_registry).toHaveLength(8);
    const archer = config.unit_registry.find((u) => u.uid === 'unit_royal_archer');
    expect(archer?.elixir_cost).toBe(3);
    expect(archer?.possession_fps_stats.weapon_beta.headshot_multiplier).toBe(3.0);
    expect(config.lootbox_drop_matrices['mega_chest']?.unlock_duration_seconds).toBe(86400);
  });
});
