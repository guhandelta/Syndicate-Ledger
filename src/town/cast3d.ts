import type { Expression } from '../ui/voices';
import type { Rig } from './figure3d';
import type { FaceBox, Features, Reach } from './glbFigure';

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
  /** How that model differs from the body pictures, where it does: laid over the rig's values when the model is built. */
  fit: GlbFit;
}

/** Where a finished 3D model's face and features are (in metres on the person, as a rig's face box), and how its hair is painted. */
export interface GlbFit {
  face?: FaceBox;
  features?: Features;
  /** How far the hair swings, compared with usual (1). */
  hairSwing?: number;
  /** How far each movement of the face goes, compared with usual (1). */
  reach?: Reach;
}

const FITS: Record<string, GlbFit> = {
  // her model looks straight ahead with the face a little to her left of the middle, and a wide smile that sits higher
  // than on the body pictures
  thenmozhi: {
    face: { x0: -0.0321, x1: 0.1187, y0: 1.332, y1: 1.5433 },
    features: {
      browL: [0.756, 0.619],
      browR: [0.247, 0.632],
      innerL: [0.642, 0.603],
      innerR: [0.397, 0.609],
      eyeL: [0.718, 0.516],
      eyeR: [0.275, 0.529],
      mouthL: [0.699, 0.234],
      mouthR: [0.266, 0.241],
      lip: [0.492, 0.173],
      cheekL: [0.774, 0.355],
    },
    // her long hair is a thin shell lying right on the cardigan: a full swing opens gaps the cardigan shows through
    hairSwing: 0.35,
    // her glasses sit over her eyes and just under her brows: the lids stay still and the brows move a third as far,
    // so the frames keep their shape; the mouth shows the feeling
    reach: { lidClose: 0, lidWide: 0, browDown: 0.3, browUp: 0.3, browInnerUp: 0.3, browInnerDown: 0.3 },
  },
};

export const CAST3D: Record<string, Cast3D> = Object.fromEntries(
  Object.entries(rigs)
    .map(([path, rig]) => [idOf(path), rig] as const)
    .filter(([id]) => atlases[`./cast3d/${id}.webp`])
    .map(([id, rig]) => [id, { rig, atlas: atlases[`./cast3d/${id}.webp`], glb: glbs[`./cast3d/${id}.glb`], fit: FITS[id] ?? {} }]),
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
