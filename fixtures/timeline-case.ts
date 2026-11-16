/**
 * A test case for the timeline puzzle: Case 1's cast with one timeline lead, so the screen can be played and tested
 * without changing Case 1. It is only served by the dev server for the end-to-end tests (fixtures/timeline.html).
 */
import caseFile from '../cases/case-01-harbor-ledger.json';
import { generateNetwork } from '../src/engine/network';
import { generateTimeline } from '../src/engine/timeline';
import { PRESETS, type CaseFile, type Lead, type PuzzleBook } from '../src/game/caseTypes';
import { MAP_RULES, NET_RULES, PRESET_RULES } from '../src/game/presets';

const lead: Lead = {
  id: 'T1',
  type: 'timeline',
  map: true,
  cost: 2,
  opensAfter: [],
  title: 'The night, minute by minute',
  intro: 'Put the night in order. Every time has exactly one moment, and not every witness is telling the truth.',
  columns: [],
  rows: ['9 PM', '10 PM', '11 PM', '12 AM', '1 AM', '2 AM', '3 AM'],
  moments: [
    'The pier lights go out',
    'The camera stops recording',
    "Vex's van pulls up",
    'A crate leaves the ice house',
    'A call comes in to the harbor office',
    'The alarm rings',
    'The van drives away',
  ],
  speakers: ['vex', 'kane', 'rosa', 'juno'],
  liars: { junior: ['vex'], detective: ['vex'], inspector: ['vex', 'kane'], chief: ['vex', 'kane'] },
  fact: 'The van was at the pier before the alarm, so the alarm was no accident.',
  pointsTo: ['vex'],
} as unknown as Lead;

const net: Lead = {
  id: 'N1',
  type: 'network',
  cost: 2,
  opensAfter: [],
  title: 'Who called whom',
  intro: 'The phone company gives each person\'s number of contacts. Work out who was in contact with whom. Not every witness is telling the truth.',
  columns: ['vex', 'kane', 'rosa', 'tip', 'juno', 'crane', 'karunakaran'],
  rows: [],
  speakers: ['rosa', 'kane', 'tip', 'juno'],
  liars: { junior: ['kane'], detective: ['kane'], inspector: ['kane', 'tip'], chief: ['kane', 'tip'] },
  fact: 'Crane was in touch with the van driver the night of the theft.',
  pointsTo: ['crane'],
} as unknown as Lead;

export const timelineCase = {
  ...(caseFile as unknown as CaseFile),
  id: 'timeline-demo',
  rankStories: undefined,
  leads: [lead, net],
  events: [],
  offers: [],
  missedClues: [],
  proof: { vex: { needs: ['T1'] } },
} as unknown as CaseFile;

export const timelineBook: PuzzleBook = {};
for (const preset of PRESETS) {
  const n = PRESET_RULES[preset].size;
  const lies = lead.liars[preset];
  timelineBook[`T1:${preset}`] = generateTimeline({
    size: n,
    speakers: lead.speakers.map((id) => ({ id, lies: lies.filter((l) => l === id).length })),
    liarRange: PRESET_RULES[preset].liarRange,
    maxGrade: Math.min(PRESET_RULES[preset].maxGrade, 3),
    minGrade: n >= 6 ? 3 : 2,
    maxStatements: n >= 7 ? 13 : n + 4,
    givens: n >= 7 ? 1 : 0,
    ...MAP_RULES[preset],
    seed: n * 101,
  });
}

for (const preset of PRESETS) {
  const n = PRESET_RULES[preset].size;
  const lies = net.liars[preset];
  timelineBook[`N1:${preset}`] = generateNetwork({
    size: n,
    speakers: net.speakers.map((id) => ({ id, lies: lies.filter((l) => l === id).length })),
    liarRange: PRESET_RULES[preset].liarRange,
    maxGrade: Math.min(PRESET_RULES[preset].maxGrade, 3),
    ...NET_RULES[preset],
    seed: n * 211,
  });
}
