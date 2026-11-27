import { describe, expect, it } from 'vitest';
import type { CaseFile, Lead } from '../src/game/caseTypes';
import { describeClaim, gridLabels, t } from '../src/game/text';
import type { Claim } from '../src/engine/types';
import { sameCell } from '../src/engine/claims';
import { TRUST_LABEL } from '../src/ui/components/labels';
import { FIGURES } from '../src/town/figures';
import { portraitOf } from '../src/ui/portraits';
import { findWrong, zoneMap, abilityLabel, allyCost, initials, liarLine } from '../src/ui/puzzleHelpers';
import { expressionFor } from '../src/ui/voices';

const cf = {
  unit: { crime: '$#k', friendly: '# coins' },
  cast: [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: '"Bee" Bo' },
  ],
} as unknown as CaseFile;
const ledger = { type: 'ledger', columns: ['a', 'b', 'zz'], rows: ['Mon', 'Jan', '8pm'], rooms: undefined } as unknown as Lead;
const rooms = { ...ledger, type: 'surveillance', rooms: ['Dock', 'Warehouse 9', 'Ice house'] } as unknown as Lead;

describe('wording', () => {
  it('picks the tone of a text, or a plain string', () => {
    expect(t('plain', 'crime')).toBe('plain');
    expect(t({ crime: 'c', friendly: 'f' }, 'friendly')).toBe('f');
    expect(t({ crime: 'c' }, 'friendly')).toBe('c');
    expect(t({ crime: 'c', friendly: 'f' }, 'crime')).toBe('c');
  });

  it('labels a grid, with quotes removed and unknown ids kept', () => {
    const L = gridLabels(cf, ledger, 3, 'crime');
    expect(L.people).toEqual(['Ann', 'Bee Bo', 'zz']);
    expect(L.value(3)).toBe('$3k');
    const kid = gridLabels(cf, ledger, 2, 'friendly');
    expect(kid.people).toHaveLength(2);
    expect(kid.value(1)).toBe('1 coin');
    expect(kid.value(2)).toBe('2 coins');
    expect(gridLabels(cf, rooms, 3, 'crime').value(2)).toBe('Warehouse 9');
  });

  const cases: [Claim, string][] = [
    [{ kind: 'is', cell: [0, 0], value: 2 }, 'Ann moved $2k on Mon.'],
    [{ kind: 'is', cell: [1, 0], value: 2 }, 'Ann moved $2k in Jan.'],
    [{ kind: 'isNot', cell: [2, 1], value: 3 }, 'Bee Bo did not move $3k at 8pm.'],
    [{ kind: 'atLeast', cell: [1, 0], value: 2 }, 'Ann moved at least $2k in Jan.'],
    [{ kind: 'atMost', cell: [1, 0], value: 2 }, 'Ann moved no more than $2k in Jan.'],
    [{ kind: 'compare', a: [1, 0], b: [1, 1], op: 'gt' }, 'In Jan, Ann moved more than Bee Bo.'],
    [{ kind: 'compare', a: [1, 0], b: [1, 1], op: 'lt' }, 'In Jan, Ann moved less than Bee Bo.'],
    [{ kind: 'compare', a: [1, 0], b: [2, 0], op: 'gt' }, 'Ann moved more in Jan than at 8pm.'],
    [{ kind: 'compare', a: [1, 0], b: [2, 0], op: 'lt' }, 'Ann moved less in Jan than at 8pm.'],
    [{ kind: 'sum', cells: [[1, 0], [2, 0]], value: 4 }, "Ann's Jan and 8pm runs add up to $4k."],
    [{ kind: 'sum', cells: [[1, 0], [1, 1]], value: 4 }, 'In Jan, Ann and Bee Bo moved $4k between them.'],
  ];
  for (const [claim, text] of cases) it(`words a ${claim.kind} claim`, () => expect(describeClaim(claim, gridLabels(cf, ledger, 3, 'crime'), 'ledger')).toBe(text));

  const roomCases: [Claim, string][] = [
    [{ kind: 'is', cell: [1, 0], value: 2 }, 'Ann was in Warehouse 9 in Jan.'],
    [{ kind: 'is', cell: [1, 0], value: 3 }, 'Ann was in the Ice house in Jan.'],
    [{ kind: 'isNot', cell: [1, 0], value: 1 }, 'Ann was not in the Dock in Jan.'],
    [{ kind: 'compare', a: [1, 0], b: [1, 1], op: 'gt' }, 'In Jan, Ann was further along the pier than Bee Bo.'],
    [{ kind: 'compare', a: [1, 0], b: [1, 1], op: 'lt' }, 'In Jan, Ann was closer to the start of the pier than Bee Bo.'],
    [{ kind: 'compare', a: [1, 0], b: [2, 0], op: 'gt' }, 'Ann was further along the pier in Jan than at 8pm.'],
    [{ kind: 'compare', a: [1, 0], b: [2, 0], op: 'lt' }, 'Ann was closer to the start of the pier in Jan than at 8pm.'],
    [{ kind: 'adjacent', a: [1, 0], b: [1, 1] }, 'In Jan, Ann and Bee Bo were in rooms right next to each other.'],
    [{ kind: 'notAdjacent', a: [1, 0], b: [1, 1] }, 'In Jan, Ann and Bee Bo were not in neighbouring rooms.'],
  ];
  for (const [claim, text] of roomCases) it(`words a ${claim.kind} room claim`, () => expect(describeClaim(claim, gridLabels(cf, rooms, 3, 'crime'), 'surveillance')).toBe(text));
});

