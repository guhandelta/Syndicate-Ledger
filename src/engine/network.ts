/**
 * Network puzzles: find out who was in contact with whom.
 *
 * The answer is a set of links between N people (call logs, payments, shared lockups). The player is shown
 * how many different people each person was in contact with (a phone bill's count), then witnesses say who
 * was or was not in contact, who shared a contact, and so on. Some witnesses lie, exactly as in the grids, and
 * the player is told how many. The counts alone leave at least two networks, so the statements are needed, and
 * the counts plus the statements (with an allowed number of lies) leave exactly one.
 *
 * An answer is `links`: a flat list over the pairs in `pairs(n)` order (0,1), (0,2), ... (n-2,n-1), where
 * links[k] is 1 if that pair was in contact and 0 if not.
 */
import { makeRng, type Rng } from './rng';
import type { SpeakerSpec } from './generator';
import type { Via } from './via';

export type NetClaim =
  /** a and b were in contact. */
  | { kind: 'linked'; a: number; b: number }
  /** a and b were never in contact. */
  | { kind: 'notLinked'; a: number; b: number }
  /** a and b had a contact in common (someone both of them were in contact with). */
  | { kind: 'common'; a: number; b: number }
  /** a and b had no contact in common. */
  | { kind: 'noCommon'; a: number; b: number }
  /** a was in contact with exactly one of b and c, not both and not neither. */
  | { kind: 'oneOf'; a: number; b: number; c: number };

export interface NetStatement {
  speaker: string;
  claim: NetClaim;
  /** Set when the clue quotes an earlier puzzle's answer (src/engine/via.ts). */
  via?: Via;
}

export interface NetworkPuzzle {
  type: 'network';
  /** Number of people. */
  size: number;
  /** degrees[p] = how many people p was in contact with. Shown to the player. */
  degrees: number[];
  statements: NetStatement[];
  liarCounts: number[];
  links: number[];
  truth: boolean[];
  /** 1 = "in contact" and "not in contact" only, 2 = "contact in common" needed, 3 = "one of the two" needed. */
  grade: number;
  /** How many networks the counts alone allow. */
  baseSolutions: number;
  seed: number;
}

/** Every pair of people, in the order `links` uses. */
export function pairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < n - 1; a++) for (let b = a + 1; b < n; b++) out.push([a, b]);
  return out;
}

/** Position of the pair (a, b) in `links`, in either order. */
export const pairIndex = (n: number, a: number, b: number): number => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return lo * n - (lo * (lo + 1)) / 2 + (hi - lo - 1);
};

export const linkedIn = (n: number, links: number[], a: number, b: number) => links[pairIndex(n, a, b)] === 1;

const contacts = (n: number, links: number[], p: number): number[] => {
  const out: number[] = [];
  for (let q = 0; q < n; q++) if (q !== p && linkedIn(n, links, p, q)) out.push(q);
  return out;
};

export const degreesOf = (n: number, links: number[]): number[] => Array.from({ length: n }, (_, p) => contacts(n, links, p).length);

export function evalNet(c: NetClaim, n: number, links: number[]): boolean {
  switch (c.kind) {
    case 'linked':
      return linkedIn(n, links, c.a, c.b);
    case 'notLinked':
      return !linkedIn(n, links, c.a, c.b);
    case 'common':
      return contacts(n, links, c.a).some((x) => x !== c.b && linkedIn(n, links, c.b, x));
    case 'noCommon':
      return !contacts(n, links, c.a).some((x) => x !== c.b && linkedIn(n, links, c.b, x));
    case 'oneOf':
      return linkedIn(n, links, c.a, c.b) !== linkedIn(n, links, c.a, c.c);
  }
}

export const claimGrade = (c: NetClaim) => (c.kind === 'linked' || c.kind === 'notLinked' ? 1 : c.kind === 'oneOf' ? 3 : 2);

/** The people a claim is about. */
export const peopleOf = (c: NetClaim): number[] => (c.kind === 'oneOf' ? [c.a, c.b, c.c] : [c.a, c.b]);

const baseCache = new Map<string, number[][]>();

/** Every network in which each person has the given number of contacts. */
export function networksWithDegrees(degrees: number[]): number[][] {
  const key = degrees.join(',');
  const hit = baseCache.get(key);
  if (hit) return hit;
  const n = degrees.length;
  const ps = pairs(n);
  const out: number[][] = [];
  const have = degrees.map(() => 0);
  // how many pairs are still to be decided for each person, to prune early
  const left = degrees.map(() => n - 1);
  const links: number[] = [];
  const go = (k: number) => {
    if (k === ps.length) return void out.push(links.slice());
    const [a, b] = ps[k];
    left[a]--;
    left[b]--;
    for (const v of [0, 1]) {
      have[a] += v;
      have[b] += v;
      if (have[a] <= degrees[a] && have[b] <= degrees[b] && have[a] + left[a] >= degrees[a] && have[b] + left[b] >= degrees[b]) {
        links.push(v);
        go(k + 1);
        links.pop();
      }
      have[a] -= v;
      have[b] -= v;
    }
    left[a]++;
    left[b]++;
  };
  go(0);
  baseCache.set(key, out);
  return out;
}

