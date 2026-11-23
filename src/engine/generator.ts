import { evalClaim } from './claims';
import { gradePuzzle } from './logic';
import { randomLatin } from './latin';
import { makeRng, type Rng } from './rng';
import { enumerate } from './solver';
import type { Via } from './via';
import type { Cell, Claim, GeneratedPuzzle, Given, Grid, GridType, Statement, Zone } from './types';

export interface SpeakerSpec {
  id: string;
  /** Number of false statements this speaker makes in this puzzle (0 for truthful). */
  lies: number;
}

export interface GenerateOptions {
  size: number;
  type: GridType;
  speakers: SpeakerSpec[];
  /** If true, the player is told a range {k, k+1} instead of the exact count (Chief preset). */
  liarRange?: boolean;
  /** Highest technique allowed (rule book section 5). */
  maxGrade: number;
  /** Lowest technique wanted, for "hard" leads. */
  minGrade?: number;
  /** Max grids the base clues may allow (keeps the statement step tractable for players). */
  maxBase?: number;
  maxStatements?: number;
  /** Ledger grids only: cells shown filled in at the start, next to the zone sums (eases big grids). Default 0. */
  ledgerGivens?: number;
  /** Cells the answer must have. Planted before any clue is built; not shown to the player. */
  anchors?: { cell: Cell; value: number }[];
  /** Link clues quoting earlier answers: true on the answer, said first, and needed to settle it. The answer is redrawn until they hold. */
  planted?: { speaker: string; claim: Claim; via: Via }[];
  seed: number;
}

const MIN_BASE = 2;

function neighbours([r, c]: Cell, n: number): Cell[] {
  const out: Cell[] = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < n - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < n - 1) out.push([r, c + 1]);
  return out;
}

function randomZones(sol: Grid, rng: Rng, bias: number): Zone[] {
  const n = sol.length;
  const owner: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const zones: Cell[][] = [];
  const order: Cell[] = rng.shuffle(Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n] as Cell));
  for (const start of order) {
    if (owner[start[0]][start[1]] >= 0) continue;
    // target size 1..5, larger when bias is high
    const roll = rng.next() + bias;
    const target = roll < 0.25 ? 2 : roll < 0.7 ? 3 : roll < 1.05 ? 4 : 5;
    const cells: Cell[] = [start];
    owner[start[0]][start[1]] = zones.length;
    while (cells.length < target) {
      const frontier = cells.flatMap((c) => neighbours(c, n)).filter(([r, c]) => owner[r][c] < 0);
      if (!frontier.length) break;
      const nx = rng.pick(frontier);
      owner[nx[0]][nx[1]] = zones.length;
      cells.push(nx);
    }
    zones.push(cells);
  }
  // merge singletons into a neighbour zone when possible (singletons give the answer away)
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].length !== 1) continue;
    const [cell] = zones[i];
    const nb = neighbours(cell, n).map(([r, c]) => owner[r][c]).filter((z) => z !== i && zones[z].length < 5);
    if (!nb.length) continue;
    const into = rng.pick(nb);
    zones[into].push(cell);
    owner[cell[0]][cell[1]] = into;
    zones[i] = [];
  }
  return zones
    .filter((z) => z.length)
    .map((cells) => ({ cells: cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]), sum: cells.reduce((s, [r, c]) => s + sol[r][c], 0) }));
}

function baseClues(sol: Grid, type: GridType, rng: Rng, maxBase: number, ledgerGivens = 0) {
  const n = sol.length;
  if (type === 'ledger') {
    let bias = 0.2;
    for (let attempt = 0; attempt < 400; attempt++) {
      const zones = randomZones(sol, rng, bias);
      // only draws from the rng when asked, so existing puzzles keep their seeds
      const givens: Given[] = !ledgerGivens ? [] : rng
        .shuffle(Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n] as Cell))
        .slice(0, ledgerGivens)
        .map((cell) => ({ cell, value: sol[cell[0]][cell[1]] }));
      const all = enumerate({ size: n, zones, givens }, maxBase + 1);
      if (all.length >= MIN_BASE && all.length <= maxBase) return { zones, givens, all };
      bias += all.length > maxBase ? -0.03 : 0.03;
      bias = Math.max(-0.3, Math.min(0.6, bias));
    }
    return null;
  }
  // surveillance: start from all sightings, remove while the grid count stays small
  const givens: Given[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) givens.push({ cell: [r, c], value: sol[r][c] });
  rng.shuffle(givens);
  let current = givens.slice();
  let all = [sol];
  for (const g of givens) {
    const trial = current.filter((x) => x !== g);
    const res = enumerate({ size: n, zones: [], givens: trial }, maxBase + 1);
    if (res.length <= maxBase) { current = trial; all = res; }
  }
  if (all.length < MIN_BASE) return null;
  return { zones: [] as Zone[], givens: current, all };
}

