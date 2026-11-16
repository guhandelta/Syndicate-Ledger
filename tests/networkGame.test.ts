import { describe, expect, it } from 'vitest';
import type { CaseFile, Lead, PuzzleBook } from '../src/game/caseTypes';
import { evalNet, fittingNetworks, generateNetwork, pairs, type NetClaim } from '../src/engine/network';
import { buyTip, checkLead, fireEvents, gapPairs, newGame, networkOf, solveLead, startLead } from '../src/game/state';
import { describeNetClaim, describeStatement, networkPeople } from '../src/game/text';
import { NET_RULES } from '../src/game/presets';
import { idleHint } from '../src/ui/idleHint';

const ids = ['a', 'b', 'c', 'd', 'e'];
const lead: Lead = {
  id: 'N1', type: 'network', cost: 2, opensAfter: [], title: 'N1', intro: '', columns: ids, rows: [], speakers: ['a', 'b', 'c', 'd'],
  liars: { junior: ['a'], detective: ['a'], inspector: ['a'], chief: ['a'] }, fact: '',
} as unknown as Lead;
const cf = {
  id: 'net-test', clock: { days: 1, hoursPerDay: 12 }, unit: '$#', events: [], offers: [], endings: [],
  cast: ids.map((id, i) => ({ id, name: id === 'e' ? '"E" Quoted' : id.toUpperCase(), role: i ? 'witness' : 'informant', reliability: i ? 'honest' : 'liar', color: '#fff', blurb: '' })),
  leads: [lead],
} as unknown as CaseFile;
const sp = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
const book = {
  'N1:junior': generateNetwork({ size: 4, speakers: sp, maxGrade: 3, ...NET_RULES.junior, seed: 5 }),
  'N1:detective': generateNetwork({ size: 5, speakers: sp, maxGrade: 3, ...NET_RULES.detective, seed: 6 }),
} as unknown as PuzzleBook;

describe('network wording', () => {
  const names = ['Ann', 'Bo', 'Cy'];
  it('says each kind of claim in plain words', () => {
    expect(describeNetClaim({ kind: 'linked', a: 0, b: 1 }, names)).toBe('Ann and Bo were in contact.');
    expect(describeNetClaim({ kind: 'notLinked', a: 0, b: 1 }, names)).toBe('Ann and Bo were never in contact.');
    expect(describeNetClaim({ kind: 'common', a: 0, b: 1 }, names)).toContain('in common');
    expect(describeNetClaim({ kind: 'noCommon', a: 0, b: 1 }, names)).toContain('nobody in common');
    expect(describeNetClaim({ kind: 'oneOf', a: 0, b: 1, c: 2 }, names)).toBe('Ann was in contact with exactly one of Bo and Cy, not both and not neither.');
  });

  it('names the people from the cast, without quote marks, and for every kind of lead', () => {
    expect(networkPeople(cf, lead, 5)).toEqual(['A', 'B', 'C', 'D', 'E Quoted']);
    expect(networkPeople(cf, { ...lead, columns: ['zz'] }, 1)).toEqual(['zz']);
    const p = book['N1:junior'] as never;
    expect(describeStatement(cf, lead, p, { kind: 'linked', a: 0, b: 1 } as NetClaim, 'crime')).toBe('A and B were in contact.');
  });
});

