import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  allCodes, cipherStep, claimGrade, evalCipher, fittingCodes, freshTrueCipherClaim, generateCipher, maxDigit, positionsOf, randomCipherClaim, verifyCipher, wrongDigit,
  type CipherClaim, type CipherPuzzle,
} from '../src/engine/cipher';

const speakers = (n: number, lies: number) => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].slice(0, n).map((id, i) => ({ id, lies: i < lies ? 1 : 0 }));

describe('cipher claims', () => {
  const code = [3, 5, 2, 4]; // position i holds code[i]
  it('judges each kind of claim', () => {
    expect(evalCipher({ kind: 'is', p: 0, d: 3 }, code)).toBe(true);
    expect(evalCipher({ kind: 'is', p: 0, d: 4 }, code)).toBe(false);
    expect(evalCipher({ kind: 'isNot', p: 0, d: 4 }, code)).toBe(true);
    expect(evalCipher({ kind: 'even', p: 2 }, code)).toBe(true);
    expect(evalCipher({ kind: 'even', p: 1 }, code)).toBe(false);
    expect(evalCipher({ kind: 'odd', p: 1 }, code)).toBe(true);
    expect(evalCipher({ kind: 'odd', p: 2 }, code)).toBe(false);
    expect(evalCipher({ kind: 'greater', a: 1, b: 0 }, code)).toBe(true);
    expect(evalCipher({ kind: 'greater', a: 0, b: 1 }, code)).toBe(false);
    expect(evalCipher({ kind: 'sum', a: 0, b: 1, total: 8 }, code)).toBe(true);
    expect(evalCipher({ kind: 'sum', a: 0, b: 1, total: 9 }, code)).toBe(false);
    expect(evalCipher({ kind: 'apart', a: 1, b: 2, gap: 3 }, code)).toBe(true);
    expect(evalCipher({ kind: 'apart', a: 2, b: 1, gap: 2 }, code)).toBe(false);
  });

  it('grades by the reading skill each claim needs, and names the positions it is about', () => {
    expect(claimGrade({ kind: 'is', p: 0, d: 1 })).toBe(1);
    expect(claimGrade({ kind: 'odd', p: 0 })).toBe(1);
    expect(claimGrade({ kind: 'greater', a: 0, b: 1 })).toBe(2);
    expect(claimGrade({ kind: 'sum', a: 0, b: 1, total: 5 })).toBe(3);
    expect(claimGrade({ kind: 'apart', a: 0, b: 1, gap: 1 })).toBe(3);
    expect(positionsOf({ kind: 'even', p: 2 })).toEqual([2]);
    expect(positionsOf({ kind: 'greater', a: 1, b: 3 })).toEqual([1, 3]);
  });

  it('lists every code of a size: different digits from 1 to one more than the size', () => {
    expect(maxDigit(4)).toBe(5);
    expect(allCodes(4)).toHaveLength(120);
    expect(allCodes(4)).toBe(allCodes(4)); // cached
    expect(allCodes(5)).toHaveLength(720);
    for (const c of allCodes(4)) expect(new Set(c).size).toBe(4);
  });

  it('keeps the shown digits and the allowed number of lies when working out which codes fit', () => {
    const claims: CipherClaim[] = [{ kind: 'is', p: 0, d: 1 }, { kind: 'is', p: 1, d: 2 }];
    const none = { size: 4, givens: [], liarCounts: [0] };
    expect(fittingCodes(none, claims).every((c) => c[0] === 1 && c[1] === 2)).toBe(true);
    expect(fittingCodes({ ...none, liarCounts: [2] }, claims).every((c) => c[0] !== 1 && c[1] !== 2)).toBe(true);
    expect(fittingCodes({ ...none, givens: [{ p: 3, d: 5 }] }, []).every((c) => c[3] === 5)).toBe(true);
  });

  it('draws only the kinds the highest grade allows', () => {
    const rng = makeRng(9);
    const kinds = (g: number) => new Set(Array.from({ length: 400 }, () => randomCipherClaim([1, 2, 3, 4], rng, g).kind));
    expect([...kinds(1)].sort()).toEqual(['even', 'is', 'isNot', 'odd']);
    expect([...kinds(2)].sort()).toEqual(['even', 'greater', 'is', 'isNot', 'odd']);
    expect([...kinds(3)].sort()).toEqual(['apart', 'even', 'greater', 'is', 'isNot', 'odd', 'sum']);
  });
});

