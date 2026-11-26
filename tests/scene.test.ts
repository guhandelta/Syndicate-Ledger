import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CaseFile } from '../src/game/caseTypes';
import { draftLead, type SceneBrief } from '../src/game/scene';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const people = ['vex', 'kane', 'meena', 'tip', 'nevethitha', 'thenmozhi', 'karunakaran'];

const ledger: SceneBrief = {
  id: 'L9',
  type: 'ledger',
  thing: 'boathouse till roll',
  backstory: 'A till roll was left in the boathouse, and somebody has been adding to it after dark.',
  people,
  rows: ['8 PM', '9 PM', '10 PM'],
  key: { person: 'kane', time: '9 PM', value: 4 },
  speakers: ['meena', 'kane', 'vex'],
};
const log: SceneBrief = {
  ...ledger,
  id: 'L10',
  type: 'surveillance',
  thing: 'harbor key log',
  rooms: ['Harbor office', 'Ice house', 'Warehouse 9'],
  key: { person: 'thenmozhi', time: '10 PM', value: 3 },
  aside: 'She wrote it down.',
};
const bad = (patch: Partial<SceneBrief>) => () => draftLead(cf, { ...ledger, ...patch });

describe('drafting a lead from a scene brief', () => {
  it('words a ledger lead from the brief and plants the key fact as an anchor', () => {
    const lead = draftLead(cf, ledger);
    expect(lead).toMatchObject({ id: 'L9', type: 'ledger', cost: 2, opensAfter: [], title: 'Boathouse till roll', columns: people, rows: ledger.rows });
    expect(lead.anchors).toEqual([{ time: '9 PM', person: 'kane', value: 4 }]);
    expect(lead.fact).toEqual({ crime: 'At 9 PM Kane moved $4k.', friendly: 'At 9 PM Kane moved 4 coins!' });
    expect(JSON.stringify(lead.intro)).toContain('how much each person moved each hour');
    expect(lead.liars).toEqual({ junior: [], detective: [], inspector: [], chief: [] });
    expect(lead).not.toHaveProperty('hard');
    expect(lead).not.toHaveProperty('rooms');
  });

  it('says one coin, not one coins', () => {
    const lead = draftLead(cf, { ...ledger, key: { ...ledger.key, value: 1 } });
    expect(lead.fact).toMatchObject({ friendly: 'At 9 PM Kane moved 1 coin!' });
  });

  it('words a surveillance lead with the room the key value points at, and keeps the optional parts', () => {
    const lead = draftLead(cf, { ...log, cost: 3, hard: true, opensAfter: ['L9'], pointsTo: ['vex'], links: [{ from: 'L9', take: 'number', use: 'is' }], liars: { chief: ['vex'] } });
    expect(lead).toMatchObject({ cost: 3, hard: true, opensAfter: ['L9'], pointsTo: ['vex'], rooms: log.rooms });
    expect(lead.links).toHaveLength(1);
    expect(lead.liars.chief).toEqual(['vex']);
    expect(lead.fact).toEqual({ crime: 'Thenmozhi was in Warehouse 9 at 10 PM. She wrote it down.', friendly: 'Thenmozhi was in Warehouse 9 at 10 PM! She wrote it down.' });
    expect(JSON.stringify(lead.intro)).toContain('who was in which room');
  });

  it('uses a plain-text unit and names titled people by their first name', () => {
    const plain = { cast: [...cf.cast, { ...cf.cast[0], id: 'capt', name: 'Capt. "Ola" Rye' }], unit: '$#k' };
    const lead = draftLead(plain, { ...ledger, people: [...people, 'capt'], key: { person: 'capt', time: '9 PM', value: 2 } });
    expect(lead.fact).toEqual({ crime: 'At 9 PM Ola moved $2k.', friendly: 'At 9 PM Ola moved $2k!' });
    const crimeOnly = draftLead({ ...plain, unit: { crime: '$#k' } }, ledger);
    expect(crimeOnly.fact).toMatchObject({ friendly: 'At 9 PM Kane moved $4k!' });
  });

  it('refuses a brief that does not hang together', () => {
    expect(bad({ speakers: ['nobody'] })).toThrow('nobody is not in the cast');
    expect(bad({ people: [...people, 'vex'] })).toThrow('listed twice');
    expect(bad({ key: { person: 'dex', time: '9 PM', value: 4 } })).toThrow('dex is not one of the people');
    expect(bad({ key: { person: 'kane', time: '1 AM', value: 4 } })).toThrow('1 AM is not one of the rows');
    expect(bad({ key: { person: 'kane', time: '9 PM', value: 0 } })).toThrow('from 1 to 9');
    expect(bad({ key: { person: 'kane', time: '9 PM', value: 2.5 } })).toThrow('from 1 to 9');
    expect(bad({ type: 'surveillance' })).toThrow('needs its rooms');
    expect(() => draftLead(cf, { ...log, key: { ...log.key, value: 4 } })).toThrow('from 1 to 3');
  });
});
