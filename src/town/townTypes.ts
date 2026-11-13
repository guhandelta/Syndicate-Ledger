/** A walkable place for a case. Loaded from cases/<case-id>/town.json, so a new case needs no new code. */

export type Vec2 = [x: number, z: number];

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
}

export interface Door {
  id: string;
  /** Where the player stands to use it. */
  at: Vec2;
  label: string;
  /** Exactly one of these: open a lead, the case board or the accusation. */
  lead?: string;
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
}
