import { describe, expect, it } from 'vitest';
import { calcLines, clock, solveCalc, type CalcData } from '../src/engine/calc';
import { DECODE_VARIANTS, decodeShift, dialStops, encodeShift, generateDecode, isDecodeCorrect, keypadDigits, moveDate, normalizeAnswer, serialHolds, solveDecode, verifyDecode, type DecodePuzzle } from '../src/engine/decode';

describe('decode rules', () => {
  it('moves a date across month and year ends', () => {
    expect(moveDate(10, 24, 10)).toEqual([11, 3]);
    expect(moveDate(12, 30, 5)).toEqual([1, 4]);
    expect(moveDate(1, 3, -5)).toEqual([12, 29]);
  });
  it('spells names on a phone keypad', () => {
    expect(keypadDigits('KILL')).toBe('5455');
    expect(keypadDigits('JOHN')).toBe('5646');
  });
  it('shifts and unshifts with a repeating key', () => {
    expect(encodeShift('AAAA', [4, 1, 9])).toBe('EBJE');
    expect(decodeShift('EBJE', [4, 1, 9])).toBe('AAAA');
  });
  it('wraps the dial', () => {
    expect(dialStops(60, [{ dir: 'R', steps: 25 }, { dir: 'L', steps: 40 }, { dir: 'R', steps: 15 }])).toEqual([25, 45, 0]);
  });
  it('checks serials by both rules', () => {
    expect(serialHolds('12306', { kind: 'sum', mod: 10 })).toBe(true);
    expect(serialHolds('12307', { kind: 'sum', mod: 10 })).toBe(false);
    expect(serialHolds('10300', { kind: 'weighted', mod: 10 })).toBe(false);
    expect(serialHolds('12384', { kind: 'weighted', mod: 10 })).toBe(true);
  });
  it('normalizes typed answers', () => {
    expect(normalizeAnswer('  anchor,   lantern ')).toBe('ANCHOR LANTERN');
  });
});

describe('every variant at every level', () => {
  for (const variant of DECODE_VARIANTS) {
    it(`${variant}: 60 seeds verify, answers differ, and a wrong answer fails`, () => {
      const answers = new Set<string>();
      const texts = new Set<string>();
      for (let level = 1; level <= 4; level++) {
        for (let seed = 1; seed <= 15; seed++) {
          const p = generateDecode({ variant, level, seed: seed * 7 + level });
          expect(verifyDecode(p)).toBe(true);
          expect(isDecodeCorrect(p, p.answer.toLowerCase())).toBe(true);
          expect(isDecodeCorrect(p, p.answer + 'X')).toBe(false);
          expect(solveDecode(p.data)).toBe(p.answer);
          answers.add(p.answer);
          texts.add(JSON.stringify(p.exhibits));
        }
      }
      expect(answers.size).toBeGreaterThan(variant === 'dice' ? 3 : variant === 'scale' ? 6 : variant === 'receipt' ? 12 : 20);
      expect(texts.size).toBeGreaterThan(55);
    });
    it(`${variant}: the same seed builds the same puzzle`, () => {
      expect(generateDecode({ variant, level: 2, seed: 99 })).toEqual(generateDecode({ variant, level: 2, seed: 99 }));
    });
  }

  it('gets harder with level', () => {
    const len = (v: 'book' | 'dial' | 'check', l: number) => generateDecode({ variant: v, level: l, seed: 5 }).exhibits.flatMap((e) => e.lines).length;
    for (const v of ['book', 'dial', 'check'] as const) expect(len(v, 4)).toBeGreaterThanOrEqual(len(v, 1));
    expect(generateDecode({ variant: 'book', level: 4, seed: 5 }).answer.split(' ').length).toBeGreaterThan(generateDecode({ variant: 'book', level: 1, seed: 5 }).answer.split(' ').length);
  });

  it('clamps an out-of-range level', () => {
    expect(generateDecode({ variant: 'dial', level: 99, seed: 1 }).level).toBe(4);
    expect(generateDecode({ variant: 'dial', level: -3, seed: 1 }).level).toBe(1);
  });
});

describe('verifyDecode rejects bad puzzles', () => {
  const good = (): DecodePuzzle => generateDecode({ variant: 'keypad', level: 2, seed: 3 });
  it('a changed answer', () => {
    expect(verifyDecode({ ...good(), answer: 'NOPE' })).toBe(false);
  });
  it('a variant that disagrees with its data', () => {
    expect(verifyDecode({ ...good(), variant: 'dial' })).toBe(false);
  });
  it('two names that spell the same digits', () => {
    const p = good();
    if (p.data.variant !== 'keypad') throw new Error('x');
    const twin = [...p.data.names, p.answer];
    expect(verifyDecode({ ...p, data: { ...p.data, names: twin } })).toBe(false);
  });
  it('two forged serials', () => {
    const p = generateDecode({ variant: 'check', level: 1, seed: 4 });
    if (p.data.variant !== 'check') throw new Error('x');
    const rule = p.data.rule;
    const real = p.data.serials.filter((s) => serialHolds(s, rule));
    const breakOne = (s: string) => s.slice(0, -1) + ((Number(s.at(-1)) + 1) % 10);
    const serials = [breakOne(real[0]), breakOne(real[1]), ...p.data.serials.filter((s) => s !== real[0] && s !== real[1])];
    expect(verifyDecode({ ...p, data: { ...p.data, serials } })).toBe(false);
  });
  it('exhibits that were not built from the data', () => {
    for (const v of DECODE_VARIANTS) {
      const p = generateDecode({ variant: v, level: 1, seed: 8 });
      expect(verifyDecode({ ...p, exhibits: [{ title: 't', lines: ['nothing here'] }] })).toBe(false);
    }
  });
});