describe('small helpers', () => {
  it('compares cells', () => {
    expect(sameCell([1, 2], [1, 2])).toBe(true);
    expect(sameCell([1, 2], [2, 1])).toBe(false);
  });

  it('labels every trust state', () => {
    expect(Object.keys(TRUST_LABEL).sort()).toEqual(['caught', 'mistaken', 'refuses', 'suspicious', 'unknown', 'verified']);
  });

  it('maps the trust meter to a portrait expression', () => {
    expect(expressionFor('caught')).toBe('caught-lying');
    expect(expressionFor('suspicious')).toBe('suspicious');
    expect(expressionFor('refuses')).toBe('suspicious');
    expect(expressionFor('verified')).toBe('neutral');
    expect(expressionFor(undefined)).toBe('neutral');
  });

  it('finds portraits and figures, falling back to neutral and then nothing', () => {
    expect(Object.keys(FIGURES).length).toBeGreaterThan(0);
    expect(portraitOf('nobody', 'neutral', false)).toBeUndefined();
    expect(portraitOf('nobody', 'suspicious', true)).toBeUndefined();
    const known = Object.keys(FIGURES)[0];
    expect(typeof portraitOf(known, 'neutral', true) === 'string' || portraitOf(known, 'neutral', true) === undefined).toBe(true);
  });

  it('describes allies, initials, wrong cells and zone colouring', () => {
    expect(allyCost({ ability: 'undercover' } as never)).toBe(2);
    expect(allyCost({ ability: 'forensics' } as never)).toBe(1);
    for (const a of ['forensics', 'accountant', 'undercover', 'partner'] as const) expect(abilityLabel({ ability: a } as never)).toContain(':');
    expect(initials('Sgt. Devaraj Kumar')).toBe('DK');
    expect(liarLine([1, 2], 3, false)).toBe('1 or 2 of these statements are lies.');
    const p = { size: 2, solution: [[1, 2], [2, 1]], zones: [{ cells: [[0, 0], [0, 1]], sum: 3 }, { cells: [[1, 0], [1, 1]], sum: 3 }] } as never;
    expect(findWrong(p, [[1, 2], [0, 0]])).toBeNull();
    expect(findWrong(p, [[1, 2], [1, 0]])).toEqual([1, 0]);
    const { zm, colour } = zoneMap(p);
    expect(zm).toEqual([[0, 0], [1, 1]]);
    expect(colour[0]).not.toBe(colour[1]);
  });
});
