/**
 * Cipher puzzles: crack a safe or lockbox code from what witnesses say about its digits.
 *
 * DESIGN NOTE
 * What it is: a code of N digits (N = 4, 5, 6, 7 by rank, written as positions 1..N). Every digit is
 * different and comes from 1..N+1, so one digit of the range is left out. The player works out the code
 * digit by digit and marks each statement True or Lie, as in the grids.
 *
 * What the player sees: witnesses say things like "the 2nd digit is 5", "the 1st digit is even", "the 3rd
 * digit is bigger than the 1st", "the 2nd and 4th digits add up to 9" or "the 1st and 3rd digits are 4 apart".
 * Some witnesses lie, and the player is told how many lies there are (Chief: a range of two).
 *
 * Why it has exactly one answer: the generator draws random statements, picks the lies so they look plausible
 * (they hold on many wrong codes), then adds true statements, always the ones that rule out the most wrong codes,
 * until no wrong code fits the allowed number of lies. `verifyCipher` does not trust the generator: it tries
 * every code, and checks that exactly one fits the statements with an allowed number of lies, and that it is
 * the stored code.
 *
 * Statements per rank (the generator stops when the answer is unique, so the number varies a little):
 * Junior about 4 to 8, Detective 5 to 9, Inspector 6 to 10, Chief up to 13, with the lies one, one, two, and
 * two to three. Grade 1 = "is", "is not", "even", "odd" (reading one digit); grade 2 = "bigger than"
 * (comparing digits); grade 3 = "add up to" and "apart" (arithmetic across digits). No easy path: Junior
 * needs at least one comparison, Detective and above at least one grade 3 statement (set with `minGrade`).
 *
 * An answer is `code`: code[i] is the digit at position i (0-based), each from 1..size+1, all different.
 * A player's work is `placed`: placed[i] is the digit they put at position i, or 0 for empty.
 */
import { makeRng, type Rng } from './rng';
import type { SpeakerSpec } from './generator';
import type { Via } from './via';

export type CipherClaim =
  /** The digit at position p is d. */
  | { kind: 'is'; p: number; d: number }
  /** The digit at position p is not d. */
  | { kind: 'isNot'; p: number; d: number }
  /** The digit at position p is even. */
  | { kind: 'even'; p: number }
  /** The digit at position p is odd. */
  | { kind: 'odd'; p: number }
  /** The digit at position a is bigger than the one at position b. */
  | { kind: 'greater'; a: number; b: number }
  /** The digits at positions a and b add up to total. */
  | { kind: 'sum'; a: number; b: number; total: number }
  /** The digits at positions a and b differ by gap. */
  | { kind: 'apart'; a: number; b: number; gap: number };

export interface CipherGiven {
  p: number;
  d: number;
}

export interface CipherStatement {
  speaker: string;
  claim: CipherClaim;
  /** Set when the clue quotes an earlier puzzle's answer (src/engine/via.ts). */
  via?: Via;
}

/** A message hidden under the code: each letter was moved on by the digit at its place, so the right code reads it back. */
export interface CipherMessage {
  /** The words the right code reveals, capital letters A to Z, one letter per place. */
  plain: string;
  /** The same letters as the player finds them, each moved on by its digit. */
  cipher: string;
}

export interface CipherPuzzle {
  type: 'cipher';
  /** Number of digits in the code. */
  size: number;
  /** Digits shown in place at the start. */
  givens: CipherGiven[];
  statements: CipherStatement[];
  liarCounts: number[];
  /** code[i] = digit at position i. */
  code: number[];
  /** A word-cipher lead: the message the code reads back (the letters of the code's own places). */
  message?: CipherMessage;
  truth: boolean[];
  /** 1 = reading one digit, 2 = comparing digits, 3 = adding or subtracting digits. */
  grade: number;
  seed: number;
}

const A = 65;

/** Moves a capital letter on by `by` places (back with a negative number), wrapping after Z. */
export const shiftLetter = (ch: string, by: number) => String.fromCharCode(A + ((((ch.charCodeAt(0) - A + by) % 26) + 26) % 26));

/** The message as the player sees it: each plain letter moved on by the digit of its place. */
export const encodeMessage = (plain: string, code: number[]): string => [...plain].map((ch, i) => shiftLetter(ch, code[i])).join('');

