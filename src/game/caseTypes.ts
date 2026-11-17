import type { CipherClaim, CipherPuzzle } from '../engine/cipher';
import type { NetClaim, NetworkPuzzle } from '../engine/network';
import type { TimeClaim, TimelinePuzzle } from '../engine/timeline';
import type { Claim } from '../engine/types';
import type { GeneratedPuzzle, GridType } from '../engine/types';

/** The kinds of puzzle a lead can hold: the two number grids, a timeline of moments to put in order, or a network of who was in contact with whom. */
export type LeadType = GridType | 'timeline' | 'network' | 'cipher';
export const LEAD_TYPES: LeadType[] = ['ledger', 'surveillance', 'timeline', 'network', 'cipher'];

/** What a witness can say, in any kind of lead. */
export type AnyClaim = Claim | TimeClaim | NetClaim | CipherClaim;

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

/**
 * The faces a person can make. The first three are drawn for everyone; the rest fall back to the nearest one
 * until their art exists (src/ui/portraits.ts).
 */
export type Face = 'neutral' | 'suspicious' | 'caught-lying' | 'nervous' | 'angry' | 'smug' | 'scared';
export const FACES: Face[] = ['neutral', 'suspicious', 'caught-lying', 'nervous', 'angry', 'smug', 'scared'];

/**
 * When a line can be said, from what the player has done so far. Every listed part must hold.
 * Flags are the ones the game sets: an accepted offer's id, "<id>-exposed", "refuses:<id>".
 */
export interface Condition {
  solved?: string[];
  unsolved?: string[];
  flags?: string[];
  notFlags?: string[];
  /** People the player has accused, at least once. */
  accused?: string[];
  notAccused?: string[];
  /** People the player has caught lying (their trust is "caught"). */
  caught?: string[];
  /** Who the player is playing as. */
  character?: string[];
  /** Only at these ranks. Ranks open in order, so at a higher rank the parts below are already uncovered. */
  rank?: Preset[];
}

/** Something a person says out loud, and how they say it (default "speech"). */
export interface Line {
  /** "..." is a pause and *word* is stressed when the line is spoken. */
  text: Text;
  voice?: Voice;
  /** The face they make while saying it. Left out, it follows the voice, then what the player knows of them. */
  face?: Face;
  /** A short stage direction shown with the line, such as "glances at Crane first". A hint, never proof. */
  tell?: Text;
  /** Said only when this holds. */
  when?: Condition;
}

/** One line of a scene: a person's line, or narration when nobody speaks. */
export interface SceneLine extends Line {
  /** Cast id of the speaker; left out for narration. */
  who?: string;
}

/**
 * How one rank's story hands over to the next: a short scene shown after the part is uncovered, and one
 * object that travels on to the next rank's board.
 */
export interface Handover {
  scene: SceneLine[];
  /** `changed` complicates what the rank just solved; `open` is the new question the next rank starts with. */
  carried?: { title: Text; fact: Text; changed?: Text; open?: Text; /** People this object points at; with it, the player can lean on it in an accusation. */ pointsTo?: string[] };
}

/** What one person says about another. Opinions can be biased or wrong. */
export interface Opinion extends Line {
  about: string;
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
  /** Greetings that depend on what the player has done; the first one whose condition holds wins over `greeting`. */
  greetings?: Line[];
  /** What they think of the others, asked about one person at a time. */
  opinions?: Opinion[];
  /** How they usually talk; their statements use it. Default "speech". */
  voice?: Voice;
}

/** A newspaper scrap. In the body, a run of ▒ is torn-away text. */
export interface Clipping {
  paper: string;
  headline: Text;
  body: Text;
}

export interface Lead {
  id: string;
  type: LeadType;
  cost: number;
  opensAfter: string[];
  hard?: boolean;
  title: Text;
  intro: Text;
  /** Most important first; smaller grids take the first N. */
  columns: string[];
  rows: string[];
  rooms?: string[];
  /**
   * Timeline leads: the moments to put in order, most important first (smaller ranks take the first N).
   * `rows` are the times they can go at, and `columns` is empty.
   */
  moments?: Text[];
  /** Timeline leads: the moments are stops on a floorplan, and the night is a walk along its corridors. */
  map?: boolean;
  /** Timeline leads: what one step between times is called in "two hours apart". Default "hour". */
  step?: string;
  speakers: string[];
  liars: Record<Preset, string[]>;
  fact: Text;
  /** Who this lead's fact points at. An accusation may only lean on facts that point at the accused. */
  pointsTo?: string[];
  /** Torn newspaper scraps shown above the puzzle. Words torn away are runs of ▒. Keep what they say true to the answer. */
  clippings?: Clipping[];
  /** The lead that follows this one at once: closing this lead offers to go straight on to it (a two-step finale). */
  then?: string;
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

/** What it takes to convict someone: facts from these solved leads (or the object handed over from the rank below, as `carried:<rank>`), and no fact that points elsewhere. */
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
  /**
   * Each rank's own story around the case's main crime. A rank story replaces only the fields it sets;
   * the rest comes from the case file above. See docs/RULEBOOK.md section 11.
   */
  rankStories?: Partial<Record<Preset, RankStory>>;
  /** Shown once every rank's part of the case is uncovered. */
  closing?: { title: Text; text: Text };
  /** Who the player can be. The first ready one is picked by default. */
  characters?: PlayableCharacter[];
}

/** Someone the player can play as. Each brings their own view of every rank story (plan: Playable Characters). */
export interface PlayableCharacter {
  /** "detective", or the id of a cast member. */
  id: string;
  name: string;
  blurb: Text;
  /** False until their own story is written: shown, but can't be picked yet. */
  ready: boolean;
}

/** The piece of the main crime one rank story uncovers. The case closes when every rank's part is uncovered. */
export interface CasePart {
  title: Text;
  /** The question this rank's part answers, e.g. "Who did it?". */
  question: Text;
  /** What the player learns when they solve it. */
  reveal: Text;
}

/** The story-level fields a rank story may replace. */
export const STORY_FIELDS = ['title', 'setup', 'leads', 'events', 'offers', 'endings', 'proof', 'lost', 'missedClues'] as const;
export type StoryField = (typeof STORY_FIELDS)[number];

/** One rank's story: its part of the crime, plus any story fields it replaces. */
export type RankStory = { part: CasePart } & Partial<Pick<CaseFile, StoryField>> & {
  /** Shown after this rank's part is uncovered. */
  handover?: Handover;
  /** Shown on this rank's briefing page, before the board. */
  opening?: SceneLine[];
  /** The newspaper front page about the crime, shown on the briefing page before anything else. */
  incident?: Clipping;
};

/** puzzles.json: key is `${leadId}:${preset}`. */
export type AnyPuzzle = GeneratedPuzzle | TimelinePuzzle | NetworkPuzzle | CipherPuzzle;
export type PuzzleBook = Record<string, AnyPuzzle>;
/** A book of grid puzzles only (Case 1 today). */
export type GridBook = Record<string, GeneratedPuzzle>;
