import type { Given, Grid, Zone } from './types';

export interface BaseClues {
  size: number;
  zones: Zone[];
  givens: Given[];
}

/**
 * Enumerate every grid (Latin square + zone sums + givens), stopping after `limit`.
 * Brute-force backtracking with most-constrained-cell ordering; instant at 6x6.
 */
export function enumerate(clues: BaseClues, limit: number): Grid[] {
  const n = clues.size;
  const full = (1 << (n + 1)) - 2; // bits 1..n
  const g: Grid = Array.from({ length: n }, () => Array(n).fill(0));
  const rowUsed = Array(n).fill(0);
  const colUsed = Array(n).fill(0);
  const zoneOf: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const zSum = clues.zones.map(() => 0);
  const zLeft = clues.zones.map((z) => z.cells.length);
  clues.zones.forEach((z, i) => z.cells.forEach(([r, c]) => (zoneOf[r][c] = i)));
  const fixed: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (const { cell, value } of clues.givens) fixed[cell[0]][cell[1]] = value;

  const out: Grid[] = [];
  const zoneOk = (z: number, v: number) => {
    const target = clues.zones[z].sum;
    const s = zSum[z] + v;
    const rem = zLeft[z] - 1;
    if (rem === 0) return s === target;
    return s + rem <= target && s + rem * n >= target;
  };

  const search = (placed: number): boolean => {
    if (placed === n * n) {
      out.push(g.map((row) => row.slice()));
      return out.length >= limit;
    }
    // pick most constrained empty cell
    let br = -1, bc = -1, bmask = 0, bcount = 99;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (g[r][c]) continue;
        let m = full & ~rowUsed[r] & ~colUsed[c];
        if (fixed[r][c]) m &= 1 << fixed[r][c];
        let cnt = 0;
        for (let x = m; x; x &= x - 1) cnt++;
        if (cnt < bcount) { br = r; bc = c; bmask = m; bcount = cnt; if (cnt <= 1) break; }
      }
    if (bcount === 0) return false;
    const z = zoneOf[br][bc];
    for (let v = 1; v <= n; v++) {
      if (!(bmask & (1 << v))) continue;
      if (z >= 0 && !zoneOk(z, v)) continue;
      g[br][bc] = v;
      rowUsed[br] |= 1 << v;
      colUsed[bc] |= 1 << v;
      if (z >= 0) { zSum[z] += v; zLeft[z]--; }
      const stop = search(placed + 1);
      if (z >= 0) { zSum[z] -= v; zLeft[z]++; }
      rowUsed[br] &= ~(1 << v);
      colUsed[bc] &= ~(1 << v);
      g[br][bc] = 0;
      if (stop) return true;
    }
    return false;
  };
  search(0);
  return out;
}
