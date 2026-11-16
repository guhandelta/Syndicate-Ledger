import { describe, expect, it } from 'vitest';
import type { CaseFile, Lead, PuzzleBook } from '../src/game/caseTypes';
import type { Claim } from '../src/engine/types';
import { makeRng } from '../src/engine/rng';
import {
  allOrders, candidateOrders, isWalk, claimGrade, evalTime, fittingOrders, freshTrueTimeClaim, generateTimeline, momentsOf, randomTimeClaim, timelineStep, verifyTimeline, wrongMoment,
  type TimeClaim, type TimelinePuzzle,
} from '../src/engine/timeline';
import { buyTip, checkLead, fireEvents, gapMoments, newGame, solveLead, startLead, timelineOf, gridOf } from '../src/game/state';
import { describeStatement, describeTimeClaim, timelineLabels } from '../src/game/text';
import { idleHint } from '../src/ui/idleHint';

const speakers = (n: number, lies: number) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].slice(0, n).map((id, i) => ({ id, lies: i < lies ? 1 : 0 }));

describe('timeline claims', () => {
  const order = [3, 1, 4, 2]; // moment m happened at slot order[m]
  it('judges each kind of claim', () => {
    expect(evalTime({ kind: 'at', m: 0, slot: 3 }, order)).toBe(true);
    expect(evalTime({ kind: 'notAt', m: 0, slot: 3 }, order)).toBe(false);
    expect(evalTime({ kind: 'before', a: 1, b: 0 }, order)).toBe(true);
    expect(evalTime({ kind: 'justBefore', a: 1, b: 3 }, order)).toBe(true);
    expect(evalTime({ kind: 'justBefore', a: 1, b: 2 }, order)).toBe(false);
    expect(evalTime({ kind: 'apart', a: 1, b: 2, gap: 3 }, order)).toBe(true);
    expect(evalTime({ kind: 'apart', a: 2, b: 1, gap: 2 }, order)).toBe(false);
  });

  it('grades by the reading skill each claim needs, and names the moments it is about', () => {
    expect(claimGrade({ kind: 'at', m: 0, slot: 1 })).toBe(1);
    expect(claimGrade({ kind: 'before', a: 0, b: 1 })).toBe(2);
    expect(claimGrade({ kind: 'apart', a: 0, b: 1, gap: 1 })).toBe(3);
    expect(momentsOf({ kind: 'notAt', m: 2, slot: 1 })).toEqual([2]);
    expect(momentsOf({ kind: 'before', a: 2, b: 1 })).toEqual([2, 1]);
  });

  it('lists every order of n moments once', () => {
    expect(allOrders(4)).toHaveLength(24);
    expect(allOrders(4)).toBe(allOrders(4));
    expect(new Set(allOrders(5).map((o) => o.join())).size).toBe(120);
  });

  it('draws only the kinds a grade allows', () => {
    const rng = makeRng(3);
    const kinds = (g: number) => new Set(Array.from({ length: 300 }, () => randomTimeClaim([1, 2, 3, 4, 5], rng, g).kind));
    expect([...kinds(1)].sort()).toEqual(['at', 'notAt']);
    expect(kinds(2).has('justBefore')).toBe(false);
    expect(kinds(3).has('apart')).toBe(true);
  });
});

