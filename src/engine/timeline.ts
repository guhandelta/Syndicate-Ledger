/**
 * Timeline puzzles (rule book section 2b): put N moments of the night in order. Each moment happened at a
 * different one of N times, so an answer is an order: order[m] is the time slot (1..N) of moment m.
 * Witnesses say when things happened relative to each other; some of them lie, exactly as in the grids.
 */
import { makeRng, type Rng } from './rng';
import type { SpeakerSpec } from './generator';

export type TimeClaim =
  /** Moment m happened at slot s. */
  | { kind: 'at'; m: number; slot: number }
  | { kind: 'notAt'; m: number; slot: number }
  /** a happened before b (any time earlier). */
  | { kind: 'before'; a: number; b: number }
  /** a happened right before b, nothing in between. */
  | { kind: 'justBefore'; a: number; b: number }
  /** a and b were exactly `gap` time slots apart, either way round. */
  | { kind: 'apart'; a: number; b: number; gap: number };

export interface TimeGiven {
  m: number;
  slot: number;
}

export interface TimeStatement {
  speaker: string;
  claim: TimeClaim;
}

export interface TimelinePuzzle {
  type: 'timeline';
  /** Number of moments, and of time slots. */
  size: number;
  givens: TimeGiven[];
  statements: TimeStatement[];
  liarCounts: number[];
  /** A floorplan (map puzzle): pairs of moments (rooms) joined by a corridor. The walk visits one room per slot, so rooms in neighbouring slots must be joined. Absent for a plain timeline. */
  edges?: [number, number][];
  /** solution[m] = slot of moment m, 1..size. */
  solution: number[];
  truth: boolean[];
  /** 1 = only "at"/"not at", 2 = "before" needed, 3 = "right before" or "apart" needed. */
  grade: number;
  seed: number;
}

export function evalTime(c: TimeClaim, order: number[]): boolean {
  switch (c.kind) {
    case 'at':
      return order[c.m] === c.slot;
    case 'notAt':
      return order[c.m] !== c.slot;
    case 'before':
      return order[c.a] < order[c.b];
    case 'justBefore':
      return order[c.a] + 1 === order[c.b];
    case 'apart':
      return Math.abs(order[c.a] - order[c.b]) === c.gap;
  }
}

export const claimGrade = (c: TimeClaim) => (c.kind === 'at' || c.kind === 'notAt' ? 1 : c.kind === 'before' ? 2 : 3);

const permCache = new Map<number, number[][]>();
/** Every order of n moments (n <= 7 gives 5040). */
export function allOrders(n: number): number[][] {
  const hit = permCache.get(n);
  if (hit) return hit;
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Set<number>();
  const go = () => {
    if (cur.length === n) return void out.push(cur.slice());
    for (let s = 1; s <= n; s++) {
      if (used.has(s)) continue;
      used.add(s);
      cur.push(s);
      go();
      cur.pop();
      used.delete(s);
    }
  };
  go();
  permCache.set(n, out);
  return out;
}

/** True when the order walks along corridors only: the rooms in neighbouring slots are joined. */
export function isWalk(order: number[], edges: [number, number][]): boolean {
  const roomAt: number[] = [];
  order.forEach((slot, m) => (roomAt[slot] = m));
  const joined = new Set(edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)));
  for (let s = 1; s < roomAt.length - 1; s++) {
    const a = roomAt[s];
    const b = roomAt[s + 1];
    if (!joined.has(a < b ? `${a},${b}` : `${b},${a}`)) return false;
  }
  return true;
}

/** Every order the puzzle allows before any statement is heard: all orders, or only the walks of a floorplan. */
export const candidateOrders = (n: number, edges?: [number, number][]) => (edges ? allOrders(n).filter((o) => isWalk(o, edges)) : allOrders(n));

const sameOrder = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** Orders that keep the givens and have an allowed number of false statements. */
export function fittingOrders(p: Pick<TimelinePuzzle, 'size' | 'givens' | 'liarCounts' | 'edges'>, claims: TimeClaim[]): number[][] {
  return candidateOrders(p.size, p.edges).filter(
    (o) => p.givens.every((g) => o[g.m] === g.slot) && p.liarCounts.includes(claims.filter((c) => !evalTime(c, o)).length),
  );
}

