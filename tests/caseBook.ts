import { readFileSync } from 'node:fs';
import type { GridBook } from '../src/game/caseTypes';

/**
 * Case 1's shipped puzzles, plus Junior's puzzles for the case file's own four leads (L1 to L4).
 * Junior plays its own story (J1 to J5), but many tests drive the case file's story at Junior,
 * so they keep the puzzles that story used there.
 */
export const book: GridBook = {
  ...JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8')),
  ...JSON.parse(readFileSync('tests/fixtures/base-junior-puzzles.json', 'utf8')),
};
