/** Standing figure for each cast member, keyed by cast id (file name without extension). */
const files = import.meta.glob<string>('./art/*.webp', { eager: true, query: '?url', import: 'default' });

export const FIGURES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/(.+)\.webp$/, '$1'), url]),
);