describe('generating timelines', () => {
  const cases: [string, number, number, number, boolean, number][] = [
    ['Junior', 4, 1, 2, false, 0],
    ['Detective', 5, 1, 3, false, 0],
    ['Inspector', 6, 2, 3, false, 0],
    ['Chief', 7, 2, 3, true, 1],
  ];
  for (const [name, n, lies, maxGrade, liarRange, givens] of cases)
    for (const seed of [11, 12, 13]) {
      it(`${name}: ${n} moments, seed ${seed}, has exactly one answer and is never trivial`, () => {
        const p = generateTimeline({ size: n, speakers: speakers(n, lies), maxGrade, minGrade: 2, liarRange, givens, maxStatements: n >= 7 ? 13 : n + 4, seed });
        expect(verifyTimeline(p)).toEqual({ ok: true });
        expect(p.grade).toBeGreaterThanOrEqual(2);
        expect(p.grade).toBeLessThanOrEqual(maxGrade);
        expect(p.truth.filter((t) => !t)).toHaveLength(lies);
        expect(p.givens).toHaveLength(givens);
        expect(p.liarCounts).toEqual(liarRange ? [lies, lies + 1] : [lies]);
        for (const s of speakers(n, lies)) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
        // a given moment is never also given away by an "at" claim
        for (const g of p.givens) expect(p.statements.some((s) => s.claim.kind === 'at' && s.claim.m === g.m)).toBe(false);
      });
    }

  it('is the same puzzle for the same seed', () => {
    const o = { size: 5, speakers: speakers(5, 1), maxGrade: 3, minGrade: 2, seed: 77 };
    expect(generateTimeline(o)).toEqual(generateTimeline(o));
  });

  it('says so when no puzzle fits the limits', () => {
    expect(() => generateTimeline({ size: 6, speakers: speakers(6, 2), maxGrade: 3, maxStatements: 1, seed: 1 }, 3)).toThrow(/Could not generate a 6-moment timeline/);
  });

  it('rejects a puzzle that was tampered with', () => {
    const p = generateTimeline({ size: 4, speakers: speakers(4, 1), maxGrade: 2, minGrade: 2, seed: 5 });
    expect(verifyTimeline({ ...p, statements: p.statements.slice(0, 1) }).ok).toBe(false);
    expect(verifyTimeline({ ...p, solution: p.solution.slice().reverse() }).reason).toMatch(/not the stored solution|orders fit/);
    expect(verifyTimeline({ ...p, truth: p.truth.map((t) => !t) }).reason).toMatch(/stored truth/);
  });
});

describe('timeline helpers', () => {
  const p: TimelinePuzzle = generateTimeline({ size: 5, speakers: speakers(5, 1), maxGrade: 3, minGrade: 2, seed: 21 });

  it('finds the first wrong moment, and ignores unplaced ones', () => {
    expect(wrongMoment(p, [0, 0, 0, 0, 0])).toBe(-1);
    expect(wrongMoment(p, p.solution)).toBe(-1);
    const bad = p.solution.slice();
    bad[2] = (bad[2] % 5) + 1;
    expect(wrongMoment(p, bad)).toBe(2);
  });

  it('points at an unplaced moment and a true statement about it, then at nothing once all are placed', () => {
    const step = timelineStep(p, [0, 0, 0, 0, 0])!;
    expect(p.truth[step.statement]).toBe(true);
    expect(momentsOf(p.statements[step.statement].claim)).toContain(step.m);
    // placing every moment leaves nothing to point at
    expect(timelineStep(p, p.solution)).toBeNull();
    // prefers a statement whose other moment is already placed
    const placed = [0, 0, 0, 0, 0];
    const first = momentsOf(p.statements[step.statement].claim).filter((m) => m !== step.m);
    for (const m of first) placed[m] = p.solution[m];
    expect(timelineStep(p, placed)).not.toBeNull();
  });

  it('sells a true statement the player does not have yet', () => {
    const have = p.statements.map((s) => s.claim);
    const c = freshTrueTimeClaim(p, have, makeRng(9))!;
    expect(evalTime(c, p.solution)).toBe(true);
    expect(have.some((h) => JSON.stringify(h) === JSON.stringify(c))).toBe(false);
  });

  it('gives up when no draw is fresh', () => {
    expect(freshTrueTimeClaim(p, [], makeRng(1), 0)).toBeNull();
  });

  it('keeps only the orders that fit the givens and an allowed number of lies', () => {
    const fits = fittingOrders(p, p.statements.map((s) => s.claim));
    expect(fits).toEqual([p.solution]);
  });
});