export function randomTimeClaim(sol: number[], rng: Rng, maxGrade: number): TimeClaim {
  const n = sol.length;
  const m = rng.int(0, n - 1);
  const other = () => {
    for (;;) {
      const b = rng.int(0, n - 1);
      if (b !== m) return b;
    }
  };
  const roll = rng.next() * (maxGrade >= 3 ? 1 : maxGrade === 2 ? 0.7 : 0.22);
  if (roll < 0.12) return { kind: 'at', m, slot: rng.int(1, n) };
  if (roll < 0.22) return { kind: 'notAt', m, slot: rng.int(1, n) };
  if (roll < 0.7) return { kind: 'before', a: m, b: other() };
  const b = other();
  if (roll < 0.85) return { kind: 'justBefore', a: m, b };
  // gaps near the true one look plausible
  return { kind: 'apart', a: m, b, gap: Math.max(1, Math.min(n - 1, Math.abs(sol[m] - sol[b]) + rng.pick([0, 0, -1, 1]))) };
}

export interface TimelineOptions {
  size: number;
  speakers: SpeakerSpec[];
  liarRange?: boolean;
  maxGrade: number;
  minGrade?: number;
  maxStatements?: number;
  /** Moments shown in place at the start. */
  givens?: number;
  /** Map puzzle: extra corridors beyond the walk itself (0 = none, a plain timeline). More corridors, more wrong walks. */
  extraCorridors?: number;
  /** Fewest orders (the answer included) that fit before the statements are heard, so it is never trivial. */
  minAlternatives?: number;
  seed: number;
}

const key = (c: TimeClaim) => JSON.stringify(c);

/** The corridors of a map: the walk itself (rooms in slot order), plus some random extras. Undefined for a plain timeline. */
function floorplan(sol: number[], extra: number | undefined, rng: Rng): [number, number][] | undefined {
  if (!extra) return undefined;
  const n = sol.length;
  const roomAt: number[] = [];
  sol.forEach((slot, m) => (roomAt[slot] = m));
  const edges: [number, number][] = [];
  const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let s = 1; s < n; s++) edges.push([roomAt[s], roomAt[s + 1]]);
  const room = () => rng.int(0, n - 1);
  for (let tries = 0, added = 0; added < extra && tries < 200; tries++) {
    const a = room();
    const b = room();
    if (a === b || has(a, b)) continue;
    edges.push([Math.min(a, b), Math.max(a, b)]);
    added++;
  }
  return edges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

