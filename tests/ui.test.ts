import { describe, expect, it } from 'vitest';
import { dupe, initials, liarLine, tornParts, zoneCombos } from '../src/ui/puzzleHelpers';

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

  it('spots a repeat along a row', () => {
    expect(dupe([[1, 1], [0, 0]], 0, 0)).toBe(true);
  });

  it('works out zone combinations around filled cells', () => {
    const empty = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    // a number already placed in a zone cell fixes that cell
    const placed = empty();
    placed[0][0] = 2;
    expect(zoneCombos(4, placed, [[0, 0], [0, 1]], 5)).toEqual([[2, 3]]);
    // a number sitting in a zone cell's column outside the zone is ruled out
    const column = empty();
    column[2][0] = 4;
    column[2][1] = 4;
    expect(zoneCombos(4, column, [[0, 0], [0, 1]], 5)).toEqual([[2, 3]]);
    // numbers in the zone's own cells don't rule each other out through the grid
    const own = empty();
    own[1][0] = 3;
    expect(zoneCombos(4, own, [[0, 0], [1, 0]], 5)).toEqual([[2, 3]]);
    // the same number can't repeat in a row or column inside a zone, but can on a diagonal
    expect(zoneCombos(4, empty(), [[0, 0], [0, 1]], 4)).toEqual([[1, 3]]);
    expect(zoneCombos(4, empty(), [[0, 0], [1, 0]], 4)).toEqual([[1, 3]]);
    expect(zoneCombos(4, empty(), [[0, 0], [1, 1]], 4)).toEqual([[1, 3], [2, 2]]);
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

  it('words the liar count for one statement', () => {
    expect(liarLine([1], 1, false)).toBe('Exactly 1 of these statement is a lie.');
  });

  it('words the liar count', () => {
    expect(liarLine([0], 3, false)).toBe('Every statement here is true.');
    expect(liarLine([0], 3, true)).toBe('Everyone is telling the truth here.');
    expect(liarLine([1], 3, false)).toBe('Exactly 1 of these statements is a lie.');
    expect(liarLine([2], 4, false)).toBe('Exactly 2 of these statements are lies.');
    expect(liarLine([1, 2], 4, false)).toBe('1 or 2 of these statements are lies.');
  });

  it('makes avatar initials without titles or quotes', () => {
    expect(initials('Sgt. Devaraj Selvam')).toBe('DS');
    expect(initials('"Tip" Callahan')).toBe('TC');
  });

  it('splits newspaper text into words and torn gaps', () => {
    expect(tornParts('The chest ▒▒▒ gone ▒')).toEqual([
      { text: 'The chest ', torn: false },
      { text: '▒▒▒', torn: true },
      { text: ' gone ', torn: false },
      { text: '▒', torn: true },
    ]);
    expect(tornParts('')).toEqual([]);
  });
});
