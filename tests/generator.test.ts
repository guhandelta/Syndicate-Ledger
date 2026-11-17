import { describe, expect, it } from 'vitest';
import { generatePuzzle, verifyUnique, randomClaim } from '../src/engine/generator';
import { makeRng } from '../src/engine/rng';
import type { GenerateOptions } from '../src/engine/generator';

const base = (over: Partial<GenerateOptions> = {}): GenerateOptions => ({
  size: 4,
  type: 'ledger',
  speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 0 }],
  maxGrade: 4,
  seed: 5,
  ...over,
});

describe('generator options and failures', () => {
  it('uses its defaults for the base grid limit and the statement cap', () => {
    const p = generatePuzzle(base());
    expect(verifyUnique(p)).toEqual({ ok: true });
  });

  it('makes puzzles with a liar range, a minimum grade and several liars', () => {
    const ranged = generatePuzzle(base({ size: 5, speakers: [{ id: 'a', lies: 1 }, { id: 'b', lies: 0 }], liarRange: true, maxGrade: 4, seed: 11 }));
    expect(ranged.liarCounts).toHaveLength(2);
    const hard = generatePuzzle(base({ size: 5, minGrade: 2, speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 1 }, { id: 'c', lies: 0 }], seed: 3 }), 600);
    expect(hard.grade).toBeGreaterThanOrEqual(2);
    expect(verifyUnique(hard)).toEqual({ ok: true });
  });

  it('can start a ledger puzzle from a few given cells', () => {
    const p = generatePuzzle(base({ size: 5, ledgerGivens: 3, seed: 4 }), 600);
    expect(p.givens).toHaveLength(3);
    expect(verifyUnique(p)).toEqual({ ok: true });
  });

  it('makes a surveillance puzzle and uses everyone as a speaker when all are liars', () => {
    const p = generatePuzzle(base({ size: 5, type: 'surveillance', speakers: [{ id: 'a', lies: 1 }, { id: 'b', lies: 1 }], seed: 9 }), 600);
    expect(p.type).toBe('surveillance');
    expect(p.statements.some((s) => s.speaker === 'a')).toBe(true);
    expect(p.statements.some((s) => s.speaker === 'b')).toBe(true);
  });

  it('gives up when the clues can never be fair', () => {
    expect(() => generatePuzzle(base({ maxBase: 1 }), 3)).toThrow(/Could not generate a 4x4 ledger puzzle/);
    expect(() => generatePuzzle(base({ type: 'surveillance', maxBase: 1 }), 3)).toThrow();
    expect(() => generatePuzzle(base({ maxStatements: 0 }), 5)).toThrow();
    expect(() => generatePuzzle(base({ maxGrade: 0 }), 5)).toThrow();
    expect(() => generatePuzzle(base({ minGrade: 99 }), 5)).toThrow();
    expect(() => generatePuzzle(base({ speakers: [{ id: 'a', lies: 40 }] }), 3)).toThrow();
  });

  it('draws every kind of claim', () => {
    const rng = makeRng(1);
    const sol = [[1, 2, 3, 4], [2, 3, 4, 1], [3, 4, 1, 2], [4, 1, 2, 3]];
    const kinds = new Set<string>();
    for (let i = 0; i < 600; i++) {
      kinds.add(randomClaim(sol, 'ledger', rng).kind);
      kinds.add(randomClaim(sol, 'surveillance', rng).kind);
    }
    expect([...kinds].sort()).toEqual(['adjacent', 'atLeast', 'atMost', 'compare', 'is', 'isNot', 'notAdjacent', 'sum']);
  });
});

describe('verifyUnique reports what is wrong', () => {
  const good = () => generatePuzzle(base({ seed: 21 }));
  it('catches every kind of damage', () => {
    const p = good();
    expect(verifyUnique({ ...p, zones: [], givens: [{ cell: [0, 0], value: 1 }, { cell: [0, 1], value: 2 }, { cell: [0, 2], value: 3 }, { cell: [1, 0], value: 2 }, { cell: [1, 1], value: 1 }] })).toMatchObject({ ok: false });
    const everything = p.solution.flatMap((row, r) => row.map((value, c) => ({ cell: [r, c] as [number, number], value })));
    expect(verifyUnique({ ...p, zones: [], givens: everything })).toEqual({ ok: false, reason: 'base clues alone already give one grid' });
    expect(verifyUnique({ ...p, statements: [] })).toMatchObject({ ok: false, reason: expect.stringContaining('grids fit') });
    const otherSolution = p.solution.map((r) => r.slice());
    [otherSolution[0][0], otherSolution[0][1]] = [otherSolution[0][1], otherSolution[0][0]];
    expect(verifyUnique({ ...p, solution: otherSolution })).toMatchObject({ ok: false });
    expect(verifyUnique({ ...p, truth: p.truth.map((t) => !t) })).toMatchObject({ ok: false, reason: 'stored truth does not match the solution' });
  });

  it('plants an anchor in the answer, and only answers with it are kept', () => {
    const p = generatePuzzle(base({ size: 5, type: 'surveillance', speakers: [{ id: 'a', lies: 1 }], seed: 11, anchors: [{ cell: [3, 0], value: 3 }] }), 3000);
    expect(p.solution[3][0]).toBe(3);
    expect(verifyUnique(p).ok).toBe(true);
  });
});
