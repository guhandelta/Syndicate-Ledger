import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRESETS, type CaseFile, type GridBook } from '../src/game/caseTypes';
import { caseBoard, carriedEvidence, carriedInto, caseClosed, caseForRank, emptyProgress, nextRank, parseProgress, partOf, partsTotal, partsUncovered, progressKey, rankAbove, rankUnlocked, recordPart } from '../src/game/rankStory';
import { t } from '../src/game/text';
import { newGame } from '../src/game/state';
import { book } from './caseBook';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));

describe('rank stories', () => {
  it('Case 1 gives every rank a part of the case, and a closing', () => {
    for (const preset of PRESETS) expect(partOf(cf, preset)).toBeTruthy();
    expect(cf.closing).toBeTruthy();
  });

  it('only an object that says who it points at can be leaned on as evidence', () => {
    expect(carriedEvidence(cf, 'junior')).toBeUndefined();
    expect(carriedEvidence(cf, 'detective')).toMatchObject({ id: 'carried:junior', pointsTo: ['crane'] });
    // the gate book page is a lead to follow, not proof of anything yet
    expect(carriedEvidence(cf, 'inspector')).toBeUndefined();
  });

  it("Detective's story only replaces who can be convicted and by what, to lean on the plate", () => {
    const d = caseForRank(cf, 'detective');
    expect(d.proof!.crane.needs).toContain('carried:junior');
    expect(d.leads).toBe(cf.leads);
  });

  it('a rank story that replaces nothing plays the case file as it is', () => {
    for (const preset of PRESETS.filter((r) => r === 'inspector' || r === 'chief')) expect(caseForRank(cf, preset)).toBe(cf);
  });

  it("Junior's own story has its own leads, ending and finale link, and keeps the case file's cast", () => {
    const junior = caseForRank(cf, 'junior');
    expect(junior.leads.map((l) => l.id)).toEqual(['J1', 'J2', 'J3', 'J4', 'J5']);
    expect(junior.leads.find((l) => l.id === 'J4')!.then).toBe('J5');
    expect(junior.endings[0].requires).toEqual(['J4', 'J5']);
    expect(junior.cast).toBe(cf.cast);
  });

  it("a rank story's fields replace the case file's, for that rank only", () => {
    const own = { ...cf.leads[0], id: 'J1' };
    const test: CaseFile = { ...cf, rankStories: { ...cf.rankStories, junior: { part: cf.rankStories!.junior!.part, leads: [own], setup: 'Junior setup' } } };
    const junior = caseForRank(test, 'junior');
    expect(junior.leads.map((l) => l.id)).toEqual(['J1']);
    expect(junior.setup).toBe('Junior setup');
    expect(junior.cast).toBe(cf.cast);
    expect(junior.events).toBe(cf.events);
    expect(caseForRank(test, 'junior')).toBe(junior);
    expect(caseForRank(test, 'inspector')).toBe(test);
    // the game is built from the rank's own leads
    const g = newGame(junior, { ...book, 'J1:junior': book['L1:junior'] }, 'junior');
    expect(Object.keys(g.s.leads)).toEqual(['J1']);
  });

  it('the rank below hands one object over to the next rank, and the first rank has none', () => {
    expect(carriedInto(cf, 'junior')).toBeUndefined();
    const carried = carriedInto(cf, 'detective')!;
    expect(carried.from).toBe('junior');
    expect(JSON.stringify(carried.changed)).toContain('runner');
    expect(JSON.stringify(carried.open)).toContain('orders');
    expect(JSON.stringify(carried.title)).toContain('stamped plate');
    expect(JSON.stringify(carriedInto(cf, 'inspector')!.title)).toContain('gate book');
    expect(JSON.stringify(carriedInto(cf, 'inspector')!.open)).toContain('paid for the alibi');
    expect(JSON.stringify(carriedInto(cf, 'chief')!.title)).toContain('police roster');
  });

  it("Junior's handover scene and Detective's opening only name people in the cast", () => {
    const ids = new Set(cf.cast.map((c) => c.id));
    const lines = [...cf.rankStories!.junior!.handover!.scene, ...cf.rankStories!.detective!.opening!, ...cf.rankStories!.detective!.handover!.scene, ...cf.rankStories!.inspector!.opening!];
    expect(lines.length).toBeGreaterThan(4);
    for (const l of lines) if (l.who) expect(ids.has(l.who)).toBe(true);
  });

  it('the case closes only when every rank part is uncovered, with any character', () => {
    let p = emptyProgress(cf);
    expect(partsTotal(cf)).toEqual(PRESETS);
    for (const [i, preset] of PRESETS.entries()) {
      expect(caseClosed(cf, p)).toBe(false);
      p = recordPart(cf, p, preset, 'full-bust', undefined, '2026-11-15T00:00:00Z');
      expect(partsUncovered(cf, p)).toHaveLength(i + 1);
    }
    expect(caseClosed(cf, p)).toBe(true);
  });

  it('a rank with no part never counts, and a case with no parts never closes', () => {
    const none: CaseFile = { ...cf, rankStories: undefined };
    const p = recordPart(none, emptyProgress(none), 'junior', 'full-bust');
    expect(p.parts).toEqual({});
    expect(caseClosed(none, p)).toBe(false);
  });

  it('reads saved progress, and ignores progress that is broken or for another case', () => {
    const p = recordPart(cf, emptyProgress(cf), 'detective', 'full-bust', 'cole', 'x');
    expect(parseProgress(cf, JSON.stringify(p))).toEqual(p);
    expect(parseProgress(cf, '{oops')).toEqual(emptyProgress(cf));
    expect(parseProgress(cf, JSON.stringify({ ...p, caseId: 'other' }))).toEqual(emptyProgress(cf));
    expect(parseProgress(cf, null)).toEqual(emptyProgress(cf));
    expect(progressKey(cf.id)).toBe('syndicate-ledger:case:case-01-harbor-ledger');
  });

  it('ranks open in order, Junior first, each once the rank below is uncovered', () => {
    let p = emptyProgress(cf);
    expect(PRESETS.filter((r) => rankUnlocked(cf, p, r))).toEqual(['junior']);
    expect(nextRank(cf, p)).toBe('junior');
    for (const [i, preset] of PRESETS.entries()) {
      p = recordPart(cf, p, preset, 'full-bust', 'detective', 'x');
      expect(PRESETS.filter((r) => rankUnlocked(cf, p, r))).toEqual(PRESETS.slice(0, i + 2));
    }
    expect(nextRank(cf, p)).toBe('chief');
    expect(p.parts.junior?.character).toBe('detective');
    expect(rankAbove('junior')).toBe('detective');
    expect(rankAbove('chief')).toBeUndefined();
    const none: CaseFile = { ...cf, rankStories: undefined };
    expect(PRESETS.every((r) => rankUnlocked(none, emptyProgress(none), r))).toBe(true);
  });

  it('Case 1 has the detective ready to play', () => {
    expect(cf.characters?.find((c) => c.ready)?.id).toBe('detective');
  });
});

