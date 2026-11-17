import { makeRng } from './rng';
import { enumerateBalance, verifyBalance, type BalanceSheet } from './balance';
import { evalClaim } from './claims';
import type { Cell, Claim, Grid } from './types';

export interface BalanceOptions {
  size: number;
  /** Largest amount in one cell. */
  maxValue: number;
  /** Fewest statements the puzzle may need (no easy path). */
  minStatements: number;
  /** Most statements the puzzle may use. */
  maxStatements: number;
  seed: number;
}

export interface GeneratedBalance extends BalanceSheet {
  solution: Grid;
  seed: number;
}

/** Grids kept while searching. Enough to tell "one" from "many" once the list shrinks. */
const KEEP = 300000;

const allCells = (n: number): Cell[] => Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n] as Cell);

/**
 * Statements true on the answer: exact amounts, and totals over two or three cells
 * (a vendor's two nights, say). Sums carry the most information per statement.
 */
export function candidates(sol: Grid, rng: ReturnType<typeof makeRng>): Claim[] {
  const n = sol.length;
  const cells = allCells(n);
  const out: Claim[] = cells.map((c) => ({ kind: 'is', cell: c, value: sol[c[0]][c[1]] }));
  for (let k = 0; k < n * n * 3; k++) {
    const picked = rng.shuffle([...cells]).slice(0, rng.int(2, 3));
    const claim: Claim = { kind: 'sum', cells: picked, value: picked.reduce((s, [r, c]) => s + sol[r][c], 0) };
    if (evalClaim(claim, sol)) out.push(claim);
  }
  return rng.shuffle(out);
}

/**
 * Plants a random answer, takes its row and column totals, then adds the true statement that leaves the
 * fewest grids, one at a time, until only one fits or the statement cap is reached.
 */
export function tryBalance(o: BalanceOptions, seed: number): GeneratedBalance | null {
  const rng = makeRng(seed);
  const n = o.size;
  const sol: Grid = Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(0, o.maxValue)));
  const rowTotals = sol.map((row) => row.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: n }, (_, c) => sol.reduce((s, row) => s + row[c], 0));
  const filled = allCells(n).filter(([r, c]) => sol[r][c] > 0);
  if (filled.length === 0) return null;
  const takeaway = rng.pick(filled);
  const base: BalanceSheet = { size: n, maxValue: o.maxValue, rowTotals, colTotals, claims: [], takeaway };

  // grids that fit so far; each statement keeps only the grids it is true on
  let fits = enumerateBalance(base, KEEP);
  const claims: Claim[] = [];
  const pool = candidates(sol, rng);
  while (fits.length > 1 && claims.length < o.maxStatements) {
    let best: { cl: Claim; left: Grid[] } | null = null;
    for (const cl of pool) {
      if (claims.includes(cl)) continue;
      const left = fits.filter((g) => evalClaim(cl, g));
      if (left.length > 0 && left.length < fits.length && (!best || left.length < best.left.length)) best = { cl, left };
      if (best?.left.length === 1) break;
    }
    /* v8 ignore next -- while two grids fit, the true 'is' claim on a cell where they differ always narrows them */
    if (!best) break;
    claims.push(best.cl);
    fits = best.left;
  }
  if (fits.length !== 1 || claims.length < o.minStatements) return null;
  const puzzle: BalanceSheet = { ...base, claims };
  /* v8 ignore next -- the greedy search leaves one grid, and verifyBalance enumerates the same sheet */
  if (!verifyBalance(puzzle).ok) return null;
  return { ...puzzle, solution: sol, seed };
}

/** Tries seeds until one puzzle works. Throws if none does within the attempts. */
export function generateBalance(o: BalanceOptions, attempts = 300): GeneratedBalance {
  for (let a = 0; a < attempts; a++) {
    const seed = (o.seed * 7919 + a * 104729) >>> 0;
    const p = tryBalance(o, seed);
    if (p) return p;
  }
  throw new Error(`Could not build a ${o.size}x${o.size} balance sheet within ${attempts} attempts`);
}
