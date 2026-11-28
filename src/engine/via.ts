/**
 * Linked clues: a statement in a later puzzle that quotes an earlier puzzle's answer.
 * To the solver it is an ordinary claim (the numbers are already filled in); `via` records where they came from,
 * so the game can word the clue as a pointer back ("what Vex moved in the hour Kane moved $3k") instead of a number.
 */
import type { CipherPuzzle } from './cipher';
import type { DecodePuzzle } from './decode';
import type { NetworkPuzzle } from './network';
import { whereOf, type StakeoutPuzzle } from './stakeout';
import type { TimelinePuzzle } from './timeline';
import type { GeneratedPuzzle } from './types';

export type AnyAnswered = GeneratedPuzzle | TimelinePuzzle | NetworkPuzzle | CipherPuzzle | StakeoutPuzzle | DecodePuzzle;

/** Something in an earlier answer: a number, or a person. */
export type LinkRef =
  /** Grid: the number at a cell. `by` names another person in the same row, so the clue can say "in the hour Kane moved $3k" instead of the hour. */
  | { kind: 'cell'; r: number; c: number; by?: { c: number; v: number } }
  /** Timeline: the place in the night (1 = first) of a moment. */
  | { kind: 'slot'; m: number }
  /** Network: how many people someone was in contact with. */
  | { kind: 'degree'; p: number }
  /** Cipher: the digit in a place. */
  | { kind: 'digit'; p: number }
  /** Decode: how many letters are in a word of a word answer (words counted from 0). A number answer is quoted by its `digit`. */
  | { kind: 'wordLen'; i: number }
  /** Decode: the place in the alphabet (A is 1) of a letter of a one-word answer (letters counted from 0). */
  | { kind: 'letter'; p: number }
  /** A fixed number from the story (a plate number, a page), not from another puzzle's answer. `says` is how the clue names it. */
  | { kind: 'fact'; value: number; says: { crime: string; friendly?: string } }
  /** Stakeout: the row or column (numbered from 1) a district's watcher stood in. */
  | { kind: 'spot'; z: number; axis: 'row' | 'col' }
  /**
   * Grid, a person: whoever has value v in row r. With `from`, v itself is quoted from another earlier answer
   * (a two-step clue: find that number first, then the person who has it).
   */
  | { kind: 'holder'; r: number; v: number; from?: { lead: string; ref: LinkRef } };

export interface Via {
  /** The earlier lead. */
  lead: string;
  ref: LinkRef;
  /** A true clue the puzzle does not need: it costs the player time, never correctness. */
  herring?: boolean;
  /** The clue worded through the story, with {a} {b} {when} {q} filled in when it is shown. Never changes what the clue says. */
  story?: { crime: string; friendly?: string };
}

/** The digits of a decode answer, in order (letters and spaces are skipped). */
export const digitsOf = (p: DecodePuzzle): string => p.answer.replace(/\D/g, '');

/** The number a ref points at (not for 'holder'). */
export function refNumber(p: AnyAnswered, ref: LinkRef): number {
  switch (ref.kind) {
    case 'cell':
      return (p as GeneratedPuzzle).solution[ref.r][ref.c];
    case 'slot':
      return (p as TimelinePuzzle).solution[ref.m];
    case 'degree':
      return (p as NetworkPuzzle).degrees[ref.p];
    case 'digit':
      return p.type === 'decode' ? Number(digitsOf(p)[ref.p]) : (p as CipherPuzzle).code[ref.p];
    case 'fact':
      return ref.value;
    case 'letter':
      return (p as DecodePuzzle).answer.charCodeAt(ref.p) - 64;
    case 'wordLen':
      return (p as DecodePuzzle).answer.split(' ')[ref.i].length;
    case 'spot': {
      const w = whereOf((p as StakeoutPuzzle).regions, (p as StakeoutPuzzle).cols)[ref.z];
      return w[ref.axis === 'row' ? 0 : 1] + 1;
    }
    case 'holder':
      throw new Error('a holder is a person, not a number');
  }
}

/** The person (column index in the earlier puzzle) a 'holder' ref points at. */
export function refHolder(p: AnyAnswered, ref: LinkRef): number {
  if (ref.kind !== 'holder') throw new Error('only a holder points at a person');
  return (p as GeneratedPuzzle).solution[ref.r].indexOf(ref.v);
}

/** Statements that carry a link. */
export const linked = <S extends { via?: Via }>(statements: S[]): S[] => statements.filter((s) => s.via);
