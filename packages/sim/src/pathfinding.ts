import { GRID_H, GRID_W } from './constants.js';
import { isWalkableCell } from './grid.js';

// A* over the 12x24 cell grid, 4-connected. Determinism: the open list is
// scanned for the lowest f-score with ties broken by lowest node index
// (y * GRID_W + x) — no heaps, no insertion-order dependence.

const NODE_COUNT = GRID_W * GRID_H;

function nodeIndex(x: number, y: number): number {
  return y * GRID_W + x;
}

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): Array<{ x: number; y: number }> {
  if (!isWalkableCell(goalX, goalY) || !isWalkableCell(startX, startY)) return [];
  if (startX === goalX && startY === goalY) return [];

  const g = new Int32Array(NODE_COUNT).fill(-1);
  const parent = new Int32Array(NODE_COUNT).fill(-1);
  const inOpen = new Uint8Array(NODE_COUNT);
  const closed = new Uint8Array(NODE_COUNT);

  const start = nodeIndex(startX, startY);
  const goal = nodeIndex(goalX, goalY);
  g[start] = 0;
  inOpen[start] = 1;
  let openCount = 1;

  const h = (idx: number): number => {
    const x = idx % GRID_W;
    const y = (idx - x) / GRID_W;
    return Math.abs(x - goalX) + Math.abs(y - goalY);
  };

  while (openCount > 0) {
    // Lowest f, tie-break lowest index.
    let current = -1;
    let bestF = Infinity;
    for (let i = 0; i < NODE_COUNT; i++) {
      if (!inOpen[i]) continue;
      const f = g[i]! + h(i);
      if (f < bestF) {
        bestF = f;
        current = i;
      }
    }
    if (current === -1) break;
    if (current === goal) break;

    inOpen[current] = 0;
    openCount--;
    closed[current] = 1;

    const cx = current % GRID_W;
    const cy = (current - cx) / GRID_W;
    // Neighbor order is part of the deterministic contract: E, W, S, N.
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as const;

    for (const [nx, ny] of neighbors) {
      if (!isWalkableCell(nx, ny)) continue;
      const ni = nodeIndex(nx, ny);
      if (closed[ni]) continue;
      const tentative = g[current]! + 1;
      if (g[ni] === -1 || tentative < g[ni]!) {
        g[ni] = tentative;
        parent[ni] = current;
        if (!inOpen[ni]) {
          inOpen[ni] = 1;
          openCount++;
        }
      }
    }
  }

  if (parent[goal] === -1 && goal !== start) return [];

  const cells: Array<{ x: number; y: number }> = [];
  let walk = goal;
  while (walk !== start && walk !== -1) {
    const x = walk % GRID_W;
    cells.push({ x, y: (walk - x) / GRID_W });
    walk = parent[walk]!;
  }
  cells.reverse();
  return cells;
}
