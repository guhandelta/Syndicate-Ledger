import type { Claim } from '../engine/types';
import type { CaseFile, Lead, Text } from './caseTypes';

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
const at = (time: string) => (DAYS.includes(time) ? `on ${time}` : /^[A-Z][a-z]{2}$/.test(time) ? `in ${time}` : `at ${time}`);
/** "the Ice house", but "Warehouse 9" (a numbered place is already a name). */
const the = (room: string) => (/\d$/.test(room) ? room : `the ${room}`);

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
