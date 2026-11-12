import { claimCells, evalClaimValues } from './claims';
import type { Cell, Grid, PuzzleSpec } from './types';

/**
 * A human-style solver used to grade puzzles and to power the Old Partner hint.
 * It assumes the truth of every statement is known (the lie has been found),
 * and measures which grid techniques are needed (rule book section 5):
 *  1 = singles (only one number fits a cell / a number fits only one cell)
 *  2 = small zones and statements (3 cells or fewer) narrowing their cells
 *  3 = any zone or statement narrowing its cells against current candidates
 *  4 = testing a number and following it to a contradiction
 */

interface Constraint {
  cells: Cell[];
  test: (vals: number[]) => boolean;
  label: string;
}

export interface Step {
  technique: number;
  cell: Cell;
  value: number;
  reason: string;
}

type Cand = number[][]; // bitmask per cell

const bitCount = (x: number) => { let c = 0; for (; x; x &= x - 1) c++; return c; };
const onlyValue = (x: number) => 31 - Math.clz32(x);

function buildConstraints(p: PuzzleSpec, truth: boolean[]): Constraint[] {
  const cs: Constraint[] = [];
  p.zones.forEach((z, i) =>
    cs.push({ cells: z.cells, test: (v) => v.reduce((s, x) => s + x, 0) === z.sum, label: `zone ${i + 1}` }),
  );
  p.statements.forEach((s, i) =>
    cs.push({ cells: claimCells(s.claim), test: (v) => evalClaimValues(s.claim, v) === truth[i], label: `statement ${i + 1}` }),
  );
  return cs;
}

class Contradiction extends Error {}

function restrict(cand: Cand, r: number, c: number, mask: number): boolean {
  const nm = cand[r][c] & mask;
  if (nm === cand[r][c]) return false;
  if (!nm) throw new Contradiction();
  cand[r][c] = nm;
  return true;
}

/** Technique 1: naked and hidden singles plus row/column elimination. Returns true if anything changed. */
function singles(cand: Cand, n: number): boolean {
  let changed = false;
  // elimination from solved cells
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const m = cand[r][c];
      if (bitCount(m) !== 1) continue;
      for (let k = 0; k < n; k++) {
        if (k !== c && restrict(cand, r, k, ~m)) changed = true;
        if (k !== r && restrict(cand, k, c, ~m)) changed = true;
      }
    }
  // hidden singles
  for (let v = 1; v <= n; v++) {
    const bit = 1 << v;
    for (let r = 0; r < n; r++) {
      const spots = [];
      for (let c = 0; c < n; c++) if (cand[r][c] & bit) spots.push(c);
      if (!spots.length) throw new Contradiction();
      if (spots.length === 1 && restrict(cand, r, spots[0], bit)) changed = true;
    }
    for (let c = 0; c < n; c++) {
      const spots = [];
      for (let r = 0; r < n; r++) if (cand[r][c] & bit) spots.push(r);
      if (!spots.length) throw new Contradiction();
      if (spots.length === 1 && restrict(cand, spots[0], c, bit)) changed = true;
    }
  }
  return changed;
}

/** Techniques 2/3: restrict each constraint's cells to values that appear in some valid combination. */
function constraintPass(cand: Cand, cs: Constraint[], maxCells: number): boolean {
  let changed = false;
  for (const k of cs) {
    if (k.cells.length > maxCells) continue;
    const support = k.cells.map(() => 0);
    const vals: number[] = [];
    const rec = (i: number) => {
      if (i === k.cells.length) {
        if (k.test(vals)) vals.forEach((v, j) => (support[j] |= 1 << v));
        return;
      }
      const [r, c] = k.cells[i];
      for (let m = cand[r][c]; m; m &= m - 1) {
        const v = onlyValue(m & -m);
        let clash = false;
        for (let j = 0; j < i; j++) {
          const [r2, c2] = k.cells[j];
          if (vals[j] === v && (r2 === r || c2 === c)) { clash = true; break; }
        }
        if (clash) continue;
        vals[i] = v;
        rec(i + 1);
      }
    };
    rec(0);
    k.cells.forEach(([r, c], j) => { if (restrict(cand, r, c, support[j])) changed = true; });
  }
  return changed;
}

