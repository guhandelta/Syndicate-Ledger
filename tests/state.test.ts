import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, GridBook } from '../src/game/caseTypes';
import {
  accuse, accusedPeople, accuseStatus, addFlag, buyTip, canAccuse, canStillWin, caseOver, checkLead, clockOn, dayLabel, evidenceLeads, failedTries,
  fireEvents, gapCells, hoursLeft, leadCost, leadOpen, newGame, proofHolds, gridOf as puzzleOf, recoverSpeaker, refusing, rules, solveLead, spendFavors,
  spendHours, stars, startLead, submitAccusation, timeUp, totalHours, triesLeft, trustOf,
} from '../src/game/state';
import { caseForRank } from '../src/game/rankStory';
import { book } from './caseBook';

const cf0: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const clone = (): CaseFile => JSON.parse(JSON.stringify(cf0));
const fresh = (preset: 'junior' | 'detective' | 'inspector' | 'chief' = 'inspector', cf = cf0) => newGame(cf, book, preset);

function fill(g: ReturnType<typeof fresh>, id: string, marks = true) {
  const p = puzzleOf(g, id);
  const lp = g.s.leads[id];
  lp.grid = p.solution.map((r) => r.slice());
  if (marks) lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
}
function solve(g: ReturnType<typeof fresh>, id: string) {
  startLead(g, id);
  fill(g, id);
  solveLead(g, id);
}

describe('clock and days', () => {
  it('counts hours and days, and has no clock at Junior', () => {
    const g = fresh('inspector');
    expect(clockOn(g)).toBe(true);
    expect(totalHours(g)).toBe(12);
    expect(dayLabel(g)).toBe('Day 1');
    spendHours(g, 5);
    expect(dayLabel(g)).toBe('Day 2');
    expect(hoursLeft(g)).toBe(7);
    spendHours(g, 100);
    expect(dayLabel(g)).toBe('Day 3');
    expect(hoursLeft(g)).toBe(0);
    expect(timeUp(g)).toBe(true);
    const j = fresh('junior');
    expect(clockOn(j)).toBe(false);
    expect(spendHours(j, 5)).toEqual([]);
    expect(j.s.hoursUsed).toBe(0);
    expect(timeUp(j)).toBe(false);
    expect(rules(j).size).toBe(4);
  });

  it('opens leads in order and prices them', () => {
    const g = fresh();
    expect(leadOpen(g, 'L1')).toBe(true);
    expect(leadOpen(g, 'L4')).toBe(false);
    expect(leadCost(g, 'L1')).toBe(2);
    g.s.leads.L1.extraCost = 1;
    expect(leadCost(g, 'L1')).toBe(3);
  });

  it('starts a lead once, refuses it without enough time', () => {
    const g = fresh();
    expect(startLead(g, 'L1')).toEqual([]);
    expect(startLead(g, 'L1')).toEqual([]);
    expect(g.s.hoursUsed).toBe(2);
    g.s.hoursUsed = 11;
    expect(startLead(g, 'L2')).toBe('no-time');
    const j = fresh('junior');
    j.s.hoursUsed = 999;
    expect(startLead(j, 'L1')).toEqual([]);
  });
});

