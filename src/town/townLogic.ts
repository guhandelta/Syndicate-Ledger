import type { CaseFile } from '../game/caseTypes';
import type { Building, CameraKind, CameraSettings, Door, Npc, Town, Vec2 } from './townTypes';

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
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) {
      const k = lengths[i] ? d / lengths[i] : 0;
      return { at: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k], moving: true };
    }
    d -= lengths[i];
  }
  return { at: pts[pts.length - 1], moving: false };
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
      target: [focus[0], 1.15, focus[1]],
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
    if (!!door.lead === !!door.goto) errors.push(`Door "${door.id}" needs exactly one of lead or goto`);
    if (door.lead && !leadIds.has(door.lead)) errors.push(`Door "${door.id}" opens unknown lead ${door.lead}`);
  }
  for (const id of leadIds) if (!town.doors.some((d) => d.lead === id)) errors.push(`Lead ${id} has no door in the town`);
  if (!town.doors.some((d) => d.goto === 'accuse')) errors.push('No door leads to the accusation');
  for (const npc of town.npcs) {
    if (!castIds.has(npc.cast)) errors.push(`Unknown cast member ${npc.cast}`);
    if (npc.untilEvent && !eventIds.has(npc.untilEvent)) errors.push(`${npc.cast} leaves on unknown event ${npc.untilEvent}`);
    for (const p of [npc.at, ...(npc.path ?? [])]) free(p, `${npc.cast}'s spot`);
  }
  for (const c of cf.cast) if (!town.npcs.some((n) => n.cast === c.id)) errors.push(`${c.name} is not in the town`);
  return errors;
}
