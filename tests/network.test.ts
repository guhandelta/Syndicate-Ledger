import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  claimGrade, degreesOf, evalNet, fittingNetworks, freshTrueNetClaim, generateNetwork, linkedIn, networksWithDegrees, networkStep, pairIndex, pairs, peopleOf,
  randomNetClaim, verifyNetwork, wrongPair, type NetClaim, type NetworkPuzzle,
} from '../src/engine/network';

const speakers = (n: number, lies: number) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].slice(0, n).map((id, i) => ({ id, lies: i < lies ? 1 : 0 }));

describe('network basics', () => {
  it('lists every pair once, in the order the links use', () => {
    expect(pairs(4)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
    pairs(5).forEach(([a, b], k) => {
      expect(pairIndex(5, a, b)).toBe(k);
      expect(pairIndex(5, b, a)).toBe(k);
    });
  });

  // a square 0-1-2-3-0 with no diagonals
  const square = [1, 0, 1, 1, 0, 1];
  it('reads contacts and counts from the links', () => {
    expect(linkedIn(4, square, 0, 1)).toBe(true);
    expect(linkedIn(4, square, 0, 2)).toBe(false);
    expect(degreesOf(4, square)).toEqual([2, 2, 2, 2]);
  });

  it('judges each kind of claim', () => {
    const e = (c: NetClaim) => evalNet(c, 4, square);
    expect(e({ kind: 'linked', a: 0, b: 1 })).toBe(true);
    expect(e({ kind: 'notLinked', a: 0, b: 2 })).toBe(true);
    expect(e({ kind: 'notLinked', a: 0, b: 1 })).toBe(false);
    // 0 and 2 share 1 and 3
    expect(e({ kind: 'common', a: 0, b: 2 })).toBe(true);
    expect(e({ kind: 'noCommon', a: 0, b: 2 })).toBe(false);
    // 0 and 1 are linked but share nobody
    expect(e({ kind: 'common', a: 0, b: 1 })).toBe(false);
    expect(e({ kind: 'noCommon', a: 0, b: 1 })).toBe(true);
    expect(e({ kind: 'oneOf', a: 0, b: 1, c: 2 })).toBe(true);
    expect(e({ kind: 'oneOf', a: 0, b: 1, c: 3 })).toBe(false);
    expect(e({ kind: 'oneOf', a: 0, b: 2, c: 3 })).toBe(true);
  });

  it('grades by the reading each claim needs and names the people', () => {
    expect(claimGrade({ kind: 'linked', a: 0, b: 1 })).toBe(1);
    expect(claimGrade({ kind: 'common', a: 0, b: 1 })).toBe(2);
    expect(claimGrade({ kind: 'oneOf', a: 0, b: 1, c: 2 })).toBe(3);
    expect(peopleOf({ kind: 'noCommon', a: 3, b: 1 })).toEqual([3, 1]);
    expect(peopleOf({ kind: 'oneOf', a: 3, b: 1, c: 0 })).toEqual([3, 1, 0]);
  });

  it('finds every network with the counts, and remembers them', () => {
    // a square, a different square and the two that cross: counts 2,2,2,2 fit the three four-cycles
    const all = networksWithDegrees([2, 2, 2, 2]);
    expect(all).toHaveLength(3);
    expect(networksWithDegrees([2, 2, 2, 2])).toBe(all);
    expect(all.every((l) => degreesOf(4, l).every((d) => d === 2))).toBe(true);
    expect(networksWithDegrees([3, 1, 1, 1])).toHaveLength(1);
    expect(networksWithDegrees([3, 3, 3, 3])).toHaveLength(1);
    expect(networksWithDegrees([3, 0, 0, 0])).toHaveLength(0);
  });

  it('draws only the kinds a grade allows', () => {
    const rng = makeRng(5);
    const kinds = (g: number) => new Set(Array.from({ length: 400 }, () => randomNetClaim(6, rng, g).kind));
    expect([...kinds(1)].sort()).toEqual(['linked', 'notLinked']);
    expect(kinds(2).has('oneOf')).toBe(false);
    expect(kinds(2).has('common')).toBe(true);
    expect(kinds(3).has('oneOf')).toBe(true);
  });
});

describe('generating networks', () => {
  const cases: [string, number, number, number, number, boolean, number][] = [
    ['Junior', 4, 1, 2, 2, false, 2],
    ['Detective', 5, 1, 3, 3, false, 6],
    ['Inspector', 6, 2, 3, 3, false, 12],
    ['Chief', 7, 2, 3, 3, true, 25],
  ];
  for (const [name, n, lies, minGrade, maxGrade, liarRange, minBase] of cases)
    for (const seed of [11, 12, 13]) {
      it(`${name}: ${n} people, seed ${seed}, has exactly one answer and is never trivial`, () => {
        const p = generateNetwork({ size: n, speakers: speakers(Math.min(n, 5), lies), minGrade, maxGrade, liarRange, minBase, maxStatements: n + 6, seed });
        expect(verifyNetwork(p)).toEqual({ ok: true });
        expect(p.grade).toBeGreaterThanOrEqual(minGrade);
        expect(p.grade).toBeLessThanOrEqual(maxGrade);
        expect(p.baseSolutions).toBeGreaterThanOrEqual(minBase);
        expect(p.truth.filter((t) => !t)).toHaveLength(lies);
        expect(p.liarCounts).toEqual(liarRange ? [lies, lies + 1] : [lies]);
        for (const s of speakers(Math.min(n, 5), lies)) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
      });
    }

  it('is the same puzzle for the same seed', () => {
    const o = { size: 5, speakers: speakers(4, 1), maxGrade: 3, minGrade: 2, seed: 77 };
    expect(generateNetwork(o)).toEqual(generateNetwork(o));
  });

  it('works when every speaker lies, with many speakers, and without a minimum grade', () => {
    const liars = [{ id: 'a', lies: 1 }, { id: 'b', lies: 1 }];
    expect(verifyNetwork(generateNetwork({ size: 5, speakers: liars, maxGrade: 3, maxStatements: 12, seed: 31 }))).toEqual({ ok: true });
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
    const p = generateNetwork({ size: 5, speakers: many, maxGrade: 3, minGrade: 2, maxStatements: 12, seed: 8 });
    for (const s of many) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
    expect(verifyNetwork(p)).toEqual({ ok: true });
  });

  it('says so when no puzzle fits the limits', () => {
    expect(() => generateNetwork({ size: 6, speakers: speakers(5, 2), maxGrade: 3, maxStatements: 2, seed: 1 }, 60)).toThrow(/Could not generate a 6-person network/);
    expect(() => generateNetwork({ size: 4, speakers: speakers(4, 1), maxGrade: 2, minGrade: 3, seed: 1 }, 3)).toThrow(/Could not generate/);
    expect(() => generateNetwork({ size: 5, speakers: speakers(5, 1), maxGrade: 3, minBase: 9999, seed: 1 }, 3)).toThrow(/Could not generate/);
    expect(() => generateNetwork({ size: 5, speakers: [{ id: 'a', lies: 1 }], maxGrade: 3, maxStatements: 0, seed: 3 }, 4)).toThrow(/Could not generate/);
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
    expect(() => generateNetwork({ size: 5, speakers: many, maxGrade: 3, minGrade: 2, maxStatements: 5, seed: 8 }, 5)).toThrow(/Could not generate/);
  });

  it('rejects a puzzle that was tampered with', () => {
    const p = generateNetwork({ size: 4, speakers: speakers(4, 1), maxGrade: 2, minGrade: 2, seed: 5 });
    expect(verifyNetwork({ ...p, statements: p.statements.slice(0, 1) }).ok).toBe(false);
    expect(verifyNetwork({ ...p, truth: p.truth.map((t) => !t) }).reason).toMatch(/stored truth/);
    expect(verifyNetwork({ ...p, degrees: p.degrees.map((d) => d + 1) }).reason).toMatch(/counts do not match/);
    const other = networksWithDegrees(p.degrees).find((l) => l.some((v, i) => v !== p.links[i]))!;
    expect(verifyNetwork({ ...p, links: other }).ok).toBe(false);
    // counts that leave only one network make the statements pointless
    const one = { ...p, links: [1, 1, 1, 0, 0, 0], degrees: [3, 1, 1, 1] };
    expect(verifyNetwork(one).reason).toMatch(/already give one network/);
  });
});

describe('network helpers', () => {
  const p: NetworkPuzzle = generateNetwork({ size: 5, speakers: speakers(4, 1), maxGrade: 3, minGrade: 2, seed: 21 });
  const none = pairs(5).map(() => 0);

  it('finds the first wrong mark and ignores undecided pairs', () => {
    expect(wrongPair(p, none)).toBeNull();
    const right = p.links.map((v) => (v ? 1 : 2));
    expect(wrongPair(p, right)).toBeNull();
    const bad = right.slice();
    bad[3] = bad[3] === 1 ? 2 : 1;
    expect(wrongPair(p, bad)).toEqual(pairs(5)[3]);
  });

  it('points at an undecided pair and a true statement that bears on it, then at nothing', () => {
    const step = networkStep(p, none)!;
    expect(step.pair).toEqual(pairs(5)[0]);
    if (step.statement >= 0) {
      expect(p.truth[step.statement]).toBe(true);
      const who = peopleOf(p.statements[step.statement].claim);
      expect(who.some((x) => step.pair.includes(x))).toBe(true);
    }
    expect(networkStep(p, p.links.map((v) => (v ? 1 : 2)))).toBeNull();
    // a pair nobody speaks about still gets pointed at, with no statement
    const lonely: NetworkPuzzle = { ...p, statements: [] };
    expect(networkStep(lonely, none)).toEqual({ pair: pairs(5)[0], statement: -1 });
    // statements that are lies are never offered, and ones about other people are skipped
    const liesOnly: NetworkPuzzle = { ...p, truth: p.truth.map(() => false) };
    expect(networkStep(liesOnly, none)!.statement).toBe(-1);
    const elsewhere: NetworkPuzzle = { ...p, statements: [{ speaker: 'a', claim: { kind: 'linked', a: 3, b: 4 } }], truth: [true] };
    expect(networkStep(elsewhere, none)!.statement).toBe(-1);
  });

  it('prefers the simplest statement about the pair', () => {
    const q: NetworkPuzzle = {
      ...p,
      statements: [{ speaker: 'a', claim: { kind: 'oneOf', a: 0, b: 1, c: 2 } }, { speaker: 'b', claim: { kind: 'linked', a: 0, b: 1 } }, { speaker: 'c', claim: { kind: 'common', a: 0, b: 1 } }],
      truth: [true, true, true],
    };
    expect(networkStep(q, none)!.statement).toBe(1);
  });

  it('sells a true statement the player does not have yet, and gives up when no draw is fresh', () => {
    const have = p.statements.map((s) => s.claim);
    const c = freshTrueNetClaim(p, have, makeRng(9))!;
    expect(evalNet(c, 5, p.links)).toBe(true);
    expect(have.some((h) => JSON.stringify(h) === JSON.stringify(c))).toBe(false);
    expect(freshTrueNetClaim(p, [], makeRng(1), 0)).toBeNull();
  });

  it('keeps only the networks that fit the counts and an allowed number of lies', () => {
    expect(fittingNetworks(p, p.statements.map((s) => s.claim))).toEqual([p.links]);
  });
});
