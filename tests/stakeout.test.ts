import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  allPlacements, checkMap, clashes, districtsOf, evalStake, fittingPlacements, freshTrueStakeClaim, generateStakeout, growRegions, randomCols, randomStakeClaim,
  stakeoutStep, verifyStakeout, whereOf, wrongSpot, type StakeClaim, type StakeoutPuzzle,
} from '../src/engine/stakeout';
import { buildRank } from '../src/game/buildRank';
import type { AnyPuzzle, CaseFile, Lead, PuzzleBook } from '../src/game/caseTypes';
import { caseForRank } from '../src/game/rankStory';
import { STAKEOUT_RULES } from '../src/game/presets';
import { buyTip, checkLead, fireEvents, gapRows, newGame, solveLead, stakeoutOf, startLead } from '../src/game/state';
import { describeStakeClaim, describeStatement, stakeoutLabels } from '../src/game/text';
import { checkLinks, describeLinked, linkResolves, planLinks, type Answers } from '../src/game/links';
import { refNumber } from '../src/engine/via';
import { idleHint } from '../src/ui/idleHint';

const speakers = (lies: number) => ['a', 'b', 'c', 'd'].map((id, i) => ({ id, lies: i < lies ? 1 : 0 }));
const rankOf = (n: number) => (n === 5 ? 'junior' : n === 6 ? 'detective' : n === 7 ? 'inspector' : 'chief') as keyof typeof STAKEOUT_RULES;
const make = (n: number, lies = 1, seed = 3, extra: Partial<Parameters<typeof generateStakeout>[0]> = {}) => {
  const { size: _size, ...rules } = STAKEOUT_RULES[rankOf(n)];
  return generateStakeout({ size: n, speakers: speakers(lies), maxGrade: 3, ...rules, seed, ...extra });
};

describe('the rules of the map', () => {
  it('counts the layouts the rules allow when every row is its own district: 2, 14, 90, 646 for 4 to 7', () => {
    const count = (n: number) => allPlacements(Array.from({ length: n }, (_, r) => Array(n).fill(r))).length;
    expect([4, 5, 6, 7].map(count)).toEqual([2, 14, 90, 646]);
  });

  it('only lists layouts with one watcher in each district, no shared column and no touching squares', () => {
    const cols = randomCols(6, makeRng(1));
    const regions = growRegions(cols, makeRng(2))!;
    const all = allPlacements(regions);
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) {
      expect(new Set(o).size).toBe(6);
      o.forEach((c, r) => r && expect(Math.abs(c - o[r - 1])).toBeGreaterThan(1));
      expect(new Set(whereOf(regions, o).map((_, z) => z)).size).toBe(6);
      expect(new Set(o.map((c, r) => regions[r][c])).size).toBe(6);
    }
    expect(all.some((o) => o.every((c, r) => c === cols[r]))).toBe(true);
  });

  it('grows connected districts out of the answer, each with the answer\'s watcher and at least two squares', () => {
    for (let s = 1; s < 30; s++) {
      const cols = randomCols(7, makeRng(s));
      const regions = growRegions(cols, makeRng(s + 100));
      if (!regions) continue;
      expect(checkMap({ size: 7, regions, cols })).toBeNull();
      const sizes = Array(7).fill(0);
      regions.forEach((row) => row.forEach((z) => sizes[z]++));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
    }
  });

  it('spots a map that is cut in pieces, has a stray square or breaks the rules', () => {
    const cols = [1, 3, 0, 2];
    const base = { size: 4, cols, regions: [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [2, 2, 3, 3]] };
    expect(checkMap(base)).toBeNull();
    expect(checkMap({ ...base, regions: [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3]] })).toMatch(/not 4x4/);
    expect(checkMap({ ...base, regions: [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [2, 2, 3, 9]] })).toMatch(/no district/);
    expect(checkMap({ ...base, regions: [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 2, 2], [2, 2, 2, 2]] })).toMatch(/no squares/);
    expect(checkMap({ ...base, regions: [[0, 1, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [0, 2, 3, 3]] })).toMatch(/in pieces/);
    expect(checkMap({ ...base, cols: [0, 1, 2, 3] })).toMatch(/breaks the rules/);
  });
});

