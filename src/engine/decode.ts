/**
 * Decode puzzles: read the exhibits, apply a rule, type the answer.
 *
 * DESIGN NOTE
 * What it is: one engine for the "code" family. A puzzle has a `variant` (which rule), a few `exhibits`
 * (short documents the player reads, as plain lines of text), a `question`, and one `answer` the player types.
 * Every variant is a pure rule over its exhibits, so the answer is always exactly one string:
 *   book   - page-line-word triples looked up in a book page set, the words read in order.
 *   keypad - a string of phone-keypad digits; exactly one name on the contact list spells it.
 *   shift  - a message whose letters are moved on by a repeating numeric key (a badge number).
 *   date   - a circled calendar date moved on or back by a number of days; the PIN is the new month and day.
 *   check  - five serial numbers; the rule on a sticky note holds for all but one forged serial.
 *   dial   - a safe dial with wrap-around; the code is where the dial stops after each turn.
 *
 * Why it has exactly one answer: `solveDecode` recomputes the answer from the structured `data` using only the
 * rule (not the generator's choices) and `verifyDecode` checks it equals the stored answer, that the exhibits
 * were built from the same data, and the variant's own uniqueness check (one contact spells the digits, one
 * serial breaks the rule). Nothing in a decode puzzle is a guess: the answer follows from reading.
 *
 * Difficulty is `level` 1 to 4 (Junior to Chief): more triples, longer words and keys, more serials checked by a
 * harder rule, more turns of the dial and a date that crosses month and year ends.
 *
 * The answer is `answer`: capital letters, digits and single spaces, compared after `normalizeAnswer`.
 */
import { makeRng, type Rng } from './rng';

export type DecodeVariant = 'book' | 'keypad' | 'shift' | 'date' | 'check' | 'dial';
export const DECODE_VARIANTS: DecodeVariant[] = ['book', 'keypad', 'shift', 'date', 'check', 'dial'];

export interface Exhibit {
  title: string;
  lines: string[];
}

/** The structured facts behind each variant; the exhibits are only their wording. */
export type DecodeData =
  | { variant: 'book'; pages: string[][][]; picks: [number, number, number][] }
  | { variant: 'keypad'; digits: string; names: string[] }
  | { variant: 'shift'; cipher: string; key: number[] }
  | { variant: 'date'; month: number; day: number; days: number; direction: 1 | -1 }
  | { variant: 'check'; serials: string[]; rule: CheckRule }
  | { variant: 'dial'; size: number; moves: { dir: 'R' | 'L'; steps: number }[] };

export type CheckRule = { kind: 'sum'; mod: number } | { kind: 'weighted'; mod: number };

export interface DecodePuzzle {
  type: 'decode';
  variant: DecodeVariant;
  level: number;
  exhibits: Exhibit[];
  question: string;
  data: DecodeData;
  answer: string;
  seed: number;
  /** The characters in the answer, so a decode lead sizes like the other leads. */
  size: number;
  /** A decode puzzle has no witnesses, so no statements to mark; these keep it shaped like the other puzzles. */
  statements: never[];
  truth: never[];
  liarCounts: number[];
}

/** Capital letters, digits, one space between words; everything else dropped. */
export const normalizeAnswer = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const WORDS = [
  'ANCHOR', 'LANTERN', 'HARBOR', 'COPPER', 'SHUTTER', 'BEACON', 'CARGO', 'ROPE', 'TIMBER', 'WINDOW', 'BRIDGE', 'FERRY', 'GRAVEL', 'KETTLE', 'MARKET', 'NEEDLE',
  'ORCHARD', 'PEPPER', 'QUARRY', 'RIBBON', 'SADDLE', 'TUNNEL', 'UMBRELLA', 'VELVET', 'WHARF', 'YELLOW', 'ZIPPER', 'BASKET', 'CANDLE', 'DOCKET', 'ENGINE', 'FOSSIL',
  'GARDEN', 'HAMMER', 'IRON', 'JACKET', 'KEYHOLE', 'LEDGER', 'MIRROR', 'NAPKIN', 'OYSTER', 'PADLOCK', 'RADIO', 'SALMON', 'TICKET', 'VALVE', 'WAGON', 'BARREL',
];
const SHORT = WORDS.filter((w) => w.length <= 6);
const NAMES = ['MARK', 'JOHN', 'ANNA', 'LENA', 'RAJA', 'SEVA', 'MEERA', 'KAVIN', 'DEVA', 'NOOR', 'TARA', 'ISHA', 'OMAR', 'BELA', 'HARI', 'VIKA', 'ROSE', 'CODY', 'LUCA', 'PIA'];

