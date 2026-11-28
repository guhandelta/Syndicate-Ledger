/**
 * The guess-and-feedback family of decode puzzles: the player is shown what earlier tries told someone, and works out
 * the one answer they all point to.
 *
 * DESIGN NOTE
 *   bulls  - a terminal's keypad code (Bulls and Cows). Each earlier guess is shown with "bulls" (right digit, right
 *            place) and "cows" (right digit, wrong place). Digits in a code are all different, 0 to 9.
 *   smudge - a PIN pad with some keys heavily smudged: the PIN uses exactly those keys, each once, and short facts
 *            about the order ("the first digit is even", "the last is bigger than the second") pin it down.
 *   scale  - a stack of identical-looking bars where one is a fake, and a balance scale that was used a few times.
 *            Easier ranks know the fake is lighter; harder ranks do not know whether it is lighter or heavier.
 *
 * Why each has exactly one answer: the generator keeps adding feedback until a brute-force search over every possible
 * answer leaves one candidate, and `solveGuess` repeats that search from the stored data alone. A player who reads
 * the clues carefully can always reach the answer; nobody has to guess.
 *
 * The answer is a string: the code or PIN digits, or the bar number (with LIGHTER or HEAVIER when that is unknown).
 */
import type { Rng } from './rng';

export type GuessVariant = 'bulls' | 'smudge' | 'scale';
export const GUESS_VARIANTS: GuessVariant[] = ['bulls', 'smudge', 'scale'];

export interface BullsTry {
  guess: number[];
  bulls: number;
  cows: number;
}

/** A fact about a PIN's order, positions counted from 0. */
export type PinFact =
  | { kind: 'parity'; at: number; even: boolean }
  | { kind: 'greater'; a: number; b: number }
  | { kind: 'sum'; a: number; b: number; total: number };

export interface Weighing {
  left: number[];
  right: number[];
  /** 'left' = the left pan was lighter, 'right' = the right pan was lighter, 'even' = they balanced (bars counted from 1). */
  result: 'left' | 'right' | 'even';
}

export type GuessData =
  | { variant: 'bulls'; length: number; tries: BullsTry[] }
  | { variant: 'smudge'; keys: number[]; facts: PinFact[] }
  | { variant: 'scale'; bars: number; known: boolean; weighings: Weighing[] };

export const score = (code: number[], guess: number[]): { bulls: number; cows: number } => {
  let bulls = 0;
  let cows = 0;
  guess.forEach((d, i) => {
    if (code[i] === d) bulls++;
    else if (code.includes(d)) cows++;
  });
  return { bulls, cows };
};

/** Every code of this length: different digits from 0 to 9. */
export function allCodes(length: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const go = () => {
    if (cur.length === length) return void out.push(cur.slice());
    for (let d = 0; d <= 9; d++) {
      if (cur.includes(d)) continue;
      cur.push(d);
      go();
      cur.pop();
    }
  };
  go();
  return out;
}