describe('claims', () => {
  const regions = [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [2, 2, 3, 3]];
  const cols = [1, 3, 0, 2]; // district 0 at (0,1), 1 at (1,3), 2 at (2,0), 3 at (3,2)
  const e = (c: StakeClaim) => evalStake(c, regions, cols);
  it('judges each kind', () => {
    expect(whereOf(regions, cols)).toEqual([[0, 1], [1, 3], [2, 0], [3, 2]]);
    expect(e({ kind: 'at', z: 0, r: 0, c: 1 })).toBe(true);
    expect(e({ kind: 'at', z: 0, r: 0, c: 0 })).toBe(false);
    expect(e({ kind: 'notAt', z: 0, r: 0, c: 0 })).toBe(true);
    expect(e({ kind: 'row', z: 2, value: 3 })).toBe(true);
    expect(e({ kind: 'row', z: 2, value: 1 })).toBe(false);
    expect(e({ kind: 'col', z: 1, value: 4 })).toBe(true);
    expect(e({ kind: 'above', a: 0, b: 3 })).toBe(true);
    expect(e({ kind: 'above', a: 3, b: 0 })).toBe(false);
    expect(e({ kind: 'left', a: 2, b: 0 })).toBe(true);
    expect(e({ kind: 'gap', axis: 'row', a: 0, b: 3, gap: 3 })).toBe(true);
    expect(e({ kind: 'gap', axis: 'col', a: 1, b: 2, gap: 3 })).toBe(true);
    expect(e({ kind: 'gap', axis: 'col', a: 1, b: 2, gap: 2 })).toBe(false);
  });

  it('words each kind in plain language, with the districts named', () => {
    const lead = { districts: ['Docks', 'Loft', 'Mill', 'Yard'], watchers: { one: 'guard', many: 'guards' } } as unknown as Lead;
    const L = stakeoutLabels(lead, 4, 'crime');
    expect(L.districts).toEqual(['Docks', 'Loft', 'Mill', 'Yard']);
    expect(describeStakeClaim({ kind: 'at', z: 0, r: 0, c: 1 }, L)).toBe('Docks’s guard stood on the square in row 1, column 2.');
    expect(describeStakeClaim({ kind: 'notAt', z: 1, r: 1, c: 0 }, L)).toContain('did not stand');
    expect(describeStakeClaim({ kind: 'row', z: 2, value: 3 }, L)).toBe('Mill’s guard stood in row 3 (counting from the top).');
    expect(describeStakeClaim({ kind: 'col', z: 3, value: 2 }, L)).toContain('column 2 (counting from the left)');
    expect(describeStakeClaim({ kind: 'above', a: 0, b: 1 }, L)).toBe('Docks’s guard stood further up the map than Loft’s guard.');
    expect(describeStakeClaim({ kind: 'left', a: 0, b: 1 }, L)).toContain('further left');
    expect(describeStakeClaim({ kind: 'gap', axis: 'row', a: 0, b: 1, gap: 1 }, L)).toBe('Docks’s guard and Loft’s guard stood 1 row apart.');
    expect(describeStakeClaim({ kind: 'gap', axis: 'col', a: 0, b: 1, gap: 2 }, L)).toContain('2 columns apart');
    // with nothing named, districts are lettered and the noun is "watcher"
    const plain = stakeoutLabels({} as Lead, 3, 'crime');
    expect(plain.districts).toEqual(['District A', 'District B', 'District C']);
    expect(plain.one).toBe('watcher');
  });

  it('draws plausible claims of every kind, and only up to the grade asked', () => {
    const rng = makeRng(9);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(randomStakeClaim(regions, cols, rng, 3).kind);
    expect([...kinds].sort()).toEqual(['above', 'at', 'col', 'gap', 'left', 'notAt', 'row']);
    const low = new Set<string>();
    for (let i = 0; i < 400; i++) low.add(randomStakeClaim(regions, cols, rng, 1).kind);
    expect([...low].sort()).toEqual(['at', 'col', 'notAt', 'row']);
  });
});

