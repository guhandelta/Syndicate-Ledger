import { describe, expect, it } from 'vitest';
import { carryMatters, carryToken, DECODE_VARIANTS, generateDecode, verifyDecode, type DecodePuzzle } from '../src/engine/decode';
import type { CaseFile, Lead } from '../src/game/caseTypes';
import { buildRank } from '../src/game/buildRank';
import { DECODE_LEVEL } from '../src/game/presets';
import { buyTip, checkLead, newGame, puzzleOf, solveLead, startLead } from '../src/game/state';
import { carryResolves, planLinks, wordExhibits } from '../src/game/links';
import { makeRng } from '../src/engine/rng';
import { refNumber } from '../src/engine/via';
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

  it('can be quoted by a later lead: a number answer by a digit, a word answer by a word length', () => {
    for (const [variant, kind] of [['dial', 'digit'], ['book', 'wordLen']] as const) {
      const second = { ...leadFor('check', 'D2'), type: 'cipher', opensAfter: ['D1'], links: [{ from: 'D1', take: 'number', use: 'is' }] } as unknown as Lead;
      const cf = caseWith([leadFor(variant), second]);
      const book = buildRank(caseWith([leadFor(variant)]), 'detective');
      const planted = planLinks(cf, 'detective', second, 5, { D1: book['D1:detective'] as never }, makeRng(1));
      expect(planted[0].via.ref.kind).toBe(kind);
    }
  });
});

const keyedLead = (variant: 'shift' | 'dial' | 'book' | 'date', links = 2): Lead =>
  ({ ...leadFor(variant, 'D2'), opensAfter: ['D1'], links: Array.from({ length: links }, () => ({ from: 'D1', take: 'number', use: 'key' })) }) as unknown as Lead;