describe('events', () => {
  it('fires once, honours flags and solved leads, and skips started leads', () => {
    const g = fresh();
    g.s.hoursUsed = 4;
    expect(fireEvents(g).map((e) => e.id)).toEqual(['juno-leaves']);
    expect(fireEvents(g)).toEqual([]);
    expect(g.s.leads.L2.missingSpeakers).toEqual(['juno']);

    const started = fresh();
    startLead(started, 'L2');
    started.s.hoursUsed = 4;
    expect(fireEvents(started)).toEqual([]);

    const solved = fresh();
    solve(solved, 'L2');
    solved.s.hoursUsed = 4;
    expect(fireEvents(solved)).toEqual([]);

    const noFlag = fresh();
    noFlag.s.hoursUsed = 8;
    expect(fireEvents(noFlag).map((e) => e.id)).not.toContain('warehouse-burns');
    const flagged = fresh();
    addFlag(flagged, 'tip-trap');
    flagged.s.hoursUsed = 8;
    expect(fireEvents(flagged).map((e) => e.id)).toContain('warehouse-burns');
    expect(flagged.s.leads.L4.extraCost).toBe(1);
    flagged.s.hoursUsed = 12;
    expect(fireEvents(flagged).map((e) => e.id)).toContain('ship-sails');
  });

  it('shows the cells that keep a lead solvable when Juno leaves, and nothing when already unique', () => {
    const g = fresh('junior');
    g.s.leads.L2.missingSpeakers = ['juno'];
    expect(gapCells(g, 'L2').length).toBeGreaterThan(0);
    const d = fresh('detective');
    d.s.leads.L2.missingSpeakers = ['juno'];
    expect(gapCells(d, 'L2')).toEqual([]);
  });

  it('accounts for cells already shown when finding the gap', () => {
    const g = fresh('junior');
    const p = puzzleOf(g, 'L2');
    g.s.leads.L2.missingSpeakers = ['juno'];
    g.s.leads.L2.revealed = [[0, 0]];
    expect(gapCells(g, 'L2').every(([r, c]) => !(r === 0 && c === 0) && p.solution[r][c] > 0)).toBe(true);
  });

  it('lets the player track a witness down for a price', () => {
    const g = fresh();
    g.s.hoursUsed = 4;
    fireEvents(g);
    expect(recoverSpeaker(g, 'L1', 'juno')).toBe('cant');
    g.s.favors = 0;
    expect(recoverSpeaker(g, 'L2', 'juno')).toBe('cant');
    g.s.favors = 3;
    g.s.hoursUsed = 12;
    expect(recoverSpeaker(g, 'L2', 'juno')).toBe('cant');
    g.s.hoursUsed = 4;
    expect(recoverSpeaker(g, 'L2', 'juno')).toEqual([]);
    expect(g.s.leads.L2.missingSpeakers).toEqual([]);
    expect(g.s.favors).toBe(2);
    expect(g.s.hoursUsed).toBe(5);
    const events = clone().events;
    expect(events.find((e) => e.effect.type !== 'removeSpeaker')).toBeTruthy();
    const j = fresh('junior');
    j.s.favors = 1;
    expect(recoverSpeaker(j, 'L2', 'juno')).toEqual([]);
    const other = fresh();
    expect(recoverSpeaker(other, 'L2', 'vex')).toBe('cant');
  });

  it('spends favors only when there are enough', () => {
    const g = fresh();
    g.s.favors = 1;
    expect(spendFavors(g, 2)).toBe(false);
    expect(spendFavors(g, 1)).toBe(true);
    expect(g.s.favors).toBe(0);
  });
});

describe('checking a lead and trust', () => {
  it('walks through every check result', () => {
    const g = fresh();
    expect(checkLead(g, 'L1')).toBe('grid-incomplete');
    fill(g, 'L1', false);
    g.s.leads.L1.grid[0][0] = (g.s.leads.L1.grid[0][0] % 4) + 1;
    expect(checkLead(g, 'L1')).toBe('grid-wrong');
    fill(g, 'L1', false);
    expect(checkLead(g, 'L1')).toBe('marks-incomplete');
    const p = puzzleOf(g, 'L1');
    g.s.leads.L1.marks = p.truth.map((t) => (t ? 'lie' : 'true'));
    expect(checkLead(g, 'L1')).toBe('marks-wrong');
    fill(g, 'L1');
    expect(checkLead(g, 'L1')).toBe('solved');
  });

  it('skips statements of witnesses who left', () => {
    const g = fresh();
    fill(g, 'L2');
    g.s.leads.L2.missingSpeakers = ['juno'];
    g.s.leads.L2.marks = g.s.leads.L2.marks.map((m, i) => (puzzleOf(g, 'L2').statements[i].speaker === 'juno' ? 'unknown' : m));
    expect(checkLead(g, 'L2')).toBe('solved');
  });

  it('earns a favor for exposing a liar and flags an exposed double agent', () => {
    const g = fresh();
    const before = g.s.favors;
    solve(g, 'L1');
    solve(g, 'L3');
    expect(g.s.favors).toBeGreaterThan(before);
    expect(g.s.flags).toContain('tip-exposed');
    expect(trustOf(g, 'tip')).toBe('caught');
  });

  it('reports every trust state', () => {
    const g = fresh();
    expect(trustOf(g, 'rosa')).toBe('unknown');
    startLead(g, 'L1');
    expect(trustOf(g, 'rosa')).toBe('unknown');
    const p = puzzleOf(g, 'L1');
    const rosaAt = p.statements.findIndex((s) => s.speaker === 'rosa');
    g.s.leads.L1.marks[rosaAt] = 'lie';
    expect(trustOf(g, 'rosa')).toBe('suspicious');
    fill(g, 'L1');
    solveLead(g, 'L1');
    expect(['verified', 'mistaken', 'caught']).toContain(trustOf(g, 'rosa'));
    addFlag(g, 'refuses:rosa');
    addFlag(g, 'refuses:rosa');
    expect(trustOf(g, 'rosa')).toBe('refuses');
    expect(refusing(g, 'rosa')).toBe(true);
  });

  it('tells a mistaken witness from a caught liar', () => {
    const c = clone();
    const g = fresh('inspector', c);
    const rosa = c.cast.find((x) => x.id === 'rosa')!;
    const lead = c.leads.find((l) => l.speakers.includes('rosa'))!;
    const p = puzzleOf(g, lead.id);
    const idx = p.statements.findIndex((s) => s.speaker === 'rosa');
    p.truth[idx] = false;
    startLead(g, lead.id);
    g.s.leads[lead.id].solved = true;
    rosa.reliability = 'mistaken';
    expect(trustOf(g, 'rosa')).toBe('mistaken');
    rosa.reliability = 'liar';
    expect(trustOf(g, 'rosa')).toBe('caught');
    p.truth[idx] = true;
  });
});

