/**
 * Stakeout puzzles: work out where a watcher stood in every district of a town map.
 *
 * DESIGN NOTE
 * What it is: an N x N map cut into N coloured districts. The investigation put exactly one watcher (a patrol,
 * a camera, a stakeout team) in each district. Two watchers never shared a street (no two in a row or a column)
 * and never stood next to each other (no two in touching squares, corners count). The map alone usually leaves a
 * few layouts; informants then say where the watchers stood, some of them lie, and the player marks each
 * statement True or Lie, as in the other leads.
 *
 * Sizes by rank (the layouts the rules allow are few, so a bigger map is what makes a harder puzzle):
 * Junior 5x5, Detective 6x6, Inspector 7x7, Chief 8x8.
 *
 * Why it has exactly one answer: the generator draws the answer first, grows the districts out of its squares (so
 * every district holds its watcher), keeps the map only if it allows a few layouts, then adds statements the same
 * way the cipher does: plausible lies first, then the true statements that rule out the most wrong layouts, until
 * only the answer fits the allowed number of lies. `verifyStakeout` does not trust the generator: it lists every
 * layout the rules allow and checks that exactly one fits, and that it is the stored one.
 *
 * Grades: 1 = a district's row, column or square ("the Ice house watcher is in row 3"), 2 = comparing two
 * districts ("further up the map than"), 3 = distance between two districts ("three rows apart").
 *
 * An answer is `cols`: cols[r] is the column of the watcher in row r (0-based). One watcher per row follows from the
 * rules, so this is the whole layout. A player's work is `placed`: placed[r] is the column + 1 they chose in row r,
 * or 0 for none.
 */
import { makeRng, type Rng } from './rng';
import type { SpeakerSpec } from './generator';
import type { Via } from './via';

/** z, a and b are districts (0-based); rows and columns in a claim's `value` are numbered from 1. */
export type StakeClaim =
  /** The watcher of district z stood on the square (r, c). */
  | { kind: 'at'; z: number; r: number; c: number }
  /** The watcher of district z did not stand on the square (r, c). */
  | { kind: 'notAt'; z: number; r: number; c: number }
  /** The watcher of district z stood in row `value` (1 = top). */
  | { kind: 'row'; z: number; value: number }
  /** The watcher of district z stood in column `value` (1 = left). */
  | { kind: 'col'; z: number; value: number }
  /** a's watcher stood further up the map (in a smaller row) than b's. */
  | { kind: 'above'; a: number; b: number }
  /** a's watcher stood further left (in a smaller column) than b's. */
  | { kind: 'left'; a: number; b: number }
  /** a's and b's watchers stood `gap` rows (or columns) apart. */
  | { kind: 'gap'; axis: 'row' | 'col'; a: number; b: number; gap: number };

export interface StakeGiven {
  r: number;
  c: number;
}

export interface StakeStatement {
  speaker: string;
  claim: StakeClaim;
  /** Set when the clue quotes an earlier puzzle's answer (src/engine/via.ts). */
  via?: Via;
}

export interface StakeoutPuzzle {
  type: 'stakeout';
  /** The map is size x size, with size districts. */
  size: number;
  /** regions[r][c] = the district (0..size-1) of the square. */
  regions: number[][];
  /** Watchers shown in place at the start. */
  givens: StakeGiven[];
  statements: StakeStatement[];
  liarCounts: number[];
  /** cols[r] = column of the watcher in row r. */
  cols: number[];
  truth: boolean[];
  /** 1 = a row, column or square, 2 = comparing districts, 3 = a distance. */
  grade: number;
  /** How many layouts the map alone allows. */
  baseSolutions: number;
  seed: number;
}

/** Where each district's watcher stood, as [row, column]. */
export function whereOf(regions: number[][], cols: number[]): [number, number][] {
  const out: [number, number][] = [];
  cols.forEach((c, r) => (out[regions[r][c]] = [r, c]));
  return out;
}

