import { PRESETS, type CaseFile, type Lead, type Preset } from '../game/caseTypes';
import { caseForRank } from '../game/rankStory';
import type { Building, CameraKind, CameraSettings, Door, Npc, Shot, Town, Vec2 } from './townTypes';

/** Pure town rules: movement, collisions, who is nearby and where the camera goes. No rendering here. */

export const PLAYER_RADIUS = 0.45;
export const NPC_RADIUS = 0.5;
export const REACH = 2.2;

export interface Pose {
  x: number;
  z: number;
  /** Radians; 0 faces north (-z), positive turns east. */
  heading: number;
}

export const forward = (heading: number): Vec2 => [Math.sin(heading), -Math.cos(heading)];

/** Pushes a circle out of an axis-aligned box. */
function pushOutOfBox(x: number, z: number, r: number, b: Building): Vec2 {
  const hx = b.size[0] / 2;
  const hz = b.size[1] / 2;
  const cx = Math.max(b.at[0] - hx, Math.min(x, b.at[0] + hx));
  const cz = Math.max(b.at[1] - hz, Math.min(z, b.at[1] + hz));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [x, z];
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // centre is inside the box: leave by the nearest wall
  const left = x - (b.at[0] - hx);
  const right = b.at[0] + hx - x;
  const top = z - (b.at[1] - hz);
  const bottom = b.at[1] + hz - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [b.at[0] - hx - r, z];
  if (m === right) return [b.at[0] + hx + r, z];
  if (m === top) return [x, b.at[1] - hz - r];
  return [x, b.at[1] + hz + r];
}

function pushOutOfCircle(x: number, z: number, r: number, c: Vec2, cr: number): Vec2 {
  const dx = x - c[0];
  const dz = z - c[1];
  const d = Math.hypot(dx, dz);
  const min = r + cr;
  if (d >= min) return [x, z];
  if (d < 1e-6) return [c[0], c[1] + min];
  return [c[0] + (dx / d) * min, c[1] + (dz / d) * min];
}

/** Moves the player by (dx, dz), keeping them on the ground and out of buildings and people. */
export function step(town: Town, from: Vec2, dx: number, dz: number, people: Vec2[] = []): Vec2 {
  let x = from[0] + dx;
  let z = from[1] + dz;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of town.buildings) [x, z] = pushOutOfBox(x, z, PLAYER_RADIUS, b);
    for (const p of people) [x, z] = pushOutOfCircle(x, z, PLAYER_RADIUS, p, NPC_RADIUS);
  }
  const [minX, minZ, maxX, maxZ] = town.bounds;
  x = Math.max(minX + PLAYER_RADIUS, Math.min(x, maxX - PLAYER_RADIUS));
  z = Math.max(Math.max(minZ, town.waterline) + PLAYER_RADIUS, Math.min(z, maxZ - PLAYER_RADIUS));
  return [x, z];
}

/** Where a person is at time t (seconds). People with a path walk it there and back at walking pace. */
export function npcPosition(npc: Npc, t: number, speed = 1.1): { at: Vec2; moving: boolean } {
  if (!npc.path?.length) return { at: npc.at, moving: false };
  const pts = [npc.at, ...npc.path];
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total < 1e-6) return { at: npc.at, moving: false };
  const pause = 3; // seconds standing at each end
  const leg = total / speed;
  const cycle = 2 * (leg + pause);
  let u = ((t % cycle) + cycle) % cycle;
  let d: number;
  if (u < pause) return { at: pts[0], moving: false };
  u -= pause;
  if (u < leg) d = u * speed;
  else if (u < leg + pause) return { at: pts[pts.length - 1], moving: false };
  else d = total - (u - leg - pause) * speed;
  // walk along the legs until the distance falls inside one; the last leg takes whatever is left, so rounding can't run past the end
  let i = 0;
  while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++];
  const k = lengths[i] ? Math.min(1, d / lengths[i]) : 0;
  return { at: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k], moving: true };
}

export const npcPresent = (npc: Npc, firedEvents: string[]) => !npc.untilEvent || !firedEvents.includes(npc.untilEvent);

export type Nearby = { kind: 'door'; door: Door; distance: number } | { kind: 'npc'; npc: Npc; distance: number };

