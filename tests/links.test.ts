import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generatePuzzle, verifyUnique } from '../src/engine/generator';
import { generateTimeline } from '../src/engine/timeline';
import { generateCipher } from '../src/engine/cipher';
import { generateNetwork } from '../src/engine/network';
import { makeRng } from '../src/engine/rng';
import type { AnyAnswered, Via } from '../src/engine/via';
import { refHolder, refNumber } from '../src/engine/via';
import type { CaseFile, PuzzleBook } from '../src/game/caseTypes';
import { PRESETS } from '../src/game/caseTypes';
import { caseForRank } from '../src/game/rankStory';
import { checkLinks, linkResolves, linksFor, planLinks, wordStatement, type Answers } from '../src/game/links';
import { describeStatement } from '../src/game/text';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const book: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));
const via: Via = { lead: 'X', ref: { kind: 'cell', r: 0, c: 0 } };

describe('planted link clues in the generators', () => {
  it('plants a true clue, says it first, and keeps exactly one answer', () => {
    const planted = [{ speaker: 'a', claim: { kind: 'is' as const, cell: [1, 2] as [number, number], value: 3 }, via }];
    const p = generatePuzzle({ size: 4, type: 'ledger', speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 0 }], maxGrade: 4, planted, seed: 9 }, 3000);
    expect(p.solution[1][2]).toBe(3);
    expect(p.statements.filter((s) => s.via)).toHaveLength(1);
    expect(verifyUnique(p)).toEqual({ ok: true });
  });

  it('plants a link in a timeline, a network and a cipher', () => {
    const t = generateTimeline({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, minGrade: 2, planted: [{ speaker: 'a', claim: { kind: 'apart', a: 0, b: 1, gap: 2 }, via }], seed: 3 }, 3000);
    expect(Math.abs(t.solution[0] - t.solution[1])).toBe(2);
    expect(t.statements.some((s) => s.via)).toBe(true);
    const n = generateNetwork({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, planted: [{ speaker: 'a', claim: { kind: 'linked', a: 0, b: 1 }, via }], seed: 5 }, 3000);
    expect(n.links[0]).toBe(1);
    const c = generateCipher({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, planted: [{ speaker: 'a', claim: { kind: 'is', p: 1, d: 3 }, via }], seed: 7 }, 3000);
    expect(c.code[1]).toBe(3);
  });

  it('catches a link the puzzle does not need, and links that settle it alone', () => {
    const p = generatePuzzle({ size: 4, type: 'ledger', speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 0 }], maxGrade: 4, seed: 12 });
    // a spare true clue marked as a link is not needed: the puzzle was already settled without it
    const spare = { speaker: 'a', claim: { kind: 'is' as const, cell: [0, 0] as [number, number], value: p.solution[0][0] }, via };
    const padded = { ...p, statements: [...p.statements, spare], truth: [...p.truth, true] };
    expect(checkLinks(padded)).toEqual({ ok: false, reason: 'the puzzle is solved without its link clues' });
    // a puzzle whose every clue is a link is solved without anything else
    const onlyLinks = { ...p, statements: p.statements.map((s) => ({ ...s, via })), liarCounts: [0], truth: p.truth.map(() => true) };
    expect(checkLinks({ ...onlyLinks, statements: onlyLinks.statements.slice(0, 0) }).ok).toBe(true);
  });
});

