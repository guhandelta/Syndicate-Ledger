import { describe, expect, it } from 'vitest';
import type { CaseFile, Lead, PuzzleBook } from '../src/game/caseTypes';
import { evalCipher, fittingCodes, generateCipher, type CipherClaim, type CipherPuzzle } from '../src/engine/cipher';
import { buyTip, checkLead, cipherOf, fireEvents, gapDigits, newGame, solveLead, startLead } from '../src/game/state';
import { cipherPlaces, describeCipherClaim, describeStatement } from '../src/game/text';
import { CIPHER_RULES } from '../src/game/presets';
import { idleHint } from '../src/ui/idleHint';

const ids = ['a', 'b', 'c', 'd'];
const lead: Lead = {
  id: 'C1', type: 'cipher', cost: 2, opensAfter: [], title: 'C1', intro: '', columns: [], rows: [], speakers: ids,
  liars: { junior: ['a'], detective: ['a'], inspector: ['a'], chief: ['a'] }, fact: '',
} as unknown as Lead;
const cf = {
  id: 'cipher-test', clock: { days: 1, hoursPerDay: 12 }, unit: '$#', events: [], offers: [], endings: [],
  cast: ids.map((id, i) => ({ id, name: id.toUpperCase(), role: i ? 'witness' : 'informant', reliability: i ? 'honest' : 'liar', color: '#fff', blurb: '' })),
  leads: [lead],
} as unknown as CaseFile;
const sp = ids.map((id, i) => ({ id, lies: i === 0 ? 1 : 0 }));
const book = {
  'C1:junior': generateCipher({ size: 4, speakers: sp, maxGrade: 3, ...CIPHER_RULES.junior, seed: 5 }),
  'C1:detective': generateCipher({ size: 5, speakers: sp, maxGrade: 3, ...CIPHER_RULES.detective, seed: 6 }),
  'C1:chief': generateCipher({ size: 7, speakers: sp, maxGrade: 3, ...CIPHER_RULES.chief, seed: 7 }),
} as unknown as PuzzleBook;

describe('cipher wording', () => {
  it('names digits by their place in the code, for each kind of claim', () => {
    expect(describeCipherClaim({ kind: 'is', p: 0, d: 3 })).toBe('The 1st digit is 3.');
    expect(describeCipherClaim({ kind: 'isNot', p: 1, d: 4 })).toBe('The 2nd digit is not 4.');
    expect(describeCipherClaim({ kind: 'even', p: 2 })).toBe('The 3rd digit is an even number.');
    expect(describeCipherClaim({ kind: 'odd', p: 3 })).toBe('The 4th digit is an odd number.');
    expect(describeCipherClaim({ kind: 'greater', a: 1, b: 0 })).toBe('The 2nd digit is bigger than the 1st digit.');
    expect(describeCipherClaim({ kind: 'sum', a: 0, b: 2, total: 7 })).toBe('The 1st digit and the 3rd digit add up to 7.');
    expect(describeCipherClaim({ kind: 'apart', a: 3, b: 0, gap: 2 })).toBe('The 4th digit and the 1st digit are 2 apart.');
    expect(describeStatement(cf, lead, book['C1:junior'], { kind: 'odd', p: 0 } as CipherClaim, 'crime')).toBe('The 1st digit is an odd number.');
  });
});

describe('a riddle told about named people', () => {
  const riddle = { ...lead, riddle: { people: ['a', 'b', 'c', 'd', 'a'], noun: 'berth' } } as Lead;

  it('names the places by person and noun, and falls back to a plain name for a person not in the cast', () => {
    const places = cipherPlaces(cf, riddle, 4);
    expect([places.long(0), places.short(1), places.thing]).toEqual(['A’s berth number', 'B', 'berth number']);
    expect(cipherPlaces({ ...cf, cast: [] } as unknown as CaseFile, riddle, 4).short(2)).toBe('c');
    expect(cipherPlaces(cf, lead, 4)).toMatchObject({ thing: 'digit' });
    expect(cipherPlaces(cf, lead, 4).short(2)).toBe('3rd');
  });

  it('words every claim through the people', () => {
    const places = cipherPlaces(cf, riddle, 4);
    expect(describeCipherClaim({ kind: 'is', p: 0, d: 3 }, places)).toBe('A’s berth number is 3.');
    expect(describeCipherClaim({ kind: 'greater', a: 1, b: 0 }, places)).toBe('B’s berth number is bigger than A’s berth number.');
    expect(describeStatement(cf, riddle, book['C1:junior'], { kind: 'odd', p: 2 } as CipherClaim, 'crime')).toBe('C’s berth number is an odd number.');
  });
});