const sameLinks = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** Networks with these degrees and an allowed number of false statements. */
export function fittingNetworks(p: Pick<NetworkPuzzle, 'size' | 'degrees' | 'liarCounts'>, claims: NetClaim[]): number[][] {
  return networksWithDegrees(p.degrees).filter((l) => p.liarCounts.includes(claims.filter((c) => !evalNet(c, p.size, l)).length));
}

export function randomNetClaim(n: number, rng: Rng, maxGrade: number): NetClaim {
  const three = (): [number, number, number] => {
    const a = rng.int(0, n - 1);
    let b = rng.int(0, n - 1);
    while (b === a) b = rng.int(0, n - 1);
    let c = rng.int(0, n - 1);
    while (c === a || c === b) c = rng.int(0, n - 1);
    return [a, b, c];
  };
  const [a, b, c] = three();
  const roll = rng.next() * (maxGrade >= 3 ? 1 : maxGrade === 2 ? 0.8 : 0.4);
  if (roll < 0.2) return { kind: 'linked', a, b };
  if (roll < 0.4) return { kind: 'notLinked', a, b };
  if (roll < 0.6) return { kind: 'common', a, b };
  if (roll < 0.8) return { kind: 'noCommon', a, b };
  return { kind: 'oneOf', a, b, c };
}

export interface NetworkOptions {
  size: number;
  speakers: SpeakerSpec[];
  liarRange?: boolean;
  maxGrade: number;
  minGrade?: number;
  maxStatements?: number;
  /** How many networks the counts alone must allow: a bigger number means more for the statements to settle. */
  minBase?: number;
  /** Link clues quoting earlier answers: true on the answer, said first, and needed to settle it. The answer is redrawn until they hold. */
  planted?: { speaker: string; claim: NetClaim; via: Via }[];
  seed: number;
}

const key = (c: NetClaim) => JSON.stringify(c);

function tryNetwork(opts: NetworkOptions, rng: Rng): NetworkPuzzle | null {
  const n = opts.size;
  const maxStatements = opts.maxStatements ?? n + 4;
  const ps = pairs(n);
  const sol = ps.map(() => (rng.next() < 0.5 ? 1 : 0));
  if (opts.planted && !opts.planted.every((p) => evalNet(p.claim, n, sol))) return null;
  const degrees = degreesOf(n, sol);
  const base = networksWithDegrees(degrees);
  // the counts alone must leave a real choice, but not so many that the statements can't settle it
  if (base.length < Math.max(2, opts.minBase ?? 2) || base.length > 400) return null;
  const others = base.filter((l) => !sameLinks(l, sol));
  const k = opts.speakers.reduce((s, sp) => s + sp.lies, 0);
  const allowed = opts.liarRange && k > 0 ? [k, k + 1] : [k];

  const pool = new Map<string, NetClaim>();
  for (let i = 0; i < 600; i++) {
    const c = randomNetClaim(n, rng, opts.maxGrade);
    pool.set(key(c), c);
  }
  const claims = [...pool.values()];
  const trueOnSol = claims.filter((c) => evalNet(c, n, sol));
  const falseOnSol = claims.filter((c) => !evalNet(c, n, sol));

  const statements: NetStatement[] = [];
  const truth: boolean[] = [];
  const falseCount = others.map(() => 0);
  const used = new Set<string>();
  const add = (speaker: string, claim: NetClaim, t: boolean, via?: Via) => {
    statements.push(via ? { speaker, claim, via } : { speaker, claim });
    truth.push(t);
    used.add(key(claim));
    others.forEach((o, i) => {
      if (!evalNet(claim, n, o)) falseCount[i]++;
    });
  };

  for (const p of opts.planted ?? []) add(p.speaker, p.claim, true, p.via);
  // a link that rules out no other network is not needed: try another answer
  if ((opts.planted ?? []).some((p) => others.every((o) => evalNet(p.claim, n, o)))) return null;

  // lies that hold on many other networks, so they sound right
  for (const sp of opts.speakers)
    for (let i = 0; i < sp.lies; i++) {
      const scored = falseOnSol
        .filter((c) => !used.has(key(c)))
        .map((c) => ({ c, score: others.filter((o) => evalNet(c, n, o)).length + rng.next() }))
        .sort((x, y) => y.score - x.score);
      /* v8 ignore next -- 600 sampled claims always include false ones */
      if (!scored.length) return null;
      add(sp.id, scored[0].c, false);
    }

  const most = Math.max(...allowed);
  const badNow = () => others.reduce((b, _, i) => b + (allowed.includes(falseCount[i]) ? 1 : 0), 0);
  const killed = (c: NetClaim) => others.reduce((s, o, i) => s + (falseCount[i] === most && !evalNet(c, n, o) ? 1 : 0), 0);
  const pressed = (c: NetClaim) => others.reduce((s, o, i) => s + (falseCount[i] <= most && !evalNet(c, n, o) ? 1 : 0), 0);
  const truthful = opts.speakers.filter((s) => s.lies === 0);
  const speakersInOrder = truthful.length ? truthful : opts.speakers;
  let turn = 0;
  while (badNow() > 0) {
    if (statements.length >= maxStatements) return null;
    const scored = trueOnSol
      .filter((c) => !used.has(key(c)))
      .map((c) => ({ c, score: killed(c) * 1000 + pressed(c) }))
      .sort((x, y) => y.score - x.score);
    /* v8 ignore next -- 600 sampled claims leave plenty of true ones */
    if (!scored.length) return null;
    const best = scored.filter((s) => s.score >= scored[0].score * 0.9).slice(0, 4);
    add(speakersInOrder[turn++ % speakersInOrder.length].id, rng.pick(best).c, true);
  }
  // everyone says something, without letting a wrong network fit the lie count
  for (const sp of opts.speakers) {
    if (statements.some((s) => s.speaker === sp.id)) continue;
    const c = trueOnSol.find((cl) => !used.has(key(cl)) && others.every((o, i) => !allowed.includes(falseCount[i] + (evalNet(cl, n, o) ? 0 : 1))));
    if (!c) return null;
    add(sp.id, c, true);
  }
  if (statements.length > maxStatements) return null;

  const order = rng.shuffle(statements.map((_, i) => i));
  const st = order.map((i) => statements[i]);
  const grade = Math.max(...st.map((s) => claimGrade(s.claim)));
  if (grade < (opts.minGrade ?? 1)) return null;
  return {
    type: 'network', size: n, degrees, statements: st, liarCounts: allowed, links: sol, truth: order.map((i) => truth[i]), grade, baseSolutions: base.length, seed: 0,
  };
}

