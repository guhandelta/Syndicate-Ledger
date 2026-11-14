import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VOICES, type CaseFile } from '../src/game/caseTypes';
import { aroundRect, bubblePaths, type BubbleShape } from '../src/ui/bubbleShape';
import { VOICE_STYLE, expressionFor, unquote, voiceFor } from '../src/ui/voices';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));

describe('dialogue voices', () => {
  it('gives every voice its own outline or colour, and a verb for screen readers', () => {
    const looks = new Set(VOICES.map((v) => `${VOICE_STYLE[v].shape}/${VOICE_STYLE[v].dashed ?? false}`));
    // whisper shares the round outline with speech but is dashed; every other voice has its own shape
    expect(looks.size).toBe(VOICES.length);
    for (const v of VOICES) expect(VOICE_STYLE[v].verb).toBeTruthy();
  });

  it('makes a caught liar sound like one, and a suspect sound shifty', () => {
    expect(voiceFor('calm', 'caught')).toBe('lying');
    expect(voiceFor(undefined, 'suspicious')).toBe('suspicious');
    expect(voiceFor('shout', 'suspicious')).toBe('shout');
    expect(voiceFor('whisper', 'unknown')).toBe('whisper');
    expect(expressionFor('caught')).toBe('caught-lying');
    expect(expressionFor('verified')).toBe('neutral');
  });

  it('drops quote marks the bubble already shows', () => {
    expect(unquote('"Give me one favor."')).toBe('Give me one favor.');
    expect(unquote('Tip shrugs. "Suit yourself!"')).toBe('Tip shrugs. "Suit yourself!"');
  });
});

describe('bubble outlines', () => {
  const shapes: BubbleShape[] = ['round', 'oval', 'cloud', 'burst', 'wobble', 'sharp', 'jagged'];

  it('draws a closed outline and a tail for every shape and size', () => {
    for (const shape of shapes)
      for (const [w, h] of [[120, 40], [420, 90], [60, 200]]) {
        const p = bubblePaths(shape, w, h, 'left');
        expect(p.body).toMatch(/^M.*Z$/);
        expect(p.body).not.toContain('NaN');
        expect(p.tail).not.toContain('NaN');
        expect(p.tail.length).toBeGreaterThan(0);
      }
  });

  it('puts the tail on the speaker side', () => {
    const xs = (d: string) => [...d.matchAll(/[ML](-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs(bubblePaths('round', 200, 60, 'left').tail))).toBeLessThan(0);
    expect(Math.max(...xs(bubblePaths('round', 200, 60, 'right').tail))).toBeGreaterThan(200);
    expect(bubblePaths('round', 200, 60, 'none').tail).toBe('');
  });

  it('walks a rounded rectangle evenly with outward normals', () => {
    const pts = aroundRect(0, 0, 100, 50, 10, 10);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(100.01);
      expect(Math.hypot(p.nx, p.ny)).toBeCloseTo(1);
    }
  });
});

describe('Case 1 dialogue', () => {
  it('has a greeting and a full set of portraits for everyone in the cast', () => {
    const files = new Set(readdirSync('src/ui/portraits/crime'));
    for (const c of cf.cast) {
      expect(c.greeting, c.id).toBeDefined();
      for (const e of ['neutral', 'suspicious', 'caught-lying']) expect(files.has(`${c.id}-${e}.webp`), `${c.id}-${e}`).toBe(true);
    }
  });
});