/** The closest door or person within reach, if any. */
export function nearest(town: Town, at: Vec2, people: { npc: Npc; at: Vec2 }[]): Nearby | null {
  let best: Nearby | null = null;
  for (const door of town.doors) {
    const distance = Math.hypot(door.at[0] - at[0], door.at[1] - at[1]);
    if (distance <= REACH && (!best || distance < best.distance)) best = { kind: 'door', door, distance };
  }
  for (const p of people) {
    const distance = Math.hypot(p.at[0] - at[0], p.at[1] - at[1]);
    if (distance <= REACH && (!best || distance < best.distance)) best = { kind: 'npc', npc: p.npc, distance };
  }
  return best;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** How far right of the person the talk camera aims (metres), leaving room for the conversation panel. */
export const TALK_AIM = 0.55;

/** Where the camera sits and looks for each kind of shot. `focus` is the person being talked to. */
export function cameraPose(kind: CameraKind, c: CameraSettings, player: Pose, focus?: Vec2): CameraPose {
  if (kind === 'wide') return { position: c.wide.position, target: c.wide.target };
  if (kind === 'talk' && focus) {
    // from behind and beside the player's shoulder, looking at the other person
    let dx = player.x - focus[0];
    let dz = player.z - focus[1];
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    return {
      position: [focus[0] + dx * (d + c.talk.distance) - dz * c.talk.side, c.talk.height, focus[1] + dz * (d + c.talk.distance) + dx * c.talk.side],
      // aim a little to the person's right on screen, so they stand left of the conversation panel, face in view
      target: [focus[0] + dz * TALK_AIM, 1.35, focus[1] - dx * TALK_AIM],
    };
  }
  if (kind === 'behind') {
    const [fx, fz] = forward(player.heading);
    return {
      position: [player.x - fx * c.behind.back, c.behind.height, player.z - fz * c.behind.back],
      target: [player.x + fx * c.behind.lookAhead, 1.3, player.z + fz * c.behind.lookAhead],
    };
  }
  return { position: [player.x, c.angled.height, player.z + c.angled.back], target: [player.x, 0.8, player.z] };
}

/** What the story shots need to know about the game. */
export interface ShotFacts {
  solved: string[];
  /** Leads the player can work now. */
  open: string[];
  firedEvents: string[];
}

/** Shots whose moment has come and that the player has not seen yet, in file order. */
export function dueShots(town: Town, facts: ShotFacts, seen: string[]): Shot[] {
  return (town.shots ?? []).filter((s) => {
    if (seen.includes(s.id)) return false;
    if (s.when.leadOpens) return facts.open.includes(s.when.leadOpens);
    if (s.when.leadSolved) return facts.solved.includes(s.when.leadSolved);
    if (s.when.event) return facts.firedEvents.includes(s.when.event);
    return false;
  });
}

/** The point on the ground a shot looks at. `npcAt` is where its person stands right now. */
export function shotFocus(shot: Shot, town: Town, npcAt?: Vec2): Vec2 {
  if (shot.focus.door) return town.doors.find((d) => d.id === shot.focus.door)!.at;
  if (shot.focus.building) return town.buildings.find((b) => b.id === shot.focus.building)!.at;
  return npcAt ?? town.npcs.find((n) => n.cast === shot.focus.npc)!.at;
}

/** Where the camera is `t` seconds into a shot. */
export function shotPose(shot: Shot, focus: Vec2, t = 0): CameraPose {
  const a = (((shot.angle ?? 0) + (shot.orbit ?? 0) * t) * Math.PI) / 180;
  const lookY = shot.focus.building ? 2 : 1.2;
  return {
    position: [focus[0] + Math.sin(a) * shot.distance, shot.height, focus[1] + Math.cos(a) * shot.distance],
    target: [focus[0], lookY, focus[1]],
  };
}

/**
 * The town as one rank plays it: each lead door opens that rank story's lead (`leadFor`, else `lead`),
 * and a door whose lead this story does not have is left out.
 */
export function townForRank(town: Town, leads: Lead[], preset: Preset): Town {
  const ids = new Set(leads.map((l) => l.id));
  const doors = town.doors.flatMap((d): Door[] => {
    if (d.goto) return [d];
    const lead = d.leadFor?.[preset] ?? d.lead;
    return lead && ids.has(lead) ? [{ ...d, lead }] : [];
  });
  return { ...town, doors };
}

/** Problems in a town file, checked against its case. An empty list means it is fine. */
export function validateTown(town: Town, cf: CaseFile): string[] {
  const errors: string[] = [];
  const leadIds = new Set(cf.leads.map((l) => l.id));
  const castIds = new Set(cf.cast.map((c) => c.id));
  const eventIds = new Set(cf.events.map((e) => e.id));
  const inside = (p: Vec2, b: Building, pad = 0) =>
    Math.abs(p[0] - b.at[0]) < b.size[0] / 2 + pad && Math.abs(p[1] - b.at[1]) < b.size[1] / 2 + pad;
  const onGround = (p: Vec2) =>
    p[0] > town.bounds[0] && p[0] < town.bounds[2] && p[1] > Math.max(town.bounds[1], town.waterline) && p[1] < town.bounds[3];
  const free = (p: Vec2, what: string) => {
    if (!onGround(p)) errors.push(`${what} is off the walkable ground`);
    const b = town.buildings.find((x) => inside(p, x, PLAYER_RADIUS * 0.9));
    if (b) errors.push(`${what} is inside ${b.name}`);
  };
  free(town.start.at, 'The start point');
  for (const door of town.doors) {
    free(door.at, `Door "${door.id}"`);
    if (!!(door.lead || door.leadFor) === !!door.goto) errors.push(`Door "${door.id}" needs exactly one of lead or goto`);
    if (door.lead && !leadIds.has(door.lead)) errors.push(`Door "${door.id}" opens unknown lead ${door.lead}`);
  }
  // a rank story with its own leads needs a door for each of them
  for (const rank of PRESETS) {
    const story = caseForRank(cf, rank);
    if (story === cf) continue;
    const t = townForRank(town, story.leads, rank);
    for (const l of story.leads) if (!t.doors.some((d) => d.lead === l.id)) errors.push(`${rank} story: lead ${l.id} has no door in the town`);
  }
  for (const id of leadIds) if (!town.doors.some((d) => d.lead === id)) errors.push(`Lead ${id} has no door in the town`);
  if (!town.doors.some((d) => d.goto === 'accuse')) errors.push('No door leads to the accusation');
  for (const npc of town.npcs) {
    if (!castIds.has(npc.cast)) errors.push(`Unknown cast member ${npc.cast}`);
    if (npc.untilEvent && !eventIds.has(npc.untilEvent)) errors.push(`${npc.cast} leaves on unknown event ${npc.untilEvent}`);
    for (const p of [npc.at, ...(npc.path ?? [])]) free(p, `${npc.cast}'s spot`);
  }
  for (const c of cf.cast) if (!town.npcs.some((n) => n.cast === c.id)) errors.push(`${c.name} is not in the town`);
  const shotIds = new Set<string>();
  for (const shot of town.shots ?? []) {
    const what = `Shot "${shot.id}"`;
    if (shotIds.has(shot.id)) errors.push(`${what} is listed twice`);
    shotIds.add(shot.id);
    const { leadOpens, leadSolved, event } = shot.when;
    if ([leadOpens, leadSolved, event].filter(Boolean).length !== 1) errors.push(`${what} needs exactly one trigger`);
    for (const id of [leadOpens, leadSolved]) if (id && !leadIds.has(id)) errors.push(`${what} waits on unknown lead ${id}`);
    if (leadOpens && leadIds.has(leadOpens) && !cf.leads.find((l) => l.id === leadOpens)!.opensAfter.length)
      errors.push(`${what} waits for ${leadOpens} to open, but it is open from the start`);
    if (event && !eventIds.has(event)) errors.push(`${what} waits on unknown event ${event}`);
    const { door, building, npc } = shot.focus;
    if ([door, building, npc].filter(Boolean).length !== 1) errors.push(`${what} needs exactly one thing to look at`);
    if (door && !town.doors.some((d) => d.id === door)) errors.push(`${what} looks at unknown door ${door}`);
    if (building && !town.buildings.some((b) => b.id === building)) errors.push(`${what} looks at unknown building ${building}`);
    if (npc) {
      const who = town.npcs.find((n) => n.cast === npc);
      if (!who) errors.push(`${what} looks at ${npc}, who is not in the town`);
      else if (who.untilEvent) errors.push(`${what} looks at ${npc}, who may have left town by then`);
    }
    if (!(shot.seconds >= 2 && shot.seconds <= 8)) errors.push(`${what} must last 2 to 8 seconds`);
    if (!(shot.distance >= 2) || !(shot.height >= 1)) errors.push(`${what} has the camera too close or too low`);
    if (!shot.caption) errors.push(`${what} has no caption`);
  }
  if (town.time) {
    const { start, moments = [] } = town.time;
    if (!(start >= 0 && start < 24)) errors.push('The time of day must start between 0 and 24');
    moments.forEach((m, i) => {
      const what = `Time moment ${i + 1}`;
      const { leadOpens, leadSolved, event } = m.when;
      if ([leadOpens, leadSolved, event].filter(Boolean).length !== 1) errors.push(`${what} needs exactly one trigger`);
      for (const id of [leadOpens, leadSolved]) if (id && !leadIds.has(id)) errors.push(`${what} waits on unknown lead ${id}`);
      if (event && !eventIds.has(event)) errors.push(`${what} waits on unknown event ${event}`);
      if (!(m.hour >= start && m.hour < start + 48)) errors.push(`${what} must come at or after the start, within two days`);
    });
  }
  return errors;
}
