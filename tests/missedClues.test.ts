import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, ClueEvent, GridBook } from '../src/game/caseTypes';
import { markCluesShown, markMistakes, pendingClues } from '../src/game/missedClues';
import { checkLead, fireEvents, newGame, gridOf as puzzleOf, solveLead, spendHours, type Game } from '../src/game/state';
import { book } from './caseBook';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
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
    const g = newGame(cf, book, 'inspector');
    const meena = wrongIndexes(g, 'L1', 'meena');
    fillLead(g, 'L1', [meena[0]]);
    expect(checkLead(g, 'L1')).toBe('marks-wrong');
    const evs = markMistakes(g, 'L1');
    expect(evs).toEqual([expect.objectContaining({ kind: 'wrong-mark', speaker: 'meena', marked: 'lie' })]);
    expect(ids(pendingClues(g, evs[0]))).toEqual(['L1-1']);
  });

  it('shows a clue only once', () => {
    const g = newGame(cf, book, 'detective');
    const ev: ClueEvent = { kind: 'wrong-mark', lead: 'L1', speaker: 'meena', marked: 'lie' };
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

  it('shows L4-2 for Meena only in Inspector and Chief', () => {
    const ev: ClueEvent = { kind: 'wrong-mark', lead: 'L4', speaker: 'meena', marked: 'true' };
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
  it('fires L2-1 when Nevethitha leaves before L2 is started', () => {
    const g = newGame(cf, book, 'inspector');
    const fired = spendHours(g, 4);
    expect(fired.map((e) => e.id)).toContain('nevethitha-leaves');
    expect(ids(pendingClues(g, { kind: 'event', event: 'nevethitha-leaves' }))).toEqual(['L2-1']);
  });

  it('does not fire L2-1 once L2 is started', () => {
    const g = newGame(cf, book, 'detective');
    g.s.leads.L2.started = true;
    fireEvents(g);
    expect(spendHours(g, 4).map((e) => e.id)).not.toContain('nevethitha-leaves');
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
    const g = newGame(cf, book, 'inspector');
    fillLead(g, 'L4');
    solveLead(g, 'L4');
    const got = ids(pendingClues(g, { kind: 'accuse', person: 'crane' }));
    expect(got).toContain('X-3');
    expect(got).not.toContain('L4-4');
  });

  it('nudges X-2 for someone whose statements were never checked', () => {
    const g = newGame(cf, book, 'detective');
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'kavya' }))).toContain('X-2');
  });

  it('does not nudge X-2 once that person has a checked statement', () => {
    const g = newGame(cf, book, 'inspector');
    fillLead(g, 'L1');
    solveLead(g, 'L1');
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'kane' }))).not.toContain('X-2');
  });

  it('repeats accusation nudges even after they were shown', () => {
    const g = newGame(cf, book, 'detective');
    const clues = pendingClues(g, { kind: 'accuse', person: 'kavya' });
    markCluesShown(g, clues);
    expect(ids(pendingClues(g, { kind: 'accuse', person: 'kavya' }))).toContain('X-2');
  });
});