describe('a cipher lead in a game', () => {
  it('starts with every place empty, except the digits already shown', () => {
    const g = newGame(cf, book, 'junior');
    expect(g.s.leads.C1.digits).toEqual([0, 0, 0, 0]);
    expect(g.s.leads.C1.grid).toEqual([]);
    expect(checkLead(g, 'C1')).toBe('grid-incomplete');
    const chief = newGame(cf, book, 'chief');
    const p = cipherOf(chief, 'C1');
    expect(p.givens).toHaveLength(1);
    expect(chief.s.leads.C1.digits![p.givens[0].p]).toBe(p.givens[0].d);
  });

  it('is wrong until every digit is right, then needs the witnesses marked', () => {
    const g = newGame(cf, book, 'junior');
    const p = cipherOf(g, 'C1');
    const lp = g.s.leads.C1;
    lp.digits = p.code.slice();
    lp.digits[0] = (lp.digits[0] % 5) + 1;
    expect(checkLead(g, 'C1')).toBe('grid-wrong');
    lp.digits = p.code.slice();
    expect(checkLead(g, 'C1')).toBe('marks-incomplete');
    lp.marks = p.truth.map((t) => (t ? 'lie' : 'true'));
    expect(checkLead(g, 'C1')).toBe('marks-wrong');
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(checkLead(g, 'C1')).toBe('solved');
    solveLead(g, 'C1');
    expect(g.s.leads.C1.solved).toBe(true);
  });

  it('sells a true statement the player does not have yet', () => {
    const g = newGame(cf, book, 'junior');
    const before = g.s.favors;
    const tip = buyTip(g, 'C1', 'a');
    expect(tip).not.toBe('cant');
    expect(evalCipher(tip as CipherClaim, cipherOf(g, 'C1').code)).toBe(true);
    expect(g.s.favors).toBe(before - 1);
    expect(g.s.leads.C1.paidTips).toHaveLength(1);
  });

  // a puzzle where one honest witness holds all the answers, so when they leave digits must be shown
  const lone = () => {
    const p = book['C1:detective'] as CipherPuzzle;
    const claim = p.statements.find((_, i) => p.truth[i])!.claim;
    return { 'C1:detective': { ...p, liarCounts: [0], statements: [{ speaker: 'b', claim }], truth: [true] } } as unknown as PuzzleBook;
  };

  it('keeps the lead solvable when a witness leaves, by showing the digits that are needed', () => {
    const g = newGame(cf, lone(), 'detective');
    const lp = g.s.leads.C1;
    const p = cipherOf(g, 'C1');
    lp.missingSpeakers.push('b');
    const added = gapDigits(g, 'C1');
    expect(added.length).toBeGreaterThan(0);
    expect(new Set(added).size).toBe(added.length);
    expect(fittingCodes({ ...p, givens: added.map((k) => ({ p: k, d: p.code[k] })) }, [])).toEqual([p.code]);
    // nothing is added while every witness is still there
    expect(gapDigits(newGame(cf, book, 'detective'), 'C1')).toEqual([]);
  });

  it('shows the needed digits by itself when an event removes a witness, and skips ones already shown', () => {
    const ev = { id: 'leaves', at: 0, effect: { type: 'removeSpeaker', lead: 'C1', speaker: 'b', recover: { hours: 1, favors: 1 } }, rumor: '', message: '' };
    const g = newGame({ ...cf, events: [ev] } as unknown as CaseFile, lone(), 'detective');
    const lp = g.s.leads.C1;
    lp.shownDigits!.push(0);
    lp.digits![0] = cipherOf(g, 'C1').code[0];
    expect(fireEvents(g)).toHaveLength(1);
    expect(lp.shownDigits!.length).toBeGreaterThan(1);
    expect(new Set(lp.shownDigits).size).toBe(lp.shownDigits!.length);
    for (const k of lp.shownDigits!) expect(lp.digits![k]).toBe(cipherOf(g, 'C1').code[k]);
    expect(startLead(g, 'C1')).toEqual([]);
  });
});

describe('idle tips on a cipher lead', () => {
  const tip = (g: ReturnType<typeof newGame>) => idleHint({ game: g, screen: 'puzzle', leadId: 'C1', town: null, dialog: false, tone: 'crime' }).todo;
  it('guides each stage of a code', () => {
    const g = newGame(cf, book, 'junior');
    const p = cipherOf(g, 'C1');
    const lp = g.s.leads.C1;
    lp.started = true;
    expect(tip(g)).toMatch(/Fill every place/);
    lp.digits = p.code.slice();
    lp.digits[0] = (lp.digits[0] % 5) + 1;
    expect(tip(g)).toMatch(/digits is wrong/);
    lp.digits = p.code.slice();
    expect(tip(g)).toMatch(/code is complete/);
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    expect(tip(g)).toMatch(/Press Close this lead/);
  });
});
