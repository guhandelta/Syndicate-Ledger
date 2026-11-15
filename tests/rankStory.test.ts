import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { caseClosed, caseForRank, emptyProgress, parseProgress, partOf, partsTotal, partsUncovered, progressKey, recordPart } from '../src/game/rankStory';
import { newGame } from '../src/game/state';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const book: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));

describe('rank stories', () => {
  it('Case 1 gives every rank a part of the case, and a closing', () => {
    for (const preset of PRESETS) expect(partOf(cf, preset)).toBeTruthy();
    expect(cf.closing).toBeTruthy();
  });

  it('a rank story that replaces nothing plays the case file as it is', () => {
    for (const preset of PRESETS) expect(caseForRank(cf, preset)).toBe(cf);
  });

  it("a rank story's fields replace the case file's, for that rank only", () => {
    const own = { ...cf.leads[0], id: 'J1' };
    const test: CaseFile = { ...cf, rankStories: { ...cf.rankStories, junior: { ...cf.rankStories!.junior!, leads: [own], setup: 'Junior setup' } } };
    const junior = caseForRank(test, 'junior');
    expect(junior.leads.map((l) => l.id)).toEqual(['J1']);
    expect(junior.setup).toBe('Junior setup');
    expect(junior.cast).toBe(cf.cast);
    expect(junior.events).toBe(cf.events);
    expect(caseForRank(test, 'junior')).toBe(junior);
    expect(caseForRank(test, 'detective')).toBe(test);
    // the game is built from the rank's own leads
    const g = newGame(junior, { ...book, 'J1:junior': book['L1:junior'] }, 'junior');
    expect(Object.keys(g.s.leads)).toEqual(['J1']);
  });

  it('the case closes only when every rank part is uncovered, with any character', () => {
    let p = emptyProgress(cf);
    expect(partsTotal(cf)).toEqual(PRESETS);
    for (const [i, preset] of PRESETS.entries()) {
      expect(caseClosed(cf, p)).toBe(false);
      p = recordPart(cf, p, preset, 'full-bust', '2026-11-15T00:00:00Z');
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
    const p = recordPart(cf, emptyProgress(cf), 'detective', 'full-bust', 'x');
    expect(parseProgress(cf, JSON.stringify(p))).toEqual(p);
    expect(parseProgress(cf, '{oops')).toEqual(emptyProgress(cf));
    expect(parseProgress(cf, JSON.stringify({ ...p, caseId: 'other' }))).toEqual(emptyProgress(cf));
    expect(parseProgress(cf, null)).toEqual(emptyProgress(cf));
    expect(progressKey(cf.id)).toBe('syndicate-ledger:case:case-01-harbor-ledger');
  });
});