function propagate(cand: Cand, n: number, cs: Constraint[], maxTech: number): number {
  let used = 0;
  for (;;) {
    if (singles(cand, n)) { used = Math.max(used, 1); continue; }
    if (maxTech >= 2 && constraintPass(cand, cs, 3)) { used = Math.max(used, 2); continue; }
    if (maxTech >= 3 && constraintPass(cand, cs, 99)) { used = Math.max(used, 3); continue; }
    return used;
  }
}

function solved(cand: Cand) {
  return cand.every((row) => row.every((m) => bitCount(m) === 1));
}

function contradictionPass(cand: Cand, n: number, cs: Constraint[]): boolean {
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (bitCount(cand[r][c]) < 2) continue;
      for (let m = cand[r][c]; m; m &= m - 1) {
        const bit = m & -m;
        const trial = cand.map((row) => row.slice());
        trial[r][c] = bit;
        try {
          propagate(trial, n, cs, 3);
        } catch (e) {
          if (!(e instanceof Contradiction)) throw e;
          restrict(cand, r, c, ~bit);
          return true;
        }
      }
    }
  return false;
}

function initialCand(p: PuzzleSpec, placed?: Grid): Cand {
  const n = p.size;
  const full = (1 << (n + 1)) - 2;
  const cand: Cand = Array.from({ length: n }, () => Array(n).fill(full));
  for (const g of p.givens) cand[g.cell[0]][g.cell[1]] = 1 << g.value;
  if (placed)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (placed[r][c]) cand[r][c] &= 1 << placed[r][c];
  return cand;
}

/** Grade a puzzle: the highest technique needed, or 0 if logic alone can't finish it. */
export function gradePuzzle(p: PuzzleSpec, truth: boolean[]): number {
  const cs = buildConstraints(p, truth);
  const cand = initialCand(p);
  let grade = 0;
  try {
    for (;;) {
      grade = Math.max(grade, propagate(cand, p.size, cs, 3));
      if (solved(cand)) return Math.max(grade, 1);
      if (!contradictionPass(cand, p.size, cs)) return 0;
      grade = 4;
    }
  } catch (e) {
    if (e instanceof Contradiction) return 0;
    throw e;
  }
}

/**
 * The Old Partner's hint: the next cell that logic pins down from the player's current
 * (correct) entries, with the technique and a plain-language reason.
 */
export function nextStep(p: PuzzleSpec, truth: boolean[], placed: Grid): Step | null {
  const n = p.size;
  const cs = buildConstraints(p, truth);
  const cand = initialCand(p, placed);
  const isOpen = (r: number, c: number) => !placed[r][c] && !p.givens.some((g) => g.cell[0] === r && g.cell[1] === c);
  const firstNew = (): [number, number] | null => {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (isOpen(r, c) && bitCount(cand[r][c]) === 1) return [r, c];
    return null;
  };
  const reasons: Record<number, string> = {
    1: 'Rule out every number already used in its row and column, and only one is left. Or it is the only spot left for that number in its row or column.',
    2: 'The small zone or statement touching this cell only works with one number here.',
    3: 'Line up the zone totals and statements with what is left in the row and column, and only one number survives.',
    4: 'Try any other number here and follow it through: it breaks a row, a column or a zone.',
  };
  try {
    let tech = 0;
    for (const t of [1, 2, 3]) {
      tech = Math.max(tech, t === 1 ? 1 : t);
      // run propagation restricted to technique t, one sweep at a time, checking for a new single
      for (;;) {
        const hit = firstNew();
        if (hit) return { technique: tech, cell: hit, value: onlyValue(cand[hit[0]][hit[1]]), reason: reasons[tech] };
        let changed = singles(cand, n);
        if (!changed && t >= 2) changed = constraintPass(cand, cs, t === 2 ? 3 : 99);
        if (!changed) break;
      }
    }
    for (;;) {
      const hit = firstNew();
      if (hit) return { technique: 4, cell: hit, value: onlyValue(cand[hit[0]][hit[1]]), reason: reasons[4] };
      if (!contradictionPass(cand, n, cs)) return null;
      propagate(cand, n, cs, 3);
    }
  } catch {
    return null;
  }
}