export function evalStake(c: StakeClaim, regions: number[][], cols: number[]): boolean {
  const w = whereOf(regions, cols);
  switch (c.kind) {
    case 'at':
      return w[c.z][0] === c.r && w[c.z][1] === c.c;
    case 'notAt':
      return !(w[c.z][0] === c.r && w[c.z][1] === c.c);
    case 'row':
      return w[c.z][0] + 1 === c.value;
    case 'col':
      return w[c.z][1] + 1 === c.value;
    case 'above':
      return w[c.a][0] < w[c.b][0];
    case 'left':
      return w[c.a][1] < w[c.b][1];
    case 'gap': {
      const i = c.axis === 'row' ? 0 : 1;
      return Math.abs(w[c.a][i] - w[c.b][i]) === c.gap;
    }
  }
}

export const claimGrade = (c: StakeClaim) => (c.kind === 'above' || c.kind === 'left' ? 2 : c.kind === 'gap' ? 3 : 1);

/** The districts a claim is about. */
export const districtsOf = (c: StakeClaim): number[] => (c.kind === 'above' || c.kind === 'left' || c.kind === 'gap' ? [c.a, c.b] : [c.z]);

/** Every layout the rules allow on a map (one watcher per district, none in a shared row or column, none touching). */
export function allPlacements(regions: number[][]): number[][] {
  const n = regions.length;
  const out: number[][] = [];
  const cols: number[] = [];
  const usedCol = Array(n).fill(false);
  const usedZone = Array(n).fill(false);
  const go = (r: number) => {
    if (r === n) return void out.push(cols.slice());
    for (let c = 0; c < n; c++) {
      const z = regions[r][c];
      if (usedCol[c] || usedZone[z]) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) <= 1) continue;
      usedCol[c] = usedZone[z] = true;
      cols.push(c);
      go(r + 1);
      cols.pop();
      usedCol[c] = usedZone[z] = false;
    }
  };
  go(0);
  return out;
}

const sameCols = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** Layouts that keep the givens and have an allowed number of false statements. */
export function fittingPlacements(p: Pick<StakeoutPuzzle, 'regions' | 'givens' | 'liarCounts'>, claims: StakeClaim[]): number[][] {
  return allPlacements(p.regions).filter((cols) => p.givens.every((g) => cols[g.r] === g.c) && p.liarCounts.includes(claims.filter((cl) => !evalStake(cl, p.regions, cols)).length));
}

/** A random layout the rules allow, ignoring the districts. */
export function randomCols(n: number, rng: Rng): number[] {
  const cols: number[] = [];
  const used = Array(n).fill(false);
  const go = (r: number): boolean => {
    if (r === n) return true;
    for (const c of rng.shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
      used[c] = true;
      cols.push(c);
      if (go(r + 1)) return true;
      cols.pop();
      used[c] = false;
    }
    return false;
  };
  go(0);
  return cols;
}

/**
 * Grows n connected districts out of the answer's squares, each at least 2 squares big (a district of one square
 * would give its watcher away). District numbers are shuffled so the row order of the answer tells nothing.
 */
export function growRegions(cols: number[], rng: Rng): number[][] | null {
  const n = cols.length;
  const ids = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const owner: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const size = Array(n).fill(1);
  cols.forEach((c, r) => (owner[r][c] = ids[r]));
  let free = n * n - n;
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (free > 0) {
    // every square next to a district that is still free, with the district that could take it
    const frontier: { r: number; c: number; z: number }[] = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (owner[r][c] < 0) continue;
        for (const [dr, dc] of dirs) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n && owner[rr][cc] < 0) frontier.push({ r: rr, c: cc, z: owner[r][c] });
        }
      }
    // the smaller of two random picks grows: districts end up similar in size, but not the same
    const a = rng.pick(frontier);
    const b = rng.pick(frontier);
    const f = size[a.z] <= size[b.z] ? a : b;
    owner[f.r][f.c] = f.z;
    size[f.z]++;
    free--;
  }
  return size.some((s) => s < 2) ? null : owner;
}