describe('timeline wording', () => {
  const lead = {
    id: 'T1', type: 'timeline', moments: ['The lights go out', 'The vault opens', 'The van leaves', 'The alarm rings'], rows: ['9 PM', '10 PM', '11 PM', '12 AM'],
    step: 'hour',
  } as unknown as Lead;
  const L = timelineLabels(lead, 4, 'crime');
  it('writes each kind of claim in plain words', () => {
    expect(L.at(2)).toBe('at 10 PM');
    const d = (c: TimeClaim) => describeTimeClaim(c, L);
    expect(d({ kind: 'at', m: 0, slot: 1 })).toBe('“The lights go out” happened at 9 PM.');
    expect(d({ kind: 'notAt', m: 1, slot: 3 })).toBe('“The vault opens” did not happen at 11 PM.');
    expect(d({ kind: 'before', a: 0, b: 1 })).toBe('“The lights go out” happened before “The vault opens”.');
    expect(d({ kind: 'justBefore', a: 2, b: 3 })).toContain('right before');
    expect(d({ kind: 'apart', a: 0, b: 3, gap: 1 })).toContain('one hour apart');
    expect(d({ kind: 'apart', a: 0, b: 3, gap: 3 })).toContain('3 hours apart');
  });
  it('takes the first N moments, and the friendly wording for Junior', () => {
    const l = { ...lead, moments: [{ crime: 'A', friendly: 'Alpha' }, 'B', 'C', 'D'] } as unknown as Lead;
    expect(timelineLabels(l, 2, 'friendly').moments).toEqual(['Alpha', 'B']);
    expect(timelineLabels({ ...lead, step: undefined } as unknown as Lead, 4, 'crime').step).toBe('hour');
    expect(timelineLabels({ ...lead, moments: undefined } as unknown as Lead, 4, 'crime').moments).toEqual([]);
  });
});

// a small case with one timeline lead and one grid lead
const lead = (id: string, type: string, extra: object): Lead =>
  ({ id, type, cost: 2, opensAfter: [], title: id, intro: '', columns: [], rows: ['9 PM', '10 PM', '11 PM', '12 AM', '1 AM', '2 AM', '3 AM'], speakers: ['a', 'b', 'c', 'd'], liars: { junior: ['a'], detective: ['a'], inspector: ['a'], chief: ['a'] }, fact: '', ...extra }) as unknown as Lead;
const moments = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const cf = {
  id: 'tl-test', clock: { days: 1, hoursPerDay: 12 }, unit: '$#', events: [], offers: [], endings: [],
  cast: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id.toUpperCase(), role: i ? 'witness' : 'informant', reliability: i ? 'honest' : 'liar', color: '#fff', blurb: '' })),
  leads: [lead('T1', 'timeline', { moments })],
  events_: [],
} as unknown as CaseFile;
const sp = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
const book = {
  'T1:junior': generateTimeline({ size: 4, speakers: sp, maxGrade: 2, minGrade: 2, seed: 3 }),
  'T1:detective': generateTimeline({ size: 5, speakers: sp, maxGrade: 3, minGrade: 2, seed: 4 }),
} as unknown as PuzzleBook;