function tryTimeline(opts: TimelineOptions, rng: Rng): TimelinePuzzle | null {
  const n = opts.size;
  const maxStatements = opts.maxStatements ?? n + 3;
  const sol = rng.shuffle(Array.from({ length: n }, (_, i) => i + 1));
  const givens: TimeGiven[] = rng
    .shuffle(Array.from({ length: n }, (_, m) => m))
    .slice(0, opts.givens ?? 0)
    .map((m) => ({ m, slot: sol[m] }));
  const edges = floorplan(sol, opts.extraCorridors, rng);
  const others = candidateOrders(n, edges).filter((o) => !sameOrder(o, sol) && givens.every((g) => o[g.m] === g.slot));
  if (others.length + 1 < (opts.minAlternatives ?? 0)) return null;
  const k = opts.speakers.reduce((s, sp) => s + sp.lies, 0);
  const allowed = opts.liarRange && k > 0 ? [k, k + 1] : [k];

  const pool = new Map<string, TimeClaim>();
  for (let i = 0; i < 600; i++) {
    const c = randomTimeClaim(sol, rng, opts.maxGrade);
    // a claim about a given moment's own time tells the player nothing
    if ((c.kind === 'at' || c.kind === 'notAt') && givens.some((g) => g.m === c.m)) continue;
    pool.set(key(c), c);
  }
  const claims = [...pool.values()];
  const trueOnSol = claims.filter((c) => evalTime(c, sol));
  const falseOnSol = claims.filter((c) => !evalTime(c, sol));

  const statements: TimeStatement[] = [];
  const truth: boolean[] = [];
  const falseCount = others.map(() => 0);
  const used = new Set<string>();
  const add = (speaker: string, claim: TimeClaim, t: boolean) => {
    statements.push({ speaker, claim });
    truth.push(t);
    used.add(key(claim));
    others.forEach((o, i) => {
      if (!evalTime(claim, o)) falseCount[i]++;
    });
  };

  // lies that hold on many other orders, so they sound right
  for (const sp of opts.speakers)
    for (let i = 0; i < sp.lies; i++) {
      const scored = falseOnSol
        .filter((c) => !used.has(key(c)))
        .map((c) => ({ c, score: others.filter((o) => evalTime(c, o)).length + rng.next() }))
        .sort((x, y) => y.score - x.score);
      /* v8 ignore next -- 600 sampled claims always include false ones */
      if (!scored.length) return null;
      add(sp.id, scored[0].c, false);
    }

  // an order is ruled out for good once more statements are false on it than the most lies allowed
  const most = Math.max(...allowed);
  const badNow = () => others.reduce((b, _, i) => b + (allowed.includes(falseCount[i]) ? 1 : 0), 0);
  const killed = (c: TimeClaim) => others.reduce((k, o, i) => k + (falseCount[i] === most && !evalTime(c, o) ? 1 : 0), 0);
  const pressed = (c: TimeClaim) => others.reduce((k, o, i) => k + (falseCount[i] <= most && !evalTime(c, o) ? 1 : 0), 0);
  const truthful = opts.speakers.filter((s) => s.lies === 0);
  const speakersInOrder = truthful.length ? truthful : opts.speakers;
  let turn = 0;
  while (badNow() > 0) {
    if (statements.length >= maxStatements) return null;
    // the claims that rule out the most orders (then push hardest on the rest), picked among at random
    // "X happened at 9" gives a moment away, so at most one true one per puzzle
    const atUsed = statements.some((st, i) => truth[i] && st.claim.kind === 'at');
    const scored = trueOnSol
      .filter((c) => !used.has(key(c)) && !(atUsed && c.kind === 'at'))
      .map((c) => ({ c, score: killed(c) * 1000 + pressed(c) }))
      .sort((x, y) => y.score - x.score);
    /* v8 ignore next -- 600 sampled claims leave plenty of true ones */
    if (!scored.length) return null;
    const best = scored.filter((s) => s.score >= scored[0].score * 0.9).slice(0, 4);
    add(speakersInOrder[turn++ % speakersInOrder.length].id, rng.pick(best).c, true);
  }
  // everyone says something
  for (const sp of opts.speakers) {
    if (statements.some((s) => s.speaker === sp.id)) continue;
    // a spare true claim must not make some other order fit the lie count (a false claim lifts an order from too few lies to just enough)
    const c = trueOnSol.find((cl) => !used.has(key(cl)) && others.every((o, i) => !allowed.includes(falseCount[i] + (evalTime(cl, o) ? 0 : 1))));
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
  return { type: 'timeline', size: n, givens, ...(edges ? { edges } : {}), statements: st, liarCounts: allowed, solution: sol, truth: order.map((i) => truth[i]), grade, seed: 0 };
}

export function generateTimeline(opts: TimelineOptions, maxAttempts = 400): TimelinePuzzle {
  for (let a = 0; a < maxAttempts; a++) {
    const seed = (opts.seed * 7919 + a * 104729) >>> 0;
    const p = tryTimeline(opts, makeRng(seed));
    if (p) return { ...p, seed };
  }
  throw new Error(`Could not generate a ${opts.size}-moment timeline within ${maxAttempts} attempts`);
}

/** Independent check used by tests and the validator: exactly one order fits, and it is the stored one. */
export function verifyTimeline(p: TimelinePuzzle): { ok: boolean; reason?: string } {
  const fits = fittingOrders(p, p.statements.map((s) => s.claim));
  if (fits.length !== 1) return { ok: false, reason: `${fits.length} orders fit the statements` };
  if (!sameOrder(fits[0], p.solution)) return { ok: false, reason: 'unique order is not the stored solution' };
  if (p.statements.some((s, i) => evalTime(s.claim, p.solution) !== p.truth[i])) return { ok: false, reason: 'stored truth does not match the solution' };
  return { ok: true };
}

/** The moments a claim is about. */
export const momentsOf = (c: TimeClaim) => (c.kind === 'at' || c.kind === 'notAt' ? [c.m] : [c.a, c.b]);

/**
 * The partner's nudge: an unplaced moment and a true statement about it that helps place it. Prefers a
 * statement whose other moment is already placed, then the simplest kind. Null once every moment is placed.
 */
export function timelineStep(p: TimelinePuzzle, placed: number[]): { m: number; statement: number } | null {
  let best: { m: number; statement: number; score: number } | null = null;
  p.statements.forEach((s, i) => {
    if (!p.truth[i]) return;
    const ms = momentsOf(s.claim);
    for (const m of ms) {
      if (placed[m]) continue;
      const anchored = ms.every((x) => x === m || placed[x]);
      const score = (anchored ? 0 : 10) + claimGrade(s.claim);
      if (!best || score < best.score) best = { m, statement: i, score };
    }
  });
  if (!best) return null;
  const { m, statement } = best;
  return { m, statement };
}

/** First moment the player placed at the wrong time, or -1. */
export const wrongMoment = (p: TimelinePuzzle, placed: number[]) => placed.findIndex((s, m) => s !== 0 && s !== p.solution[m]);

/** A random true claim the player doesn't have yet (the informant's paid tip). */
export function freshTrueTimeClaim(p: TimelinePuzzle, have: TimeClaim[], rng: Rng, tries = 500): TimeClaim | null {
  const known = new Set(have.map(key));
  for (let i = 0; i < tries; i++) {
    const c = randomTimeClaim(p.solution, rng, 3);
    if (evalTime(c, p.solution) && !known.has(key(c))) return c;
  }
  return null;
}