const KEYS: Record<string, string> = { A: '2', B: '2', C: '2', D: '3', E: '3', F: '3', G: '4', H: '4', I: '4', J: '5', K: '5', L: '5', M: '6', N: '6', O: '6', P: '7', Q: '7', R: '7', S: '7', T: '8', U: '8', V: '8', W: '9', X: '9', Y: '9', Z: '9' };
/** The phone-keypad digits a word is typed with. */
export const keypadDigits = (word: string): string => [...word].map((c) => KEYS[c]).join('');

const A = 65;
const shiftBy = (ch: string, by: number) => String.fromCharCode(A + ((((ch.charCodeAt(0) - A + by) % 26) + 26) % 26));
export const encodeShift = (plain: string, key: number[]) => [...plain].map((c, i) => shiftBy(c, key[i % key.length])).join('');
export const decodeShift = (cipher: string, key: number[]) => [...cipher].map((c, i) => shiftBy(c, -key[i % key.length])).join('');

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Moves a month/day (in a year of 365 days) on by `days`, wrapping past the year's ends. */
export function moveDate(month: number, day: number, days: number): [number, number] {
  let doy = day;
  for (let m = 1; m < month; m++) doy += MONTH_DAYS[m - 1];
  doy = ((((doy - 1 + days) % 365) + 365) % 365) + 1;
  let m = 1;
  while (doy > MONTH_DAYS[m - 1]) doy -= MONTH_DAYS[m++ - 1];
  return [m, doy];
}

/** True for a serial that obeys the rule: its last digit is the check digit of the digits before it. */
export function serialHolds(serial: string, rule: CheckRule): boolean {
  const ds = [...serial].map(Number);
  const body = ds.slice(0, -1);
  const total = rule.kind === 'sum' ? body.reduce((a, b) => a + b, 0) : body.reduce((a, b, i) => a + b * (i % 2 === 0 ? 1 : 3), 0);
  return total % rule.mod === ds[ds.length - 1];
}
const checkDigit = (body: number[], rule: CheckRule) => (rule.kind === 'sum' ? body.reduce((a, b) => a + b, 0) : body.reduce((a, b, i) => a + b * (i % 2 === 0 ? 1 : 3), 0)) % rule.mod;

/** Where the dial stops after each move, starting at 0. */
export const dialStops = (size: number, moves: { dir: 'R' | 'L'; steps: number }[]): number[] => {
  const out: number[] = [];
  let at = 0;
  for (const m of moves) {
    at = (((at + (m.dir === 'R' ? m.steps : -m.steps)) % size) + size) % size;
    out.push(at);
  }
  return out;
};

const wordAt = (pages: string[][][], [p, l, w]: [number, number, number]) => pages[p - 1][l - 1][w - 1];

/** Recomputes the answer from the data alone, by the rule. */
export function solveDecode(d: DecodeData): string {
  switch (d.variant) {
    case 'book':
      return d.picks.map((t) => wordAt(d.pages, t)).join(' ');
    case 'keypad': {
      const hits = d.names.filter((n) => keypadDigits(n) === d.digits);
      return hits.length === 1 ? hits[0] : '';
    }
    case 'shift':
      return decodeShift(d.cipher, d.key);
    case 'date': {
      const [m, day] = moveDate(d.month, d.day, d.direction * d.days);
      return pad2(m) + pad2(day);
    }
    case 'check': {
      const bad = d.serials.filter((s) => !serialHolds(s, d.rule));
      return bad.length === 1 ? bad[0] : '';
    }
    case 'dial':
      return dialStops(d.size, d.moves).map(pad2).join('');
  }
}