describe('playing as a character', () => {
  it('a new game remembers who the player is, and older games have no one set', () => {
    expect(newGame(cf, book, 'junior', 'cole').s.character).toBe('cole');
    expect('character' in newGame(cf, book, 'junior').s).toBe(false);
  });
});

describe('the case board', () => {
  const found = (...ranks: (typeof PRESETS)[number][]) => recordPart(cf, ranks.reduce((p, r) => recordPart(cf, p, r, 'full-bust'), emptyProgress(cf)), ranks[0], 'full-bust');

  it('starts with only the first question and hidden slots, so nothing is given away', () => {
    const rows = caseBoard(cf, emptyProgress(cf));
    expect(rows.map((r) => r.state)).toEqual(['open', 'hidden', 'hidden', 'hidden']);
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4]);
    expect(rows[0].part).toBe(partOf(cf, 'junior'));
    // a hidden row carries no part, so no question or reveal can leak into the screen
    for (const r of rows.slice(1)) expect(r.part).toBeUndefined();
  });

  it('shows each part found, the next question, and hides the rest', () => {
    const rows = caseBoard(cf, found('junior', 'detective'));
    expect(rows.map((r) => r.state)).toEqual(['found', 'found', 'open', 'hidden']);
    expect(rows[2].part).toBe(partOf(cf, 'inspector'));
  });

  it('has nothing left open once every part is found', () => {
    expect(caseBoard(cf, found('junior', 'detective', 'inspector', 'chief')).map((r) => r.state)).toEqual(['found', 'found', 'found', 'found']);
  });

  it('is empty for a case without parts', () => {
    expect(caseBoard({ ...cf, rankStories: undefined }, emptyProgress(cf))).toEqual([]);
  });
});

describe('newspaper clues in the Junior story', () => {
  const junior = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8')) as CaseFile;
  const story = junior.rankStories!.junior!;
  it('opens with the front page and puts clippings on the timeline and whispering leads', () => {
    expect(t(story.incident!.headline, 'friendly')).toMatch(/chest/i);
    const byId = Object.fromEntries(story.leads!.map((l) => [l.id, l]));
    expect(byId.J2.clippings!.length).toBe(3);
    expect(byId.J3.clippings!.length).toBe(1);
  });
  it('has one lie and one honest mix-up among the timeline witnesses', () => {
    const j2 = story.leads!.find((l) => l.id === 'J2')!;
    expect(j2.liars.junior).toEqual(['vex', 'rosa']);
    const rosa = junior.cast.find((c) => c.id === 'rosa')!;
    expect(rosa.reliability).toBe('mistaken');
  });
});