describe('generating a stakeout', () => {
  for (const n of [5, 6, 7, 8]) {
    it(`builds a ${n}x${n} map with exactly one answer, whatever the seed`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const p = make(n, n === 8 ? 1 : 1, seed, n === 8 ? { liarRange: true } : {});
        expect(verifyStakeout(p)).toEqual({ ok: true });
        expect(p.size).toBe(n);
        expect(p.baseSolutions).toBeGreaterThanOrEqual(STAKEOUT_RULES[rankOf(n)].minBase);
        expect(p.truth.filter((t) => !t)).toHaveLength(1);
        expect(p.liarCounts).toEqual(n === 8 ? [1, 2] : [1]);
        // every speaker says something
        for (const sp of speakers(1)) expect(p.statements.some((s) => s.speaker === sp.id)).toBe(true);
      }
    });
  }

  it('makes the same puzzle from the same seed', () => {
    expect(make(6, 1, 42)).toEqual(make(6, 1, 42));
    expect(make(6, 1, 42)).not.toEqual(make(6, 1, 43));
  });

  it('gives away at most one square outright', () => {
    for (let seed = 1; seed < 8; seed++) {
      const p = make(6, 1, seed);
      expect(p.statements.filter((s, i) => p.truth[i] && s.claim.kind === 'at').length).toBeLessThanOrEqual(1);
    }
  });

  it('can show some watchers in place, and then says nothing about those districts alone', () => {
    const p = make(6, 1, 5, { givens: 2 });
    expect(p.givens).toHaveLength(2);
    for (const g of p.givens) expect(p.cols[g.r]).toBe(g.c);
    expect(verifyStakeout(p)).toEqual({ ok: true });
    const shown = p.givens.map((g) => p.regions[g.r][g.c]);
    for (const s of p.statements) if ('z' in s.claim) expect(shown).not.toContain(s.claim.z);
  });

  it('fails clearly when the limits cannot be met', () => {
    expect(() => make(5, 1, 1, { minBase: 99, maxBase: 100 }, )).toThrow(/Could not generate a 5x5 stakeout/);
    expect(() => generateStakeout({ size: 5, speakers: speakers(1), maxGrade: 3, maxStatements: 1, seed: 1 }, 20)).toThrow();
  });

  it('wants a grade of at least minGrade', () => {
    for (const seed of [1, 2, 3]) expect(make(7, 1, seed).grade).toBeGreaterThanOrEqual(3);
  });

  it('is only unique when every statement is counted: dropping a true one leaves more layouts', () => {
    const p = make(6, 1, 11);
    const claims = p.statements.map((s) => s.claim);
    expect(fittingPlacements(p, claims)).toHaveLength(1);
    const trueIdx = p.truth.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
    const fewer = fittingPlacements(p, claims.filter((_, i) => i !== trueIdx[0]));
    expect(fewer.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a puzzle with the wrong truth, the wrong answer or another layout that fits', () => {
    const p = make(6, 1, 12);
    expect(verifyStakeout({ ...p, truth: p.truth.map((t) => !t) }).ok).toBe(false);
    expect(verifyStakeout({ ...p, statements: [], liarCounts: [0] })).toEqual({ ok: false, reason: expect.stringMatching(/layouts fit/) });
    const other = allPlacements(p.regions).find((o) => o.some((c, r) => c !== p.cols[r]))!;
    expect(verifyStakeout({ ...p, cols: other })).toEqual({ ok: false, reason: expect.stringMatching(/unique layout is not the stored layout|stored truth/) });
    expect(verifyStakeout({ ...p, cols: [0, 0, 0, 0, 0, 0] }).reason).toMatch(/breaks the rules/);
  });
});

