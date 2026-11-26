import type { CaseFile, Lead, LeadType, LinkSpec, Preset, Text } from './caseTypes';

/**
 * A scene brief: what a number-grid lead is about, in story terms. The author gives the place, the thing on the table,
 * the people and the one fact the lead must reveal; `draftLead` turns it into a lead the generator can build, with the
 * title, intro and fact worded from the brief. The puzzle itself still comes from the generator, so it stays fresh.
 */
export interface SceneBrief {
  /** The lead id, e.g. "L5". */
  id: string;
  /** A ledger counts things each person moved; a surveillance log says which room each person was in. */
  type: Extract<LeadType, 'ledger' | 'surveillance'>;
  opensAfter?: string[];
  cost?: number;
  hard?: boolean;
  /** The thing on the table, e.g. "cash book" or "dock camera log". It becomes the title. */
  thing: string;
  /** Where it is and why it matters now, in a sentence or two. It opens the intro. */
  backstory: string;
  /** Cast ids, most important first. A grid takes the first N, so list at least as many as the biggest rank needs. */
  people: string[];
  /** The times the grid covers, e.g. ["8 PM", "9 PM"]. */
  rows: string[];
  /** Surveillance only: the rooms, numbered from 1 in this order. */
  rooms?: string[];
  /** The one fact this lead must reveal: this person, at this time, has this value (a room number for surveillance). */
  key: { person: string; time: string; value: number };
  /** Anything extra the fact says after the key sentence. */
  aside?: string;
  speakers: string[];
  /** Who lies at each rank. Ranks left out have no liar. */
  liars?: Partial<Record<Preset, string[]>>;
  pointsTo?: string[];
  links?: LinkSpec[];
}

const first = (name: string) => name.replace(/^(Capt\.|Dr\.|Sgt\.|Officer)\s+/, '').split(' ')[0].replace(/"/g, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (crime: string, friendly: string): Text => ({ crime, friendly });

/** Turns a scene brief into a lead, worded for the case's cast and unit. Throws when the brief does not hang together. */
export function draftLead(cf: Pick<CaseFile, 'cast' | 'unit'>, scene: SceneBrief): Lead {
  const ids = new Set(cf.cast.map((c) => c.id));
  const nameOf = (id: string) => first(cf.cast.find((c) => c.id === id)!.name);
  const fail = (msg: string): never => {
    throw new Error(`scene ${scene.id}: ${msg}`);
  };
  for (const id of [...scene.people, ...scene.speakers, ...(scene.pointsTo ?? []), ...Object.values(scene.liars ?? {}).flat()]) {
    if (!ids.has(id)) fail(`${id} is not in the cast`);
  }
  if (new Set(scene.people).size !== scene.people.length) fail('a person is listed twice');
  if (!scene.people.includes(scene.key.person)) fail(`${scene.key.person} is not one of the people`);
  if (!scene.rows.includes(scene.key.time)) fail(`${scene.key.time} is not one of the rows`);
  const surveillance = scene.type === 'surveillance';
  if (surveillance && !scene.rooms?.length) fail('a surveillance scene needs its rooms');
  const top = surveillance ? scene.rooms!.length : 9;
  if (!Number.isInteger(scene.key.value) || scene.key.value < 1 || scene.key.value > top) fail(`the key value must be a whole number from 1 to ${top}`);

  const who = nameOf(scene.key.person);
  const unit = (tone: 'crime' | 'friendly') => {
    const u = typeof cf.unit === 'string' ? cf.unit : (cf.unit[tone] ?? cf.unit.crime);
    return u.replace('#', String(scene.key.value)).replace(/^1 coins$/, '1 coin');
  };
  const where = surveillance ? scene.rooms![scene.key.value - 1] : '';
  const aside = scene.aside ? ` ${scene.aside}` : '';
  const task = surveillance
    ? 'Work out who was in which room each hour, then check what people say against your answers and mark each one True or Lie.'
    : 'Work out how much each person moved each hour, then check what people say against your answers and mark each one True or Lie.';
  const factCrime = surveillance
    ? `${who} was in ${where} at ${scene.key.time}.${aside}`
    : `At ${scene.key.time} ${who} moved ${unit('crime')}.${aside}`;
  const factFriendly = surveillance
    ? `${who} was in ${where} at ${scene.key.time}!${aside}`
    : `At ${scene.key.time} ${who} moved ${unit('friendly')}!${aside}`;

  const liars = (p: Preset) => scene.liars?.[p] ?? [];
  return {
    id: scene.id,
    type: scene.type,
    cost: scene.cost ?? 2,
    opensAfter: scene.opensAfter ?? [],
    ...(scene.hard ? { hard: true } : {}),
    ...(scene.links ? { links: scene.links } : {}),
    title: cap(scene.thing),
    intro: both(`${scene.backstory} ${task}`, `${scene.backstory} ${task}`),
    columns: scene.people,
    rows: scene.rows,
    ...(surveillance ? { rooms: scene.rooms } : {}),
    speakers: scene.speakers,
    liars: { junior: liars('junior'), detective: liars('detective'), inspector: liars('inspector'), chief: liars('chief') },
    anchors: [{ time: scene.key.time, person: scene.key.person, value: scene.key.value }],
    fact: both(factCrime, factFriendly),
    ...(scene.pointsTo ? { pointsTo: scene.pointsTo } : {}),
  };
}
