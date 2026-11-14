import type { GeneratedPuzzle, GridType } from '../engine/types';

export type Preset = 'junior' | 'detective' | 'inspector' | 'chief';
export const PRESETS: Preset[] = ['junior', 'detective', 'inspector', 'chief'];

/** Player-facing text with an optional friendly (Junior) version. */
export type Text = string | { crime: string; friendly?: string };

export type Reliability = 'honest' | 'liar' | 'mistaken' | 'double-agent';
export type Role = 'suspect' | 'witness' | 'informant' | 'ally' | 'boss';
export type Ability = 'forensics' | 'accountant' | 'undercover' | 'partner';

/**
 * How a line is said. The UI draws each one as a different comic bubble (outline, colour, portrait expression);
 * see src/ui/voices.ts.
 */
export type Voice = 'speech' | 'calm' | 'thought' | 'shout' | 'whisper' | 'nervous' | 'suspicious' | 'lying';
export const VOICES: Voice[] = ['speech', 'calm', 'thought', 'shout', 'whisper', 'nervous', 'suspicious', 'lying'];

/** Something a person says out loud, and how they say it (default "speech"). */
export interface Line {
  text: Text;
  voice?: Voice;
}

export interface CastMember {
  id: string;
  name: string;
  role: Role;
  reliability: Reliability;
  ability?: Ability;
  protects?: string;
  color: string;
  blurb: Text;
  /** What they say when the player walks up to them in the town. */
  greeting?: Line;
  /** How they usually talk; their statements use it. Default "speech". */
  voice?: Voice;
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
  /** Who this lead's fact points at. An accusation may only lean on facts that point at the accused. */
  pointsTo?: string[];
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
  /** How the offer is said. Defaults to the speaker's voice. */
  voice?: Voice;
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

/** What the game observed, matched against a clue's `when`. */
export type ClueEvent =
  | { kind: 'wrong-mark'; lead: string; speaker: string; marked: 'true' | 'lie' }
  | { kind: 'unmarked'; lead: string; speaker: string }
  | { kind: 'event'; event: string }
  | { kind: 'accuse'; person: string };

/** Condition for a clue. Every field present must hold. */
export type ClueWhen =
  | { kind: 'wrong-mark'; lead: string; speaker: string; marked: 'true' | 'lie' }
  | { kind: 'unmarked'; lead: string; speaker: string }
  | { kind: 'event'; event: string; flag?: string }
  | {
      kind: 'accuse';
      person?: string;
      /** The lead must still be unsolved. */
      unsolved?: string;
      /** The lead must be solved. */
      solved?: string;
      /** The flag must not be set yet. */
      missingFlag?: string;
      /** The accused has no statement in any solved lead. */
      unchecked?: boolean;
    };

/** A nudge shown when the player misses a clue. Shown at most once, except accusation nudges. */
export interface MissedClue {
  id: string;
  presets: Preset[];
  when: ClueWhen;
  message: Text;
}

/** What it takes to convict someone: facts from these solved leads, and no fact that points elsewhere. */
export interface Proof {
  needs: string[];
}

/** Shown when the case is lost. Nothing here may say who did it. */
export interface LostCase {
  title: Text;
  /** The clock ran out before an accusation held up. */
  time: Text;
  /** Everyone who could still be accused has been, or is out of tries. */
  limits: Text;
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
  /** Who can be convicted, and on what. Anyone not listed can never be proven guilty. */
  proof?: Record<string, Proof>;
  lost?: LostCase;
  missedClues?: MissedClue[];
}

/** puzzles.json: key is `${leadId}:${preset}`. */
export type PuzzleBook = Record<string, GeneratedPuzzle>;
