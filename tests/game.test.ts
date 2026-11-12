import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, PuzzleBook } from '../src/game/caseTypes';
import { PRESETS } from '../src/game/caseTypes';
import { accuse, addFlag, checkLead, hoursLeft, newGame, puzzleOf, solveLead, spendHours, startLead, trustOf } from '../src/game/state';
import { verifyUnique } from '../src/engine/generator';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const book: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));

function solve(g: ReturnType<typeof newGame>, id: string) {
  const p = puzzleOf(g, id);
  const lp = g.s.leads[id];
  lp.grid = p.solution.map((r) => r.slice());
  lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
  expect(checkLead(g, id)).toBe('solved');
  solveLead(g, id);
}

describe('case 1', () => {
  it('has a verified puzzle for every lead and preset', () => {
    for (const lead of cf.leads)
      for (const preset of PRESETS) {
        const p = book[`${lead.id}:${preset}`];
        expect(p, `${lead.id}:${preset}`).toBeTruthy();
        expect(verifyUnique(p)).toEqual({ ok: true });
      }
  });

  it('reaches the full bust on the default clock without informants', () => {
    const g = newGame(cf, book, 'inspector');
    for (const id of ['L1', 'L2', 'L3', 'L4']) {
      expect(startLead(g, id)).not.toBe('no-time');
      solve(g, id);
    }
    expect(hoursLeft(g)).toBeGreaterThanOrEqual(0);
    expect(trustOf(g, 'tip')).toBe('caught');
    expect(trustOf(g, 'kane')).toBe('verified');
    expect(accuse(g, 'crane').id).toBe('full-bust');
  });

  it('makes Juno leave if the dock log is not done by Day 2', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    solve(g, 'L1');
    startLead(g, 'L3');
    expect(g.s.leads.L2.missingSpeakers).toEqual(['juno']);
  });

  it('burns the warehouse if Tip was trusted', () => {
    const g = newGame(cf, book, 'inspector');
    addFlag(g, 'tip-trap');
    for (const id of ['L1', 'L2', 'L3']) { startLead(g, id); solve(g, id); }
    g.s.hoursUsed = 7;
    spendHours(g, 1);
    expect(g.s.leads.L4.extraCost).toBe(1);
    const before = g.s.hoursUsed;
    startLead(g, 'L4');
    expect(g.s.hoursUsed - before).toBe(3);
  });

  it('gives the wrong-arrest ending for innocents', () => {
    const g = newGame(cf, book, 'junior');
    expect(accuse(g, 'kane').id).toBe('wrong-arrest');
    const g2 = newGame(cf, book, 'junior');
    expect(accuse(g2, 'crane').id).toBe('boss-walks');
  });
});