export function randomStakeClaim(regions: number[][], cols: number[], rng: Rng, maxGrade: number): StakeClaim {
  const n = cols.length;
  const w = whereOf(regions, cols);
  const z = rng.int(0, n - 1);
  const other = () => {
    for (;;) {
      const b = rng.int(0, n - 1);
      if (b !== z) return b;
    }
  };
  const roll = rng.next() * (maxGrade >= 3 ? 1 : maxGrade === 2 ? 0.75 : 0.5);
  if (roll < 0.08) return { kind: 'at', z, r: rng.int(0, n - 1), c: rng.int(0, n - 1) };
  if (roll < 0.16) return { kind: 'notAt', z, r: w[z][0], c: w[z][1] };
  if (roll < 0.33) return { kind: 'row', z, value: rng.int(1, n) };
  if (roll < 0.5) return { kind: 'col', z, value: rng.int(1, n) };
  if (roll < 0.62) return { kind: 'above', a: z, b: other() };
  if (roll < 0.75) return { kind: 'left', a: z, b: other() };
  const b = other();
  const axis = rng.pick(['row', 'col'] as const);
  const i = axis === 'row' ? 0 : 1;
  // gaps near the true one look plausible
  return { kind: 'gap', axis, a: z, b, gap: Math.max(1, Math.min(n - 1, Math.abs(w[z][i] - w[b][i]) + rng.pick([0, 0, -1, 1]))) };
}

export interface StakeoutOptions {
  size: number;
  speakers: SpeakerSpec[];
  liarRange?: boolean;
  maxGrade: number;
  minGrade?: number;
  maxStatements?: number;
  /** The map alone must allow at least this many layouts, so the statements are needed. */
  minBase?: number;
  /** ... and at most this many, so the statements are enough. */
  maxBase?: number;
  /** Watchers shown in place at the start. */
  givens?: number;
  /** Link clues quoting earlier answers: true on the answer, said first, and needed to settle it. The answer is redrawn until they hold. */
  planted?: { speaker: string; claim: StakeClaim; via: Via }[];
  seed: number;
}

const key = (c: StakeClaim) => JSON.stringify(c);

