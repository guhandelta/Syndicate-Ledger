import { claimCells, evalClaim } from './claims';
import type { Cell, Claim, Grid } from './types';

/**
 * Balance sheet: rows are accounts, columns are nights. Each row must add to its account
 * statement and each column to the daily deposits. Repeat amounts are fine, unlike the
 * Latin-square ledger. The statements pin the grid down, and the takeaway cell is the answer
 * the rest of the case uses (for example, the amount skimmed and the night it was taken).
 */
export interface BalanceSheet {
  size: number;
  /** Largest amount in one cell (amounts are 0..maxValue). */
  maxValue: number;
  rowTotals: number[];
  colTotals: number[];
  /** Statements every witness agrees with on the answer. Each is about one or more cells. */
  claims: Claim[];
  /** The cell whose amount is the answer. */
  takeaway: Cell;
}

const idx = (c: Cell, n: number) => c[0] * n + c[1];

/** Every grid that fits the totals and the claims, up to `limit`. Cells are filled row by row. */
export function enumerateBalance(p: BalanceSheet, limit = 50): Grid[] {
  const n = p.size;
  const grid: Grid = Array.from({ length: n }, () => Array(n).fill(0));
  const rowLeft = [...p.rowTotals];
  const colLeft = [...p.colTotals];
  // a claim is checked as soon as its last cell is filled
  const due: Claim[][] = Array.from({ length: n * n }, () => []);
  for (const c of p.claims) due[Math.max(...claimCells(c).map((x) => idx(x, n)))].push(c);
  const out: Grid[] = [];

  const fill = (i: number) => {
    if (out.length >= limit) return;
    if (i === n * n) {
      out.push(grid.map((row) => [...row]));
      return;
    }
    const r = Math.floor(i / n);
    const c = i % n;
    const hi = Math.min(p.maxValue, rowLeft[r], colLeft[c]);
    for (let v = 0; v <= hi; v++) {
      grid[r][c] = v;
      rowLeft[r] -= v;
      colLeft[c] -= v;
      // a row must be exactly full at its last cell, a column at its last row
      const rowOk = c < n - 1 || rowLeft[r] === 0;
      const colOk = r < n - 1 || colLeft[c] === 0;
      if (rowOk && colOk && due[i].every((cl) => evalClaim(cl, grid))) fill(i + 1);
      rowLeft[r] += v;
      colLeft[c] += v;
      grid[r][c] = 0;
    }
  };
  fill(0);
  return out;
}

/** The puzzle works when the totals and claims leave exactly one grid, and the takeaway is set. */
export function verifyBalance(p: BalanceSheet): { ok: boolean; reason?: string; answer?: number; solution?: Grid } {
  if (p.rowTotals.length !== p.size || p.colTotals.length !== p.size) return { ok: false, reason: 'the totals do not match the grid size' };
  const all = enumerateBalance(p, 2);
  if (all.length !== 1) return { ok: false, reason: `${all.length >= 2 ? 'more than one' : 'no'} grid fits the totals and statements` };
  const [sol] = all;
  return { ok: true, answer: sol[p.takeaway[0]][p.takeaway[1]], solution: sol };
}
