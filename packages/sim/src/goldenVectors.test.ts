import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { viewHash } from './hash.js';
import { stepPossessedMovement } from './movementKernel.js';

// Guards the cross-language contract: if the TS kernel or hash changes, the
// committed golden files (which the C# tests assert against) must be
// regenerated with `npm run golden` — this test fails until they are.

const golden = (name: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../shared/golden/${name}`, import.meta.url)), 'utf8'),
  );

describe('golden vectors stay in sync with the kernel', () => {
  it('movement_vectors.json matches stepPossessedMovement', () => {
    const data = golden('movement_vectors.json') as {
      vectors: Array<{ moveX: number; moveY: number; x: number; y: number; speed: number; outX: number; outY: number }>;
      chain: { startX: number; startY: number; speed: number; inputs: number[][]; outputs: number[][] };
    };
    expect(data.vectors.length).toBeGreaterThan(100);
    for (const v of data.vectors) {
      const out = stepPossessedMovement({ moveX: v.moveX, moveY: v.moveY }, { x: v.x, y: v.y }, v.speed);
      expect([out.x, out.y]).toEqual([v.outX, v.outY]);
    }
    let t = { x: data.chain.startX, y: data.chain.startY };
    data.chain.inputs.forEach((input, i) => {
      t = stepPossessedMovement({ moveX: input[0]!, moveY: input[1]! }, t, data.chain.speed);
      expect([t.x, t.y]).toEqual(data.chain.outputs[i]);
    });
  });

  it('hash_fixtures.json matches viewHash', () => {
    const data = golden('hash_fixtures.json') as {
      fixtures: Array<{ entities: Array<{ id: number; x: number; y: number; yawMdeg: number; hp: number }>; hash: string }>;
    };
    for (const f of data.fixtures) {
      expect(viewHash(f.entities)).toBe(f.hash);
    }
  });
});