function tryStakeout(opts: StakeoutOptions, rng: Rng): StakeoutPuzzle | null {
  const n = opts.size;
  const maxStatements = opts.maxStatements ?? n + 4;
  const cols = randomCols(n, rng);
  const regions = growRegions(cols, rng);
  if (!regions) return null;
  if (opts.planted && !opts.planted.every((p) => evalStake(p.claim, regions, cols))) return null;
  const givens: StakeGiven[] = rng
    .shuffle(Array.from({ length: n }, (_, r) => r))
    .slice(0, opts.givens ?? 0)
    .map((r) => ({ r, c: cols[r] }));
  const all = allPlacements(regions);
  if (all.length < (opts.minBase ?? 2) || all.length > (opts.maxBase ?? Infinity)) return null;
  // wrong layouts that could still fit, with how many statements are false on each
  let alive = all.filter((o) => !sameCols(o, cols) && givens.every((g) => o[g.r] === g.c));
  let falseCount = alive.map(() => 0);
  const k = opts.speakers.reduce((s, sp) => s + sp.lies, 0);
  const allowed = opts.liarRange && k > 0 ? [k, k + 1] : [k];
  const most = Math.max(...allowed);
  const ev = (c: StakeClaim, o: number[]) => evalStake(c, regions, o);

  const pool = new Map<string, StakeClaim>();
  for (let i = 0; i < 300; i++) {
    const c = randomStakeClaim(regions, cols, rng, opts.maxGrade);
    // a claim about a district whose watcher is already shown tells the player nothing
    if (districtsOf(c).length === 1 && givens.some((g) => regions[g.r][g.c] === (c as { z: number }).z)) continue;
    pool.set(key(c), c);
  }
  const claims = [...pool.values()];
  const trueOnCols = claims.filter((c) => ev(c, cols));
  const falseOnCols = claims.filter((c) => !ev(c, cols));

  const statements: StakeStatement[] = [];
  const truth: boolean[] = [];
  const used = new Set<string>();
  const add = (speaker: string, claim: StakeClaim, t: boolean, via?: Via) => {
    statements.push(via ? { speaker, claim, via } : { speaker, claim });
    truth.push(t);
    used.add(key(claim));
    falseCount = falseCount.map((f, i) => f + (ev(claim, alive[i]) ? 0 : 1));
    // a layout with more false statements than the most lies allowed is out for good
    const keep = falseCount.map((f) => f <= most);
    alive = alive.filter((_, i) => keep[i]);
    falseCount = falseCount.filter((_, i) => keep[i]);
  };

  const wrong = alive.slice();
  for (const p of opts.planted ?? []) add(p.speaker, p.claim, true, p.via);
  // a link that rules out no wrong layout is not needed: try another answer
  if ((opts.planted ?? []).some((p) => wrong.every((o) => ev(p.claim, o)))) return null;

  // lies that hold on many wrong layouts, so they sound right
  for (const sp of opts.speakers)
    for (let i = 0; i < sp.lies; i++) {
      const scored = falseOnCols
        .filter((c) => !used.has(key(c)))
        .map((c) => ({ c, score: alive.filter((o) => ev(c, o)).length + rng.next() }))
        .sort((x, y) => y.score - x.score);
      /* v8 ignore next -- 300 sampled claims always include false ones */
      if (!scored.length) return null;
      add(sp.id, scored[0].c, false);
    }

  // add true statements that rule out the most wrong layouts until every wrong layout is out of the allowed lie count
  const badNow = () => alive.reduce((b, _, i) => b + (allowed.includes(falseCount[i]) ? 1 : 0), 0);
  const killed = (c: StakeClaim) => alive.reduce((s, o, i) => s + (falseCount[i] === most && !ev(c, o) ? 1 : 0), 0);
  const pressed = (c: StakeClaim) => alive.reduce((s, o) => s + (ev(c, o) ? 0 : 1), 0);
  const truthful = opts.speakers.filter((s) => s.lies === 0);
  const speakersInOrder = truthful.length ? truthful : opts.speakers;
  let turn = 0;
  while (badNow() > 0) {
    if (statements.length >= maxStatements) return null;
    // "the Ice house watcher stood on this square" gives a district away, so at most one true one per puzzle
    const atUsed = statements.some((st, i) => truth[i] && st.claim.kind === 'at');
    const scored = trueOnCols
      .filter((c) => !used.has(key(c)) && !(atUsed && c.kind === 'at'))
      .map((c) => ({ c, score: killed(c) * 1000 + pressed(c) }))
      .sort((x, y) => y.score - x.score);
    /* v8 ignore next -- 300 sampled claims leave plenty of true ones */
    if (!scored.length) return null;
    const best = scored.filter((s) => s.score >= scored[0].score * 0.9).slice(0, 4);
    add(speakersInOrder[turn++ % speakersInOrder.length].id, rng.pick(best).c, true);
  }
  // everyone says something; a spare true claim must not bring a wrong layout back to an allowed lie count
  for (const sp of opts.speakers) {
    if (statements.some((s) => s.speaker === sp.id)) continue;
    const c = trueOnCols.find((cl) => !used.has(key(cl)) && alive.every((o, i) => !allowed.includes(falseCount[i] + (ev(cl, o) ? 0 : 1))));
    /* v8 ignore next -- a spare true claim is always left for a silent speaker */
    if (!c) return null;
    add(sp.id, c, true);
  }
  if (statements.length > maxStatements) return null;

  const order = rng.shuffle(statements.map((_, i) => i));
  const st = order.map((i) => statements[i]);
  const grade = Math.max(...st.map((s) => claimGrade(s.claim)));
  // claims are only drawn up to maxGrade, so the grade can't be too high; it can be too low
  if (grade < (opts.minGrade ?? 1)) return null;
  return { type: 'stakeout', size: n, regions, givens, statements: st, liarCounts: allowed, cols, truth: order.map((i) => truth[i]), grade, baseSolutions: all.length, seed: 0 };
}

export function generateStakeout(opts: StakeoutOptions, maxAttempts = 400): StakeoutPuzzle {
  for (let a = 0; a < maxAttempts; a++) {
    const seed = (opts.seed * 7919 + a * 104729) >>> 0;
    const p = tryStakeout(opts, makeRng(seed));
    if (p) return { ...p, seed };
  }
  throw new Error(`Could not generate a ${opts.size}x${opts.size} stakeout within ${maxAttempts} attempts`);
}