describe('a network lead in a game', () => {
  it('starts with every pair undecided', () => {
    const g = newGame(cf, book, 'junior');
    const lp = g.s.leads.N1;
    expect(lp.links).toEqual(pairs(4).map(() => 0));
    expect(lp.grid).toEqual([]);
    expect(checkLead(g, 'N1')).toBe('grid-incomplete');
  });

  it('is wrong until every pair is decided the right way, then needs the witnesses marked', () => {
    const g = newGame(cf, book, 'junior');
    const p = networkOf(g, 'N1');
    const lp = g.s.leads.N1;
    lp.links = p.links.map((v) => (v ? 1 : 2));
    lp.links[0] = p.links[0] ? 2 : 1;
    expect(checkLead(g, 'N1')).toBe('grid-wrong');
    lp.links = p.links.map((v) => (v ? 1 : 2));
    expect(checkLead(g, 'N1')).toBe('marks-incomplete');
    lp.marks = p.truth.map((t) => (t ? 'lie' : 'true'));
    expect(checkLead(g, 'N1')).toBe('marks-wrong');
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(checkLead(g, 'N1')).toBe('solved');
    solveLead(g, 'N1');
    expect(g.s.leads.N1.solved).toBe(true);
  });

  it('sells a true statement the player does not have yet', () => {
    const g = newGame(cf, book, 'junior');
    const before = g.s.favors;
    const tip = buyTip(g, 'N1', 'a');
    expect(tip).not.toBe('cant');
    expect(evalNet(tip as NetClaim, 4, networkOf(g, 'N1').links)).toBe(true);
    expect(g.s.favors).toBe(before - 1);
    expect(g.s.leads.N1.paidTips).toHaveLength(1);
  });

  // a puzzle where one honest witness holds all the answers, so when they leave pairs must be shown
  const trueClaim = (p: ReturnType<typeof networkOf>) => p.statements.find((_, i) => p.truth[i])!;
  const lone = () => {
    const p = book['N1:detective'] as ReturnType<typeof networkOf>;
    return { 'N1:detective': { ...p, liarCounts: [0], statements: [{ ...trueClaim(p), speaker: 'b' }], truth: [true] } } as unknown as PuzzleBook;
  };

  it('keeps the lead solvable when a witness leaves, by showing the pairs that are needed', () => {
    const g = newGame(cf, lone(), 'detective');
    const lp = g.s.leads.N1;
    const p = networkOf(g, 'N1');
    lp.missingSpeakers.push('b');
    const added = gapPairs(g, 'N1');
    expect(added.length).toBeGreaterThan(0);
    // the pairs are all different, and with them shown only the real network is left
    expect(new Set(added).size).toBe(added.length);
    expect(fittingNetworks(p, []).filter((l) => added.every((k) => l[k] === p.links[k]))).toEqual([p.links]);
    // nothing is added while every witness is still there
    expect(gapPairs(newGame(cf, book, 'detective'), 'N1')).toEqual([]);
  });

  it('shows the needed pairs by itself when an event removes a witness, and skips pairs already shown', () => {
    const ev = { id: 'leaves', at: 0, effect: { type: 'removeSpeaker', lead: 'N1', speaker: 'b', recover: { hours: 1, favors: 1 } }, rumor: '', message: '' };
    const g = newGame({ ...cf, events: [ev] } as unknown as CaseFile, lone(), 'detective');
    const lp = g.s.leads.N1;
    lp.shownPairs!.push(0);
    lp.links![0] = networkOf(g, 'N1').links[0] ? 1 : 2;
    expect(fireEvents(g)).toHaveLength(1);
    expect(lp.shownPairs!.length).toBeGreaterThan(1);
    expect(new Set(lp.shownPairs).size).toBe(lp.shownPairs!.length);
    for (const k of lp.shownPairs!) expect(lp.links![k]).toBe(networkOf(g, 'N1').links[k] ? 1 : 2);
    expect(startLead(g, 'N1')).toEqual([]);
  });
});

describe('idle tips on a network lead', () => {
  const tip = (g: ReturnType<typeof newGame>) => idleHint({ game: g, screen: 'puzzle', leadId: 'N1', town: null, dialog: false, tone: 'crime' }).todo;
  it('guides each stage of a network', () => {
    const g = newGame(cf, book, 'junior');
    const p = networkOf(g, 'N1');
    const lp = g.s.leads.N1;
    lp.started = true;
    expect(tip(g)).toMatch(/Decide every pair/);
    lp.links = p.links.map((v) => (v ? 1 : 2));
    lp.links[0] = p.links[0] ? 2 : 1;
    expect(tip(g)).toMatch(/decided the wrong way/);
    lp.links = p.links.map((v) => (v ? 1 : 2));
    expect(tip(g)).toMatch(/network is complete/);
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(tip(g)).toMatch(/Press Close this lead/);
  });
});
