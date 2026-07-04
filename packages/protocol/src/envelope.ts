import { z } from 'zod';
import type { Opcode } from './opcodes.js';

export const PROTOCOL_VERSION = 1;

export interface Envelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  t: Opcode;
  /** Monotonic per sender per connection. */
  seq: number;
  /** Highest contiguous seq received from the peer. */
  ack?: number;
  /** Simulation tick the message pertains to. */
  tick?: number;
  p: T;
}

export const envelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.string(),
  seq: z.number().int().min(0),
  ack: z.number().int().min(0).optional(),
  tick: z.number().int().min(0).optional(),
  p: z.unknown(),
});
