import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, GridBook } from '../src/game/caseTypes';
import { PRESETS } from '../src/game/caseTypes';
import { caseForRank } from '../src/game/rankStory';
import { enumerate } from '../src/engine/solver';
import { evalClaim } from '../src/engine/claims';
import { fireEvents, accuse, accuseStatus, submitAccusation, addFlag, checkLead, gridOf as puzzleOf, hoursLeft, newGame, solveLead, spendHours, startLead, trustOf } from '../src/game/state';
import { verifyUnique } from '../src/engine/generator';
import { book } from './caseBook';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));

function solve(g: ReturnType<typeof newGame>, id: string) {
  const p = puzzleOf(g, id);
  const lp = g.s.leads[id];
  lp.grid = p.solution.map((r) => r.slice());
  lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
  expect(checkLead(g, id)).toBe('solved');
  solveLead(g, id);
}

describe('case 1', () => {
  // one test per puzzle, so no single test holds the worker for long. The 7x7 Chief puzzles take many seconds each
  // to check (a CI run with coverage stalled the test worker), so `npm run validate` checks those.
  for (const lead of cf.leads)
    for (const preset of PRESETS.filter((r) => r !== 'chief'))
      it(`has a verified puzzle for ${lead.id} at ${preset}`, { timeout: 120_000 }, () => {
        const p = book[`${lead.id}:${preset}`];
        expect(p, `${lead.id}:${preset}`).toBeTruthy();
        expect(verifyUnique(p)).toEqual({ ok: true });
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

  it('makes Nevethitha leave if the dock log is not done by Day 2', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    solve(g, 'L1');
    startLead(g, 'L3');
    expect(g.s.leads.L2.missingSpeakers).toEqual(['nevethitha']);
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

describe('accusation rules', () => {
  const play = (preset: 'junior' | 'detective' | 'inspector' | 'chief' = 'inspector') => {
    const g = newGame(preset === 'chief' ? caseForRank(cf, 'chief') : cf, book, preset);
    for (const id of preset === 'chief' ? ['C1'] : ['L1', 'L2', 'L3', 'L4']) { startLead(g, id); solve(g, id); }
    return g;
  };

  it('accepts a right name with valid proof', () => {
    const g = play();
    const r = submitAccusation(g, 'crane', ['L3', 'L4']);
    expect(r.kind).toBe('accepted');
  });

  it('refuses a right name with missing or wrong proof and costs a try', () => {
    const g = play();
    const r = submitAccusation(g, 'crane', ['L3']);
    expect(r).toMatchObject({ kind: 'rejected', triesLeft: 1, refuses: false });
    expect(submitAccusation(g, 'crane', ['L1', 'L3', 'L4']).kind).toBe('rejected');
    expect(accuseStatus(g, 'crane')).toBe('locked');
    expect(submitAccusation(g, 'crane', ['L3', 'L4']).kind).toBe('blocked');
  });

  it('caps the people who can be accused, more at bigger grids', () => {
    const cases = [['detective', ['vex', 'tip', 'kane']], ['inspector', ['vex', 'tip', 'kane', 'meena']], ['chief', ['vex', 'tip', 'kane', 'meena', 'nevethitha']]] as const;
    for (const [preset, people] of cases) {
      const g = play(preset);
      for (const p of people.slice(0, -1)) submitAccusation(g, p, []);
      expect(accuseStatus(g, 'crane'), preset).not.toBe('no-room');
      submitAccusation(g, people[people.length - 1], []);
      expect(accuseStatus(g, 'crane'), preset).toBe('no-room');
    }
  });

  it('makes a wrongly accused innocent stop cooperating', () => {
    const g = play();
    const r = submitAccusation(g, 'kane', ['L1']);
    expect(r).toMatchObject({ kind: 'rejected', refuses: true });
    expect(trustOf(g, 'kane')).toBe('refuses');
  });

  it('loses the case when no one who can be convicted is left', () => {
    const g = play();
    for (const p of ['vex', 'tip', 'crane']) { submitAccusation(g, p, []); submitAccusation(g, p, []); }
    expect(g.s.lost).toBe('limits');
  });
});

describe('witness leaves', () => {
  // (Chief has its own leads and no Nevethitha event)
  for (const preset of PRESETS.filter((r) => r !== 'chief')) {
    it(`keeps L2 solvable with one answer at ${preset} after Nevethitha leaves`, () => {
      const g = newGame(cf, book, preset);
      g.s.hoursUsed = 4;
      const fired = fireEvents(g);
      expect(fired.map((e) => e.id)).toContain('nevethitha-leaves');
      const p = puzzleOf(g, 'L2');
      const lp = g.s.leads.L2;
      const said = p.statements.filter((s) => s.speaker !== 'nevethitha');
      const grids = enumerate({ size: p.size, zones: p.zones, givens: [...p.givens, ...lp.revealed.map(([r, c]) => ({ cell: [r, c] as [number, number], value: p.solution[r][c] }))] }, 10_000);
      const fits = grids.filter((x) => p.liarCounts.includes(said.filter((s) => !evalClaim(s.claim, x)).length));
      expect(fits).toHaveLength(1);
      expect(fits[0]).toEqual(p.solution);
    });
  }
});
