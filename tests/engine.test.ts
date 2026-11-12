import { describe, expect, it } from 'vitest';
import { enumerate } from '../src/engine/solver';
import { evalClaim } from '../src/engine/claims';
import { generatePuzzle, verifyUnique } from '../src/engine/generator';
import { gradePuzzle, nextStep } from '../src/engine/logic';

describe('solver', () => {
  it('counts all 4x4 Latin squares', () => {
    expect(enumerate({ size: 4, zones: [], givens: [] }, 10_000).length).toBe(576);
  });
  it('respects zone sums', () => {
    const grids = enumerate({ size: 4, zones: [{ cells: [[0, 0], [0, 1]], sum: 3 }], givens: [] }, 10_000);
    expect(grids.length).toBeGreaterThan(0);
    for (const g of grids) expect(g[0][0] + g[0][1]).toBe(3);
  });
});

describe('claims', () => {
  const g = [[1, 2], [2, 1]];
  it('evaluates', () => {
    expect(evalClaim({ kind: 'compare', a: [0, 1], b: [0, 0], op: 'gt' }, g)).toBe(true);
    expect(evalClaim({ kind: 'sum', cells: [[0, 0], [1, 0]], value: 3 }, g)).toBe(true);
    expect(evalClaim({ kind: 'adjacent', a: [0, 0], b: [0, 1] }, g)).toBe(true);
    expect(evalClaim({ kind: 'atMost', cell: [1, 0], value: 1 }, g)).toBe(false);
  });
});

describe('generator', () => {
  const cases = [
    { size: 4, type: 'ledger' as const, lies: 0, maxGrade: 2 },
    { size: 5, type: 'surveillance' as const, lies: 1, maxGrade: 3 },
    { size: 6, type: 'ledger' as const, lies: 1, maxGrade: 4 },
    { size: 6, type: 'ledger' as const, lies: 2, maxGrade: 4, liarRange: true },
  ];
  for (const c of cases)
    it(`makes a fair ${c.size}x${c.size} ${c.type} puzzle with ${c.lies} lie(s)`, () => {
      const p = generatePuzzle({
        size: c.size,
        type: c.type,
        speakers: [{ id: 'liar', lies: c.lies }, { id: 'honest', lies: 0 }],
        maxGrade: c.maxGrade,
        liarRange: c.liarRange,
        seed: 42,
      });
      expect(verifyUnique(p)).toEqual({ ok: true });
      expect(p.truth.filter((t) => !t).length).toBe(c.lies);
      expect(p.baseSolutions).toBeGreaterThanOrEqual(2);
      expect(gradePuzzle(p, p.truth)).toBe(p.grade);
      const empty = p.solution.map((row) => row.map(() => 0));
      const step = nextStep(p, p.truth, empty);
      expect(step).not.toBeNull();
      expect(step!.value).toBe(p.solution[step!.cell[0]][step!.cell[1]]);
    }, 60_000);
});