export function randomClaim(sol: Grid, type: GridType, rng: Rng): Claim {
  const n = sol.length;
  const cell = (): Cell => [rng.int(0, n - 1), rng.int(0, n - 1)];
  const other = (a: Cell, sameRow: boolean): Cell => {
    for (;;) {
      const b: Cell = sameRow ? [a[0], rng.int(0, n - 1)] : [rng.int(0, n - 1), a[1]];
      if (b[0] !== a[0] || b[1] !== a[1]) return b;
    }
  };
  const roll = rng.next();
  const a = cell();
  const v = rng.int(1, n);
  if (type === 'ledger') {
    if (roll < 0.3) return { kind: 'compare', a, b: other(a, rng.next() < 0.6), op: rng.pick(['gt', 'lt'] as const) };
    if (roll < 0.5) {
      const b = other(a, rng.next() < 0.5);
      return { kind: 'sum', cells: [a, b], value: sol[a[0]][a[1]] + sol[b[0]][b[1]] + (rng.next() < 0.5 ? 0 : rng.pick([-2, -1, 1, 2])) };
    }
    if (roll < 0.62) return { kind: 'is', cell: a, value: v };
    if (roll < 0.74) return { kind: 'isNot', cell: a, value: v };
    if (roll < 0.87) return { kind: 'atLeast', cell: a, value: rng.int(2, n) };
    return { kind: 'atMost', cell: a, value: rng.int(1, n - 1) };
  }
  if (roll < 0.3) return { kind: 'adjacent', a, b: other(a, true) };
  if (roll < 0.45) return { kind: 'notAdjacent', a, b: other(a, true) };
  if (roll < 0.65) return { kind: 'compare', a, b: other(a, rng.next() < 0.7), op: rng.pick(['gt', 'lt'] as const) };
  if (roll < 0.85) return { kind: 'is', cell: a, value: v };
  return { kind: 'isNot', cell: a, value: v };
}

/**
 * Renames the numbers of a Latin square (still a Latin square, still random) so that "is" link clues hold, instead of
 * redrawing until they do. A clue that can't be fitted this way is left for the caller to reject.
 */
function fitPlanted(sol: Grid, claims: Claim[]) {
  const done: Cell[] = [];
  for (const c of claims) {
    if (c.kind !== 'is') continue;
    const [r, col] = c.cell;
    const have = sol[r][col];
    if (have !== c.value) {
      // swapping two numbers must not break a cell already fitted
      if (done.some(([dr, dc]) => sol[dr][dc] === have || sol[dr][dc] === c.value)) continue;
      for (const row of sol) for (let k = 0; k < row.length; k++) row[k] = row[k] === have ? c.value : row[k] === c.value ? have : row[k];
    }
    done.push(c.cell);
  }
}

