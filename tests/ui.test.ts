import { describe, expect, it } from 'vitest';
import { dupe, initials, liarLine, zoneCombos } from '../src/ui/puzzleHelpers';

describe('puzzle helpers', () => {
  it('spots a repeated number in a row or column', () => {
    const grid = [
      [1, 2, 0],
      [0, 0, 2],
      [1, 0, 0],
    ];
    expect(dupe(grid, 0, 0)).toBe(true); // column 0 has two 1s
    expect(dupe(grid, 0, 1)).toBe(false);
    expect(dupe(grid, 1, 2)).toBe(false);
  });

  it('lists what a zone can hold given its rows and columns', () => {
    const empty = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    // two cells side by side in one row adding to 5
    expect(zoneCombos(4, empty, [[0, 0], [0, 1]], 5)).toEqual([[1, 4], [2, 3]]);
    // a 4 already sits in row 0, so 1 + 4 is out
    const withFour = empty.map((r) => r.slice());
    withFour[0][3] = 4;
    expect(zoneCombos(4, withFour, [[0, 0], [0, 1]], 5)).toEqual([[2, 3]]);
  });

  it('words the liar count', () => {
    expect(liarLine([0], 3, false)).toBe('Every statement here is true.');
    expect(liarLine([0], 3, true)).toBe('Everyone is telling the truth here.');
    expect(liarLine([1], 3, false)).toBe('Exactly 1 of these statements is a lie.');
    expect(liarLine([2], 4, false)).toBe('Exactly 2 of these statements are lies.');
    expect(liarLine([1, 2], 4, false)).toBe('1 or 2 of these statements are lies.');
  });

  it('makes avatar initials without titles or quotes', () => {
    expect(initials('Sgt. Dex Okafor')).toBe('DO');
    expect(initials('"Tip" Callahan')).toBe('TC');
  });
});
