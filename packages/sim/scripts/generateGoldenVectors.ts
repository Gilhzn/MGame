import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from '@overlord/protocol';
import { stepPossessedMovement } from '../src/movementKernel.js';
import { viewHash } from '../src/hash.js';
import { nextInt } from '../src/prng.js';

// Generates the cross-language contract fixtures (docs/determinism.md).
// The C# side (client/CoreLogic.Tests) must reproduce every value exactly.
// Regenerate with `npm run golden` after ANY movement-kernel or hash change.

const outDir = fileURLToPath(new URL('../../../shared/golden/', import.meta.url));
mkdirSync(dirname(outDir + 'x'), { recursive: true });

// ---- movement vectors ----
interface Vector {
  moveX: number; moveY: number; x: number; y: number; speed: number;
  outX: number; outY: number;
}

const vectors: Vector[] = [];
const push = (moveX: number, moveY: number, x: number, y: number, speed: number): void => {
  const out = stepPossessedMovement({ moveX, moveY }, { x, y }, speed);
  vectors.push({ moveX, moveY, x, y, speed, outX: out.x, outY: out.y });
};

// Directed cases: cardinal/diagonal, unnormalized input, river walls, bridge
// crossings, border clamps, zero input.
const speeds = [110, 160, 210, 240];
for (const speed of speeds) {
  push(0, 1000, 5500, 5500, speed);
  push(1000, 0, 5500, 5500, speed);
  push(-1000, 0, 5500, 5500, speed);
  push(0, -1000, 5500, 5500, speed);
  push(1000, 1000, 5500, 5500, speed); // diagonal normalize
  push(-707, 707, 5500, 5500, speed);
  push(333, -999, 5500, 5500, speed);
  push(1000, 1000, 80, 80, speed); // corner clamp
  push(0, 1000, 5500, 10950, speed); // river wall (non-bridge col)
  push(0, 1000, 2500, 10950, speed); // bridge crossing
  push(0, 1000, 8500, 10900, speed); // bridge col 8
  push(0, -1000, 5500, 13050, speed); // river wall from north side
  push(0, 0, 5500, 5500, speed);
}
// Seeded pseudo-random sweep across the arena.
let rng = 0x601d;
const roll = (n: number): number => {
  const r = nextInt(rng, n);
  rng = r.state;
  return r.value;
};
for (let i = 0; i < 150; i++) {
  const x = 60 + roll(11880);
  const y = 60 + roll(23880);
  const moveX = roll(2001) - 1000;
  const moveY = roll(2001) - 1000;
  const speed = 80 + roll(200);
  push(moveX, moveY, x, y, speed);
}

// Chained walk: 120 steps with turning input, crossing the river northward.
const chain = { startX: 2500, startY: 9500, speed: 210, inputs: [] as number[][], outputs: [] as number[][] };
{
  let t = { x: chain.startX, y: chain.startY };
  for (let i = 0; i < 120; i++) {
    const mx = i % 20 < 10 ? 300 : -300;
    const my = 1000;
    chain.inputs.push([mx, my]);
    t = stepPossessedMovement({ moveX: mx, moveY: my }, t, chain.speed);
    chain.outputs.push([t.x, t.y]);
  }
}

writeFileSync(outDir + 'movement_vectors.json', JSON.stringify({ vectors, chain }, null, 1));

// ---- view-hash fixtures ----
const hashFixtures = [
  { entities: [], },
  { entities: [{ id: 1, x: 5500, y: 1500, yawMdeg: 0, hp: 2400 }] },
  {
    entities: [
      { id: 1, x: 5500, y: 1500, yawMdeg: 0, hp: 2400 },
      { id: 7, x: 2500, y: 10500, yawMdeg: 90000, hp: 210 },
      { id: 9, x: 11940, y: 23940, yawMdeg: -135000, hp: 1 },
    ],
  },
  {
    entities: [
      { id: 3, x: -50, y: 0, yawMdeg: -180000, hp: 0 },
      { id: 4, x: 50, y: 12000, yawMdeg: 180000, hp: 65535 },
    ],
  },
].map((f) => ({ ...f, hash: viewHash(f.entities) }));

writeFileSync(outDir + 'hash_fixtures.json', JSON.stringify({ fixtures: hashFixtures }, null, 1));

// ---- envelope fixtures ----
const envelopes = [
  {
    raw: encode('SPAWN_CARD', { cardId: 'unit_royal_archer', cell: { x: 6, y: 4 }, possess: true }, { seq: 3, tick: 120 }),
    t: 'SPAWN_CARD', seq: 3, tick: 120,
  },
  {
    raw: encode('INPUT', {
      unitId: 9, cTick: 40, seq: 11, moveX: -707, moveY: 707,
      yawMdeg: 135000, pitchMdeg: -4500, predictedX: 2450, predictedY: 10920,
    }, { seq: 12, ack: 40 }),
    t: 'INPUT', seq: 12, ack: 40,
  },
  {
    raw: encode('CORRECTION', { unitId: 9, tick: 41, x: 2400, y: 10900, yawMdeg: 135000, lastInputSeq: 11 }, { seq: 90, tick: 41 }),
    t: 'CORRECTION', seq: 90, tick: 41,
  },
] as const;

writeFileSync(outDir + 'envelope_fixtures.json', JSON.stringify({ fixtures: envelopes }, null, 1));

console.log(`golden vectors written: ${vectors.length} movement vectors, ${hashFixtures.length} hash fixtures, ${envelopes.length} envelopes`);
