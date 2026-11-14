import type { Expression } from './voices';

/**
 * Face shots for the dialogue bubbles, cropped from assets/ by scripts/make-portraits.py.
 * Keyed by "<tone>/<cast id>-<expression>". Junior (friendly) uses its own art where it has it.
 */
const files = import.meta.glob<string>('./portraits/*/*.webp', { eager: true, query: '?url', import: 'default' });

const PORTRAITS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/portraits\/(\w+)\/(.+)\.webp$/, '$1/$2'), url]),
);

/** The best portrait there is for this person and expression, or undefined to fall back to initials. */
export function portraitOf(castId: string, expression: Expression, friendly: boolean): string | undefined {
  const tones = friendly ? ['friendly', 'crime'] : ['crime'];
  for (const tone of tones) {
    const src = PORTRAITS[`${tone}/${castId}-${expression}`];
    if (src) return src;
  }
  return expression === 'neutral' ? undefined : portraitOf(castId, 'neutral', friendly);
}