describe('a decode lead that carries numbers from an earlier lead', () => {
  for (const variant of ['shift', 'dial', 'book', 'date'] as const) {
    it(`${variant}: every rank carries two numbers that match the earlier answer and each one matters`, () => {
      const cf = caseWith([leadFor('dial'), keyedLead(variant)]);
      for (const preset of ['junior', 'detective', 'inspector', 'chief'] as const) {
        for (const runSeed of [0, 5, 9]) {
          const book = buildRank(cf, preset, { runSeed });
          const p = book[`D2:${preset}`] as DecodePuzzle;
          expect(p.carry).toHaveLength(2);
          expect(verifyDecode(p)).toBe(true);
          expect(carryMatters(p)).toBe(true);
          expect(carryResolves(keyedLead(variant), preset, p, { D1: book[`D1:${preset}`] as never })).toBeNull();
          expect(p.exhibits.flatMap((e) => e.lines).join(' ')).toContain(carryToken(0));
        }
      }
    });
  }

  it('words each carried number as a pointer back, never as the number itself', () => {
    const cf = { ...caseWith([leadFor('dial'), keyedLead('shift')]), leads: [{ ...leadFor('dial'), title: 'The safe' }, keyedLead('shift')] } as CaseFile;
    const book = buildRank(cf, 'junior');
    const p = book['D2:junior'] as DecodePuzzle;
    const text = wordExhibits(cf, p, { D1: book['D1:junior'] as never }, 'crime').flatMap((e) => e.lines).join(' ');
    expect(text).toMatch(/digit of the answer to “The safe”/);
    expect(text).not.toContain(carryToken(0));
    expect(wordExhibits(cf, book['D1:junior'] as DecodePuzzle, {}, 'crime')).toBe((book['D1:junior'] as DecodePuzzle).exhibits);
  });

  it('words a word-length pointer, and the 2nd digit by its place', () => {
    const cf = caseWith([{ ...leadFor('shift'), title: 'The note' }, keyedLead('dial')]);
    const word = buildRank(caseWith([leadFor('shift')]), 'junior')['D1:junior'] as DecodePuzzle;
    const via = { lead: 'D1', ref: { kind: 'wordLen', i: 0 } } as const;
    const p = { ...word, via: [via, via], carry: [3, 3], exhibits: [{ title: 't', lines: [`${carryToken(1)}`] }] } as DecodePuzzle;
    expect(wordExhibits(cf, p, { D1: word as never }, 'crime')[0].lines[0]).toMatch(/letters in the 1st word of the answer to “The note”/);
  });

  it('refuses a link count that the puzzle cannot use, and a source with no number', () => {
    const cf = caseWith([leadFor('dial'), keyedLead('shift', 1)]);
    expect(() => buildRank(cf, 'junior')).toThrow(/could not be built with its links/);
    const lone = { ...leadFor('shift', 'D2'), opensAfter: [], links: [{ from: 'D1', take: 'number', use: 'key' }, { from: 'D1', take: 'number', use: 'key' }] } as unknown as Lead;
    expect(() => buildRank(caseWith([lone]), 'junior')).toThrow();
  });

  it('can carry fixed story numbers instead of an earlier answer, worded as the story names them', () => {
    const fact = (value: number, crime: string) => ({ from: '@story', take: 'number', use: 'key', fact: { value, story: { crime, friendly: `${crime} (friendly)` } } });
    const lead = { ...leadFor('date', 'D1'), links: [fact(9, 'the door number on the plate'), fact(4, 'the coins Tip carried')] } as unknown as Lead;
    const cf = caseWith([lead]);
    for (const preset of ['junior', 'chief'] as const) {
      const book = buildRank(cf, preset);
      const p = book[`D1:${preset}`] as DecodePuzzle;
      expect(p.carry).toEqual([9, 4]);
      expect(carryMatters(p)).toBe(true);
      expect(carryResolves(lead, preset, p, {})).toBeNull();
    }
    const p = buildRank(cf, 'junior')['D1:junior'] as DecodePuzzle;
    expect(wordExhibits(cf, p, {}, 'crime').flatMap((e) => e.lines).join(' ')).toContain('[the door number on the plate]/[the coins Tip carried]');
    expect(wordExhibits(cf, p, {}, 'friendly').flatMap((e) => e.lines).join(' ')).toContain('the coins Tip carried (friendly)');
    expect(refNumber(p, p.via![0].ref)).toBe(9);
    // a story number outside the slot's range, a wrong carried number and a wrong kind of link are all caught
    const tooBig = { ...lead, links: [fact(12, 'x'), fact(4, 'y')] } as unknown as Lead;
    expect(() => buildRank(caseWith([tooBig]), 'junior')).toThrow(/does not fit slot 1/);
    expect(carryResolves(lead, 'junior', { ...p, carry: [9, 5] }, {})).toMatch(/should carry the story number/);
    expect(carryResolves(lead, 'junior', { ...p, via: [{ lead: 'D0', ref: { kind: 'digit', p: 0 } }, p.via![1]] }, {})).toMatch(/should carry the story number/);
  });

  it('quotes a letter of a one-word answer by its place in the alphabet', () => {
    const cf = caseWith([{ ...leadFor('shift'), title: 'The note' }, keyedLead('dial')]);
    const book = buildRank(cf, 'junior');
    const p = book['D2:junior'] as DecodePuzzle;
    expect(p.via!.every((v) => v.ref.kind === 'letter')).toBe(true);
    const text = wordExhibits(cf, p, { D1: book['D1:junior'] as never }, 'crime').flatMap((e) => e.lines).join(' ');
    expect(text).toMatch(/place in the alphabet \(A is 1\) of the \d\w\w letter of the answer to “The note”/);
    expect(carryResolves(keyedLead('dial'), 'junior', p, { D1: book['D1:junior'] as never })).toBeNull();
  });

  it('says so when the earlier answer has no number that fits a slot', () => {
    // a book's line slot takes 1 to 4, and a shift answer's first word is always longer than that
    const cf = caseWith([leadFor('shift'), keyedLead('book')]);
    expect(() => buildRank(cf, 'junior')).toThrow(/has no number for slot/);
  });

  it('carryResolves spots a wrong count, a wrong source and a wrong number', () => {
    const cf = caseWith([leadFor('dial'), keyedLead('shift')]);
    const book = buildRank(cf, 'junior');
    const p = book['D2:junior'] as DecodePuzzle;
    const answers = { D1: book['D1:junior'] as never };
    const lead = keyedLead('shift');
    expect(carryResolves(lead, 'junior', { ...p, carry: [1] }, answers)).toMatch(/carried numbers/);
    expect(carryResolves(lead, 'junior', { ...p, carry: undefined, via: undefined }, answers)).toMatch(/0 carried numbers/);
    expect(carryResolves(lead, 'junior', { ...p, via: undefined }, answers)).toMatch(/2 carried numbers/);
    expect(carryResolves(lead, 'junior', { ...p, via: [{ ...p.via![0], lead: 'D9' }, p.via![1]] }, answers)).toMatch(/slot 1 quotes/);
    expect(carryResolves(lead, 'junior', { ...p, carry: [p.carry![0] === 1 ? 2 : 1, p.carry![1]] }, answers)).toMatch(/slot 1 carries/);
  });

  it('generateDecode rejects a carry that does not fit, and a variant that cannot take one is never "mattering"', () => {
    expect(() => generateDecode({ variant: 'shift', level: 1, seed: 1, carry: [1] })).toThrow(/does not fit/);
    expect(() => generateDecode({ variant: 'shift', level: 1, seed: 1, carry: [1, 10] })).toThrow(/does not fit/);
    const odd = { ...generateDecode({ variant: 'check', level: 1, seed: 1 }), carry: [1] };
    expect(carryMatters(odd)).toBe(false);
    expect(carryMatters(generateDecode({ variant: 'shift', level: 1, seed: 1 }))).toBe(true);
  });
});