export const permutations = (xs: number[]): number[][] => (xs.length <= 1 ? [xs.slice()] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

export const pinFactHolds = (f: PinFact, pin: number[]): boolean => (f.kind === 'parity' ? pin[f.at] % 2 === (f.even ? 0 : 1) : f.kind === 'greater' ? pin[f.a] > pin[f.b] : pin[f.a] + pin[f.b] === f.total);

/** A bar's weight against the others: 1 = the fake is lighter, -1 = heavier. */
const pan = (w: Weighing, fake: number, dir: 1 | -1): 'left' | 'right' | 'even' => {
  const inLeft = w.left.includes(fake);
  const inRight = w.right.includes(fake);
  if (!inLeft && !inRight) return 'even';
  // a lighter fake makes its own pan lighter; a heavier one makes the other pan lighter
  const ownLighter = dir === 1;
  return inLeft === ownLighter ? 'left' : 'right';
};

/** Every (bar, direction) still possible after these weighings. Bars are counted from 1. */
export function scaleCandidates(bars: number, known: boolean, weighings: Weighing[]): { bar: number; dir: 1 | -1 }[] {
  const out: { bar: number; dir: 1 | -1 }[] = [];
  for (let bar = 1; bar <= bars; bar++)
    for (const dir of known ? ([1] as const) : ([1, -1] as const)) if (weighings.every((w) => pan(w, bar, dir) === w.result)) out.push({ bar, dir });
  return out;
}

/** Recomputes the answer from the data alone; '' when the clues leave zero or several answers. */
export function solveGuess(d: GuessData): string {
  switch (d.variant) {
    case 'bulls': {
      const left = allCodes(d.length).filter((c) => d.tries.every((t) => {
        const s = score(c, t.guess);
        return s.bulls === t.bulls && s.cows === t.cows;
      }));
      return left.length === 1 ? left[0].join('') : '';
    }
    case 'smudge': {
      const left = permutations(d.keys).filter((p) => d.facts.every((f) => pinFactHolds(f, p)));
      return left.length === 1 ? left[0].join('') : '';
    }
    case 'scale': {
      const left = scaleCandidates(d.bars, d.known, d.weighings);
      if (left.length !== 1) return '';
      return d.known ? String(left[0].bar) : `${left[0].bar} ${left[0].dir === 1 ? 'LIGHTER' : 'HEAVIER'}`;
    }
  }
}

/** The lines of exhibit text that must mention the data, so a puzzle is worded from it. */
export function guessLines(d: GuessData): string[] {
  switch (d.variant) {
    case 'bulls':
      return d.tries.map((t) => `${t.guess.join('')} -> ${t.bulls} in the right place, ${t.cows} in the wrong place`);
    case 'smudge':
      return [`Smudged keys: ${d.keys.join(' ')}`, ...d.facts.map(factText)];
    case 'scale':
      return d.weighings.map((w, i) => `Weighing ${i + 1}: bars ${w.left.join(' ')} against bars ${w.right.join(' ')}: ${w.result === 'even' ? 'balanced' : w.result === 'left' ? 'left pan lighter' : 'right pan lighter'}`);
  }
}

const place = (i: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][i];
export const factText = (f: PinFact): string =>
  f.kind === 'parity' ? `The ${place(f.at)} digit is ${f.even ? 'even' : 'odd'}.` : f.kind === 'greater' ? `The ${place(f.a)} digit is bigger than the ${place(f.b)} digit.` : `The ${place(f.a)} and ${place(f.b)} digits add up to ${f.total}.`;

// ---- generators ----

export function genBulls(level: number, rng: Rng): { data: GuessData; exhibits: { title: string; lines: string[] }[]; question: string } {
  const length = 2 + level;
  const codes = allCodes(length);
  const secret = rng.pick(codes);
  let left = codes;
  const tries: BullsTry[] = [];
  while (left.length > 1) {
    // among a few random guesses, keep the one that rules out the most
    let best: number[] | null = null;
    let bestLeft = left.length + 1;
    for (let k = 0; k < 8; k++) {
      const g = rng.pick(codes);
      const s = score(secret, g);
      const rest = left.filter((c) => {
        const t = score(c, g);
        return t.bulls === s.bulls && t.cows === s.cows;
      }).length;
      if (rest < bestLeft) {
        bestLeft = rest;
        best = g;
      }
    }
    const s = score(secret, best!);
    tries.push({ guess: best!, ...s });
    left = left.filter((c) => {
      const t = score(c, best!);
      return t.bulls === s.bulls && t.cows === s.cows;
    });
  }
  const data: GuessData = { variant: 'bulls', length, tries };
  return {
    data,
    exhibits: [
      { title: 'Terminal log: every try so far', lines: guessLines(data) },
      { title: 'How the terminal answers', lines: [`The code has ${length} digits, all different, 0 to 9.`, '"Right place" means the digit and its place are both right. "Wrong place" means the digit is in the code but somewhere else.'] },
    ],
    question: 'Work out the code and type it.',
  };
}

export function genSmudge(level: number, rng: Rng): { data: GuessData; exhibits: { title: string; lines: string[] }[]; question: string } {
  const length = 2 + level;
  const keys = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, length).sort((a, b) => a - b);
  const pin = rng.shuffle(keys.slice());
  const all = permutations(keys);
  const facts: PinFact[] = [];
  let left = all;
  for (let guard = 0; left.length > 1 && guard < 400; guard++) {
    const a = rng.int(0, length - 1);
    let b = rng.int(0, length - 1);
    if (b === a) b = (a + 1) % length;
    const roll = rng.next();
    const f: PinFact = roll < 0.35 ? { kind: 'parity', at: a, even: pin[a] % 2 === 0 } : roll < 0.75 ? (pin[a] > pin[b] ? { kind: 'greater', a, b } : { kind: 'greater', a: b, b: a }) : { kind: 'sum', a, b, total: pin[a] + pin[b] };
    if (facts.some((x) => JSON.stringify(x) === JSON.stringify(f))) continue;
    const rest = left.filter((p) => pinFactHolds(f, p));
    if (rest.length < left.length) {
      facts.push(f);
      left = rest;
    }
  }
  const data: GuessData = { variant: 'smudge', keys, facts };
  return {
    data,
    exhibits: [
      { title: 'The keypad under the lamp', lines: [`Smudged keys: ${keys.join(' ')}`, 'These are the keys with fingerprint smudges.', `The PIN has ${length} digits and uses each smudged key once.`] },
      { title: 'What else is known', lines: facts.map(factText) },
    ],
    question: 'Work out the PIN and type it.',
  };
}