/** Does this puzzle's stored answer follow from its data, and are its exhibits worded from that data? */
export function verifyDecode(p: DecodePuzzle): boolean {
  const solved = solveDecode(p.data);
  if (solved === '' || normalizeAnswer(solved) !== normalizeAnswer(p.answer)) return false;
  if (p.data.variant !== p.variant) return false;
  const text = p.exhibits.flatMap((e) => e.lines).join('\n');
  switch (p.data.variant) {
    case 'book':
      return p.data.picks.every(([a, b, c]) => text.includes(`${a}-${b}-${c}`));
    case 'keypad':
      return text.includes(p.data.digits) && p.data.names.every((n) => text.includes(n));
    case 'shift':
      return text.includes(p.data.cipher) && text.includes(p.data.key.join('-'));
    case 'date':
      return text.includes(`${p.data.month}/${p.data.day}`) && text.includes(String(p.data.days));
    case 'check':
      return p.data.serials.every((s) => text.includes(s));
    case 'dial':
      return p.data.moves.every((m) => text.includes(`${m.dir} ${m.steps}`));
  }
}

/** The checks a player's typed answer is held to. */
export const isDecodeCorrect = (p: DecodePuzzle, typed: string) => normalizeAnswer(typed) === normalizeAnswer(p.answer);

const make = (variant: DecodeVariant, level: number, seed: number, data: DecodeData, exhibits: Exhibit[], question: string): DecodePuzzle => {
  const answer = solveDecode(data);
  return { type: 'decode', variant, level, exhibits, question, data, answer, seed, size: answer.length, statements: [], truth: [], liarCounts: [0] };
};

function genBook(level: number, seed: number, rng: Rng): DecodePuzzle {
  const pagesN = 3 + level * 2;
  const pages: string[][][] = [];
  for (let p = 0; p < pagesN; p++) {
    const lines: string[][] = [];
    for (let l = 0; l < 3 + level; l++) lines.push(Array.from({ length: 4 + level }, () => rng.pick(WORDS)));
    pages.push(lines);
  }
  const k = level + 1;
  const seen = new Set<string>();
  const picks: [number, number, number][] = [];
  while (picks.length < k) {
    const p = rng.int(1, pagesN);
    const l = rng.int(1, pages[p - 1].length);
    const w = rng.int(1, pages[p - 1][l - 1].length);
    const id = `${p}-${l}-${w}`;
    if (seen.has(id)) continue;
    seen.add(id);
    picks.push([p, l, w]);
  }
  const data: DecodeData = { variant: 'book', pages, picks };
  const bookLines = pages.flatMap((lines, pi) => lines.map((ws, li) => `p${pi + 1} l${li + 1}: ${ws.join(' ')}`));
  return make('book', level, seed, data, [
    { title: 'The cryptic note', lines: [picks.map((t) => t.join('-')).join(', ')] },
    { title: 'The book on the desk (page, line: words)', lines: bookLines },
  ], 'Each triple is page-line-word. Look up each word and type them in order, separated by spaces.');
}

function genKeypad(level: number, seed: number, rng: Rng): DecodePuzzle {
  const pool = [...NAMES, ...SHORT.filter((w) => w.length <= 5)];
  const names: string[] = [];
  const digitsSeen = new Set<string>();
  const count = 4 + level;
  for (const n of rng.shuffle(pool.slice())) {
    const d = keypadDigits(n);
    if (digitsSeen.has(d)) continue;
    digitsSeen.add(d);
    names.push(n);
    if (names.length === count) break;
  }
  const target = names[rng.int(0, names.length - 1)];
  const digits = keypadDigits(target);
  const data: DecodeData = { variant: 'keypad', digits, names };
  return make('keypad', level, seed, data, [
    { title: 'Scrawled on a napkin', lines: [digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits, `(raw digits: ${digits})`] },
    { title: 'Names in the suspect\'s phone', lines: names },
    { title: 'Keypad', lines: ['2 ABC', '3 DEF', '4 GHI', '5 JKL', '6 MNO', '7 PQRS', '8 TUV', '9 WXYZ'] },
  ], 'Each digit is a key on an old phone. Which name on the list is the napkin spelling? Type it.');
}