describe('Case 1 links', () => {
  const ranks = PRESETS.map((preset) => ({ preset, story: caseForRank(cf, preset) }));

  it('every link the case asks for is in the shipped puzzle, quotes its source exactly, and is needed', { timeout: 120_000 }, () => {
    let seen = 0;
    for (const { preset, story } of ranks) {
      const answers: Answers = {};
      for (const l of story.leads) answers[l.id] = book[`${l.id}:${preset}`];
      for (const lead of story.leads) {
        const p = book[`${lead.id}:${preset}`] as AnyAnswered;
        const links = (p.statements as { via?: Via }[]).filter((s) => s.via);
        expect(links.length, `${lead.id}:${preset}`).toBe(linksFor(lead, preset).length);
        for (const st of links) {
          expect(linkResolves(story, lead, p, st as never, answers), `${lead.id}:${preset}`).toBeNull();
          seen++;
        }
        // the 6x6 and 7x7 proofs are slow enough to stall the test worker; `npm run validate` runs them for every rank
        if (preset === 'junior' || preset === 'detective') expect(checkLinks(p), `${lead.id}:${preset}`).toEqual({ ok: true });
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('only quotes leads that open before the one that quotes them', () => {
    for (const { story } of ranks)
      for (const lead of story.leads)
        for (const spec of lead.links ?? []) {
          const idx = story.leads.findIndex((l) => l.id === spec.from);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(story.leads.findIndex((l) => l.id === lead.id));
        }
  });

  it('words a link as a pointer back, not the number', () => {
    const story = caseForRank(cf, 'junior');
    const answers: Answers = {};
    for (const l of story.leads) answers[l.id] = book[`${l.id}:junior`];
    const lead = story.leads.find((l) => l.id === 'J2')!;
    const p = book['J2:junior'] as AnyAnswered;
    const st = (p.statements as { via?: Via }[]).find((s) => s.via)!;
    const said = wordStatement(story, lead, p, st as never, answers, 'friendly');
    expect(said).toContain('numbered');
    expect(said).toContain('The festival notebook');
    // an ordinary statement reads as before
    const plain = (p.statements as { claim: unknown; via?: Via }[]).find((s) => !s.via)!;
    expect(wordStatement(story, lead, p, plain as never, answers, 'crime')).toBe(describeStatement(story, lead, p as never, plain.claim as never, 'crime'));
  });

  it('higher ranks describe the cell through someone else in the same hour', () => {
    const story = caseForRank(cf, 'detective');
    const answers: Answers = {};
    for (const l of story.leads) answers[l.id] = book[`${l.id}:detective`];
    const lead = story.leads.find((l) => l.id === 'L2')!;
    const p = book['L2:detective'] as AnyAnswered;
    const st = (p.statements as { via?: Via }[]).find((s) => s.via)!;
    expect(st.via!.ref.kind === 'cell' && st.via!.ref.by).toBeTruthy();
    expect(wordStatement(story, lead, p, st as never, answers, 'crime')).toMatch(/in the hour .* moved/);
  });

  it('plans links from the earlier answers, the same every time for the same seed', () => {
    const story = caseForRank(cf, 'junior');
    const answers: Answers = {};
    for (const l of story.leads) answers[l.id] = book[`${l.id}:junior`];
    const lead = story.leads.find((l) => l.id === 'J5')!;
    const a = planLinks(story, 'junior', lead, 4, answers, makeRng(5));
    const b = planLinks(story, 'junior', lead, 4, answers, makeRng(5));
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    for (const pl of a) expect(refNumber(answers[pl.via.lead]!, pl.via.ref)).toBeGreaterThan(0);
    // a person link points at someone in the earlier grid
    const j3 = story.leads.find((l) => l.id === 'J3')!;
    const [who] = planLinks(story, 'junior', j3, 4, answers, makeRng(2));
    expect(refHolder(answers.J1!, who.via.ref)).toBeGreaterThanOrEqual(0);
  });

  it('refuses a link to a lead that is not built yet', () => {
    const story = caseForRank(cf, 'junior');
    const lead = story.leads.find((l) => l.id === 'J2')!;
    expect(() => planLinks(story, 'junior', lead, 4, {}, makeRng(1))).toThrow(/not built yet/);
  });
});

// ---- every kind of link, on small made-up leads ----
import { allCodes } from '../src/engine/cipher';
import type { Lead } from '../src/game/caseTypes';
import { describeLinked, linksFor as linksOf } from '../src/game/links';
import { linked, refHolder as holderOf } from '../src/engine/via';
import type { GeneratedPuzzle } from '../src/engine/types';
import type { NetworkPuzzle } from '../src/engine/network';
import type { TimelinePuzzle } from '../src/engine/timeline';
import type { CipherPuzzle } from '../src/engine/cipher';

const viaL: Via = { lead: 'L', ref: { kind: 'cell', r: 0, c: 0 } };
const ids = ['a', 'b', 'c', 'd'];
const mk = (id: string, type: Lead['type'], extra: Partial<Lead> = {}): Lead =>
  ({ id, type, cost: 1, opensAfter: [], title: `Lead ${id}`, intro: '', columns: ids, rows: ['1', '2', '3', '4'], rooms: ['R1', 'R2', 'R3', 'R4'], moments: ['m0', 'm1', 'm2', 'm3'], speakers: ['a', 'b'], liars: { junior: ['b'], detective: [], inspector: [], chief: [] }, fact: '', ...extra }) as Lead;
const story = (leads: Lead[], events: CaseFile['events'] = []): CaseFile =>
  ({ id: 'x', unit: '$#k', cast: ids.map((id) => ({ id, name: id.toUpperCase() })), leads, events }) as unknown as CaseFile;

const ledger = generatePuzzle({ size: 4, type: 'ledger', speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 0 }], maxGrade: 4, seed: 21 });
const rooms = generatePuzzle({ size: 4, type: 'surveillance', speakers: [{ id: 'a', lies: 0 }, { id: 'b', lies: 0 }], maxGrade: 4, seed: 22 });
const tline = generateTimeline({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, minGrade: 2, seed: 3 });
const net = generateNetwork({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, seed: 5 });
const cip = generateCipher({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, seed: 7 });
const answers: Answers = { L: ledger, S: rooms, T: tline, N: net, C: cip };
const leads = [mk('L', 'ledger'), mk('S', 'surveillance'), mk('T', 'timeline'), mk('N', 'network'), mk('C', 'cipher')];
const S = story(leads);
const plan = (lead: Lead, spec: object, seed = 1) => planLinks(S, 'detective', { ...lead, links: [spec as never] }, 4, answers, makeRng(seed));
const word = (lead: Lead, p: AnyAnswered, pl: { claim: unknown; via: Via }) => describeLinked(S, lead, p, pl, answers, 'crime');

describe('every kind of link', () => {
  it('quotes each kind of earlier answer: a cell, a moment, a count, a digit, and who held a figure', () => {
    for (const from of ['L', 'S', 'T', 'N', 'C']) {
      const [pl] = plan(leads[0], { from, take: 'number', use: 'is' });
      expect(refNumber(answers[from]!, pl.via.ref)).toBe((pl.claim as { value: number }).value);
    }
    const [who] = plan(leads[3], { from: 'S', take: 'person', use: 'linked' });
    expect(holderOf(rooms, who.via.ref)).toBeGreaterThanOrEqual(0);
    expect(linked([{ via }, {}] as { via?: Via }[])).toHaveLength(1);
  });

  it('uses a number as a cell, a sum, a gap, a time or a digit', () => {
    expect((plan(leads[1], { from: 'L', take: 'number', use: 'is' })[0].claim as { kind: string }).kind).toBe('is');
    const sums = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => plan(leads[0], { from: 'L', take: 'number', use: 'sum' }, s)[0].claim as { kind: string });
    expect(sums.every((c) => c.kind === 'sum')).toBe(true);
    expect((plan(leads[2], { from: 'L', take: 'number', use: 'apart' })[0].claim as { kind: string }).kind).toBe('apart');
    expect((plan(leads[2], { from: 'L', take: 'number', use: 'is' })[0].claim as { kind: string }).kind).toBe('at');
    expect((plan(leads[4], { from: 'L', take: 'number', use: 'is' })[0].claim as { kind: string }).kind).toBe('is');
    expect((plan(leads[4], { from: 'L', take: 'number', use: 'apart' })[0].claim as { kind: string }).kind).toBe('apart');
  });

  it('refuses links that make no sense', () => {
    const bad = (lead: Lead, spec: object) => () => plan(lead, spec);
    expect(bad(leads[0], { from: 'L', take: 'person', use: 'linked' })).toThrow(/network lead/);
    expect(bad(leads[3], { from: 'T', take: 'person', use: 'linked' })).toThrow(/grid lead/);
    expect(bad(leads[3], { from: 'L', take: 'number', use: 'is' })).toThrow(/cannot be used/);
    // nobody of the earlier grid sits in a network of strangers
    const strangers = mk('N', 'network', { columns: ['w', 'x', 'y', 'z'] });
    expect(() => plan(strangers, { from: 'L', take: 'person', use: 'linked' })).toThrow(/no person/);
  });

  it('refuses a number the earlier answer cannot give', () => {
    const none = { ...net, degrees: [0, 0, 0, 0] } as NetworkPuzzle;
    const poor: Answers = { ...answers, N: none };
    for (const use of ['is', 'sum', 'apart'] as const)
      for (const lead of [leads[0], leads[2], leads[4]])
        expect(() => planLinks(S, 'junior', { ...lead, links: [{ from: 'N', take: 'number', use } as never] }, 4, poor, makeRng(1))).toThrow(/has no number/);
  });

  it('picks the witness who stays and tells the truth, unless the case names one', () => {
    const sent = story(leads, [{ effect: { type: 'removeSpeaker', lead: 'L', speaker: 'a' } }, { effect: { type: 'endCase' } }] as never);
    const lead = { ...leads[0], liars: { ...leads[0].liars, junior: [] } };
    expect(planLinks(sent, 'junior', { ...lead, links: [{ from: 'S', take: 'number', use: 'is' }] }, 4, answers, makeRng(1))[0].speaker).toBe('b');
    expect(planLinks(sent, 'junior', { ...lead, links: [{ from: 'S', take: 'number', use: 'is', speaker: 'd' }] }, 4, answers, makeRng(1))[0].speaker).toBe('d');
    // everyone lies or leaves: the first honest one, then the first
    const only = { ...lead, speakers: ['a'], liars: { ...lead.liars, junior: ['a'] } };
    expect(planLinks(sent, 'junior', { ...only, links: [{ from: 'S', take: 'number', use: 'is' }] }, 4, answers, makeRng(1))[0].speaker).toBe('a');
    expect(linksOf({ ...lead, links: [{ from: 'S', take: 'number', use: 'is', ranks: ['chief'] }] }, 'junior')).toEqual([]);
  });

  it('words every kind of link', () => {
    const cases: [Lead, AnyAnswered, object, RegExp][] = [
      [leads[0], ledger, { from: 'L', take: 'number', use: 'is' }, /figure equals what .* moved in the hour .* moved .* in “Lead L”/],
      [leads[1], rooms, { from: 'S', take: 'number', use: 'is' }, /room number .* equals the number of the room .* was in when .* was in .* in “Lead S”/],
      [leads[0], ledger, { from: 'T', take: 'number', use: 'is' }, /place in the night .* of “m\d” in “Lead T”/],
      [leads[0], ledger, { from: 'N', take: 'number', use: 'is' }, /how many people .* was in contact with in “Lead N”/],
      [leads[0], ledger, { from: 'C', take: 'number', use: 'is' }, /digit of the code in “Lead C”/],
      [leads[2], tline, { from: 'L', take: 'number', use: 'apart' }, /as many hours apart as what/],
      [leads[2], tline, { from: 'L', take: 'number', use: 'is' }, /happened at the time numbered what/],
      [leads[4], cip, { from: 'L', take: 'number', use: 'is' }, /digit is what/],
      [leads[4], cip, { from: 'L', take: 'number', use: 'apart' }, / digits? .*are what .* apart|digit and the \d(st|nd|rd|th) digit are what .* apart/],
      [leads[3], net, { from: 'L', take: 'person', use: 'linked' }, /was in contact with the person who moved .* in “Lead L”/],
      [leads[3], net, { from: 'S', take: 'person', use: 'linked' }, /was in contact with whoever was in .* in “Lead S”/],
    ];
    for (const [lead, p, spec, re] of cases) expect(word(lead, p, plan(lead, spec)[0]), JSON.stringify(spec)).toMatch(re);
    // sums, and a link on an earlier cell named without a second person (direct wording)
    const [sum] = plan(leads[0], { from: 'L', take: 'number', use: 'sum' }, 3);
    expect(word(leads[0], ledger, sum)).toContain('figures add up to');
    const direct = planLinks(S, 'junior', { ...leads[0], links: [{ from: 'L', take: 'number', use: 'is' }] }, 4, answers, makeRng(1));
    const noBy = { claim: direct[0].claim, via: { lead: 'L', ref: { kind: 'cell', r: 0, c: 0 } } as Via };
    expect(word(leads[0], ledger, noBy)).toContain('what A moved at 1 in “Lead L”');
    expect(word(leads[1], rooms, { claim: { kind: 'is', cell: [0, 0], value: 1 }, via: { lead: 'S', ref: { kind: 'cell', r: 0, c: 0 } } })).toContain('the number of the room A was in at 1');
    // anything else a link claim can be falls back to the plain wording
    expect(word(leads[0], ledger, { claim: { kind: 'isNot', cell: [0, 0], value: 1 }, via: viaL })).toContain('did not move');
    expect(word(leads[2], tline, { claim: { kind: 'before', a: 0, b: 1 }, via: viaL })).toContain('before');
    expect(word(leads[4], cip, { claim: { kind: 'odd', p: 0 }, via: viaL })).toBe(word(leads[4], cip, { claim: { kind: 'odd', p: 0 }, via: viaL }));
  });

  it('words a link through the story when the case gives it, in either tone', () => {
    const tell = (lead: Lead, p: AnyAnswered, spec: object, tone: 'crime' | 'friendly', seed = 1) => {
      const [pl] = plan(lead, spec, seed);
      return describeLinked(S, lead, p, pl, answers, tone);
    };
    const both = { crime: 'CR {a}|{b}|{when}|{q}', friendly: 'FR {a}|{when}|{q}' };
    const specs: [Lead, AnyAnswered, object][] = [
      [leads[0], ledger, { from: 'L', take: 'number', use: 'is', story: both }],
      [leads[0], ledger, { from: 'L', take: 'number', use: 'sum', story: both }],
      [leads[2], tline, { from: 'L', take: 'number', use: 'is', story: both }],
      [leads[2], tline, { from: 'L', take: 'number', use: 'apart', story: both }],
      [leads[4], cip, { from: 'L', take: 'number', use: 'is', story: both }],
      [leads[4], cip, { from: 'L', take: 'number', use: 'apart', story: both }],
      [leads[3], net, { from: 'L', take: 'person', use: 'linked', story: both }],
    ];
    for (const [lead, p, spec] of specs) {
      expect(tell(lead, p, spec, 'crime', 3), JSON.stringify(spec)).toMatch(/^CR .*in “Lead L”/);
      expect(tell(lead, p, spec, 'friendly', 3)).toMatch(/^FR /);
    }
    // a story with no friendly wording uses the other one
    expect(tell(leads[0], ledger, { from: 'L', take: 'number', use: 'is', story: { crime: 'Only {q}' } }, 'friendly')).toMatch(/^Only what/);
  });

  it('checks that a link says what it quotes', () => {
    const [pl] = plan(leads[0], { from: 'L', take: 'number', use: 'is' });
    expect(linkResolves(S, leads[0], ledger, pl, answers)).toBeNull();
    const off = { ...pl, claim: { ...(pl.claim as object), value: ((pl.claim as { value: number }).value % 4) + 1 } };
    expect(linkResolves(S, leads[0], ledger, off, answers)).toMatch(/quotes/);
    expect(linkResolves(S, leads[0], ledger, pl, {})).toMatch(/not there/);
    const [who] = plan(leads[3], { from: 'S', take: 'person', use: 'linked' });
    expect(linkResolves(S, leads[3], net, who, answers)).toBeNull();
    const wrong = { ...who, claim: { kind: 'linked', a: (((who.claim as { a: number }).a) + 1) % 4, b: 0 } };
    expect(linkResolves(S, leads[3], net, wrong, answers)).toMatch(/points at/);
    expect(() => refHolder(ledger, { kind: 'cell', r: 0, c: 0 })).toThrow(/person/);
    expect(() => refNumber(ledger, { kind: 'holder', r: 0, v: 1 })).toThrow(/person/);
  });

  it('is fine with a puzzle that has no links, and says why one fails', () => {
    expect(checkLinks(ledger)).toEqual({ ok: true });
    const all = (p: GeneratedPuzzle) => ({ ...p, statements: p.statements.map((s) => ({ ...s, via })) });
    // every clue is a link, and together they settle it: not enough alone fails
    expect(checkLinks(all(ledger))).toEqual({ ok: false, reason: 'the link clues alone settle the puzzle' });
    // a herring is left out of the first proof
    const herring = { ...ledger, statements: ledger.statements.map((s) => ({ ...s, via: { ...via, herring: true } })) };
    expect(checkLinks(herring).ok).toBe(false);
    for (const p of [tline as TimelinePuzzle, net as NetworkPuzzle, cip as CipherPuzzle]) expect(typeof checkLinks({ ...p, statements: p.statements.map((s) => ({ ...s, via })) } as never).ok).toBe('boolean');
    expect(allCodes(4).length).toBeGreaterThan(0);
  });
});

describe('link clues that cannot be fitted', () => {
  const opts = { size: 4, type: 'ledger' as const, speakers: [{ id: 'a', lies: 0 }], maxGrade: 4, seed: 4 };
  const spec = (claim: unknown) => [{ speaker: 'a', claim, via }] as never;

  it('rejects a link that rules nothing out, in every kind of puzzle', () => {
    expect(() => generatePuzzle({ ...opts, planted: spec({ kind: 'atLeast', cell: [0, 0], value: 1 }) }, 5)).toThrow(/Could not generate/);
    expect(() => generateTimeline({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, planted: spec({ kind: 'apart', a: 0, b: 0, gap: 0 }), seed: 3 }, 5)).toThrow(/Could not generate/);
    expect(() => generateCipher({ size: 4, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, planted: spec({ kind: 'apart', a: 0, b: 0, gap: 0 }), seed: 3 }, 5)).toThrow(/Could not generate/);
  });

  it('fits some link clues by renaming numbers and leaves the rest to be drawn again', () => {
    // a sum is not fitted by renaming; two different numbers in cells that clash are not both fitted
    const sum = generatePuzzle({ ...opts, planted: spec({ kind: 'sum', cells: [[0, 0], [0, 1]], value: 3 }) }, 3000);
    expect(sum.solution[0][0] + sum.solution[0][1]).toBe(3);
    expect(() => generatePuzzle({ ...opts, planted: [{ speaker: 'a', claim: { kind: 'is', cell: [0, 0], value: 1 }, via }, { speaker: 'a', claim: { kind: 'is', cell: [1, 1], value: 2 }, via }] as never }, 1)).not.toThrow();
  });

  it('keeps an anchor while fitting a link', () => {
    const p = generatePuzzle({ ...opts, size: 5, anchors: [{ cell: [2, 1], value: 3 }], planted: spec({ kind: 'is', cell: [0, 0], value: 4 }) }, 3000);
    expect([p.solution[2][1], p.solution[0][0]]).toEqual([3, 4]);
  });

  it('plans a herring and a rank with no liars listed', () => {
    const [h] = planLinks(S, 'chief', { ...leads[0], liars: {} as never, links: [{ from: 'S', take: 'number', use: 'is', herring: true }] }, 4, answers, makeRng(2));
    expect(h.via.herring).toBe(true);
  });
});

describe('the solver on an open grid', () => {
  it('counts Latin squares without any clue', async () => {
    const { enumerate } = await import('../src/engine/solver');
    expect(enumerate({ size: 3, zones: [], givens: [] }, 100)).toHaveLength(12);
    expect(enumerate({ size: 3, zones: [], givens: [{ cell: [0, 0], value: 1 }] }, 100)).toHaveLength(4);
  });
});