export function genScale(level: number, rng: Rng): { data: GuessData; exhibits: { title: string; lines: string[] }[]; question: string } {
  const bars = [8, 9, 9, 12][level - 1];
  const known = level <= 2;
  const fake = rng.int(1, bars);
  const dir: 1 | -1 = known || rng.next() < 0.5 ? 1 : -1;
  const weighings: Weighing[] = [];
  let left = scaleCandidates(bars, known, []);
  for (let guard = 0; left.length > 1 && guard < 12; guard++) {
    let best: Weighing | null = null;
    let bestWorst = left.length + 1;
    for (let k = 0; k < 60; k++) {
      const per = rng.int(1, Math.floor(bars / 2));
      const order = rng.shuffle(Array.from({ length: bars }, (_, i) => i + 1));
      const w: Weighing = { left: order.slice(0, per).sort((x, y) => x - y), right: order.slice(per, per * 2).sort((x, y) => x - y), result: 'even' };
      const buckets = { left: 0, right: 0, even: 0 };
      for (const c of left) buckets[pan(w, c.bar, c.dir)]++;
      const worst = Math.max(buckets.left, buckets.right, buckets.even);
      if (worst < bestWorst) {
        bestWorst = worst;
        best = w;
      }
    }
    const w = { ...best!, result: pan(best!, fake, dir) };
    weighings.push(w);
    left = scaleCandidates(bars, known, weighings);
  }
  const data: GuessData = { variant: 'scale', bars, known, weighings };
  return {
    data,
    exhibits: [
      { title: 'The balance scale log', lines: guessLines(data) },
      { title: 'The smuggler\'s stack', lines: [`${bars} bars that look identical, numbered 1 to ${bars}. Exactly one is a fake.`, known ? 'The fake is hollow, so it is lighter than the real ones.' : 'The fake is a different weight from the real ones. Nobody knows if it is lighter or heavier.'] },
    ],
    question: known ? 'Which bar is the fake? Type its number.' : 'Which bar is the fake, and is it lighter or heavier? Type the number, then LIGHTER or HEAVIER.',
  };
}
