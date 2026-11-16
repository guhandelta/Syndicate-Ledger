import type { Expression } from './voices';

/**
 * Face shots for the dialogue bubbles, cropped from assets/ by scripts/make-portraits.py.
 * Keyed by "<tone>/<cast id>-<expression>". Junior (friendly) uses its own art where it has it.
 */
const files = import.meta.glob<string>('./portraits/*/*.webp', { eager: true, query: '?url', import: 'default' });

const PORTRAITS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/portraits\/(\w+)\/(.+)\.webp$/, '$1/$2'), url]),
);

/** The nearest face to use while a newer face's art doesn't exist yet. */
export const FACE_FALLBACK: Record<Expression, Expression | undefined> = {
  neutral: undefined,
  suspicious: 'neutral',
  'caught-lying': 'suspicious',
  nervous: 'suspicious',
  angry: 'suspicious',
  scared: 'suspicious',
  smug: 'neutral',
};

/** The best portrait there is for this person and expression, or undefined to fall back to initials. */
export function portraitOf(castId: string, expression: Expression, friendly: boolean): string | undefined {
  const tones = friendly ? ['friendly', 'crime'] : ['crime'];
  for (const tone of tones) {
    const src = PORTRAITS[`${tone}/${castId}-${expression}`];
    if (src) return src;
  }
  const next = FACE_FALLBACK[expression];
  return next ? portraitOf(castId, next, friendly) : undefined;
}
