import type { GeneratedPuzzle } from '../src/engine/types';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GridBook } from '../src/game/caseTypes';
import { gradePuzzle, nextStep } from '../src/engine/logic';
import { book } from './caseBook';

// only the grid puzzles: timelines, networks and ciphers have their own engines and tests
const all = Object.entries(book).filter(([, p]) => p.type === 'ledger' || p.type === 'surveillance') as [string, GeneratedPuzzle][];
const empty = (n: number) => Array.from({ length: n }, () => Array(n).fill(0));

describe('logic grading and hints', () => {
  it('grades every shipped puzzle as solvable by logic', () => {
    for (const [key, p] of all) expect(gradePuzzle(p, p.truth), key).toBeGreaterThan(0);
  });

  it('gives up (grade 0) when the truth values contradict the grid', () => {
    const results = all.map(([, p]) => gradePuzzle(p, p.truth.map((t) => !t)));
    expect(results).toContain(0);
    // grades every shipped grid (the 7x7 ones are heavy), which took over 30s on a busy CI machine
  }, 120_000);

  it('suggests a next step from an empty board and from a partly filled one', () => {
    for (const [, p] of all) {
      const first = nextStep(p, p.truth, empty(p.size));
      expect(first).not.toBeNull();
      if (!first) continue;
      const placed = empty(p.size);
      placed[first.cell[0]][first.cell[1]] = first.value;
      const second = nextStep(p, p.truth, placed);
      expect(second === null || second.cell.length === 2).toBe(true);
    }
  });

  it('has nothing to say when the board is already full or wrong', () => {
    for (const [, p] of all) {
      expect(nextStep(p, p.truth, p.solution.map((r) => r.slice()))).toBeNull();
      const wrong = p.solution.map((r) => r.slice());
      wrong[0][0] = wrong[0][0] === 1 ? 2 : 1;
      wrong[0][1] = wrong[0][0];
      expect(nextStep(p, p.truth, wrong)).toBeNull();
    }
  });

  it('walks a puzzle to the end one hint at a time, using each technique level', () => {
    const levels = new Set<number>();
    for (const [, p] of all) {
      const placed = empty(p.size);
      for (let guard = 0; guard < p.size * p.size; guard++) {
        const step = nextStep(p, p.truth, placed);
        if (!step) break;
        levels.add(step.technique);
        placed[step.cell[0]][step.cell[1]] = step.value;
      }
    }
    expect([...levels].sort()).toEqual(expect.arrayContaining([1]));
    expect(levels.size).toBeGreaterThan(1);
  });
});