describe('clue conditions', () => {
  const withClues = (when: object, preset: 'inspector' = 'inspector') => {
    const c: CaseFile = JSON.parse(JSON.stringify(cf));
    c.missedClues = [{ id: 'T', presets: [preset], when, message: 'm' } as never];
    return newGame(c, book, preset);
  };

  it('skips statements of witnesses who left, and reports a doubted true statement as marked true', () => {
    const g = newGame(cf, book, 'inspector');
    const lp = g.s.leads.L2;
    lp.missingSpeakers = ['nevethitha'];
    const events = markMistakes(g, 'L2');
    expect(events.some((e) => e.kind === 'unmarked' && e.speaker === 'nevethitha')).toBe(false);
    fillLead(g, 'L2', wrongIndexes(g, 'L2', 'vex'));
    const flipped = markMistakes(g, 'L2');
    expect(flipped.find((e) => e.kind === 'wrong-mark' && e.speaker === 'vex')).toMatchObject({ marked: 'true' });
    fillLead(g, 'L1', wrongIndexes(g, 'L1', 'meena'));
    expect(markMistakes(g, 'L1').find((e) => e.kind === 'wrong-mark' && e.speaker === 'meena')).toMatchObject({ marked: 'lie' });
  });

  it('matches event clues with and without a flag', () => {
    const plain = withClues({ kind: 'event', event: 'x' });
    expect(pendingClues(plain, { kind: 'event', event: 'x' })).toHaveLength(1);
    expect(pendingClues(plain, { kind: 'event', event: 'y' })).toHaveLength(0);
    const flagged = withClues({ kind: 'event', event: 'x', flag: 'f' });
    expect(pendingClues(flagged, { kind: 'event', event: 'x' })).toHaveLength(0);
    flagged.s.flags.push('f');
    expect(pendingClues(flagged, { kind: 'event', event: 'x' })).toHaveLength(1);
  });

  it('matches unmarked and wrong-mark clues only for the right lead and speaker', () => {
    const g = withClues({ kind: 'unmarked', lead: 'L1', speaker: 'meena' });
    expect(pendingClues(g, { kind: 'unmarked', lead: 'L1', speaker: 'meena' })).toHaveLength(1);
    expect(pendingClues(g, { kind: 'unmarked', lead: 'L1', speaker: 'kane' })).toHaveLength(0);
    expect(pendingClues(g, { kind: 'event', event: 'x' })).toHaveLength(0);
    const w = withClues({ kind: 'wrong-mark', lead: 'L1', speaker: 'meena', marked: 'lie' });
    expect(pendingClues(w, { kind: 'wrong-mark', lead: 'L1', speaker: 'meena', marked: 'lie' })).toHaveLength(1);
    expect(pendingClues(w, { kind: 'wrong-mark', lead: 'L1', speaker: 'meena', marked: 'true' })).toHaveLength(0);
  });

  it('matches accusation clues by person, solved leads, flags and checked statements', () => {
    const person = withClues({ kind: 'accuse', person: 'crane' });
    expect(pendingClues(person, { kind: 'accuse', person: 'crane' })).toHaveLength(1);
    expect(pendingClues(person, { kind: 'accuse', person: 'vex' })).toHaveLength(0);
    const anyone = withClues({ kind: 'accuse' });
    expect(pendingClues(anyone, { kind: 'accuse', person: 'vex' })).toHaveLength(1);

    const unsolved = withClues({ kind: 'accuse', unsolved: 'L1' });
    expect(pendingClues(unsolved, { kind: 'accuse', person: 'vex' })).toHaveLength(1);
    unsolved.s.leads.L1.solved = true;
    expect(pendingClues(unsolved, { kind: 'accuse', person: 'vex' })).toHaveLength(0);

    const solved = withClues({ kind: 'accuse', solved: 'L1' });
    expect(pendingClues(solved, { kind: 'accuse', person: 'vex' })).toHaveLength(0);
    solved.s.leads.L1.solved = true;
    expect(pendingClues(solved, { kind: 'accuse', person: 'vex' })).toHaveLength(1);

    const missing = withClues({ kind: 'accuse', missingFlag: 'f' });
    expect(pendingClues(missing, { kind: 'accuse', person: 'vex' })).toHaveLength(1);
    missing.s.flags.push('f');
    expect(pendingClues(missing, { kind: 'accuse', person: 'vex' })).toHaveLength(0);

    const unchecked = withClues({ kind: 'accuse', unchecked: true });
    expect(pendingClues(unchecked, { kind: 'accuse', person: 'meena' })).toHaveLength(1);
    unchecked.s.leads.L1.solved = true;
    expect(pendingClues(unchecked, { kind: 'accuse', person: 'meena' })).toHaveLength(0);
  });

  it('shows a clue once, except accusation nudges, and has none when the case lists none', () => {
    const g = withClues({ kind: 'event', event: 'x' });
    expect(pendingClues(g, { kind: 'event', event: 'x' })).toHaveLength(1);
    markCluesShown(g, pendingClues(g, { kind: 'event', event: 'x' }));
    expect(pendingClues(g, { kind: 'event', event: 'x' })).toHaveLength(0);
    const bare: CaseFile = JSON.parse(JSON.stringify(cf));
    delete bare.missedClues;
    expect(pendingClues(newGame(bare, book, 'inspector'), { kind: 'event', event: 'x' })).toEqual([]);
    const nudge = withClues({ kind: 'accuse' });
    markCluesShown(nudge, pendingClues(nudge, { kind: 'accuse', person: 'meena' }));
    expect(pendingClues(nudge, { kind: 'accuse', person: 'meena' })).toHaveLength(1);
  });
});
