import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CaseFile, GridBook } from '../src/game/caseTypes';
import { addFlag, newGame, solveLead } from '../src/game/state';
import { greetingFor, hearOpinion, heardAbout, meets, opinionsOf } from '../src/game/talk';
import { deliver, plainLine, wordDelay } from '../src/ui/delivery';
import { FACE_FALLBACK, portraitOf } from '../src/ui/portraits';
import { book } from './caseBook';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const person = (id: string) => cf.cast.find((c) => c.id === id)!;
const game = (character?: string) => newGame(cf, book, 'detective', character);

/** Marks a lead solved without playing it, enough for conditions that only look at "solved". */
function solved(g: ReturnType<typeof game>, id: string) {
  g.s.leads[id].started = true;
  g.s.leads[id].solved = true;
}

describe('rank conditions and the changed greetings', () => {
  it('a rank condition holds only at those ranks', () => {
    const g = game();
    expect(meets(g, { rank: ['detective', 'chief'] })).toBe(true);
    expect(meets(g, { rank: ['junior'] })).toBe(false);
  });

  it('Tip, Vex, Meena and Kane greet differently once the Junior part is behind the player', () => {
    for (const id of ['tip', 'vex', 'meena', 'kane']) {
      const detective = greetingFor(game(), person(id))!;
      const junior = greetingFor(newGame(cf, book, 'junior'), person(id))!;
      expect(detective.when?.rank).toEqual(['detective']);
      expect(junior.when?.rank).toBeUndefined();
    }
  });
});

describe('conditions on lines', () => {
  it('no condition always holds, and every listed part must hold', () => {
    const g = game();
    expect(meets(g, undefined)).toBe(true);
    expect(meets(g, {})).toBe(true);
    expect(meets(g, { solved: ['L1'] })).toBe(false);
    expect(meets(g, { unsolved: ['L1'] })).toBe(true);
    solved(g, 'L1');
    expect(meets(g, { solved: ['L1'], unsolved: ['L2'] })).toBe(true);
    expect(meets(g, { unsolved: ['L1'] })).toBe(false);
    expect(meets(g, { solved: ['nope'] })).toBe(false);
  });

  it('reads flags, accusations, who was caught lying, and the character played', () => {
    const g = game('cole');
    expect(meets(g, { flags: ['tip-trap'] })).toBe(false);
    expect(meets(g, { notFlags: ['tip-trap'] })).toBe(true);
    addFlag(g, 'tip-trap');
    expect(meets(g, { flags: ['tip-trap'] })).toBe(true);
    expect(meets(g, { notFlags: ['tip-trap'] })).toBe(false);

    expect(meets(g, { accused: ['kane'] })).toBe(false);
    expect(meets(g, { notAccused: ['kane'] })).toBe(true);
    g.s.accuseLog = [{ person: 'kane', ok: false }];
    expect(meets(g, { accused: ['kane'] })).toBe(true);
    expect(meets(g, { notAccused: ['kane'] })).toBe(false);
    const g2 = game();
    g2.s.accused = 'crane';
    expect(meets(g2, { accused: ['crane'] })).toBe(true);

    expect(meets(g, { character: ['cole'] })).toBe(true);
    expect(meets(g, { character: ['detective'] })).toBe(false);
    expect(meets(game(), { character: ['detective'] })).toBe(true);

    expect(meets(g, { caught: ['vex'] })).toBe(false);
  });

  it('a liar is caught once the lead that shows the lie is solved', () => {
    const g = newGame(cf, book, 'inspector');
    const p = book['L2:inspector'];
    const lp = g.s.leads.L2;
    lp.started = true;
    lp.grid = p.solution.map((r) => r.slice());
    lp.marks = p.truth.map((t) => (t ? 'true' : 'lie'));
    solveLead(g, 'L2');
    expect(meets(g, { caught: ['vex'] })).toBe(true);
  });
});

describe('greetings and opinions', () => {
  it('a greeting that holds wins over the usual one', () => {
    const g = newGame(cf, book, 'inspector');
    const tip = person('tip');
    expect(greetingFor(g, tip)).toBe(tip.greeting);
    addFlag(g, 'tip-trap');
    expect(greetingFor(g, tip)?.when?.flags).toEqual(['tip-trap']);
    expect(greetingFor(g, person('kavya'))).toBe(person('kavya').greeting);
    expect(greetingFor(g, { ...tip, greetings: undefined, greeting: undefined })).toBeUndefined();
    expect(greetingFor(g, { ...tip, greetings: undefined, greeting: { text: 'x', when: { solved: ['L4'] } } })).toBeUndefined();
  });

  it('gives one opinion per person, the first that holds, and changes with what happened', () => {
    const g = game();
    const crane = person('crane');
    const tipOnCrane = () => opinionsOf(g, person('tip')).find((o) => o.about === 'crane')!;
    expect(tipOnCrane().face).toBe('smug');
    addFlag(g, 'tip-exposed');
    expect(tipOnCrane().face).toBe('scared');
    expect(opinionsOf(g, crane).filter((o) => o.about === 'tip')).toHaveLength(1);
    expect(opinionsOf(g, person('kavya'))).toEqual([]);
  });

  it('remembers what was heard, once, and the notebook shows it as it stands now', () => {
    const g = game();
    expect(heardAbout(g, 'crane')).toEqual([]);
    hearOpinion(g, 'tip', 'crane');
    hearOpinion(g, 'tip', 'crane');
    hearOpinion(g, 'nevethitha', 'crane');
    expect(g.s.heard).toEqual(['tip:crane', 'nevethitha:crane']);
    expect(heardAbout(g, 'crane').map((h) => h.speaker.id)).toEqual(['nevethitha', 'tip']);
    addFlag(g, 'tip-exposed');
    expect(heardAbout(g, 'crane').find((h) => h.speaker.id === 'tip')!.opinion.face).toBe('scared');
    // an opinion that no longer holds drops out
    g.s.heard!.push('crane:tip');
    expect(heardAbout(g, 'tip').map((h) => h.speaker.id)).toEqual(['crane']);
    const g2 = game();
    g2.s.heard = ['crane:nobody'];
    expect(heardAbout(g2, 'nobody')).toEqual([]);
  });
});

describe('spoken lines', () => {
  it('splits a line into words, with stressed words and pauses', () => {
    expect(deliver('I *told* you... I   carry *boxes*!')).toEqual([
      { text: 'I', stress: false, pause: false },
      { text: 'told', stress: true, pause: false },
      { text: 'you...', stress: false, pause: true },
      { text: 'I', stress: false, pause: false },
      { text: 'carry', stress: false, pause: false },
      { text: 'boxes!', stress: true, pause: false },
    ]);
    expect(deliver('')).toEqual([]);
    expect(plainLine('I *told* you')).toBe('I told you');
  });

  it('waits longer after a pause or a full stop', () => {
    expect(wordDelay({ text: 'well...', stress: false, pause: true })).toBeGreaterThan(wordDelay({ text: 'done.', stress: false, pause: false }));
    expect(wordDelay({ text: 'done.', stress: false, pause: false })).toBeGreaterThan(wordDelay({ text: 'word', stress: false, pause: false }));
  });
});

describe('faces', () => {
  it('falls back to the nearest face, then to initials', () => {
    expect(portraitOf('crane', 'smug', false)).toBeTruthy();
    expect(portraitOf('crane', 'scared', true)).toBeTruthy();
    expect(portraitOf('nobody', 'nervous', false)).toBeUndefined();
    for (const [face, next] of Object.entries(FACE_FALLBACK)) if (next) expect(next).not.toBe(face);
  });
});
