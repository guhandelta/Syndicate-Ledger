/** [row, col]. Rows are time slots, columns are people. */
export type Cell = [number, number];
/** 0 = empty, otherwise 1..N. grid[row][col]. */
export type Grid = number[][];

export type GridType = 'ledger' | 'surveillance';

/** A claim is a machine-checkable statement about the grid (rule book section 2). */
export type Claim =
  | { kind: 'is'; cell: Cell; value: number }
  | { kind: 'isNot'; cell: Cell; value: number }
  | { kind: 'atLeast'; cell: Cell; value: number }
  | { kind: 'atMost'; cell: Cell; value: number }
  | { kind: 'compare'; a: Cell; b: Cell; op: 'gt' | 'lt' }
  | { kind: 'sum'; cells: Cell[]; value: number }
  | { kind: 'adjacent'; a: Cell; b: Cell }
  | { kind: 'notAdjacent'; a: Cell; b: Cell };

export interface Zone {
  cells: Cell[];
  sum: number;
}

export interface Given {
  cell: Cell;
  value: number;
}

export interface Statement {
  speaker: string;
  claim: Claim;
}

/** What the player sees (minus truth and solution). */
export interface PuzzleSpec {
  size: number;
  type: GridType;
  zones: Zone[];
  givens: Given[];
  statements: Statement[];
  /** Allowed numbers of false statements, e.g. [1] or [1, 2] for a Chief range. */
  liarCounts: number[];
}

export interface GeneratedPuzzle extends PuzzleSpec {
  solution: Grid;
  /** truth[i] is whether statements[i] is true on the solution. */
  truth: boolean[];
  /** Highest grid technique needed, 1..4 (rule book section 5). */
  grade: number;
  /** How many grids the zones/sightings alone allow. */
  baseSolutions: number;
  seed: number;
}
