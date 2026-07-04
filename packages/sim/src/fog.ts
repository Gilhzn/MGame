import {
  BUSH_REVEAL_RANGE_MU,
  TOWER_OCCLUSION_RADIUS_MU,
  TOWER_SIGHT_RANGE_MU,
  UNIT_SIGHT_RANGE_MU,
} from './constants.js';
import { idiv, isqrt } from './fixed.js';
import { cellOfMu, isBushCell } from './grid.js';
import type { PlayerIndex, SimState } from './types.js';

// Network fog of war (PRD 2.2): the server strips hidden enemy entities from a
// player's packets entirely. Visibility is computed from the viewer's OWN
// entities (units + towers): an enemy is visible when some friendly observer
// has it in sight range with no tower disc blocking the sightline; entities
// standing in stealth bushes need an observer within close reveal range.

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return isqrt(dx * dx + dy * dy);
}

/** Does the segment (x1,y1)→(x2,y2) pass through the circle at (cx,cy)? */
function segmentBlocked(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, radiusMu: number,
): boolean {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const den = ex * ex + ey * ey;
  if (den === 0) return false;
  let num = (cx - x1) * ex + (cy - y1) * ey;
  if (num < 0) num = 0;
  if (num > den) num = den;
  const px = x1 + idiv(ex * num, den);
  const py = y1 + idiv(ey * num, den);
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy <= radiusMu * radiusMu;
}

/**
 * Ids of ENEMY entities (units + projectiles) visible to `viewer`. Towers are
 * static landmarks and always visible; the caller sends own entities freely.
 */
export function computeVisibility(state: SimState, viewer: PlayerIndex): Set<number> {
  const observers: Array<{ x: number; y: number; rangeMu: number }> = [];
  for (const u of state.units) {
    if (u.owner === viewer) observers.push({ x: u.x, y: u.y, rangeMu: UNIT_SIGHT_RANGE_MU });
  }
  for (const t of state.towers) {
    if (t.owner === viewer && t.hp > 0) observers.push({ x: t.x, y: t.y, rangeMu: TOWER_SIGHT_RANGE_MU });
  }

  const blockers = state.towers.filter((t) => t.hp > 0);
  const visible = new Set<number>();

  const testEntity = (id: number, x: number, y: number): void => {
    const cell = cellOfMu(x, y);
    const inBush = isBushCell(cell.x, cell.y);
    for (const ob of observers) {
      const d = dist(ob.x, ob.y, x, y);
      if (inBush) {
        if (d <= BUSH_REVEAL_RANGE_MU) {
          visible.add(id);
          return;
        }
        continue;
      }
      if (d > ob.rangeMu) continue;
      let blocked = false;
      for (const b of blockers) {
        // A tower does not occlude a sightline that starts or ends on itself.
        if ((b.x === ob.x && b.y === ob.y) || (b.x === x && b.y === y)) continue;
        if (segmentBlocked(ob.x, ob.y, x, y, b.x, b.y, TOWER_OCCLUSION_RADIUS_MU)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        visible.add(id);
        return;
      }
    }
  };

  for (const u of state.units) {
    if (u.owner !== viewer) testEntity(u.id, u.x, u.y);
  }
  for (const p of state.projectiles) {
    if (p.owner !== viewer) testEntity(p.id, p.x, p.y);
  }
  return visible;
}
