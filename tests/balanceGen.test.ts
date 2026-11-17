import { describe, expect, it } from 'vitest';
import { candidates, generateBalance, tryBalance } from '../src/engine/balanceGen';
import { makeRng } from '../src/engine/rng';
import { verifyBalance } from '../src/engine/balance';
import { evalClaim } from '../src/engine/claims';

describe('balance-sheet generator', () => {
  it('makes 3x3 sheets that have exactly one answer, and the answer is the planted grid', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const p = generateBalance({ size: 3, maxValue: 9, minStatements: 1, maxStatements: 10, seed });
      expect(p.claims.length).toBeLessThanOrEqual(10);
      expect(verifyBalance(p).ok).toBe(true);
      expect(verifyBalance(p).solution).toEqual(p.solution);
    }
  });

  it('makes a 4x4 sheet with a small maximum amount', () => {
    const p = generateBalance({ size: 4, maxValue: 5, minStatements: 1, maxStatements: 10, seed: 3 }, 300);
    expect(verifyBalance(p).ok).toBe(true);
    expect(p.claims.length).toBeGreaterThanOrEqual(1);
    expect(p.claims.length).toBeLessThanOrEqual(10);
  });

  it('gives only true statements, and sums cover two or three cells', () => {
    const sol = [
      [1, 2],
      [3, 0],
    ];
    const pool = candidates(sol, makeRng(4));
    expect(pool.length).toBeGreaterThan(0);
    for (const cl of pool) expect(evalClaim(cl, sol)).toBe(true);
    for (const cl of pool) {
      if (cl.kind === 'sum') expect([2, 3]).toContain(cl.cells.length);
    }
  });

  it('gives up when the amount cap leaves no way to pin the answer', () => {
    expect(tryBalance({ size: 3, maxValue: 9, minStatements: 1, maxStatements: 0, seed: 5 }, 5)).toBeNull();
    expect(() => generateBalance({ size: 3, maxValue: 9, minStatements: 1, maxStatements: 0, seed: 5 }, 3)).toThrow(
      /Could not build a 3x3 balance sheet/,
    );
  });

  it('gives up on an all-zero sheet, since there is no takeaway to point at', () => {
    expect(tryBalance({ size: 2, maxValue: 0, minStatements: 0, maxStatements: 5, seed: 1 }, 1)).toBeNull();
  });

  it('refuses when the statements are fewer than the minimum', () => {
    expect(tryBalance({ size: 3, maxValue: 9, minStatements: 50, maxStatements: 10, seed: 2 }, 2)).toBeNull();
  });
});