/** What the player's digits read so far: a letter for each filled place, a dot for each empty one. */
export const decodeMessage = (cipher: string, digits: number[]): string => [...cipher].map((ch, i) => (digits[i] ? shiftLetter(ch, -digits[i]) : '·')).join('');

/** The biggest digit a code of this size may use: one more than the number of positions. */
export const maxDigit = (size: number) => size + 1;

export function evalCipher(c: CipherClaim, code: number[]): boolean {
  switch (c.kind) {
    case 'is':
      return code[c.p] === c.d;
    case 'isNot':
      return code[c.p] !== c.d;
    case 'even':
      return code[c.p] % 2 === 0;
    case 'odd':
      return code[c.p] % 2 === 1;
    case 'greater':
      return code[c.a] > code[c.b];
    case 'sum':
      return code[c.a] + code[c.b] === c.total;
    case 'apart':
      return Math.abs(code[c.a] - code[c.b]) === c.gap;
  }
}

export const claimGrade = (c: CipherClaim) => (c.kind === 'greater' ? 2 : c.kind === 'sum' || c.kind === 'apart' ? 3 : 1);

/** The positions a claim is about. */
export const positionsOf = (c: CipherClaim): number[] => (c.kind === 'greater' || c.kind === 'sum' || c.kind === 'apart' ? [c.a, c.b] : [c.p]);

const codeCache = new Map<number, number[][]>();
/** Every code of this size: n different digits from 1..n+1 (n <= 7 gives 40320). */
export function allCodes(n: number): number[][] {
  const hit = codeCache.get(n);
  if (hit) return hit;
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Set<number>();
  const go = () => {
    if (cur.length === n) return void out.push(cur.slice());
    for (let d = 1; d <= maxDigit(n); d++) {
      if (used.has(d)) continue;
      used.add(d);
      cur.push(d);
      go();
      cur.pop();
      used.delete(d);
    }
  };
  go();
  codeCache.set(n, out);
  return out;
}

const sameCode = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** Codes that keep the givens and have an allowed number of false statements. */
export function fittingCodes(p: Pick<CipherPuzzle, 'size' | 'givens' | 'liarCounts'>, claims: CipherClaim[]): number[][] {
  return allCodes(p.size).filter((c) => p.givens.every((g) => c[g.p] === g.d) && p.liarCounts.includes(claims.filter((cl) => !evalCipher(cl, c)).length));
}

export function randomCipherClaim(code: number[], rng: Rng, maxGrade: number): CipherClaim {
  const n = code.length;
  const hi = maxDigit(n);
  const p = rng.int(0, n - 1);
  const other = () => {
    for (;;) {
      const b = rng.int(0, n - 1);
      if (b !== p) return b;
    }
  };
  const roll = rng.next() * (maxGrade >= 3 ? 1 : maxGrade === 2 ? 0.75 : 0.5);
  if (roll < 0.1) return { kind: 'is', p, d: rng.int(1, hi) };
  if (roll < 0.2) return { kind: 'isNot', p, d: rng.int(1, hi) };
  if (roll < 0.35) return { kind: 'even', p };
  if (roll < 0.5) return { kind: 'odd', p };
  if (roll < 0.75) return { kind: 'greater', a: p, b: other() };
  const b = other();
  // sums and gaps near the true ones look plausible
  if (roll < 0.9) return { kind: 'sum', a: p, b, total: Math.max(3, code[p] + code[b] + rng.pick([0, 0, -1, 1])) };
  return { kind: 'apart', a: p, b, gap: Math.max(1, Math.min(hi - 1, Math.abs(code[p] - code[b]) + rng.pick([0, 0, -1, 1]))) };
}

export interface CipherOptions {
  size: number;
  speakers: SpeakerSpec[];
  liarRange?: boolean;
  maxGrade: number;
  minGrade?: number;
  maxStatements?: number;
  /** Digits shown in place at the start. */
  givens?: number;
  /** A word-cipher lead: the message (capital letters, one per place) the right code reads back. Ignored when its length is not `size`. */
  message?: string;
  /** Link clues quoting earlier answers: true on the answer, said first, and needed to settle it. The answer is redrawn until they hold. */
  planted?: { speaker: string; claim: CipherClaim; via: Via }[];
  seed: number;
}

