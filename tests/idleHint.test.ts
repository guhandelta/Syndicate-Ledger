import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, GridBook } from '../src/game/caseTypes';
import { newGame, gridOf as puzzleOf, solveLead, startLead } from '../src/game/state';
import type { Town } from '../src/town/townTypes';
import { idleHint, type IdleContext } from '../src/ui/idleHint';
import { book } from './caseBook';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const town: Town = JSON.parse(readFileSync('cases/case-01-harbor-ledger/town.json', 'utf8'));

const ctx = (over: Partial<IdleContext>): IdleContext => ({ game: null, screen: 'title', leadId: null, town, dialog: false, tone: 'crime', ...over });

function solve(g: ReturnType<typeof newGame>, id: string) {
  startLead(g, id);
  const p = puzzleOf(g, id);
  g.s.leads[id].grid = p.solution.map((r) => r.slice());
  g.s.leads[id].marks = p.truth.map((t) => (t ? 'true' : 'lie'));
  solveLead(g, id);
}

describe('idle tips', () => {
  it('tells a new player how to start', () => {
    expect(idleHint(ctx({})).todo).toMatch(/Open the case/);
  });

  it('points to the next lead on the board and in the town', () => {
    const g = newGame(cf, book, 'inspector');
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/Open Fish market cash book/);
    expect(idleHint(ctx({ game: g, screen: 'town' })).todo).toMatch(/Walk to Fish hall and press E/);
    solve(g, 'L1');
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/Open Dock camera log/);
  });

  it('sends the player to accuse once every lead is solved', () => {
    const g = newGame(cf, book, 'inspector');
    for (const id of ['L1', 'L2', 'L3', 'L4']) solve(g, id);
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/Make an accusation/);
    expect(idleHint(ctx({ game: g, screen: 'town' })).todo).toMatch(/Harbor police desk/);
  });

  it('inside a lead, points at a cell without giving its number away', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    const hint = idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' }));
    expect(hint.todo).toMatch(/^Look at .+: only one amount can go there\./);
    expect(hint.todo).not.toMatch(/\$\d+k/);
  });

  it('moves on to marking, then closing, as the lead fills in', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    const p = puzzleOf(g, 'L1');
    g.s.leads.L1.grid = p.solution.map((r) => r.slice());
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/mark it True or Lie/);
    g.s.leads.L1.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/Close this lead/);
  });

  it('flags a wrong number without saying where', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    const p = puzzleOf(g, 'L1');
    const grid = p.solution.map((r) => r.slice());
    const open = (() => {
      for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (!p.givens.some((x) => x.cell[0] === r && x.cell[1] === c)) return [r, c];
      throw new Error('no open cell');
    })();
    grid[open[0]][open[1]] = (grid[open[0]][open[1]] % p.size) + 1;
    g.s.leads.L1.grid = grid;
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/doesn.t fit/);
  });

  it('asks the player to answer a waiting dialog first', () => {
    expect(idleHint(ctx({ game: newGame(cf, book, 'junior'), screen: 'board', dialog: true })).where).toBe('A message is waiting');
  });

  it('lists what can be done on every screen', () => {
    const g = newGame(cf, book, 'inspector');
    for (const screen of ['title', 'intro', 'board', 'town', 'accuse', 'verdict'] as const) {
      const hint = idleHint(ctx({ game: g, screen }));
      expect(hint.can.length, screen).toBeGreaterThan(0);
    }
    startLead(g, 'L1');
    const inLead = idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' }));
    expect(inLead.can.join(' ')).toMatch(/Mark each witness statement True or Lie/);
    solve(g, 'L1');
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).can.join(' ')).toMatch(/pick the next lead/);
    expect(idleHint(ctx({ game: g, screen: 'board', town: null })).can.join(' ')).not.toMatch(/Walk the town/);
  });

  it('has words for the lost screen, the accusation and a solved lead', () => {
    const g = newGame(cf, book, 'inspector');
    expect(idleHint(ctx({ game: g, screen: 'lost' })).where).toBe('The case is lost');
    expect(idleHint(ctx({ game: g, screen: 'lost' })).can.length).toBeGreaterThan(0);
    expect(idleHint(ctx({ game: g, screen: 'accuse' })).todo).toMatch(/Some leads are still unsolved/);
    for (const id of ['L1', 'L2', 'L3', 'L4']) solve(g, id);
    expect(idleHint(ctx({ game: g, screen: 'accuse' })).todo).toMatch(/tick the leads that prove it/);
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/This lead is solved/);
    expect(idleHint(ctx({ game: g, screen: 'verdict' })).where).toBe('The case is closed');
  });

  it('says to check the marks when one is wrong', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    const p = puzzleOf(g, 'L1');
    g.s.leads.L1.grid = p.solution.map((r) => r.slice());
    g.s.leads.L1.marks = p.truth.map((t) => (t ? 'lie' : 'true'));
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/one of your True or Lie marks is off/);
  });

  it('falls back to the basics when no logical next step exists, and uses the right words for rooms and kids', () => {
    const broken: GridBook = JSON.parse(JSON.stringify(book));
    broken['L1:inspector'].statements = [];
    broken['L1:inspector'].zones = [];
    broken['L1:inspector'].truth = [];
    const g = newGame(cf, broken, 'inspector');
    startLead(g, 'L1');
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: 'L1' })).todo).toMatch(/appears once in every row and column/);

    const rooms = newGame(cf, book, 'inspector');
    solve(rooms, 'L1');
    startLead(rooms, 'L2');
    expect(idleHint(ctx({ game: rooms, screen: 'puzzle', leadId: 'L2' })).todo).toMatch(/only one room can go there/);

    const kid = newGame(cf, book, 'junior');
    startLead(kid, 'L1');
    expect(idleHint(ctx({ game: kid, screen: 'puzzle', leadId: 'L1', tone: 'friendly' })).todo).toMatch(/only one number can go there/);
  });

  it('sends the player back to a lead they have started', () => {
    const g = newGame(cf, book, 'inspector');
    startLead(g, 'L1');
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/Finish .*Keep working/);
    expect(idleHint(ctx({ game: g, screen: 'town' })).todo).toMatch(/Go back into Fish hall to finish/);
    expect(idleHint(ctx({ game: g, screen: 'town', town: { ...town, doors: [] } })).todo).toMatch(/Go back into Fish market cash book to finish/);
    expect(idleHint(ctx({ game: g, screen: 'town', town: null })).todo).toMatch(/Go back into Fish market cash book/);
  });

  it('warns when time is short, and handles a town without the next door', () => {
    const g = newGame(cf, book, 'inspector');
    g.s.hoursUsed = 11;
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/short on time/);
    expect(idleHint(ctx({ game: g, screen: 'town', town: { ...town, doors: [] } })).todo).toMatch(/Walk to the glowing door/);
  });

  it('lists the other leads that are open too', () => {
    const c: CaseFile = JSON.parse(JSON.stringify(cf));
    for (const l of c.leads) l.opensAfter = [];
    const g = newGame(c, book, 'inspector');
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/Open Fish market cash book.*You could also open Dock camera log or Tip's payment records or/);
  });

  it('says so when nothing can be opened', () => {
    const c: CaseFile = JSON.parse(JSON.stringify(cf));
    for (const l of c.leads) l.opensAfter = ['L4'];
    const g = newGame(c, book, 'inspector');
    expect(idleHint(ctx({ game: g, screen: 'board' })).todo).toMatch(/No lead can be opened right now/);
  });

  it('falls back to the board hint on a puzzle screen with no lead chosen', () => {
    const g = newGame(cf, book, 'inspector');
    expect(idleHint(ctx({ game: g, screen: 'puzzle', leadId: null })).where).toBe('The evidence board');
  });
});