describe('the guess-and-feedback puzzles', () => {
  it('bulls: keeps adding tries until one code is left, and never repeats a digit in the code', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = generateDecode({ variant: 'bulls', level: 1 + (seed % 4), seed });
      expect(new Set(p.answer).size).toBe(p.answer.length);
      expect(p.exhibits[0].lines.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('smudge: the PIN uses exactly the smudged keys', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = generateDecode({ variant: 'smudge', level: 1 + (seed % 4), seed });
      if (p.data.variant !== 'smudge') throw new Error('x');
      expect([...p.answer].map(Number).sort((a, b) => a - b)).toEqual(p.data.keys);
    }
  });
  it('scale: known-lighter ranks answer with a number, unknown-weight ranks add LIGHTER or HEAVIER', () => {
    expect(generateDecode({ variant: 'scale', level: 1, seed: 3 }).answer).toMatch(/^\d+$/);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) seen.add(generateDecode({ variant: 'scale', level: 3, seed }).answer.split(' ')[1]);
    expect([...seen].sort()).toEqual(['HEAVIER', 'LIGHTER']);
  });
  it('rejects clues that leave several answers or none', () => {
    const p = generateDecode({ variant: 'bulls', level: 2, seed: 4 });
    if (p.data.variant !== 'bulls') throw new Error('x');
    expect(solveDecode({ ...p.data, tries: p.data.tries.slice(0, 1) })).toBe('');
    const s = generateDecode({ variant: 'scale', level: 1, seed: 4 });
    if (s.data.variant !== 'scale') throw new Error('x');
    expect(solveDecode({ ...s.data, weighings: [] })).toBe('');
    const m = generateDecode({ variant: 'smudge', level: 2, seed: 4 });
    if (m.data.variant !== 'smudge') throw new Error('x');
    expect(solveDecode({ ...m.data, facts: [] })).toBe('');
  });
});

describe('the calculation puzzles', () => {
  it('wraps a clock past midnight', () => {
    expect(clock(-15)).toBe('2345');
    expect(clock(1440 + 75)).toBe('0115');
  });
  it('receipt: works the torn price out from the change', () => {
    // subtotal 30 + 10% tax = 33; paid 50, change 17; items 12 + torn + 8 -> torn = 10
    const d: CalcData = { variant: 'receipt', items: [{ name: 'A', price: 12 }, { name: 'B', price: null }, { name: 'C', price: 8 }], rate: 10, paid: 50, change: 17 };
    expect(solveCalc(d)).toBe('10');
    expect(solveCalc({ ...d, change: 16 })).toBe('');
    expect(solveCalc({ ...d, items: [{ name: 'A', price: 12 }, { name: 'B', price: 1 }, { name: 'C', price: 8 }] })).toBe('');
    expect(solveCalc({ ...d, items: [{ name: 'A', price: 12 }, { name: 'B', price: null }, { name: 'C', price: 30 }] })).toBe('');
    expect(calcLines(d)[1]).toContain('torn');
  });
  it('zone: adds the zone difference and wraps at midnight', () => {
    const d = { variant: 'zone', watch: '03:15', from: { city: 'A', offset: 0 }, to: { city: 'B', offset: 3 } } as const;
    expect(solveCalc(d)).toBe('0615');
    expect(solveCalc({ ...d, watch: '23:30' })).toBe('0230');
    expect(solveCalc({ ...d, to: { city: 'C', offset: -5 } })).toBe('2215');
    expect(solveCalc({ ...d, to: { city: 'C', offset: 5.5 } })).toBe('0845');
  });
  it('cooling: counts back from when the cup was found', () => {
    const d = { variant: 'cooling', found: '02:00', foundTemp: 54, startTemp: 90, perHour: 9 } as const;
    expect(solveCalc(d)).toBe('2200');
    expect(solveCalc({ ...d, foundTemp: 49.5, perHour: 9 })).toBe('2130');
    expect(solveCalc({ ...d, foundTemp: 53 })).toBe('');
    expect(solveCalc({ ...d, foundTemp: 95 })).toBe('');
  });
  it('triangulate: needs exactly one crossing that fits every report', () => {
    const towers = [{ x: 0, y: 0, d: 2 }];
    expect(solveCalc({ variant: 'triangulate', size: 5, towers })).toBe('');
    expect(solveCalc({ variant: 'triangulate', size: 5, towers: [{ x: 0, y: 0, d: 4 }, { x: 4, y: 0, d: 2 }] })).toBe('3 1');
    expect(solveCalc({ variant: 'triangulate', size: 5, towers: [{ x: 0, y: 0, d: 20 }] })).toBe('');
  });
  it('dice: only one die may look rigged', () => {
    const fair = [10, 10, 10, 10, 10, 10];
    const loaded = [30, 6, 6, 6, 6, 6];
    expect(solveCalc({ variant: 'dice', rolls: 60, dice: [fair, loaded, fair] })).toBe('2');
    expect(solveCalc({ variant: 'dice', rolls: 60, dice: [fair, fair] })).toBe('');
    expect(solveCalc({ variant: 'dice', rolls: 60, dice: [loaded, loaded] })).toBe('');
  });
});