const key = (c: CipherClaim) => JSON.stringify(c);

function tryCipher(opts: CipherOptions, rng: Rng): CipherPuzzle | null {
  const n = opts.size;
  const maxStatements = opts.maxStatements ?? n + 4;
  const code = rng.shuffle(Array.from({ length: maxDigit(n) }, (_, i) => i + 1)).slice(0, n);
  if (opts.planted && !opts.planted.every((p) => evalCipher(p.claim, code))) return null;
  const givens: CipherGiven[] = rng
    .shuffle(Array.from({ length: n }, (_, p) => p))
    .slice(0, opts.givens ?? 0)
    .map((p) => ({ p, d: code[p] }));
  // wrong codes that could still fit, with how many statements are false on each
  let alive = allCodes(n).filter((c) => !sameCode(c, code) && givens.every((g) => c[g.p] === g.d));
  let falseCount = alive.map(() => 0);
  const k = opts.speakers.reduce((s, sp) => s + sp.lies, 0);
  const allowed = opts.liarRange && k > 0 ? [k, k + 1] : [k];
  const most = Math.max(...allowed);

  const pool = new Map<string, CipherClaim>();
  for (let i = 0; i < 300; i++) {
    const c = randomCipherClaim(code, rng, opts.maxGrade);
    // a claim about a given digit's own position tells the player nothing
    if (positionsOf(c).length === 1 && givens.some((g) => g.p === (c as { p: number }).p)) continue;
    pool.set(key(c), c);
  }
  const claims = [...pool.values()];
  const trueOnCode = claims.filter((c) => evalCipher(c, code));
  const falseOnCode = claims.filter((c) => !evalCipher(c, code));

  const statements: CipherStatement[] = [];
  const truth: boolean[] = [];
  const used = new Set<string>();
  const add = (speaker: string, claim: CipherClaim, t: boolean, via?: Via) => {
    statements.push(via ? { speaker, claim, via } : { speaker, claim });
    truth.push(t);
    used.add(key(claim));
    falseCount = falseCount.map((f, i) => f + (evalCipher(claim, alive[i]) ? 0 : 1));
    // a code with more false statements than the most lies allowed is out for good
    const keep = falseCount.map((f) => f <= most);
    alive = alive.filter((_, i) => keep[i]);
    falseCount = falseCount.filter((_, i) => keep[i]);
  };

  const wrong = alive.slice();
  for (const p of opts.planted ?? []) add(p.speaker, p.claim, true, p.via);
  // a link that rules out no wrong code is not needed: try another answer
  if ((opts.planted ?? []).some((p) => wrong.every((o) => evalCipher(p.claim, o)))) return null;

  // lies that hold on many wrong codes, so they sound right
  for (const sp of opts.speakers)
    for (let i = 0; i < sp.lies; i++) {
      const scored = falseOnCode
        .filter((c) => !used.has(key(c)))
        .map((c) => ({ c, score: alive.filter((o) => evalCipher(c, o)).length + rng.next() }))
        .sort((x, y) => y.score - x.score);
      /* v8 ignore next -- 300 sampled claims always include false ones */
      if (!scored.length) return null;
      add(sp.id, scored[0].c, false);
    }

  // add true statements that rule out the most wrong codes until every wrong code is out of the allowed lie count
  const badNow = () => alive.reduce((b, _, i) => b + (allowed.includes(falseCount[i]) ? 1 : 0), 0);
  const killed = (c: CipherClaim) => alive.reduce((s, o, i) => s + (falseCount[i] === most && !evalCipher(c, o) ? 1 : 0), 0);
  const pressed = (c: CipherClaim) => alive.reduce((s, o) => s + (evalCipher(c, o) ? 0 : 1), 0);
  const truthful = opts.speakers.filter((s) => s.lies === 0);
  const speakersInOrder = truthful.length ? truthful : opts.speakers;
  let turn = 0;
  while (badNow() > 0) {
    if (statements.length >= maxStatements) return null;
    // "the 2nd digit is 5" gives a digit away, so at most one true one per puzzle
    const isUsed = statements.some((st, i) => truth[i] && st.claim.kind === 'is');
    const scored = trueOnCode
      .filter((c) => !used.has(key(c)) && !(isUsed && c.kind === 'is'))
      .map((c) => ({ c, score: killed(c) * 1000 + pressed(c) }))
      .sort((x, y) => y.score - x.score);
    /* v8 ignore next -- 300 sampled claims leave plenty of true ones */
    if (!scored.length) return null;
    const best = scored.filter((s) => s.score >= scored[0].score * 0.9).slice(0, 4);
    add(speakersInOrder[turn++ % speakersInOrder.length].id, rng.pick(best).c, true);
  }
  // everyone says something; a spare true claim must not bring a wrong code back to an allowed lie count
  for (const sp of opts.speakers) {
    if (statements.some((s) => s.speaker === sp.id)) continue;
    const c = trueOnCode.find((cl) => !used.has(key(cl)) && alive.every((o, i) => !allowed.includes(falseCount[i] + (evalCipher(cl, o) ? 0 : 1))));
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
  return { type: 'cipher', size: n, givens, statements: st, liarCounts: allowed, code, truth: order.map((i) => truth[i]), grade, seed: 0 };
}

export function generateCipher(opts: CipherOptions, maxAttempts = 400): CipherPuzzle {
  for (let a = 0; a < maxAttempts; a++) {
    const seed = (opts.seed * 7919 + a * 104729) >>> 0;
    const p = tryCipher(opts, makeRng(seed));
    if (p) {
      const plain = opts.message?.length === opts.size ? opts.message : undefined;
      return { ...p, seed, ...(plain ? { message: { plain, cipher: encodeMessage(plain, p.code) } } : {}) };
    }
  }
  throw new Error(`Could not generate a ${opts.size}-digit cipher within ${maxAttempts} attempts`);
}

/** Independent check used by tests and the validator: exactly one code fits, and it is the stored one. */
export function verifyCipher(p: CipherPuzzle): { ok: boolean; reason?: string } {
  const fits = fittingCodes(p, p.statements.map((s) => s.claim));
  if (fits.length !== 1) return { ok: false, reason: `${fits.length} codes fit the statements` };
  if (!sameCode(fits[0], p.code)) return { ok: false, reason: 'unique code is not the stored code' };
  if (p.statements.some((s, i) => evalCipher(s.claim, p.code) !== p.truth[i])) return { ok: false, reason: 'stored truth does not match the code' };
  if (p.message && (p.message.cipher !== encodeMessage(p.message.plain, p.code) || decodeMessage(p.message.cipher, p.code) !== p.message.plain)) return { ok: false, reason: 'the message does not read back from the code' };
  return { ok: true };
}

/** First position where the player put the wrong digit, or -1. `placed[i]` is 0 for empty. */
export const wrongDigit = (p: CipherPuzzle, placed: number[]) => placed.findIndex((d, i) => d !== 0 && d !== p.code[i]);

/**
 * The partner's nudge: an empty position and a true statement about it that helps. Prefers a statement whose
 * other position is already filled, then the simplest kind. Null once every position is filled.
 */
export function cipherStep(p: CipherPuzzle, placed: number[]): { pos: number; statement: number } | null {
  let best: { pos: number; statement: number; score: number } | null = null;
  p.statements.forEach((s, i) => {
    if (!p.truth[i]) return;
    const ps = positionsOf(s.claim);
    for (const pos of ps) {
      if (placed[pos]) continue;
      const anchored = ps.every((x) => x === pos || placed[x]);
      const score = (anchored ? 0 : 10) + claimGrade(s.claim);
      if (!best || score < best.score) best = { pos, statement: i, score };
    }
  });
  if (!best) return null;
  const { pos, statement } = best;
  return { pos, statement };
}

/** A random true claim the player doesn't have yet (the informant's paid tip). */
export function freshTrueCipherClaim(p: CipherPuzzle, have: CipherClaim[], rng: Rng, tries = 500): CipherClaim | null {
  const known = new Set(have.map(key));
  for (let i = 0; i < tries; i++) {
    const c = randomCipherClaim(p.code, rng, 3);
    if (evalCipher(c, p.code) && !known.has(key(c))) return c;
  }
  return null;
}
