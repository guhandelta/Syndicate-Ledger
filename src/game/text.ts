import type { CipherClaim } from '../engine/cipher';
import type { NetClaim } from '../engine/network';
import type { StakeClaim } from '../engine/stakeout';
import type { TimeClaim } from '../engine/timeline';
import type { Claim } from '../engine/types';
import type { AnyClaim, AnyPuzzle, CaseFile, Lead, Text } from './caseTypes';

export type Tone = 'crime' | 'friendly';

export function t(text: Text, tone: Tone): string {
  if (typeof text === 'string') return text;
  return tone === 'friendly' ? text.friendly ?? text.crime : text.crime;
}

export interface GridLabels {
  people: string[];
  times: string[];
  value: (v: number) => string;
}

export function gridLabels(cf: CaseFile, lead: Lead, size: number, tone: Tone): GridLabels {
  const nameOf = (id: string) => cf.cast.find((c) => c.id === id)?.name ?? id;
  const unit = t(cf.unit, tone);
  return {
    people: lead.columns.slice(0, size).map((id) => nameOf(id).replace(/"/g, '')),
    times: lead.rows.slice(0, size),
    value: (v) => (lead.type === 'surveillance' ? lead.rooms![v - 1] : unit.replace('#', String(v)).replace(/^1 coins$/, '1 coin')),
  };
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const at = (time: string) => (DAYS.includes(time) ? `on ${time}` : /^[A-Z][a-z]{2}$/.test(time) ? `in ${time}` : `at ${time}`);
/** "the Ice house", but "Warehouse 9" (a numbered place is already a name). */
export const the = (room: string) => (/\d$/.test(room) ? room : `the ${room}`);

/** Plain-language wording of a claim (rule book: statements must be checkable). */
export function describeClaim(c: Claim, L: GridLabels, type: 'ledger' | 'surveillance'): string {
  const P = (cell: [number, number]) => L.people[cell[1]];
  const T = (cell: [number, number]) => L.times[cell[0]];
  const V = L.value;
  const moved = type === 'ledger';
  switch (c.kind) {
    case 'is':
      return moved ? `${P(c.cell)} moved ${V(c.value)} ${at(T(c.cell))}.` : `${P(c.cell)} was in ${the(V(c.value))} ${at(T(c.cell))}.`;
    case 'isNot':
      return moved ? `${P(c.cell)} did not move ${V(c.value)} ${at(T(c.cell))}.` : `${P(c.cell)} was not in ${the(V(c.value))} ${at(T(c.cell))}.`;
    case 'atLeast':
      return `${P(c.cell)} moved at least ${V(c.value)} ${at(T(c.cell))}.`;
    case 'atMost':
      return `${P(c.cell)} moved no more than ${V(c.value)} ${at(T(c.cell))}.`;
    case 'compare': {
      const sameRow = c.a[0] === c.b[0];
      const more = c.op === 'gt';
      if (moved)
        return sameRow
          ? `${cap(at(T(c.a)))}, ${P(c.a)} moved ${more ? 'more' : 'less'} than ${P(c.b)}.`
          : `${P(c.a)} moved ${more ? 'more' : 'less'} ${at(T(c.a))} than ${at(T(c.b))}.`;
      return sameRow
        ? `${cap(at(T(c.a)))}, ${P(c.a)} was ${more ? 'further along' : 'closer to the start of'} the pier than ${P(c.b)}.`
        : `${P(c.a)} was ${more ? 'further along' : 'closer to the start of'} the pier ${at(T(c.a))} than ${at(T(c.b))}.`;
    }
    case 'sum': {
      const [a, b] = c.cells;
      return a[1] === b[1]
        ? `${P(a)}'s ${T(a)} and ${T(b)} runs add up to ${V(c.value)}.`
        : `${cap(at(T(a)))}, ${P(a)} and ${P(b)} moved ${V(c.value)} between them.`;
    }
    case 'adjacent':
      return `${cap(at(T(c.a)))}, ${P(c.a)} and ${P(c.b)} were in rooms right next to each other.`;
    case 'notAdjacent':
      return `${cap(at(T(c.a)))}, ${P(c.a)} and ${P(c.b)} were not in neighbouring rooms.`;
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface TimelineLabels {
  /** The moments to put in order. */
  moments: string[];
  /** The times they can go at, earliest first. */
  times: string[];
  /** "at 9 PM" for a slot (1..N). */
  at: (slot: number) => string;
  /** What one step between times is called ("hour"). */
  step: string;
}

export function timelineLabels(lead: Lead, size: number, tone: Tone): TimelineLabels {
  const times = lead.rows.slice(0, size);
  return {
    moments: (lead.moments ?? []).slice(0, size).map((m) => t(m, tone)),
    times,
    at: (slot) => at(times[slot - 1]),
    step: lead.step ?? 'hour',
  };
}

/** Plain-language wording of a timeline claim. Moments are quoted so any wording reads right. */
export function describeTimeClaim(c: TimeClaim, L: TimelineLabels): string {
  const M = (m: number) => `“${L.moments[m]}”`;
  switch (c.kind) {
    case 'at':
      return `${M(c.m)} happened ${L.at(c.slot)}.`;
    case 'notAt':
      return `${M(c.m)} did not happen ${L.at(c.slot)}.`;
    case 'before':
      return `${M(c.a)} happened before ${M(c.b)}.`;
    case 'justBefore':
      return `${M(c.a)} happened right before ${M(c.b)}, with nothing in between.`;
    case 'apart':
      return `${M(c.a)} and ${M(c.b)} were ${c.gap === 1 ? `one ${L.step}` : `${c.gap} ${L.step}s`} apart.`;
  }
}

/** The people of a network lead, by name. */
export const networkPeople = (cf: CaseFile, lead: Lead, size: number): string[] =>
  lead.columns.slice(0, size).map((id) => (cf.cast.find((c) => c.id === id)?.name ?? id).replace(/"/g, ''));

/** Plain-language wording of a network claim. */
export function describeNetClaim(c: NetClaim, people: string[]): string {
  const P = (i: number) => people[i];
  switch (c.kind) {
    case 'linked':
      return `${P(c.a)} and ${P(c.b)} were in contact.`;
    case 'notLinked':
      return `${P(c.a)} and ${P(c.b)} were never in contact.`;
    case 'common':
      return `${P(c.a)} and ${P(c.b)} had someone in common they were both in contact with.`;
    case 'noCommon':
      return `${P(c.a)} and ${P(c.b)} had nobody in common they were both in contact with.`;
    case 'oneOf':
      return `${P(c.a)} was in contact with exactly one of ${P(c.b)} and ${P(c.c)}, not both and not neither.`;
  }
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** How a cipher lead names the places of its code: "the 2nd digit" for a plain code, "Kane’s berth number" for a riddle. */
export interface CipherPlaces {
  /** In a sentence: "the 2nd digit" or "Kane’s berth number". */
  long: (p: number) => string;
  /** On a button: "2nd" or "Kane". */
  short: (p: number) => string;
  /** What each place holds, for headings: "digit" or "berth number". */
  thing: string;
}

export function cipherPlaces(cf: CaseFile, lead: Lead, size: number): CipherPlaces {
  const riddle = lead.riddle;
  if (!riddle) return { long: (p) => `the ${ORDINALS[p]} digit`, short: (p) => ORDINALS[p], thing: 'digit' };
  const names = riddle.people.slice(0, size).map((id) => (cf.cast.find((c) => c.id === id)?.name ?? id).replace(/"/g, ''));
  return { long: (p) => `${names[p]}’s ${riddle.noun} number`, short: (p) => names[p], thing: `${riddle.noun} number` };
}

/** Plain-language wording of a cipher claim: places are named by their order in the code, or by the person in a riddle. */
export function describeCipherClaim(c: CipherClaim, places?: CipherPlaces): string {
  const D = places?.long ?? ((p: number) => `the ${ORDINALS[p]} digit`);
  switch (c.kind) {
    case 'is':
      return `${cap(D(c.p))} is ${c.d}.`;
    case 'isNot':
      return `${cap(D(c.p))} is not ${c.d}.`;
    case 'even':
      return `${cap(D(c.p))} is an even number.`;
    case 'odd':
      return `${cap(D(c.p))} is an odd number.`;
    case 'greater':
      return `${cap(D(c.a))} is bigger than ${D(c.b)}.`;
    case 'sum':
      return `${cap(D(c.a))} and ${D(c.b)} add up to ${c.total}.`;
    case 'apart':
      return `${cap(D(c.a))} and ${D(c.b)} are ${c.gap} apart.`;
  }
}

export interface StakeoutLabels {
  /** District names, in district order. */
  districts: string[];
  /** What stands in each district, singular and plural. */
  one: string;
  many: string;
}

export function stakeoutLabels(lead: Lead, size: number, tone: Tone): StakeoutLabels {
  const named = (lead.districts ?? []).slice(0, size).map((d) => t(d, tone));
  const districts = Array.from({ length: size }, (_, i) => named[i] ?? `District ${String.fromCharCode(65 + i)}`);
  return { districts, one: lead.watchers?.one ?? 'watcher', many: lead.watchers?.many ?? 'watchers' };
}

/** Plain-language wording of a stakeout claim: districts are named, rows count from the top and columns from the left. */
export function describeStakeClaim(c: StakeClaim, L: StakeoutLabels): string {
  const W = (z: number) => `${L.districts[z]}’s ${L.one}`;
  switch (c.kind) {
    case 'at':
      return `${W(c.z)} stood on the square in row ${c.r + 1}, column ${c.c + 1}.`;
    case 'notAt':
      return `${W(c.z)} did not stand on the square in row ${c.r + 1}, column ${c.c + 1}.`;
    case 'row':
      return `${W(c.z)} stood in row ${c.value} (counting from the top).`;
    case 'col':
      return `${W(c.z)} stood in column ${c.value} (counting from the left).`;
    case 'above':
      return `${W(c.a)} stood further up the map than ${W(c.b)}.`;
    case 'left':
      return `${W(c.a)} stood further left on the map than ${W(c.b)}.`;
    case 'gap': {
      const unit = c.axis === 'row' ? 'row' : 'column';
      return `${W(c.a)} and ${W(c.b)} stood ${c.gap} ${unit}${c.gap === 1 ? '' : 's'} apart.`;
    }
  }
}

/** Wording of a statement from any kind of lead. */
export function describeStatement(cf: CaseFile, lead: Lead, p: AnyPuzzle, claim: AnyClaim, tone: Tone): string {
  if (p.type === 'timeline') return describeTimeClaim(claim as TimeClaim, timelineLabels(lead, p.size, tone));
  if (p.type === 'cipher') return describeCipherClaim(claim as CipherClaim, cipherPlaces(cf, lead, p.size));
  if (p.type === 'stakeout') return describeStakeClaim(claim as StakeClaim, stakeoutLabels(lead, p.size, tone));
  if (p.type === 'network') return describeNetClaim(claim as NetClaim, networkPeople(cf, lead, p.size));
  return describeClaim(claim as Claim, gridLabels(cf, lead, p.size, tone), p.type);
}
