import { describe, expect, it } from 'vitest';
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
      expect(answers.size).toBeGreaterThan(20);
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