describe('generating ciphers', () => {
  const ranks = [
    { size: 4, lies: 1, range: false, maxGrade: 2, minGrade: 2, maxStatements: 8, givens: 0 },
    { size: 5, lies: 1, range: false, maxGrade: 3, minGrade: 3, maxStatements: 9, givens: 0 },
    { size: 6, lies: 2, range: false, maxGrade: 3, minGrade: 3, maxStatements: 10, givens: 0 },
    { size: 7, lies: 2, range: true, maxGrade: 3, minGrade: 3, maxStatements: 13, givens: 1 },
  ];
  for (const r of ranks)
    it(`builds fair ${r.size}-digit ciphers: one answer, the right lies, every speaker heard`, () => {
      for (const seed of [1, 2, 3]) {
        const p = generateCipher({ size: r.size, speakers: speakers(4, r.lies), liarRange: r.range, maxGrade: r.maxGrade, minGrade: r.minGrade, maxStatements: r.maxStatements, givens: r.givens, seed });
        expect(verifyCipher(p)).toEqual({ ok: true });
        expect(p.type).toBe('cipher');
        expect(p.size).toBe(r.size);
        expect(p.givens).toHaveLength(r.givens);
        expect(p.statements.length).toBeLessThanOrEqual(r.maxStatements);
        expect(p.truth.filter((t) => !t)).toHaveLength(r.lies);
        expect(p.liarCounts).toEqual(r.range ? [r.lies, r.lies + 1] : [r.lies]);
        expect(p.grade).toBeGreaterThanOrEqual(r.minGrade);
        for (const s of speakers(4, r.lies)) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
        // a claim never repeats, and at most one true "is"
        expect(new Set(p.statements.map((s) => JSON.stringify(s.claim))).size).toBe(p.statements.length);
        expect(p.statements.filter((s, i) => p.truth[i] && s.claim.kind === 'is').length).toBeLessThanOrEqual(1);
        // nothing is said about a digit already shown
        for (const g of p.givens) expect(p.statements.some((s) => positionsOf(s.claim).length === 1 && positionsOf(s.claim)[0] === g.p)).toBe(false);
      }
    });

  it('gives the same puzzle for the same seed, and a different one for another', () => {
    const o = { size: 4, speakers: speakers(4, 1), maxGrade: 3, seed: 11 };
    expect(generateCipher(o)).toEqual(generateCipher(o));
    expect(generateCipher({ ...o, seed: 12 })).not.toEqual(generateCipher(o));
  });

  it('makes sure every speaker says something, even with more speakers than the clues need', () => {
    const p = generateCipher({ size: 4, speakers: speakers(12, 1), maxGrade: 2, minGrade: 2, maxStatements: 14, seed: 8 });
    for (const s of speakers(12, 1)) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
    expect(verifyCipher(p)).toEqual({ ok: true });
  });

  it('works when every speaker lies, and has no room for speakers who would push past the limit', () => {
    const p = generateCipher({ size: 4, speakers: [{ id: 'a', lies: 1 }, { id: 'b', lies: 1 }], maxGrade: 3, maxStatements: 12, seed: 4 });
    expect(verifyCipher(p)).toEqual({ ok: true });
    expect(p.truth.filter((t) => !t)).toHaveLength(2);
    expect(() => generateCipher({ size: 4, speakers: speakers(12, 1), maxGrade: 2, maxStatements: 6, seed: 3 }, 20)).toThrow(/Could not generate/);
  });

  it('gives up with an error when the limits cannot be met', () => {
    expect(() => generateCipher({ size: 4, speakers: speakers(4, 1), maxGrade: 3, maxStatements: 2, seed: 1 }, 10)).toThrow(/Could not generate/);
    expect(() => generateCipher({ size: 4, speakers: speakers(4, 0), maxGrade: 1, minGrade: 3, seed: 1 }, 10)).toThrow(/Could not generate/);
  });
});

describe('the independent checker', () => {
  const p: CipherPuzzle = generateCipher({ size: 4, speakers: speakers(4, 1), maxGrade: 3, seed: 21 });
  it('passes a good puzzle and rejects broken ones', () => {
    expect(verifyCipher(p)).toEqual({ ok: true });
    // fewer statements leave several codes
    expect(verifyCipher({ ...p, statements: p.statements.slice(0, 1), truth: p.truth.slice(0, 1) }).reason).toMatch(/codes fit/);
    // the stored code is not the one that fits
    const other = allCodes(4).find((c) => c.join() !== p.code.join())!;
    expect(verifyCipher({ ...p, code: other }).reason).toMatch(/not the stored code/);
    // the stored truth disagrees
    expect(verifyCipher({ ...p, truth: p.truth.map((t, i) => (i === 0 ? !t : t)) }).reason).toMatch(/stored truth/);
  });
});

describe('cipher helpers', () => {
  const p = generateCipher({ size: 5, speakers: speakers(4, 1), maxGrade: 3, minGrade: 3, seed: 5 });
  it('finds the first wrong digit', () => {
    expect(wrongDigit(p, [0, 0, 0, 0, 0])).toBe(-1);
    expect(wrongDigit(p, p.code)).toBe(-1);
    const bad = p.code.slice();
    bad[2] = bad[2] === 1 ? 2 : 1;
    expect(wrongDigit(p, bad)).toBe(2);
  });

  it('points the partner at an empty position with a true statement, then at none once all are filled', () => {
    const empty = [0, 0, 0, 0, 0];
    const first = cipherStep(p, empty)!;
    expect(p.truth[first.statement]).toBe(true);
    expect(positionsOf(p.statements[first.statement].claim)).toContain(first.pos);
    // prefers a statement whose other position is already filled
    const some = p.code.map((d, i) => (i === first.pos ? 0 : d));
    const next = cipherStep(p, some)!;
    expect(next.pos).toBe(first.pos);
    expect(cipherStep(p, p.code)).toBeNull();
  });

  it('sells a true statement the player does not have yet, and runs out', () => {
    const have = p.statements.map((s) => s.claim);
    const tip = freshTrueCipherClaim(p, have, makeRng(3))!;
    expect(evalCipher(tip, p.code)).toBe(true);
    expect(have.some((c) => JSON.stringify(c) === JSON.stringify(tip))).toBe(false);
    expect(freshTrueCipherClaim(p, have, makeRng(3), 0)).toBeNull();
  });
});
