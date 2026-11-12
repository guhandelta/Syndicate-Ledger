import type { Cell, Claim, Grid } from './types';

export function claimCells(c: Claim): Cell[] {
  switch (c.kind) {
    case 'is':
    case 'isNot':
    case 'atLeast':
    case 'atMost':
      return [c.cell];
    case 'compare':
    case 'adjacent':
    case 'notAdjacent':
      return [c.a, c.b];
    case 'sum':
      return c.cells;
  }
}

/** Evaluate a claim given the values of its cells, in claimCells order. */
export function evalClaimValues(c: Claim, v: number[]): boolean {
  switch (c.kind) {
    case 'is':
      return v[0] === c.value;
    case 'isNot':
      return v[0] !== c.value;
    case 'atLeast':
      return v[0] >= c.value;
    case 'atMost':
      return v[0] <= c.value;
    case 'compare':
      return c.op === 'gt' ? v[0] > v[1] : v[0] < v[1];
    case 'adjacent':
      return Math.abs(v[0] - v[1]) === 1;
    case 'notAdjacent':
      return Math.abs(v[0] - v[1]) !== 1;
    case 'sum':
      return v.reduce((s, x) => s + x, 0) === c.value;
  }
}

export function evalClaim(c: Claim, g: Grid): boolean {
  return evalClaimValues(c, claimCells(c).map(([r, col]) => g[r][col]));
}

export function sameCell(a: Cell, b: Cell) {
  return a[0] === b[0] && a[1] === b[1];
}
