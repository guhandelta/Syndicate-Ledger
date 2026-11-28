import { describe, expect, it } from 'vitest';
import { DECODE_VARIANTS, type DecodePuzzle } from '../src/engine/decode';
import type { CaseFile, Lead } from '../src/game/caseTypes';
import { buildRank } from '../src/game/buildRank';
import { DECODE_LEVEL } from '../src/game/presets';
import { buyTip, checkLead, newGame, puzzleOf, solveLead, startLead } from '../src/game/state';
import { planLinks } from '../src/game/links';
import { makeRng } from '../src/engine/rng';
import { idleHint } from '../src/ui/idleHint';

const leadFor = (variant: (typeof DECODE_VARIANTS)[number], id = 'D1'): Lead =>
  ({ id, type: 'decode', decode: { variant }, cost: 2, opensAfter: [], title: id, intro: '', columns: [], rows: [], speakers: [], liars: { junior: [], detective: [], inspector: [], chief: [] }, fact: '' }) as unknown as Lead;
const caseWith = (leads: Lead[]) =>
  ({ id: 'decode-test', clock: { days: 1, hoursPerDay: 12 }, unit: '$#', events: [], offers: [], endings: [], cast: [], leads }) as unknown as CaseFile;

describe('a decode lead in the game', () => {
  it('is built for every rank, at the rank level, in each variant', () => {
    for (const variant of DECODE_VARIANTS) {
      const cf = caseWith([leadFor(variant)]);
      for (const preset of ['junior', 'detective', 'inspector', 'chief'] as const) {
        const book = buildRank(cf, preset);
        const p = book[`D1:${preset}`] as DecodePuzzle;
        expect(p.type).toBe('decode');
        expect(p.variant).toBe(variant);
        expect(p.level).toBe(DECODE_LEVEL[preset]);
      }
    }
  });

  it('is closed by typing the right answer, in any case or spacing', () => {
    const cf = caseWith([leadFor('book')]);
    const g = newGame(cf, buildRank(cf, 'detective'), 'detective');
    const p = puzzleOf(g, 'D1') as DecodePuzzle;
    startLead(g, 'D1');
    expect(g.s.leads.D1.typed).toBe('');
    expect(checkLead(g, 'D1')).toBe('grid-incomplete');
    g.s.leads.D1.typed = 'not it';
    expect(checkLead(g, 'D1')).toBe('grid-wrong');
    g.s.leads.D1.typed = `  ${p.answer.toLowerCase().replace(/ /g, '   ')} `;
    expect(checkLead(g, 'D1')).toBe('solved');
    solveLead(g, 'D1');
    expect(g.s.leads.D1.solved).toBe(true);
  });

  it('has no informant to buy a tip from', () => {
    const cf = caseWith([leadFor('dial')]);
    const g = newGame(cf, buildRank(cf, 'junior'), 'junior');
    startLead(g, 'D1');
    expect(buyTip(g, 'D1', 'nobody')).toBe('cant');
  });

  it('tells the player what to do', () => {
    const cf = caseWith([leadFor('date')]);
    const g = newGame(cf, buildRank(cf, 'inspector'), 'inspector');
    startLead(g, 'D1');
    expect(idleHint({ game: g, screen: 'puzzle', leadId: 'D1', town: null, dialog: false, tone: 'crime' }).todo).toMatch(/type the one answer/);
  });

  it('cannot be quoted by a link yet, and says so', () => {
    const second = { ...leadFor('check', 'D2'), type: 'cipher', opensAfter: ['D1'], links: [{ from: 'D1', take: 'number', use: 'is' }] } as unknown as Lead;
    const cf = caseWith([leadFor('book'), second]);
    const book = buildRank(caseWith([leadFor('book')]), 'junior');
    expect(() => planLinks(cf, 'junior', second, 4, { D1: book['D1:junior'] as never }, makeRng(1))).toThrow(/no number/);
  });
});