describe('playing a stakeout', () => {
  const p = make(5, 1, 7) as StakeoutPuzzle;
  it('finds the first wrong square and the clashes between watchers', () => {
    expect(wrongSpot(p, [0, 0, 0, 0, 0])).toBe(-1);
    const right = p.cols.map((c) => c + 1);
    expect(wrongSpot(p, right)).toBe(-1);
    const bad = right.slice();
    bad[2] = ((p.cols[2] + 1) % 5) + 1;
    expect(wrongSpot(p, bad)).toBe(2);
    expect(clashes(p, right).size).toBe(0);
    // a shared column, touching squares in neighbouring rows, and a shared district
    expect(clashes(p, [1, 0, 1, 0, 0]).has(0)).toBe(true);
    expect(clashes(p, [1, 2, 0, 0, 0])).toEqual(new Set([0, 1]));
  });

  it('flags two watchers in one district', () => {
    // two squares of one district, two rows apart, never touching
    for (let r = 0; r < 5; r++)
      for (let s = r + 2; s < 5; s++)
        for (let c = 0; c < 5; c++)
          for (let d = 0; d < 5; d++)
            if (c !== d && p.regions[r][c] === p.regions[s][d]) {
              const placed = [0, 0, 0, 0, 0];
              placed[r] = c + 1;
              placed[s] = d + 1;
              expect(clashes(p, placed)).toEqual(new Set([r, s]));
              return;
            }
    throw new Error('no district with two squares two rows apart');
  });

  it('the partner points at a row a true statement is about, preferring one next to a placed watcher', () => {
    const none = stakeoutStep(p, [0, 0, 0, 0, 0])!;
    expect(none.row).toBeGreaterThanOrEqual(0);
    expect(p.truth[none.statement]).toBe(true);
    expect(stakeoutStep(p, p.cols.map((c) => c + 1))).toBeNull();
  });

  it('prefers a statement whose other district is already placed', () => {
    const q = make(6, 1, 21);
    const w = whereOf(q.regions, q.cols);
    // everything placed but one row: the nudge points at it
    const placed = q.cols.map((c) => c + 1);
    const said = q.statements.find((_, i) => q.truth[i])!;
    const row = w[districtsOf(said.claim)[0]][0];
    placed[row] = 0;
    expect(stakeoutStep(q, placed)!.row).toBe(row);
  });

  it('works with the options left out, and when every witness may lie', () => {
    const bare = generateStakeout({ size: 5, speakers: [{ id: 'a', lies: 0 }], maxGrade: 3, seed: 1 });
    expect(verifyStakeout(bare)).toEqual({ ok: true });
    const liars = generateStakeout({ size: 5, speakers: [{ id: 'a', lies: 1 }, { id: 'b', lies: 1 }], maxGrade: 3, minBase: 3, seed: 2 }, 3000);
    expect(verifyStakeout(liars)).toEqual({ ok: true });
  });

  it('reads the row and the column of a district from an answer', () => {
    const q = make(5, 1, 7);
    const [r, c] = whereOf(q.regions, q.cols)[2];
    expect(refNumber(q, { kind: 'spot', z: 2, axis: 'row' })).toBe(r + 1);
    expect(refNumber(q, { kind: 'spot', z: 2, axis: 'col' })).toBe(c + 1);
  });

  it('sells a fresh true tip', () => {
    const rng = makeRng(2);
    const have = p.statements.map((s) => s.claim);
    const c = freshTrueStakeClaim(p, have, rng)!;
    expect(evalStake(c, p.regions, p.cols)).toBe(true);
    expect(JSON.stringify(have)).not.toContain(JSON.stringify(c));
    expect(freshTrueStakeClaim(p, have, rng, 0)).toBeNull();
  });
});

// ---- inside a case: the Junior story's stakeout lead, plus every rank's size ----
const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const shipped: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));

