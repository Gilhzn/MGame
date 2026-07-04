import { z } from 'zod';
import { C2S, S2C } from './opcodes.js';

// Fixed-point conventions (see docs/determinism.md): positions in milli-units,
// angles in milli-degrees, elixir in tenths. All integers on the wire.
const int = z.number().int();
const uint = z.number().int().min(0);

export const gridCellSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(23),
});
export type GridCell = z.infer<typeof gridCellSchema>;

// ---------------------------------------------------------------- C→S payloads

export const helloSchema = z.object({ token: z.string().min(1) });

export const queueJoinSchema = z.object({ mode: z.enum(['ladder', 'training']) });

export const spawnCardSchema = z.object({
  cardId: z.string().min(1),
  cell: gridCellSchema,
  // Consumed server-side only; never rebroadcast (PRD 1.2 — the bluff).
  possess: z.boolean(),
});

export const inputSchema = z.object({
  unitId: uint,
  cTick: uint,
  seq: uint,
  moveX: int.min(-1000).max(1000),
  moveY: int.min(-1000).max(1000),
  yawMdeg: int.min(-180000).max(180000),
  pitchMdeg: int.min(-89000).max(89000),
  predictedX: int,
  predictedY: int,
});

export const shootSchema = z.object({
  unitId: uint,
  weapon: z.enum(['alpha', 'beta']),
  originX: int,
  originY: int,
  originZ: int,
  dirX: int.min(-1000).max(1000),
  dirY: int.min(-1000).max(1000),
  dirZ: int.min(-1000).max(1000),
  clientTimeMs: uint,
  seq: uint,
});

export const hashReportSchema = z.object({ tick: uint, hash: z.string() });

export const pingSchema = z.object({ t0: uint });

const emptySchema = z.object({}).passthrough();

// ---------------------------------------------------------------- S→C payloads

export const entitySnapshotSchema = z.object({
  id: uint,
  kind: z.enum(['unit', 'tower', 'projectile']),
  uid: z.string(),
  owner: z.union([z.literal(0), z.literal(1)]),
  x: int,
  y: int,
  yawMdeg: int,
  hp: int,
  maxHp: int,
  anim: z.enum(['idle', 'walk', 'attack', 'death']),
});
export type EntitySnapshot = z.infer<typeof entitySnapshotSchema>;

export const gameEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spawn'), id: uint, uid: z.string(), owner: uint }),
  z.object({
    type: z.literal('hit'),
    targetId: uint,
    damage: uint,
    headshot: z.boolean(),
  }),
  z.object({ type: z.literal('death'), id: uint }),
  z.object({ type: z.literal('shot'), shooterId: uint, weapon: z.enum(['alpha', 'beta', 'ai']) }),
  z.object({ type: z.literal('tower_destroyed'), id: uint, owner: uint }),
]);
export type GameEvent = z.infer<typeof gameEventSchema>;

export const welcomeSchema = z.object({ profileId: z.string(), serverTime: uint });

export const queuedSchema = z.object({ position: uint });

export const matchFoundSchema = z.object({
  roomId: z.string(),
  opponent: z.object({ username: z.string(), trophies: uint }),
});

export const matchStartSchema = z.object({
  tick0: uint,
  seed: uint,
  playerIndex: z.union([z.literal(0), z.literal(1)]),
  decks: z.tuple([z.array(z.string()).length(8), z.array(z.string()).length(8)]),
  configVersion: z.string(),
  durationTicks: uint,
});

export const stateDeltaSchema = z.object({
  tick: uint,
  entities: z.array(entitySnapshotSchema),
  removed: z.array(uint),
  events: z.array(gameEventSchema),
  elixir: uint, // recipient's own elixir, in tenths
  doubleElixir: z.boolean(),
  lastProcessedInputSeq: uint,
  stateHash: z.string().optional(),
});
export type StateDelta = z.infer<typeof stateDeltaSchema>;

export const correctionSchema = z.object({
  unitId: uint,
  tick: uint,
  x: int,
  y: int,
  yawMdeg: int,
  lastInputSeq: uint,
});

export const fullSnapshotSchema = z.object({ tick: uint, state: z.unknown() });

export const possessConfirmSchema = z.object({ unitId: uint });

export const possessEndSchema = z.object({
  unitId: uint,
  reason: z.enum(['death', 'match_end']),
});

export const gameOverSchema = z.object({
  winnerIndex: z.union([z.literal(0), z.literal(1), z.literal(-1)]), // -1 = draw
  crowns: z.tuple([uint, uint]),
  trophyDelta: int,
  rewards: z.object({ gold: uint, chestType: z.string().optional() }),
  replayId: z.string().optional(),
});

export const pongSchema = z.object({ t0: uint, serverTime: uint });

export const errorSchema = z.object({ code: z.string(), message: z.string() });

// ------------------------------------------------------------- opcode registry

export const payloadSchemas = {
  [C2S.HELLO]: helloSchema,
  [C2S.QUEUE_JOIN]: queueJoinSchema,
  [C2S.QUEUE_LEAVE]: emptySchema,
  [C2S.READY]: emptySchema,
  [C2S.SPAWN_CARD]: spawnCardSchema,
  [C2S.INPUT]: inputSchema,
  [C2S.SHOOT]: shootSchema,
  [C2S.HASH_REPORT]: hashReportSchema,
  [C2S.RESYNC_REQUEST]: emptySchema,
  [C2S.PING]: pingSchema,
  [S2C.WELCOME]: welcomeSchema,
  [S2C.QUEUED]: queuedSchema,
  [S2C.MATCH_FOUND]: matchFoundSchema,
  [S2C.MATCH_START]: matchStartSchema,
  [S2C.STATE_DELTA]: stateDeltaSchema,
  [S2C.CORRECTION]: correctionSchema,
  [S2C.FULL_SNAPSHOT]: fullSnapshotSchema,
  [S2C.POSSESS_CONFIRM]: possessConfirmSchema,
  [S2C.POSSESS_END]: possessEndSchema,
  [S2C.GAME_OVER]: gameOverSchema,
  [S2C.PONG]: pongSchema,
  [S2C.ERROR]: errorSchema,
} as const;

export type PayloadSchemas = typeof payloadSchemas;
export type PayloadOf<T extends keyof PayloadSchemas> = z.infer<PayloadSchemas[T]>;

export type HelloPayload = PayloadOf<'HELLO'>;
export type QueueJoinPayload = PayloadOf<'QUEUE_JOIN'>;
export type SpawnCardPayload = PayloadOf<'SPAWN_CARD'>;
export type InputPayload = PayloadOf<'INPUT'>;
export type ShootPayload = PayloadOf<'SHOOT'>;
export type HashReportPayload = PayloadOf<'HASH_REPORT'>;
export type WelcomePayload = PayloadOf<'WELCOME'>;
export type MatchFoundPayload = PayloadOf<'MATCH_FOUND'>;
export type MatchStartPayload = PayloadOf<'MATCH_START'>;
export type StateDeltaPayload = PayloadOf<'STATE_DELTA'>;
export type CorrectionPayload = PayloadOf<'CORRECTION'>;
export type FullSnapshotPayload = PayloadOf<'FULL_SNAPSHOT'>;
export type PossessConfirmPayload = PayloadOf<'POSSESS_CONFIRM'>;
export type PossessEndPayload = PayloadOf<'POSSESS_END'>;
export type GameOverPayload = PayloadOf<'GAME_OVER'>;
export type ErrorPayload = PayloadOf<'ERROR'>;
