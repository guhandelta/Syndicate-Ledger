import type { GeneratedPuzzle, GridType } from '../engine/types';

export type Preset = 'junior' | 'detective' | 'inspector' | 'chief';
export const PRESETS: Preset[] = ['junior', 'detective', 'inspector', 'chief'];

/** Player-facing text with an optional friendly (Junior) version. */
export type Text = string | { crime: string; friendly?: string };

export type Reliability = 'honest' | 'liar' | 'mistaken' | 'double-agent';
export type Role = 'suspect' | 'witness' | 'informant' | 'ally' | 'boss';
export type Ability = 'forensics' | 'accountant' | 'undercover' | 'partner';

export interface CastMember {
  id: string;
  name: string;
  role: Role;
  reliability: Reliability;
  ability?: Ability;
  protects?: string;
  color: string;
  blurb: Text;
}

export interface Lead {
  id: string;
  type: GridType;
  cost: number;
  opensAfter: string[];
  hard?: boolean;
  title: Text;
  intro: Text;
  /** Most important first; smaller grids take the first N. */
  columns: string[];
  rows: string[];
  rooms?: string[];
  speakers: string[];
  liars: Record<Preset, string[]>;
  fact: Text;
}

export type EventEffect =
  | { type: 'removeSpeaker'; lead: string; speaker: string; recover: { hours: number; favors: number } }
  | { type: 'addCost'; lead: string; hours: number }
  | { type: 'endCase' };

export interface CaseEvent {
  id: string;
  /** Hour index on the clock (0 = start of Day 1, hoursPerDay = start of Day 2). */
  at: number;
  ifFlag?: string;
  unlessSolved?: string;
  effect: EventEffect;
  rumor: Text;
  message: Text;
}

export interface Offer {
  id: string;
  from: string;
  after: string;
  cost: { favors: number };
  text: Text;
  accept: Text;
  decline: Text;
}

export interface Ending {
  id: string;
  /** Who the player accuses to reach this ending. */
  accuse: string[];
  /** Solved lead ids or flags like "tip-exposed" needed; endings are checked in order. */
  requires?: string[];
  title: Text;
  text: Text;
}

export interface CaseFile {
  id: string;
  title: Text;
  setup: Text;
  /** Number format, "#" is replaced by the value. */
  unit: Text;
  clock: { days: number; hoursPerDay: number };
  cast: CastMember[];
  leads: Lead[];
  events: CaseEvent[];
  offers: Offer[];
  endings: Ending[];
}

/** puzzles.json: key is `${leadId}:${preset}`. */
export type PuzzleBook = Record<string, GeneratedPuzzle>;
