import type { Preset, Text } from '../game/caseTypes';

/** A walkable place for a case. Loaded from cases/<case-id>/town.json, so a new case needs no new code. */

export type Vec2 = [x: number, z: number];

/** How a building is built, after the streets of Chennai and Coimbatore. `plain` is the old box. */
export const BUILDING_STYLES = ['plain', 'madras', 'bungalow', 'mill', 'shed'] as const;
export type BuildingStyle = (typeof BUILDING_STYLES)[number];

export interface Building {
  id: string;
  name: string;
  /** Centre of the footprint on the ground. */
  at: Vec2;
  /** Width (x) and depth (z) in metres. */
  size: Vec2;
  height: number;
  color: string;
  roof: string;
  /** Which wall the door and sign are on. */
  doorSide: 'north' | 'south';
  /** The look of the building; leaving it out keeps the plain box. */
  style?: BuildingStyle;
  /** Colour of the trim (cornice, pillars, awning) as #rrggbb; each style has its own when left out. */
  trim?: string;
}

export interface Door {
  id: string;
  /** Where the player stands to use it. */
  at: Vec2;
  label: string;
  /** Exactly one of these: open a lead, the case board or the accusation. */
  lead?: string;
  /** A rank story with its own leads: the lead this door opens there instead of `lead`. A door with only this is for those ranks alone. */
  leadFor?: Partial<Record<Preset, string>>;
  goto?: 'board' | 'accuse';
}

export interface Npc {
  /** Cast member id from the case file. */
  cast: string;
  at: Vec2;
  /** Walks back and forth along these points, starting from `at`. */
  path?: Vec2[];
  /** Gone from the town once this event has fired (for example a witness leaving). */
  untilEvent?: string;
}

export interface Prop {
  kind: 'lamp' | 'crate' | 'camera' | 'boat' | 'bollard';
  at: Vec2;
}

export type CameraKind = 'wide' | 'angled' | 'behind' | 'talk';

export interface CameraSettings {
  /** Opening shot of the whole place. */
  wide: { position: [number, number, number]; target: [number, number, number] };
  /** Follows the player from above. */
  angled: { height: number; back: number };
  /** Follows from behind the player's shoulders. */
  behind: { height: number; back: number; lookAhead: number };
  /** Close shot of the person being talked to: how far behind and beside the player the camera stands. */
  talk: { distance: number; height: number; side: number };
}

/** What makes a story shot play. Exactly one of these. */
export interface ShotTrigger {
  /** A lead that was locked has just opened. */
  leadOpens?: string;
  leadSolved?: string;
  /** A timed event from the case file has fired. */
  event?: string;
}

/**
 * A short scripted camera shot for a moment in the story or the investigation.
 * It plays once, the next time the player is in the town after its trigger comes true.
 */
export interface Shot {
  id: string;
  when: ShotTrigger;
  /** What the camera looks at. Exactly one of these ids. */
  focus: { door?: string; building?: string; npc?: string };
  /** How far from the focus the camera stands, and how high. */
  distance: number;
  height: number;
  /** Degrees around the focus: 0 looks from the south, 90 from the east. Default 0. */
  angle?: number;
  /** Degrees per second the camera circles while the shot plays. Default 0. */
  orbit?: number;
  seconds: number;
  caption: Text;
}

/** A moment in the story that moves the clock of the town's day on. */
export interface TimeMoment {
  when: ShotTrigger;
  /** Hour of the day this moment brings, counted on from the first day: 29.5 is half past five the next morning. */
  hour: number;
}

/**
 * The time of day in the town. It follows the story, not the player's own clock: the town opens at `start` and each
 * moment that has come moves it on to its hour (the latest one wins, so the day never runs backwards).
 * A town with no `time` stays in the dark of night, as before. Junior's town stays in daylight.
 */
export interface TownTime {
  /** Hour the story opens at (0 to 24). */
  start: number;
  moments?: TimeMoment[];
}

export interface Town {
  name: string;
  /** Walkable ground: min x, min z, max x, max z. */
  bounds: [number, number, number, number];
  /** Water starts north of this z. */
  waterline: number;
  start: { at: Vec2; heading: number };
  buildings: Building[];
  doors: Door[];
  npcs: Npc[];
  props: Prop[];
  cameras: CameraSettings;
  /** Which camera each moment uses. */
  moments: { enter: CameraKind; explore: CameraKind; talk: CameraKind };
  /** Story shots, in the order they play when several are due at once. */
  shots?: Shot[];
  /** The time of day, from the story. */
  time?: TownTime;
  /** The weather in the grown-up town: rain (the default) or clear. Junior's town never has rain. */
  weather?: 'rain' | 'clear';
}
