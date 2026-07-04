import type { EntitySnapshot, GameEvent, StateDeltaPayload } from '@overlord/protocol';
import {
  computeVisibility,
  isDoubleElixir,
  viewHash,
  type PlayerIndex,
  type SimEvent,
  type SimSpec,
  type SimState,
} from '@overlord/sim';

// Per-player state distribution (PRD 2.2): hidden enemy entities are never
// serialized into the recipient's packets — there is nothing for a maphack to
// read. And no field ever distinguishes a possessed unit from an AI one
// (PRD 1.2): the wire format is identical for both.

function unitSnapshot(state: SimState, id: number): EntitySnapshot | null {
  for (const u of state.units) {
    if (u.id === id) {
      return {
        id: u.id,
        kind: 'unit',
        uid: u.uid,
        owner: u.owner,
        x: u.x,
        y: u.y,
        yawMdeg: u.yawMdeg,
        hp: u.hp,
        maxHp: u.maxHp,
        anim: u.anim,
      };
    }
  }
  return null;
}

export interface CulledView {
  entities: EntitySnapshot[]; // ascending id
  sentIds: Set<number>;
}

export function buildCulledView(state: SimState, viewer: PlayerIndex): CulledView {
  const visibleEnemies = computeVisibility(state, viewer);
  const entities: EntitySnapshot[] = [];

  for (const t of state.towers) {
    entities.push({
      id: t.id,
      kind: 'tower',
      uid: `tower_${t.kind}`,
      owner: t.owner,
      x: t.x,
      y: t.y,
      yawMdeg: 0,
      hp: t.hp,
      maxHp: t.maxHp,
      anim: 'idle',
    });
  }
  for (const u of state.units) {
    if (u.owner === viewer || visibleEnemies.has(u.id)) {
      entities.push(unitSnapshot(state, u.id)!);
    }
  }
  for (const p of state.projectiles) {
    if (p.owner === viewer || visibleEnemies.has(p.id)) {
      entities.push({
        id: p.id,
        kind: 'projectile',
        uid: 'projectile',
        owner: p.owner,
        x: p.x,
        y: p.y,
        yawMdeg: 0,
        hp: 1,
        maxHp: 1,
        anim: 'idle',
      });
    }
  }

  entities.sort((a, b) => a.id - b.id);
  return { entities, sentIds: new Set(entities.map((e) => e.id)) };
}

/** Wire events for one recipient, with possession-preserving weapon masking. */
export function wireEvents(state: SimState, viewer: PlayerIndex, events: readonly SimEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'spawn':
        out.push({ type: 'spawn', id: e.id, uid: e.uid, owner: e.owner });
        break;
      case 'hit':
        out.push({ type: 'hit', targetId: e.targetId, damage: e.damage, headshot: e.headshot });
        break;
      case 'death':
        out.push({ type: 'death', id: e.id });
        break;
      case 'towerDestroyed':
        out.push({ type: 'tower_destroyed', id: e.id, owner: e.owner });
        break;
      case 'shot': {
        // The bluff: opponents must not learn a unit fires player-controlled
        // weapons. Own shots keep their weapon; enemy shots read as 'ai'.
        let weapon: 'alpha' | 'beta' | 'ai' = e.weapon;
        if (weapon !== 'ai') {
          const shooter = state.units.find((u) => u.id === e.shooterId);
          if (!shooter || shooter.owner !== viewer) weapon = 'ai';
        }
        out.push({ type: 'shot', shooterId: e.shooterId, weapon });
        break;
      }
      default:
        break; // possessStart/possessEnd/spawnRejected/gameOver go via dedicated messages
    }
  }
  return out;
}

export interface DeltaArgs {
  state: SimState;
  spec: SimSpec;
  viewer: PlayerIndex;
  events: readonly SimEvent[];
  prevSentIds: ReadonlySet<number>;
  lastProcessedInputSeq: number;
  includeHash: boolean;
}

export function buildStateDelta(args: DeltaArgs): { delta: StateDeltaPayload; sentIds: Set<number> } {
  const view = buildCulledView(args.state, args.viewer);
  const removed: number[] = [];
  for (const id of args.prevSentIds) {
    if (!view.sentIds.has(id)) removed.push(id);
  }
  removed.sort((a, b) => a - b);

  const delta: StateDeltaPayload = {
    tick: args.state.tick,
    entities: view.entities,
    removed,
    events: wireEvents(args.state, args.viewer, args.events),
    elixir: args.state.elixirTenths[args.viewer],
    doubleElixir: isDoubleElixir(args.state, args.spec),
    lastProcessedInputSeq: args.lastProcessedInputSeq,
  };
  if (args.includeHash) delta.stateHash = viewHash(view.entities);
  return { delta, sentIds: view.sentIds };
}