/** Every district is one connected piece, each holds the answer's watcher, and the answer follows the rules. */
export function checkMap(p: Pick<StakeoutPuzzle, 'size' | 'regions' | 'cols'>): string | null {
  const n = p.size;
  if (p.regions.length !== n || p.regions.some((row) => row.length !== n)) return `the map is not ${n}x${n}`;
  if (p.regions.some((row) => row.some((z) => !Number.isInteger(z) || z < 0 || z >= n))) return 'a square is in no district';
  for (let z = 0; z < n; z++) {
    const cells: [number, number][] = [];
    p.regions.forEach((row, r) => row.forEach((x, c) => x === z && cells.push([r, c])));
    if (!cells.length) return `district ${z + 1} has no squares`;
    const seen = new Set([cells[0].join()]);
    const todo = [cells[0]];
    while (todo.length) {
      const [r, c] = todo.pop()!;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const next: [number, number] = [r + dr, c + dc];
        if (p.regions[next[0]]?.[next[1]] === z && !seen.has(next.join())) {
          seen.add(next.join());
          todo.push(next);
        }
      }
    }
    if (seen.size !== cells.length) return `district ${z + 1} is in pieces`;
  }
  if (!allPlacements(p.regions).some((o) => sameCols(o, p.cols))) return 'the answer breaks the rules of the map';
  return null;
}

/** Independent check used by tests and the validator: exactly one layout fits, and it is the stored one. */
export function verifyStakeout(p: StakeoutPuzzle): { ok: boolean; reason?: string } {
  const bad = checkMap(p);
  if (bad) return { ok: false, reason: bad };
  const fits = fittingPlacements(p, p.statements.map((s) => s.claim));
  if (fits.length !== 1) return { ok: false, reason: `${fits.length} layouts fit the statements` };
  if (!sameCols(fits[0], p.cols)) return { ok: false, reason: 'unique layout is not the stored layout' };
  if (p.statements.some((s, i) => evalStake(s.claim, p.regions, p.cols) !== p.truth[i])) return { ok: false, reason: 'stored truth does not match the layout' };
  return { ok: true };
}

/** First row where the player put the watcher in the wrong column, or -1. `placed[r]` is the column + 1, or 0 for none. */
export const wrongSpot = (p: StakeoutPuzzle, placed: number[]) => placed.findIndex((v, r) => v !== 0 && v - 1 !== p.cols[r]);

/** The rows (0-based) whose watchers break a rule against another placed watcher: same column, same district, or touching. */
export function clashes(p: Pick<StakeoutPuzzle, 'regions'>, placed: number[]): Set<number> {
  const out = new Set<number>();
  placed.forEach((v, r) => {
    if (!v) return;
    placed.forEach((w, s) => {
      if (s <= r || !w) return;
      if (v === w || Math.abs(v - w) <= 1 && s - r === 1 || p.regions[r][v - 1] === p.regions[s][w - 1]) {
        out.add(r);
        out.add(s);
      }
    });
  });
  return out;
}

/**
 * The partner's nudge: an empty row and a true statement about its district that helps. Prefers a statement whose
 * other district is already placed, then the simplest kind. Null once every row is filled.
 */
export function stakeoutStep(p: StakeoutPuzzle, placed: number[]): { row: number; statement: number } | null {
  const w = whereOf(p.regions, p.cols);
  let best: { row: number; statement: number; score: number } | null = null;
  p.statements.forEach((s, i) => {
    if (!p.truth[i]) return;
    const zs = districtsOf(s.claim);
    for (const z of zs) {
      const row = w[z][0];
      if (placed[row]) continue;
      const anchored = zs.every((x) => x === z || placed[w[x][0]]);
      const score = (anchored ? 0 : 10) + claimGrade(s.claim);
      if (!best || score < best.score) best = { row, statement: i, score };
    }
  });
  if (!best) return null;
  const { row, statement } = best;
  return { row, statement };
}

/** A random true claim the player doesn't have yet (the informant's paid tip). */
export function freshTrueStakeClaim(p: StakeoutPuzzle, have: StakeClaim[], rng: Rng, tries = 500): StakeClaim | null {
  const known = new Set(have.map(key));
  for (let i = 0; i < tries; i++) {
    const c = randomStakeClaim(p.regions, p.cols, rng, 3);
    if (evalStake(c, p.regions, p.cols) && !known.has(key(c))) return c;
  }
  return null;
}