function tryGenerate(opts: GenerateOptions, rng: Rng): GeneratedPuzzle | null {
  const n = opts.size;
  const maxBase = opts.maxBase ?? 40;
  const maxStatements = opts.maxStatements ?? 8;
  const sol = randomLatin(n, rng);
  if (opts.planted?.length)
    fitPlanted(sol, [...(opts.anchors ?? []).map((a) => ({ kind: 'is', cell: a.cell, value: a.value }) as Claim), ...opts.planted.map((p) => p.claim)]);
  if (opts.anchors && !opts.anchors.every((a) => sol[a.cell[0]][a.cell[1]] === a.value)) return null;
  if (opts.planted && !opts.planted.every((p) => evalClaim(p.claim, sol))) return null;
  const base = baseClues(sol, opts.type, rng, maxBase, opts.ledgerGivens);
  if (!base) return null;
  const others = base.all.filter((g) => g.some((row, r) => row.some((v, c) => v !== sol[r][c])));

  const k = opts.speakers.reduce((s, sp) => s + sp.lies, 0);
  const allowed = opts.liarRange && k > 0 ? [k, k + 1] : [k];

  const pool: Claim[] = [];
  for (let i = 0; i < 400; i++) pool.push(randomClaim(sol, opts.type, rng));
  const trueOnSol = pool.filter((c) => evalClaim(c, sol));
  const falseOnSol = pool.filter((c) => !evalClaim(c, sol));

  const statements: Statement[] = [];
  const truth: boolean[] = [];
  const falseCount = new Map<Grid, number>(others.map((g) => [g, 0]));
  const add = (speaker: string, claim: Claim, t: boolean, via?: Via) => {
    statements.push(via ? { speaker, claim, via } : { speaker, claim });
    truth.push(t);
    for (const g of others) if (!evalClaim(claim, g)) falseCount.set(g, falseCount.get(g)! + 1);
  };

  for (const p of opts.planted ?? []) add(p.speaker, p.claim, true, p.via);
  // a link that rules out no other grid is not needed: try another answer
  if ((opts.planted ?? []).some((p) => others.every((g) => evalClaim(p.claim, g)))) return null;

  // lies: prefer ones that are true on many alternative grids, so they look plausible
  for (const sp of opts.speakers)
    for (let i = 0; i < sp.lies; i++) {
      const scored = falseOnSol
        .filter((c) => !statements.some((s) => JSON.stringify(s.claim) === JSON.stringify(c)))
        .map((c) => ({ c, score: others.filter((g) => evalClaim(c, g)).length + rng.next() }));
      scored.sort((x, y) => y.score - x.score);
      /* v8 ignore next -- 400 sampled claims always include false ones */
      if (!scored.length) return null;
      add(sp.id, scored[0].c, false);
    }

  const bad = () => others.filter((g) => allowed.includes(falseCount.get(g)!)).length;
  const truthful = opts.speakers.filter((s) => s.lies === 0);
  const speakersInOrder = truthful.length ? truthful : opts.speakers;
  let turn = 0;
  while (bad() > 0) {
    if (statements.length >= maxStatements) return null;
    let best: Claim | null = null;
    let bestBad = Infinity;
    for (const c of trueOnSol) {
      if (statements.some((s) => s.claim === c)) continue;
      let b = 0;
      for (const g of others) {
        const fc = falseCount.get(g)! + (evalClaim(c, g) ? 0 : 1);
        if (allowed.includes(fc)) b++;
      }
      if (b < bestBad) { bestBad = b; best = c; }
    }
    if (!best || bestBad >= bad()) return null;
    add(speakersInOrder[turn++ % speakersInOrder.length].id, best, true);
  }
  // every speaker should say something
  for (const sp of opts.speakers) {
    if (statements.some((s) => s.speaker === sp.id)) continue;
    const c = trueOnSol.find((cl) => !statements.some((s) => s.claim === cl) && others.every((g) => !allowed.includes(falseCount.get(g)! + (evalClaim(cl, g) ? 0 : 1))));
    /* v8 ignore next -- the draw above always holds a spare true claim for a silent speaker */
    if (!c) return null;
    add(sp.id, c, true);
  }
  if (statements.length > maxStatements) return null;

  // shuffle statement order so lies aren't always first
  const order = rng.shuffle(statements.map((_, i) => i));
  const spec = {
    size: n,
    type: opts.type,
    zones: base.zones,
    givens: base.givens,
    statements: order.map((i) => statements[i]),
    liarCounts: allowed,
  };
  const t = order.map((i) => truth[i]);
  const grade = gradePuzzle(spec, t);
  if (grade === 0 || grade > opts.maxGrade || grade < (opts.minGrade ?? 1)) return null;
  return { ...spec, solution: sol, truth: t, grade, baseSolutions: base.all.length, seed: 0 };
}

export function generatePuzzle(opts: GenerateOptions, maxAttempts = 300): GeneratedPuzzle {
  for (let a = 0; a < maxAttempts; a++) {
    const seed = (opts.seed * 7919 + a * 104729) >>> 0;
    const p = tryGenerate(opts, makeRng(seed));
    if (p) return { ...p, seed };
  }
  throw new Error(`Could not generate a ${opts.size}x${opts.size} ${opts.type} puzzle within ${maxAttempts} attempts`);
}

/** Independent check used by tests and the validator: exactly one grid fits with an allowed number of lies. */
export function verifyUnique(p: GeneratedPuzzle): { ok: boolean; reason?: string } {
  const all = enumerate({ size: p.size, zones: p.zones, givens: p.givens }, 10_000);
  if (all.length < MIN_BASE) return { ok: false, reason: 'base clues alone already give one grid' };
  const fits = all.filter((g) => p.liarCounts.includes(p.statements.filter((s) => !evalClaim(s.claim, g)).length));
  if (fits.length !== 1) return { ok: false, reason: `${fits.length} grids fit the statements` };
  const s = fits[0];
  if (s.some((row, r) => row.some((v, c) => v !== p.solution[r][c]))) return { ok: false, reason: 'unique grid is not the stored solution' };
  const t = p.statements.map((st) => evalClaim(st.claim, s));
  if (t.some((v, i) => v !== p.truth[i])) return { ok: false, reason: 'stored truth does not match the solution' };
  return { ok: true };
}
