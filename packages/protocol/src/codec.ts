import { envelopeSchema, type Envelope, PROTOCOL_VERSION } from './envelope.js';
import { payloadSchemas, type PayloadOf, type PayloadSchemas } from './messages.js';
import type { Opcode } from './opcodes.js';

// JSON today; isolated here so a binary encoding can replace it without
// touching game logic.

export type DecodeResult =
  | { ok: true; env: Envelope }
  | { ok: false; error: string };

export function encode<T extends keyof PayloadSchemas>(
  t: T,
  p: PayloadOf<T>,
  opts: { seq: number; ack?: number; tick?: number },
): string {
  const env: Envelope = { v: PROTOCOL_VERSION, t, seq: opts.seq, p };
  if (opts.ack !== undefined) env.ack = opts.ack;
  if (opts.tick !== undefined) env.tick = opts.tick;
  return JSON.stringify(env);
}

export function decode(raw: string | Buffer): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return { ok: false, error: 'MALFORMED_JSON' };
  }

  const envResult = envelopeSchema.safeParse(parsed);
  if (!envResult.success) return { ok: false, error: 'BAD_ENVELOPE' };

  const schema = payloadSchemas[envResult.data.t as keyof PayloadSchemas];
  if (!schema) return { ok: false, error: `UNKNOWN_OPCODE:${envResult.data.t}` };

  const payloadResult = schema.safeParse(envResult.data.p);
  if (!payloadResult.success) {
    return { ok: false, error: `BAD_PAYLOAD:${envResult.data.t}` };
  }

  return {
    ok: true,
    env: { ...envResult.data, t: envResult.data.t as Opcode, p: payloadResult.data },
  };
}