describe('a timeline lead in a game', () => {
  it('starts with the given moments in place and nothing else', () => {
    const g = newGame(cf, book, 'junior');
    const lp = g.s.leads.T1;
    expect(lp.order).toEqual([0, 0, 0, 0]);
    expect(lp.grid).toEqual([]);
    expect(checkLead(g, 'T1')).toBe('grid-incomplete');
  });

  it('is wrong until every moment is at its own time, then needs the witnesses marked', () => {
    const g = newGame(cf, book, 'junior');
    const p = timelineOf(g, 'T1');
    const lp = g.s.leads.T1;
    lp.order = p.solution.slice();
    lp.order![0] = (lp.order![0] % 4) + 1;
    expect(checkLead(g, 'T1')).toBe('grid-wrong');
    lp.order = p.solution.slice();
    expect(checkLead(g, 'T1')).toBe('marks-incomplete');
    lp.marks = p.truth.map((t) => (t ? 'lie' : 'true'));
    expect(checkLead(g, 'T1')).toBe('marks-wrong');
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(checkLead(g, 'T1')).toBe('solved');
    solveLead(g, 'T1');
    expect(g.s.leads.T1.solved).toBe(true);
    expect(g.s.favors).toBe(7); // exposing a liar earns a favor
  });

  it('pins the given moments when the game starts', () => {
    const withGiven = { 'T1:chief': { ...book['T1:detective'], givens: [{ m: 1, slot: 3 }] } } as unknown as PuzzleBook;
    const g = newGame(cf, withGiven, 'chief');
    expect(g.s.leads.T1.order![1]).toBe(3);
  });

  it('sells a true timeline statement for a favor and an hour', () => {
    const g = newGame(cf, book, 'detective');
    const before = g.s.favors;
    const tip = buyTip(g, 'T1', 'a');
    expect(tip).not.toBe('cant');
    expect(evalTime(tip as TimeClaim, timelineOf(g, 'T1').solution)).toBe(true);
    expect(g.s.favors).toBe(before - 1);
    expect(g.s.leads.T1.paidTips).toHaveLength(1);
    expect(describeStatement(cf, cf.leads[0], timelineOf(g, 'T1'), tip as TimeClaim, 'crime')).toContain('“');
  });

  it('keeps the lead solvable when a witness leaves, by showing the moments that are needed', () => {
    const g = newGame(cf, book, 'detective');
    const lp = g.s.leads.T1;
    const p = timelineOf(g, 'T1');
    lp.missingSpeakers.push(p.statements[0].speaker);
    const added = gapMoments(g, 'T1');
    const said = p.statements.filter((s) => s.speaker !== p.statements[0].speaker).map((s) => s.claim);
    const pinned = { ...p, givens: [...p.givens, ...added.map((m) => ({ m, slot: p.solution[m] }))] };
    expect(fittingOrders(pinned, said)).toEqual([p.solution]);
    // nothing more is added once the answer is already unique
    lp.missingSpeakers.pop();
    expect(gapMoments(g, 'T1')).toEqual([]);
  });

  it('fills the gap by itself when an event removes a witness before the lead is worked', () => {
    const who = book['T1:detective'].statements[0].speaker;
    const ev = { id: 'leaves', at: 0, effect: { type: 'removeSpeaker', lead: 'T1', speaker: who, recover: { hours: 1, favors: 1 } }, rumor: '', message: '' };
    const g = newGame({ ...cf, events: [ev] } as unknown as CaseFile, book, 'detective');
    expect(fireEvents(g)).toHaveLength(1);
    expect(g.s.leads.T1.missingSpeakers).toEqual([who]);
    const lp = g.s.leads.T1;
    // every shown moment is at its true time
    for (const m of lp.shownMoments!) expect(lp.order![m]).toBe(timelineOf(g, 'T1').solution[m]);
    expect(startLead(g, 'T1')).toEqual([]);
  });

  it('knows a grid lead from a timeline one', () => {
    expect(() => gridOf(newGame(cf, book, 'junior'), 'T1')).not.toThrow();
  });
});

describe('more timeline coverage', () => {
  it('makes sure every speaker says something, even with more speakers than the clues need', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
    const p = generateTimeline({ size: 4, speakers: many, maxGrade: 2, minGrade: 2, maxStatements: 12, seed: 8 });
    for (const s of many) expect(p.statements.some((x) => x.speaker === s.id)).toBe(true);
    expect(verifyTimeline(p)).toEqual({ ok: true });
  });

  it('skips moments that are already pinned when it works out which to show', () => {
    const p = book['T1:detective'] as TimelinePuzzle;
    const withGiven = { 'T1:detective': { ...p, givens: [{ m: 1, slot: p.solution[1] }] } } as unknown as PuzzleBook;
    const g = newGame(cf, withGiven, 'detective');
    const lp = g.s.leads.T1;
    // every witness but one has left
    lp.missingSpeakers.push(...sp.map((s) => s.id).filter((id) => id !== p.statements[0].speaker));
    const added = gapMoments(g, 'T1');
    expect(added).not.toContain(1);
    expect(new Set(added).size).toBe(added.length);
  });

  it('words a grid statement as before', () => {
    const grid = { id: 'L1', type: 'ledger', columns: ['a', 'b'], rows: ['9 PM', '10 PM'] } as unknown as Lead;
    const c: Claim = { kind: 'is', cell: [0, 1], value: 3 };
    const out = describeStatement(cf, grid, { type: 'ledger', size: 2 } as never, c, 'crime');
    expect(out).toContain('moved');
  });
});

describe('idle tips on a timeline lead', () => {
  const tip = (g: ReturnType<typeof newGame>) => idleHint({ game: g, screen: 'puzzle', leadId: 'T1', town: null, dialog: false, tone: 'crime' }).todo;
  it('guides each stage of a timeline', () => {
    const g = newGame(cf, book, 'junior');
    const p = timelineOf(g, 'T1');
    const lp = g.s.leads.T1;
    lp.started = true;
    expect(tip(g)).toMatch(/Every moment goes at a different time/);
    lp.order = p.solution.slice();
    lp.order[0] = (lp.order[0] % 4) + 1;
    expect(tip(g)).toMatch(/wrong time/);
    lp.order = p.solution.slice();
    expect(tip(g)).toMatch(/timeline is complete/);
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(tip(g)).toMatch(/Press Close this lead/);
  });
});

