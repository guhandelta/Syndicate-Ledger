/**
 * The grid-logic family of decode puzzles: the player fills a small grid from clues, and the finished grid is the answer.
 *
 * DESIGN NOTE
 *   nonogram - a lock plate (or a stamp, a window grille). Each row and column lists the lengths of its runs of
 *              studs, in order. Shade the cells so every run matches. The answer is the grid, one row of 1s (studs)
 *              and 0s (blank) per line, rows separated by spaces.
 *
 * Why it has exactly one answer: the generator draws a random picture and keeps it only if a search over every
 * picture that fits the clues finds exactly one. `solveGrid` repeats that search from the clues alone and returns
 * the picture only when it is the only one, otherwise an empty string, so a puzzle with two solutions never ships.
 * Nothing is a guess: the clues always force the picture.
 *
 * Difficulty is `level` 1 to 4 (Junior to Chief): a larger grid (5, 6, 8, 10 cells a side) and a picture with fewer
 * giveaway full rows.
 */
import type { Rng } from './rng';

export type GridVariant = 'nonogram';
export const GRID_VARIANTS: GridVariant[] = ['nonogram'];

export interface NonogramData {
  variant: 'nonogram';
  /** Run lengths for each row, left to right. */
  rows: number[][];
  /** Run lengths for each column, top to bottom. */
  cols: number[][];
}
export type GridData = NonogramData;

/** The run lengths of a line of 0/1 cells. An empty line is `[0]`, as nonogram clues usually show it. */
export const runsOf = (line: number[]): number[] => {
  const out: number[] = [];
  let n = 0;
  for (const c of line) {
    if (c) n++;
    else if (n) { out.push(n); n = 0; }
  }
  if (n) out.push(n);
  return out.length ? out : [0];
};

/** The runs a clue asks for, without the `[0]` of an empty line. */
const wanted = (clue: number[]) => clue.filter((x) => x > 0);

/** Can this start of a line still be finished into the clue within `len` cells? */
function canContinue(prefix: number[], clue: number[], len: number): boolean {
  const want = wanted(clue);
  const r = wanted(runsOf(prefix));
  const open = prefix.length > 0 && prefix[prefix.length - 1] === 1;
  const done = open ? r.slice(0, -1) : r;
  if (done.length > want.length || done.some((v, i) => v !== want[i])) return false;
  let need = 0;
  let from = done.length;
  if (open) {
    if (from >= want.length || r[r.length - 1] > want[from]) return false;
    need = want[from] - r[r.length - 1];
    from++;
    if (from < want.length) need += 1;
  }
  const rest = want.slice(from);
  need += rest.reduce((sum, x) => sum + x, 0) + Math.max(0, rest.length - 1);
  return prefix.length + need <= len;
}

/** Every 0/1 line of this length whose runs equal the clue. */
function lineOptions(len: number, clue: number[]): number[][] {
  const out: number[][] = [];
  const go = (line: number[]) => {
    if (!canContinue(line, clue, len)) return;
    if (line.length === len) {
      out.push(line);
      return;
    }
    go([...line, 0]);
    go([...line, 1]);
  };
  go([]);
  return out;
}

/** All pictures that fit the clues, counted up to `cap`. */
export function countPictures(rows: number[][], cols: number[][], cap = 2): { count: number; first: number[][] | null } {
  const h = rows.length;
  const w = cols.length;
  const options = rows.map((clue) => lineOptions(w, clue));
  let count = 0;
  let first: number[][] | null = null;
  const picked: number[][] = [];
  const go = (r: number) => {
    if (r === h) {
      // every column was checked while building, and a full column only passes when it matches its clue exactly
      count++;
      if (!first) first = picked.map((row) => [...row]);
      return;
    }
    for (const opt of options[r]) {
      picked.push(opt);
      let ok = true;
      for (let c = 0; c < w && ok; c++) ok = canContinue(picked.map((row) => row[c]), cols[c], h);
      if (ok) go(r + 1);
      picked.pop();
      if (count >= cap) return;
    }
  };
  go(0);
  return { count, first };
}

const encode = (cells: number[][]) => cells.map((r) => r.join('')).join(' ');

/** The picture the clues force, as rows of 1s and 0s, or an empty string if there is not exactly one. */
export function solveGrid(d: GridData): string {
  const { count, first } = countPictures(d.rows, d.cols);
  return count === 1 && first ? encode(first) : '';
}

const clueText = (clue: number[]) => clue.join(' ');

/** The exhibit lines for a nonogram: what the player reads. */
export function gridLines(d: GridData): string[] {
  return [...d.rows.map((c, i) => `Row ${i + 1}: ${clueText(c)}`), ...d.cols.map((c, i) => `Column ${i + 1}: ${clueText(c)}`)];
}

const SIZE = [0, 5, 6, 8, 10];

export function genNonogram(level: number, rng: Rng): { data: GridData; exhibits: { title: string; lines: string[] }[]; question: string } {
  const n = SIZE[level];
  for (;;) {
    const density = 0.5 + rng.next() * 0.2;
    const cells = Array.from({ length: n }, () => Array.from({ length: n }, () => (rng.next() < density ? 1 : 0)));
    const rows = cells.map(runsOf);
    const cols = Array.from({ length: n }, (_, c) => runsOf(cells.map((row) => row[c])));
    // no blank or full lines: they give the picture away and make the clues dull
    if (rows.some((r) => r[0] === 0 || r[0] === n) || cols.some((r) => r[0] === 0 || r[0] === n)) continue;
    const { count } = countPictures(rows, cols);
    if (count !== 1) continue;
    const data: GridData = { variant: 'nonogram', rows, cols };
    return {
      data,
      exhibits: [
        { title: 'Scratched inside the lock plate', lines: gridLines(data).slice(0, n) },
        { title: 'Scratched along the plate’s edge', lines: gridLines(data).slice(n) },
        { title: 'How to read it', lines: [`The plate is ${n} studs by ${n}. Each number is a run of studs side by side, in order, with at least one gap between runs. Studs are 1, gaps are 0.`] },
      ],
      question: 'Shade the studs so every row and column fits. Your finished grid is the code.',
    };
  }
}