function genShift(level: number, seed: number, rng: Rng): DecodePuzzle {
  const plain = rng.pick(WORDS.filter((w) => w.length >= 4 + level && w.length <= 5 + level * 2));
  const key = Array.from({ length: 2 + Math.min(level, 3) }, () => rng.int(1, 9));
  const cipher = encodeShift(plain, key);
  const data: DecodeData = { variant: 'shift', cipher, key };
  return make('shift', level, seed, data, [
    { title: 'The scrambled message', lines: [cipher] },
    { title: "Badge number on the desk", lines: [key.join('-')] },
    { title: 'Note in the margin', lines: ['Letter 1 moves back by the first number, letter 2 by the second, and so on. When the numbers run out, start again.'] },
  ], 'Undo the shifts and type the hidden word.');
}

function genDate(level: number, seed: number, rng: Rng): DecodePuzzle {
  const month = level >= 3 ? rng.pick([1, 2, 11, 12]) : rng.int(1, 12);
  const day = rng.int(1, MONTH_DAYS[month - 1]);
  const days = rng.int(5, 20 + level * 30);
  const direction: 1 | -1 = level >= 2 && rng.next() < 0.5 ? -1 : 1;
  const data: DecodeData = { variant: 'date', month, day, days, direction };
  return make('date', level, seed, data, [
    { title: 'Wall calendar', lines: [`${month}/${day} is circled in red. (Months have 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 days; no leap year.)`] },
    { title: 'Sticky note on the safe', lines: [`Move ${direction === 1 ? 'forward' : 'back'} by the victim's age: ${days}. The PIN is the new month then the new day, two digits each.`] },
  ], 'Work out the new date and type the four-digit PIN.');
}

function genCheck(level: number, seed: number, rng: Rng): DecodePuzzle {
  const rule: CheckRule = level >= 3 ? { kind: 'weighted', mod: 10 } : { kind: 'sum', mod: 10 };
  const len = 4 + level;
  const count = 4 + Math.min(level, 2);
  const serials: string[] = [];
  const fake = rng.int(0, count - 1);
  while (serials.length < count) {
    const body = Array.from({ length: len }, () => rng.int(0, 9));
    const good = checkDigit(body, rule);
    const last = serials.length === fake ? (good + rng.int(1, 9)) % 10 : good;
    const s = body.join('') + last;
    serials.push(s);
  }
  const ruleText = rule.kind === 'sum' ? 'The last digit is the sum of all the other digits, ignoring tens (only the ones digit counts).' : 'Add the digits before the last, counting the 2nd, 4th, ... digits three times. The ones digit of that total is the last digit.';
  const data: DecodeData = { variant: 'check', serials, rule };
  return make('check', level, seed, data, [
    { title: 'Serial numbers in the stack', lines: serials },
    { title: 'Sticky note on the desk', lines: [ruleText] },
  ], 'One serial breaks the rule: it was forged. Type it.');
}

function genDial(level: number, seed: number, rng: Rng): DecodePuzzle {
  const size = level >= 3 ? 60 : 40;
  const n = 2 + level;
  const moves = Array.from({ length: n }, (_, i) => ({ dir: (i % 2 === 0 ? 'R' : 'L') as 'R' | 'L', steps: rng.int(5, size - 5) }));
  const data: DecodeData = { variant: 'dial', size, moves };
  return make('dial', level, seed, data, [
    { title: "Scribbled on the safe's lid", lines: ['Start at 0.', ...moves.map((m) => `${m.dir} ${m.steps}`)] },
    { title: 'The dial', lines: [`Numbers 0 to ${size - 1}, then back to 0. R turns up, L turns down. The code is where the dial stops after each turn, two digits each.`] },
  ], 'Work out where it stops each time and type the code.');
}

const GEN: Record<DecodeVariant, (level: number, seed: number, rng: Rng) => DecodePuzzle> = { book: genBook, keypad: genKeypad, shift: genShift, date: genDate, check: genCheck, dial: genDial };

export interface DecodeOptions {
  variant: DecodeVariant;
  /** 1 (Junior) to 4 (Chief). */
  level: number;
  seed: number;
}

/** Builds one decode puzzle. The tests check `verifyDecode` on many seeds of every variant and level. */
export function generateDecode(o: DecodeOptions): DecodePuzzle {
  const level = Math.max(1, Math.min(4, Math.round(o.level)));
  return GEN[o.variant](level, o.seed, makeRng(o.seed));
}
