import type { Expression } from '../ui/voices';
import type { Rig } from './figure3d';

/**
 * The 3D people made by scripts/make-figures.py, keyed by cast id. A cast member with no entry here
 * still stands in the town as a flat picture.
 */
const rigs = import.meta.glob<Rig>('./cast3d/*.json', { eager: true, import: 'default' });
const atlases = import.meta.glob<string>('./cast3d/*.webp', { eager: true, query: '?url', import: 'default' });
const glbs = import.meta.glob<string>('./cast3d/*.glb', { eager: true, query: '?url', import: 'default' });
const faces = import.meta.glob<string>('./cast3d/faces/*/*.webp', { eager: true, query: '?url', import: 'default' });

const idOf = (path: string) => path.replace(/^.*\/(.+)\.(json|webp)$/, '$1');

export interface Cast3D {
  rig: Rig;
  atlas: string;
  /** A finished 3D model, when the person has one: it is used instead of the figure built from the body pictures. */
  glb?: string;
}

export const CAST3D: Record<string, Cast3D> = Object.fromEntries(
  Object.entries(rigs)
    .map(([path, rig]) => [idOf(path), rig] as const)
    .filter(([id]) => atlases[`./cast3d/${id}.webp`])
    .map(([id, rig]) => [id, { rig, atlas: atlases[`./cast3d/${id}.webp`], glb: glbs[`./cast3d/${id}.glb`] }]),
);

/** The nearest face to use while a newer face's art doesn't exist yet (the same order as the dialogue portraits). */
const NEXT: Partial<Record<Expression, Expression>> = {
  suspicious: 'neutral',
  'caught-lying': 'suspicious',
  nervous: 'suspicious',
  angry: 'suspicious',
  scared: 'suspicious',
  smug: 'neutral',
};

/** The expression face to put on a 3D head, or undefined when there is none. Junior uses its own faces where it has them. */
export function faceOf(castId: string, expression: Expression, friendly: boolean): string | undefined {
  for (const tone of friendly ? ['friendly', 'crime'] : ['crime']) {
    const url = faces[`./cast3d/faces/${tone}/${castId}-${expression}.webp`];
    if (url) return url;
  }
  const next = NEXT[expression];
  return next ? faceOf(castId, next, friendly) : undefined;
}