describe('the stakeout lead in Case 1', () => {
  const story = caseForRank(cf, 'junior');
  const lead = story.leads.find((l) => l.type === 'stakeout')!;
  const answers: Answers = {};
  for (const l of story.leads) answers[l.id] = shipped[`${l.id}:junior`] as never;

  it('is the fourth Junior lead, opens after the network lead and comes before the map', () => {
    expect(lead.id).toBe('J4');
    expect(lead.opensAfter).toEqual(['J3']);
    expect(story.leads.find((l) => l.id === 'J5')!.opensAfter).toEqual(['J4']);
    expect(lead.districts!.length).toBeGreaterThanOrEqual(STAKEOUT_RULES.chief.size);
  });

  it('quotes earlier answers: a row or column, and a gap, each needed and not enough alone', () => {
    const p = shipped['J4:junior'] as StakeoutPuzzle;
    const linked = p.statements.filter((s) => s.via);
    expect(linked).toHaveLength(3);
    expect(linked.map((s) => s.claim.kind)).toContain('gap');
    expect(linked.map((s) => s.claim.kind).filter((k) => k === 'row' || k === 'col')).toHaveLength(2);
    expect(checkLinks(p)).toEqual({ ok: true });
    for (const st of linked) expect(linkResolves(story, lead, p, st as never, answers)).toBeNull();
    for (const st of linked) {
      const said = describeLinked(story, lead, p, st as never, answers, 'crime');
      expect(said).not.toMatch(/\{/);
      expect(said).toMatch(/whose number is|numbered|apart/);
    }
  });

  it('words its link clues without a story too, and with the answer it comes from named', () => {
    const p = shipped['J4:junior'] as StakeoutPuzzle;
    const bare: Lead = { ...lead, links: lead.links!.map(({ story: _s, ...l }) => l) };
    const bareStory = { ...story, leads: story.leads.map((l) => (l.id === 'J4' ? bare : l)) } as CaseFile;
    for (const st of p.statements.filter((s) => s.via)) {
      const stNoStory = { claim: st.claim, via: { ...st.via!, story: undefined } };
      const said = describeLinked(bareStory, bare, p, stNoStory as never, answers, 'crime');
      expect(said).toMatch(/’s watchman/);
      expect(said).toMatch(/whose number is|numbered|apart/);
      expect(said).toMatch(/in “/);
    }
  });

  it('plans links the same way every time', () => {
    const a = planLinks(story, 'junior', lead, 5, answers, makeRng(5));
    expect(a).toEqual(planLinks(story, 'junior', lead, 5, answers, makeRng(5)));
    expect(a).toHaveLength(3);
    for (const pl of a) expect(refNumber(answers[pl.via.lead]!, pl.via.ref)).toBeGreaterThan(0);
  });

  it('quotes a stakeout answer in a later lead: the row or column a watchman stood in', () => {
    const later: Lead = { ...story.leads.find((l) => l.id === 'J5')!, links: [{ from: 'J4', take: 'number', use: 'is' }] };
    const cfx = { ...story, leads: story.leads.map((l) => (l.id === 'J5' ? later : l)) } as CaseFile;
    const [pl] = planLinks(cfx, 'junior', later, 4, answers, makeRng(3));
    expect(pl.via.ref.kind).toBe('spot');
    const said = describeLinked(cfx, later, shipped['J5:junior'] as never, { claim: pl.claim, via: pl.via } as never, answers, 'crime');
    expect(said).toMatch(/the (row|column) number of .*’s watchman in “The harbor watch”/);
  });

  it('words every kind of link clue, with and without a story, for both rows and columns', () => {
    const p = shipped['J4:junior'] as StakeoutPuzzle;
    const via = (axis: 'row' | 'col', story?: { crime: string }) => ({ lead: 'J4', ref: { kind: 'spot' as const, z: 1, axis }, ...(story ? { story } : {}) });
    const say = (claim: StakeClaim, v: ReturnType<typeof via>) => describeLinked(story, lead, p, { claim, via: v } as never, answers, 'crime');
    expect(say({ kind: 'row', z: 0, value: 2 }, via('row'))).toMatch(/stood in the row whose number is the row number of .*’s watchman in “The harbor watch” \(the top row is 1\)/);
    expect(say({ kind: 'col', z: 0, value: 2 }, via('col'))).toMatch(/column whose number is the column number of/);
    expect(say({ kind: 'gap', axis: 'row', a: 0, b: 1, gap: 1 }, via('row'))).toMatch(/as many rows apart as the row number of/);
    expect(say({ kind: 'gap', axis: 'col', a: 0, b: 1, gap: 1 }, via('col'))).toMatch(/as many columns apart as the column number of/);
    const told = { crime: '{a}/{b}/{when}/{q}' };
    expect(say({ kind: 'row', z: 0, value: 2 }, via('row', told))).toMatch(/’s watchman\/\/row\//);
    expect(say({ kind: 'col', z: 0, value: 2 }, via('col', told))).toMatch(/\/column\//);
    expect(say({ kind: 'gap', axis: 'row', a: 0, b: 1, gap: 1 }, via('row', told))).toMatch(/’s watchman\/.*’s watchman\/rows\//);
    expect(say({ kind: 'gap', axis: 'col', a: 0, b: 1, gap: 1 }, via('col', told))).toMatch(/\/columns\//);
  });

  it('says so when an earlier answer has no number that fits a row, column or gap', () => {
    const dull = { type: 'ledger', size: 2, solution: [[3, 3], [3, 3]], statements: [], truth: [], givens: [], zones: [], liarCounts: [0], grade: 1, baseSolutions: 1, seed: 1 } as never;
    const mk = (use: 'is' | 'apart'): Lead => ({ ...lead, links: [{ from: 'J1', take: 'number', use }] });
    for (const [use, what] of [['apart', /for a gap/], ['is', /for a row or column/]] as const)
      expect(() => planLinks(story, 'junior', mk(use), 2, { J1: dull }, makeRng(1))).toThrow(what);
  });

  it('refuses a stakeout link that is neither "is" nor "apart"', () => {
    const bad: Lead = { ...lead, links: [{ from: 'J1', take: 'number', use: 'sum' }] };
    expect(() => planLinks(story, 'junior', bad, 5, answers, makeRng(1))).toThrow(/"is" or "apart"/);
  });

  it('builds at every rank on its own size, when put in a later chain', () => {
    for (const preset of ['junior', 'detective', 'inspector', 'chief'] as const) {
      const c: CaseFile = JSON.parse(JSON.stringify(cf));
      const l = { ...lead, links: [], opensAfter: [] } as Lead;
      c.leads = [l];
      c.rankStories = undefined;
      const book = buildRank(c, preset);
      const p = book[`J4:${preset}`] as StakeoutPuzzle;
      expect(p.size).toBe(STAKEOUT_RULES[preset].size);
      expect(verifyStakeout(p)).toEqual({ ok: true });
    }
  });
});

describe('a stakeout in the game', () => {
  const story = caseForRank(cf, 'junior');
  const book = shipped as PuzzleBook;
  const fresh = () => {
    const g = newGame(story, book, 'junior');
    for (const id of ['J1', 'J2', 'J3']) g.s.leads[id].solved = true;
    startLead(g, 'J4');
    return g;
  };

  it('starts with the shown watchers in place', () => {
    const shownBook = { ...book, 'J4:junior': make(5, 1, 7, { givens: 2 }) } as PuzzleBook;
    const g = newGame(story, shownBook, 'junior');
    const p = stakeoutOf(g, 'J4');
    for (const gv of p.givens) expect(g.s.leads.J4.spots![gv.r]).toBe(gv.c + 1);
    expect(g.s.leads.J4.spots!.filter(Boolean)).toHaveLength(2);
  });

  it('starts empty, is wrong while a watcher is off, and solves once the map and the marks are right', () => {
    const g = fresh();
    const p = stakeoutOf(g, 'J4');
    const lp = g.s.leads.J4;
    expect(lp.spots).toEqual([0, 0, 0, 0, 0]);
    expect(checkLead(g, 'J4')).toBe('grid-incomplete');
    lp.spots = p.cols.map((c) => c + 1);
    lp.spots[0] = lp.spots[0] === 1 ? 2 : 1;
    expect(checkLead(g, 'J4')).toBe('grid-wrong');
    lp.spots = p.cols.map((c) => c + 1);
    expect(checkLead(g, 'J4')).toBe('marks-incomplete');
    p.truth.forEach((t, i) => (lp.marks[i] = t ? 'true' : 'lie'));
    expect(checkLead(g, 'J4')).toBe('solved');
    solveLead(g, 'J4');
    expect(g.s.leads.J4.solved).toBe(true);
  });

  it('shows the watchers that keep the lead solvable when a witness leaves, and the rest stay open', () => {
    const g = fresh();
    const p = stakeoutOf(g, 'J4');
    const lp = g.s.leads.J4;
    lp.missingSpeakers = [p.statements[0].speaker];
    const rows = gapRows(g, 'J4');
    for (const r of rows) expect(r).toBeLessThan(p.size);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('sells a tip that is true', () => {
    const g = fresh();
    const tip = buyTip(g, 'J4', 'tip');
    expect(tip).not.toBe('cant');
    const p = stakeoutOf(g, 'J4');
    expect(evalStake(tip as StakeClaim, p.regions, p.cols)).toBe(true);
    expect(g.s.leads.J4.paidTips).toHaveLength(1);
  });

  it('shows the needed watchers by itself when an event removes a witness, and skips rows already shown', () => {
    const base = fresh();
    const p0 = stakeoutOf(base, 'J4');
    // two witnesses gone leave the layout open, so a watcher has to be shown: one is away already, the event sends the other
    const speakers = [...new Set(p0.statements.map((x) => x.speaker))];
    // a pair of witnesses whose leaving still needs a watcher shown after another row is shown already
    let shown = 0;
    const rows = Array.from({ length: p0.size }, (_, r) => r);
    const pair = speakers.flatMap((a) => speakers.filter((b) => b !== a).map((b) => [a, b] as const)).find(([a, b]) =>
      rows.some((r) => {
        const probe = fresh();
        probe.s.leads.J4.missingSpeakers = [a, b];
        probe.s.leads.J4.shownSpots!.push(r);
        shown = r;
        return gapRows(probe, 'J4').length > 0;
      }),
    )!;
    const who = pair[1];
    const ev = { id: 'leaves', at: 0, effect: { type: 'removeSpeaker', lead: 'J4', speaker: who, recover: { hours: 1, favors: 1 } }, rumor: '', message: '' };
    const g = newGame({ ...story, events: [ev] } as unknown as CaseFile, book, 'junior');
    for (const id of ['J1', 'J2', 'J3']) g.s.leads[id].solved = true;
    const lp = g.s.leads.J4;
    lp.missingSpeakers = [pair[0]];
    lp.shownSpots!.push(shown);
    lp.spots![shown] = stakeoutOf(g, 'J4').cols[shown] + 1;
    expect(fireEvents(g).length).toBeGreaterThan(0);
    const p = stakeoutOf(g, 'J4');
    expect(new Set(lp.shownSpots).size).toBe(lp.shownSpots!.length);
    for (const r of lp.shownSpots!) expect(lp.spots![r]).toBe(p.cols[r] + 1);
  });

  it('words its statements and gives the idle tips', () => {
    const g = fresh();
    const p = g.book['J4:junior'] as AnyPuzzle;
    expect(describeStatement(story, story.leads[3], p, p.statements[0].claim, 'crime')).toMatch(/watchman/);
    const ctx = { game: g, screen: 'puzzle', leadId: 'J4', tone: 'crime' } as never;
    expect(idleHint(ctx).todo).toMatch(/one watcher in every district/);
    const sp = stakeoutOf(g, 'J4');
    const lp = g.s.leads.J4;
    lp.spots = sp.cols.map((c) => c + 1);
    lp.spots[1] = lp.spots[1] === 1 ? 2 : 1;
    expect(idleHint(ctx).todo).toMatch(/wrong square/);
    lp.spots = sp.cols.map((c) => c + 1);
    expect(idleHint(ctx).todo).toMatch(/mark it True or Lie/);
  });
});
