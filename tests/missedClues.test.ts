import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, ClueEvent, PuzzleBook } from '../src/game/caseTypes';
import { markCluesShown, markMistakes, pendingClues } from '../src/game/missedClues';
import { checkLead, fireEvents, newGame, puzzleOf, solveLead, spendHours, type Game } from '../src/game/state';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const book: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));
const ids = (cs: { id: string }[]) => cs.map((c) => c.id).sort();

/** Fill the grid correctly and mark every statement as its truth, except the indexes in `flip`. */
function fillLead(g: Game, leadId: string, flip: number[] = []) {
  const p = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  lp.started = true;
  lp.grid = p.solution.map((r) => r.slice());
  lp.marks = p.truth.map((t, i) => (flip.includes(i) ? (t ? 'lie' : 'true') : t ? 'true' : 'lie'));
}

function wrongIndexes(g: Game, leadId: string, speaker: string): number[] {
  return puzzleOf(g, leadId).statements.flatMap((s, i) => (s.speaker === speaker ? [i] : []));
}

describe('missed-clue data', () => {
  it('has 14 clues with unique ids and at least one preset each', () => {
    const clues = cf.missedClues ?? [];
    expect(clues.length).toBe(14);
    expect(new Set(clues.map((c) => c.id)).size).toBe(clues.length);
    for (const c of clues) expect(c.presets.length).toBeGreaterThan(0);
  });

  it('gives Junior friendly text for every clue it can see', () => {
    for (const c of cf.missedClues ?? [])
      if (c.presets.includes('junior')) expect(typeof c.message === 'object' && c.message.friendly, c.id).toBeTruthy();
  });
});

describe('wrong marks', () => {
  it('nudges when the player doubts an honest witness (L1-1)', () => {
    const g = newGame(cf, book, 'detective');
    const rosa = wrongIndexes(g, 'L1', 'rosa');
    fillLead(g, 'L1', [rosa[0]]);
    expect(checkLead(g, 'L1')).toBe('marks-wrong');
    const evs = markMistakes(g, 'L1');
    expect(evs).toEqual([expect.objectContaining({ kind: 'wrong-mark', speaker: 'rosa', marked: 'lie' })]);
    expect(ids(pendingClues(g, evs[0]))).toEqual(['L1-1']);
  });

  it('shows a clue only once', () => {
    const g = newGame(cf, book, 'detective');
    const ev: ClueEvent = { kind: 'wrong-mark', lead: 'L1', speaker: 'rosa', marked: 'lie' };
    const clues = pendingClues(g, ev);
    expect(clues.length).toBe(1);
    markCluesShown(g, clues);
    expect(pendingClues(g, ev)).toEqual([]);
  });

  it('keeps Vex and Tip nudges to the presets that have the lie', () => {
    const junior = newGame(cf, book, 'junior');
    expect(ids(pendingClues(junior, { kind: 'wrong-mark', lead: 'L2', speaker: 'vex', marked: 'true' }))).toEqual([]);
    const det = newGame(cf, book, 'detective');
    expect(ids(pendingClues(det, { kind: 'wrong-mark', lead: 'L2', speaker: 'vex', marked: 'true' }))).toEqual(['L2-2']);
  });

  it('shows L4-2 for Rosa only in Inspector and Chief', () => {
    const ev: ClueEvent = { kind: 'wrong-mark', lead: 'L4', speaker: 'rosa', marked: 'true' };
    expect(ids(pendingClues(newGame(cf, book, 'detective'), ev))).toEqual([]);
    expect(ids(pendingClues(newGame(cf, book, 'inspector'), ev))).toEqual(['L4-2']);
  });
});

describe('unmarked statements', () => {
  it('nudges when Tip is left unmarked (L3-2)', () => {
    const g = newGame(cf, book, 'inspector');
    fillLead(g, 'L3');
    const tip = wrongIndexes(g, 'L3', 'tip');
    tip.forEach((i) => (g.s.leads.L3.marks[i] = 'unknown'));
    expect(checkLead(g, 'L3')).toBe('marks-incomplete');
    const evs = markMistakes(g, 'L3').filter((e) => e.kind === 'unmarked');
    expect(ids(evs.flatMap((e) => pendingClues(g, e)))).toEqual(['L3-2']);
  });
});

describe('events', () => {
  it('fires L2-1 when Juno leaves before L2 is started', () => {
    const g = newGame(cf, book, 'detective');
    const fired = spendHours(g, 4);
    expect(fired.map((e) => e.id)).toContain('juno-leaves');
    expect(ids(pendingClues(g, { kind: 'event', event: 'juno-leaves' }))).toEqual(['L2-1']);
  });

  it('does not fire L2-1 once L2 is started', () => {
    const g = newGame(cf, book, 'detective');
    g.s.leads.L2.started = true;
    fireEvents(g);
    expect(spendHours(g, 4).map((e) => e.id)).not.toContain('juno-leaves');
  });

  it('fires L4-3 and X-1 when the Tip trap was bought and Warehouse 9 burns', () => {
    const g = newGame(cf, book, 'inspector');
    g.s.flags.push('tip-trap');
    spendHours(g, 8);
    const ev: ClueEvent = { kind: 'event', event: 'warehouse-burns' };
    expect(ids(pendingClues(g, ev))).toEqual(['L4-3', 'X-1']);
  });

  it('keeps X-1 out when the Tip trap was not bought', () => {
    const g = newGame(cf, book, 'inspector');
    spendHours(g, 8);
    expect(ids(pendingClues(g, { kind: 'event', event: 'warehouse-burns' }))).toEqual(['L4-3']);
  });
});

describe('accusations', () => {
  it('nudges L4-4 when Crane is accused before the harbormaster ledger is solved', () => {
    const g = newGame(cf, book, 'detective');
    const ids2 = ids(pendingClues(g, { kind: 'accuse', person: 'crane' }));
    expect(ids2).toContain('L4-4');
    expect(ids2).not.toContain('X-3');
  });

  it('nudges X-3 when L4 is solved but Tip is not exposed', () => {
    const g = newGame(cf, book, 'detective');
    fillLead(g, 'L4');
    solveLead(g, 'L4');
    const got = ids(pendingClues(g, { kind: 'accuse', person: 'crane' }));
    expect(got).toContain('X-3');
    expect(got).not.toContain('L4-4');
  });

  it('nudges X-2 for someone whose statements were never checked', () => {
    const g = newGame(cf, book, 'detective');
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'mara' }))).toContain('X-2');
  });

  it('does not nudge X-2 once that person has a checked statement', () => {
    const g = newGame(cf, book, 'detective');
    fillLead(g, 'L1');
    solveLead(g, 'L1');
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'kane' }))).not.toContain('X-2');
  });

  it('repeats accusation nudges even after they were shown', () => {
    const g = newGame(cf, book, 'detective');
    const clues = pendingClues(g, { kind: 'accuse', person: 'mara' });
    markCluesShown(g, clues);
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'mara' }))).toContain('X-2');
  });
});