export function generateNetwork(opts: NetworkOptions, maxAttempts = 600): NetworkPuzzle {
  for (let a = 0; a < maxAttempts; a++) {
    const seed = (opts.seed * 7919 + a * 104729) >>> 0;
    const p = tryNetwork(opts, makeRng(seed));
    if (p) return { ...p, seed };
  }
  throw new Error(`Could not generate a ${opts.size}-person network within ${maxAttempts} attempts`);
}

/** Independent check: exactly one network fits the counts and statements, it is the stored one, and the counts are real. */
export function verifyNetwork(p: NetworkPuzzle): { ok: boolean; reason?: string } {
  if (degreesOf(p.size, p.links).some((d, i) => d !== p.degrees[i])) return { ok: false, reason: 'stored counts do not match the stored network' };
  if (networksWithDegrees(p.degrees).length < 2) return { ok: false, reason: 'the counts alone already give one network' };
  const fits = fittingNetworks(p, p.statements.map((s) => s.claim));
  if (fits.length !== 1) return { ok: false, reason: `${fits.length} networks fit the statements` };
  if (!sameLinks(fits[0], p.links)) return { ok: false, reason: 'unique network is not the stored solution' };
  if (p.statements.some((s, i) => evalNet(s.claim, p.size, p.links) !== p.truth[i])) return { ok: false, reason: 'stored truth does not match the solution' };
  return { ok: true };
}

/** First pair the player marked wrongly: marks[k] is 0 undecided, 1 in contact, 2 not in contact. Null if none. */
export function wrongPair(p: NetworkPuzzle, marks: number[]): [number, number] | null {
  const k = marks.findIndex((m, i) => m !== 0 && (m === 1) !== (p.links[i] === 1));
  return k < 0 ? null : pairs(p.size)[k];
}

/**
 * The partner's nudge: an undecided pair and a true statement that bears on it, preferring statements about
 * two people only. Null once every pair is decided.
 */
export function networkStep(p: NetworkPuzzle, marks: number[]): { pair: [number, number]; statement: number } | null {
  const ps = pairs(p.size);
  const k = marks.findIndex((m) => m === 0);
  if (k < 0) return null;
  const [a, b] = ps[k];
  let best = -1;
  let bestScore = Infinity;
  p.statements.forEach((s, i) => {
    if (!p.truth[i]) return;
    const who = peopleOf(s.claim);
    if (!who.includes(a) && !who.includes(b)) return;
    const score = claimGrade(s.claim) * 10 - who.filter((x) => x === a || x === b).length;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return { pair: [a, b], statement: best };
}

/** A random true statement the player doesn't have yet (the informant's paid tip). */
export function freshTrueNetClaim(p: NetworkPuzzle, have: NetClaim[], rng: Rng, tries = 500): NetClaim | null {
  const known = new Set(have.map(key));
  for (let i = 0; i < tries; i++) {
    const c = randomNetClaim(p.size, rng, 3);
    if (evalNet(c, p.size, p.links) && !known.has(key(c))) return c;
  }
  return null;
}
