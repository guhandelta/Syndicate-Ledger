import type { Voice } from '../game/caseTypes';
import type { Trust } from '../game/state';
import type { BubbleShape } from './bubbleShape';

export type Expression = 'neutral' | 'suspicious' | 'caught-lying';

export interface VoiceStyle {
  /** Outline drawn around the bubble. */
  shape: BubbleShape;
  /** Bubble fill and outline colours, and the text colour. */
  fill: string;
  outline: string;
  ink: string;
  /** Outline thickness in pixels. */
  stroke: number;
  /** Dashed outline, for a voice that barely carries. */
  dashed?: boolean;
  /** Portrait to show with it. Left out, the portrait follows what the player knows of the speaker. */
  expression?: Expression;
  /** Read out before the line by screen readers, since the outline is visual only ("Tip whispers: ..."). */
  verb: string;
}

/**
 * The one place that says how each voice looks. Every voice differs in outline shape as well as colour,
 * so it reads for colourblind players too.
 */
export const VOICE_STYLE: Record<Voice, VoiceStyle> = {
  speech: { shape: 'round', fill: '#fbf7ec', outline: '#2a2418', ink: '#2a2418', stroke: 2.5, verb: 'says' },
  calm: { shape: 'oval', fill: '#e2edf8', outline: '#3d6a96', ink: '#1d3047', stroke: 2, verb: 'says calmly' },
  thought: { shape: 'cloud', fill: '#f1eefb', outline: '#6a5a9c', ink: '#2e2547', stroke: 2.5, verb: 'thinks' },
  shout: { shape: 'burst', fill: '#ffe45c', outline: '#b3261e', ink: '#3a0d0a', stroke: 3, verb: 'shouts' },
  whisper: { shape: 'round', fill: '#e8e9ee', outline: '#6b7180', ink: '#3b3f4a', stroke: 2, dashed: true, verb: 'whispers' },
  nervous: { shape: 'wobble', fill: '#e6f2dc', outline: '#4f7a3a', ink: '#22331a', stroke: 2.5, verb: 'says nervously' },
  suspicious: { shape: 'sharp', fill: '#f7e1b5', outline: '#9a6512', ink: '#3a2606', stroke: 2.5, expression: 'suspicious', verb: 'says, sounding shifty' },
  lying: { shape: 'jagged', fill: '#f9d3cf', outline: '#b3261e', ink: '#45100b', stroke: 3, expression: 'caught-lying', verb: 'lies' },
};

/** Portrait expression from the trust meter, when the line itself doesn't set one. */
export function expressionFor(trust: Trust | undefined): Expression {
  return trust === 'caught' ? 'caught-lying' : trust === 'suspicious' || trust === 'refuses' ? 'suspicious' : 'neutral';
}

/**
 * The voice a person's line is drawn in, given what the player knows: a caught liar always sounds like one,
 * and someone the player suspects sounds shifty unless they are shouting or whispering it.
 */
export function voiceFor(said: Voice | undefined, trust: Trust | undefined): Voice {
  if (trust === 'caught') return 'lying';
  const v = said ?? 'speech';
  if (trust === 'suspicious' && (v === 'speech' || v === 'calm')) return 'suspicious';
  return v;
}

/** Bubbles draw their own outline, so quote marks around a line are dropped. */
export function unquote(s: string): string {
  const t = s.trim();
  return /^["“].*["”]$/s.test(t) ? t.slice(1, -1) : t;
}