describe('timeline generator limits', () => {
  it('works when every speaker lies, and without a minimum grade', () => {
    const liars = [{ id: 'a', lies: 1 }, { id: 'b', lies: 1 }];
    const p = generateTimeline({ size: 4, speakers: liars, maxGrade: 2, seed: 31, maxStatements: 12 });
    expect(verifyTimeline(p)).toEqual({ ok: true });
    expect(p.truth.filter((t) => !t)).toHaveLength(2);
  });

  it('refuses a puzzle that needs more statements than allowed because many speakers each need a line', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
    expect(() => generateTimeline({ size: 4, speakers: many, maxGrade: 2, minGrade: 2, maxStatements: 5, seed: 8 }, 5)).toThrow(/Could not generate/);
  });

  it('points the partner at a moment across many puzzles and partly placed timelines', () => {
    for (const seed of [41, 42, 43, 44, 45, 46]) {
      const q = generateTimeline({ size: 6, speakers: speakers(6, 2), maxGrade: 3, minGrade: 3, maxStatements: 10, seed });
      const placed = q.solution.map((s, m) => (m % 2 ? s : 0));
      const step = timelineStep(q, placed);
      if (step) expect(placed[step.m]).toBe(0);
      expect(timelineStep(q, q.solution.map(() => 0))).not.toBeNull();
    }
  });
});

describe('timeline minimum grade', () => {
  it('keeps trying until the puzzle needs at least the wanted reading skill', () => {
    for (const seed of [51, 52, 53]) {
      const p = generateTimeline({ size: 4, speakers: speakers(4, 1), maxGrade: 3, minGrade: 3, maxStatements: 9, seed });
      expect(p.grade).toBe(3);
      expect(verifyTimeline(p)).toEqual({ ok: true });
    }
  });
});

describe('timeline impossible grade', () => {
  it('says so when the wanted skill is higher than the claims allowed', () => {
    expect(() => generateTimeline({ size: 4, speakers: speakers(4, 1), maxGrade: 2, minGrade: 3, seed: 1 }, 3)).toThrow(/Could not generate/);
  });
});

describe('map puzzles (a timeline over a floorplan)', () => {
  it('only walks along corridors are possible answers', () => {
    // rooms 0-1-2-3 in a line: the walk 0,1,2,3 or back, nothing else
    const line: [number, number][] = [[0, 1], [1, 2], [2, 3]];
    expect(candidateOrders(4, line)).toHaveLength(2);
    expect(isWalk([1, 2, 3, 4], line)).toBe(true);
    expect(isWalk([2, 1, 3, 4], line)).toBe(false);
    expect(candidateOrders(4)).toHaveLength(24);
    expect(isWalk([1, 2, 3, 4], [[1, 0], [2, 1], [3, 2]])).toBe(true); // corridors may be written either way round
  });

  it('builds maps with one answer, every wrong walk ruled out, and corridors that lead somewhere', () => {
    for (const [n, extra, alts] of [[4, 2, 3], [5, 3, 4], [6, 4, 6]] as const)
      for (let seed = 1; seed <= 6; seed++) {
        const p = generateTimeline({ size: n, speakers: speakers(3, 1), maxGrade: 3, extraCorridors: extra, minAlternatives: alts, seed });
        expect(verifyTimeline(p)).toEqual({ ok: true });
        expect(p.edges!.length).toBeGreaterThanOrEqual(n - 1);
        expect(isWalk(p.solution, p.edges!)).toBe(true);
        expect(candidateOrders(n, p.edges).length).toBeGreaterThanOrEqual(alts);
      }
  });

  it('a plain timeline has no floorplan, and a map can be too easy to build', () => {
    expect(generateTimeline({ size: 4, speakers: speakers(3, 1), maxGrade: 3, seed: 3 }).edges).toBeUndefined();
    // a 3-room map can never have 50 alternative walks
    expect(() => generateTimeline({ size: 3, speakers: speakers(3, 0), maxGrade: 3, extraCorridors: 1, minAlternatives: 50, seed: 1 }, 5)).toThrow();
  });
});