describe('buying a tip', () => {
  it('sells one true statement, costing a favor and an hour', () => {
    const g = fresh();
    g.s.favors = 2;
    startLead(g, 'L1');
    const claim = buyTip(g, 'L1', 'tip');
    expect(claim).not.toBe('cant');
    expect(g.s.favors).toBe(1);
    expect(g.s.leads.L1.paidTips).toHaveLength(1);
  });

  it('refuses when exposed, broke, out of time, or out of claims', () => {
    const exposed = fresh();
    addFlag(exposed, 'tip-exposed');
    expect(buyTip(exposed, 'L1', 'tip')).toBe('cant');
    const poor = fresh();
    poor.s.favors = 0;
    expect(buyTip(poor, 'L1', 'tip')).toBe('cant');
    const late = fresh();
    late.s.hoursUsed = 12;
    expect(buyTip(late, 'L1', 'tip')).toBe('cant');
    const j = fresh('junior');
    j.s.hoursUsed = 99;
    expect(buyTip(j, 'L1', 'tip')).not.toBe('cant');
  });
});

describe('accusations', () => {
  const solved = (preset: 'junior' | 'inspector' = 'inspector') => {
    const g = fresh(preset);
    for (const id of ['L1', 'L2', 'L3', 'L4']) solve(g, id);
    return g;
  };

  it('accepts only complete proof that points at the person', () => {
    const g = solved();
    expect(proofHolds(g, 'kane', ['L1'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3', 'L4', 'L1'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3', 'L4', 'LX'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3', 'L4'])).toBe(true);
    g.s.leads.L3.solved = false;
    expect(proofHolds(g, 'crane', ['L3', 'L4'])).toBe(false);
  });

  it('lets the object handed over from the rank below stand as proof, only for who it points at', () => {
    const g = fresh('detective', caseForRank(cf0, 'detective'));
    for (const id of ['L1', 'L2', 'L3', 'L4']) solve(g, id);
    // the plate is part of what convicts Crane here, so the two leads alone are not enough
    expect(proofHolds(g, 'crane', ['L3', 'L4'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3', 'L4', 'carried:junior'])).toBe(true);
    // it does not point at Vex, and a rank that is handed no such object has nothing to lean on
    expect(proofHolds(g, 'vex', ['L2', 'carried:junior'])).toBe(false);
    expect(proofHolds(g, 'crane', ['L3', 'L4', 'carried:detective'])).toBe(false);
    expect(proofHolds(fresh('junior'), 'crane', ['L3', 'L4', 'carried:junior'])).toBe(false);
  });

  it('lists the proven facts', () => {
    const g = fresh();
    expect(evidenceLeads(g)).toEqual([]);
    solve(g, 'L1');
    expect(evidenceLeads(g).map((l) => l.id)).toEqual(['L1']);
  });

  it('turns an accepted accusation into an ending', () => {
    const g = solved();
    const r = submitAccusation(g, 'crane', ['L3', 'L4']);
    expect(r).toMatchObject({ kind: 'accepted' });
    expect(caseOver(g)).toBe(true);
    expect(stars(g)).toBeGreaterThan(0);
  });

  it('counts tries and people, and locks them', () => {
    const g = solved();
    expect(canAccuse(g, 'crane')).toBe(true);
    expect(submitAccusation(g, 'crane', [])).toMatchObject({ kind: 'rejected', triesLeft: 1, locked: false, refuses: false });
    expect(failedTries(g, 'crane')).toBe(1);
    expect(submitAccusation(g, 'crane', [])).toMatchObject({ kind: 'rejected', triesLeft: 0, locked: true });
    expect(accuseStatus(g, 'crane')).toBe('locked');
    expect(submitAccusation(g, 'crane', ['L3', 'L4'])).toEqual({ kind: 'blocked', why: 'locked' });
    submitAccusation(g, 'vex', []);
    submitAccusation(g, 'tip', []);
    submitAccusation(g, 'rosa', []);
    expect(accusedPeople(g)).toEqual(['crane', 'vex', 'tip', 'rosa']);
    expect(accuseStatus(g, 'kane')).toBe('no-room');
    expect(submitAccusation(g, 'kane', [])).toEqual({ kind: 'blocked', why: 'no-room' });
    expect(canStillWin(g)).toBe(true);
  });

  it('makes a wrongly accused innocent stop helping, costing an hour', () => {
    const g = solved();
    const g2 = fresh();
    g2.s.leads.L1.started = true;
    const r = submitAccusation(g2, 'kane', ['L1']);
    expect(r).toMatchObject({ refuses: true });
    expect(g2.s.leads.L2.extraCost).toBe(1);
    expect(g2.s.leads.L1.extraCost).toBe(0);
    const j = fresh('junior');
    submitAccusation(j, 'kane', []);
    expect(j.s.leads.L2.extraCost).toBe(0);
    expect(g.s.lost).toBeUndefined();
  });

  it('loses the case when time is up or nobody provable is left', () => {
    const late = fresh();
    late.s.hoursUsed = 12;
    expect(submitAccusation(late, 'crane', [])).toMatchObject({ lost: 'time' });
    expect(late.s.lost).toBe('time');
    expect(caseOver(late)).toBe(true);
    const g = solved();
    for (const p of ['vex', 'tip', 'crane']) {
      submitAccusation(g, p, []);
      submitAccusation(g, p, []);
    }
    expect(g.s.lost).toBe('limits');
    expect(canStillWin(g)).toBe(false);
  });

  it('works for a case with no proof table', () => {
    const c = clone();
    delete c.proof;
    const g = fresh('inspector', c);
    expect(proofHolds(g, 'crane', ['L3'])).toBe(false);
    expect(canStillWin(g)).toBe(false);
    expect(submitAccusation(g, 'crane', [])).toMatchObject({ kind: 'rejected', refuses: true });
  });

  it('picks the right ending', () => {
    const g = solved();
    expect(accuse(g, 'crane').id).toBe('full-bust');
    const h = fresh();
    expect(accuse(h, 'crane').id).not.toBe('full-bust');
    expect(g.s.accused).toBe('crane');
    const w = fresh();
    expect(accuse(w, 'nobody').id).toBe(cf0.endings[cf0.endings.length - 1].id);
  });

  it('falls back to the last ending when the requirements are unmet and no plain ending fits', () => {
    const c = clone();
    c.endings = c.endings.filter((e) => e.id !== 'boss-walks');
    const g = fresh('inspector', c);
    expect(accuse(g, 'crane').id).toBe(c.endings[c.endings.length - 1].id);
  });

  it('scores stars', () => {
    const g = solved();
    accuse(g, 'crane');
    expect(stars(g)).toBe(3);
    g.s.hintsUsed = 2;
    expect(stars(g)).toBe(2);
    g.s.hintsUsed = 5;
    expect(stars(g)).toBe(1);
    const second = fresh();
    second.s.endingId = cf0.endings[1].id;
    expect(stars(second)).toBe(1);
    second.s.endingId = cf0.endings[2].id;
    expect(stars(second)).toBe(0);
  });
});
