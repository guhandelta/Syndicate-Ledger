import { describe, expect, it } from 'vitest';
import { enumerateBalance, verifyBalance, type BalanceSheet } from '../src/engine/balance';

// 2x2 books: a + b = 3, c + d = 4 (rows); a + c = 4, b + d = 3 (columns).
// Without a statement, a can be 1..3 (three grids, since amounts stop at 3). "a is 1" leaves exactly one.
const base: BalanceSheet = { size: 2, maxValue: 3, rowTotals: [3, 4], colTotals: [4, 3], claims: [], takeaway: [1, 1] };

describe('balance sheet', () => {
  it('finds every grid the totals allow, when nothing else is known', () => {
    expect(enumerateBalance(base).length).toBe(3);
  });

  it('leaves one grid once a statement pins it, and the takeaway is its amount', () => {
    const p = { ...base, claims: [{ kind: 'is' as const, cell: [0, 0] as [number, number], value: 1 }] };
    expect(enumerateBalance(p)).toEqual([[[1, 2], [3, 1]]]);
    expect(verifyBalance(p)).toMatchObject({ ok: true, answer: 1 });
  });

  it('rejects a puzzle that stays open, and one whose totals do not fit the size', () => {
    expect(verifyBalance(base)).toMatchObject({ ok: false, reason: 'more than one grid fits the totals and statements' });
    expect(verifyBalance({ ...base, size: 3 })).toMatchObject({ ok: false, reason: 'the totals do not match the grid size' });
  });

  it('rejects statements that no grid can meet', () => {
    const p = { ...base, claims: [{ kind: 'is' as const, cell: [0, 0] as [number, number], value: 9 }] };
    expect(verifyBalance(p)).toMatchObject({ ok: false, reason: 'no grid fits the totals and statements' });
  });

  it('checks a statement across two cells as soon as both are filled', () => {
    const p = { ...base, claims: [{ kind: 'compare' as const, a: [0, 0] as [number, number], b: [0, 1] as [number, number], op: 'gt' as const }] };
    expect(enumerateBalance(p).every((g) => g[0][0] > g[0][1])).toBe(true);
  });
});
