import type { Building, BuildingStyle, Vec2 } from './townTypes';

/** One solid piece of a building or of the sea line, in metres. Colours are 0xRRGGBB. The scene turns each into a mesh. */
export interface Part {
  /**
   * box: size is [x, y, z]. hip: a four-sided roof over [x, y, z]. gable: a ridge along x, size [length, height, width].
   * dome: half a ball of radius size[0]. cyl: radius size[0], height size[1]. ball: a ball of radius size[0], squashed to
   * size[1] high when that is given. ring: a hoop of radius size[0] and thickness size[1], standing up and facing south.
   * panel: a flat picture size[0] wide and size[1] high, facing south, painted with `tex`; tilt lays it back about its middle.
   */
  shape: 'box' | 'hip' | 'gable' | 'dome' | 'cyl' | 'ball' | 'ring' | 'panel';
  /** The middle of the bottom of the piece, relative to the middle of the building's footprint on the ground. */
  at: [number, number, number];
  size: [number, number, number];
  color: number;
  /** Lit like a window: it glows at dusk. */
  glow?: boolean;
  /** Turned about its own middle, in radians: tilt leans its south end down, turn swings it round (as a heading). */
  tilt?: number;
  turn?: number;
  /** A panel's picture (an image URL), and how its edge is drawn: cut away round a shape, or faded. */
  tex?: string;
  edge?: 'hard' | 'soft' | 'cut';
  /** A panel seen from both faces (an awning from under it, a hanging sign from behind). */
  twoSided?: boolean;
  /** How warm a glowing panel lights up at dusk: a dim tint for a whole pictured wall, full lamp light when left out. */
  glowTint?: number;
  /** Moves by itself: a wheel that spins on its axle, or a flag that flaps. */
  anim?: 'spin' | 'flap';
}

/** The colours each style trims itself in when the town file gives none: cornices, pillars, awnings. */
export const STYLE_TRIM: Record<BuildingStyle, number> = {
  plain: 0x2a2418,
  madras: 0x7a2e24,
  bungalow: 0xf1ead8,
  mill: 0x3b2a24,
  shed: 0x8a9096,
};

const num = (hex: string) => parseInt(hex.replace('#', ''), 16);

/**
 * The pieces of one building in the look of its style, from the streets of Chennai and Coimbatore:
 * madras (Indo-Saracenic office: flat roof, parapet, cornice, pillars, small domes on the corners),
 * bungalow (whitewashed house with a tiled roof and a pillared veranda),
 * mill (Coimbatore mill: brick, a saw-tooth roof and a chimney), shed (harbour shed with a corrugated roof),
 * plain (the old box with a hip roof). The door, windows and sign are the scene's own.
 */
export function buildingParts(b: Building): Part[] {
  const [w, d] = b.size;
  const h = b.height;
  const wall = num(b.color);
  const roof = num(b.roof);
  const style = b.style ?? 'plain';
  const trim = b.trim ? num(b.trim) : STYLE_TRIM[style];
  // the door side: +1 puts the front toward +z
  const f = b.doorSide === 'south' ? 1 : -1;
  const body: Part = { shape: 'box', at: [0, 0, 0], size: [w, h, d], color: wall };

  if (style === 'madras') {
    const cap = 0.35;
    const parts: Part[] = [
      body,
      // flat roof slab with a parapet all round
      { shape: 'box', at: [0, h, 0], size: [w + 0.3, 0.25, d + 0.3], color: roof },
      { shape: 'box', at: [0, h + 0.25, (d / 2) * f], size: [w + 0.3, 0.45, 0.25], color: trim },
      { shape: 'box', at: [0, h + 0.25, -(d / 2) * f], size: [w + 0.3, 0.45, 0.25], color: trim },
      { shape: 'box', at: [-w / 2, h + 0.25, 0], size: [0.25, 0.45, d + 0.3], color: trim },
      { shape: 'box', at: [w / 2, h + 0.25, 0], size: [0.25, 0.45, d + 0.3], color: trim },
      // cornice band under the roof and a plinth at the foot
      { shape: 'box', at: [0, h - 0.5, 0], size: [w + 0.5, 0.3, d + 0.5], color: trim },
      { shape: 'box', at: [0, 0, 0], size: [w + 0.3, 0.5, d + 0.3], color: trim },
      // a tall central dome over the entrance
      { shape: 'cyl', at: [0, h + 0.25, (d / 4) * f], size: [1.1, 0.7, 0], color: wall },
      { shape: 'dome', at: [0, h + 0.95, (d / 4) * f], size: [1.2, 0, 0], color: roof },
    ];
    // pilasters between the windows on the front, and a small dome on each front corner
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2, 0]) {
      parts.push({ shape: 'box', at: [x, 0.5, (d / 2) * f], size: [0.4, h - 1, 0.2], color: trim });
    }
    for (const x of [-w / 2 + 0.5, w / 2 - 0.5]) {
      parts.push({ shape: 'cyl', at: [x, h + 0.25, (d / 2 - 0.5) * f], size: [0.35, 0.8, 0], color: trim });
      parts.push({ shape: 'dome', at: [x, h + 1.05, (d / 2 - 0.5) * f], size: [0.45, 0, 0], color: roof });
    }
    return parts;
  }

  if (style === 'bungalow') {
    const parts: Part[] = [body, { shape: 'hip', at: [0, h, 0], size: [w + 0.8, 1.5, d + 0.8], color: roof }];
    // a veranda along the front: a low floor, a slab roof on pillars
    const porch = 0.9;
    const frontZ = (d / 2 + porch / 2) * f;
    parts.push({ shape: 'box', at: [0, 0, frontZ], size: [w + 0.4, 0.2, porch], color: trim });
    parts.push({ shape: 'box', at: [0, 2.7, frontZ], size: [w + 0.6, 0.18, porch + 0.2], color: roof });
    const n = Math.max(3, Math.round(w / 2.2));
    for (let i = 0; i <= n; i++) {
      parts.push({ shape: 'box', at: [-w / 2 + 0.2 + ((w - 0.4) * i) / n, 0.2, (d / 2 + porch - 0.15) * f], size: [0.22, 2.5, 0.22], color: trim });
    }
    // a plinth line and a chimney-like water tank on the ridge
    parts.push({ shape: 'box', at: [0, 0, 0], size: [w + 0.1, 0.4, d + 0.1], color: trim });
    return parts;
  }

  if (style === 'mill') {
    // saw-tooth roof: a row of gables with their steep faces turned the same way
    const teeth = Math.max(2, Math.round(d / 2.4));
    const toothDepth = d / teeth;
    const parts: Part[] = [body];
    for (let i = 0; i < teeth; i++) {
      const z = -d / 2 + toothDepth * (i + 0.5);
      parts.push({ shape: 'gable', at: [0, h, z], size: [w, 1.5, toothDepth], color: roof });
      // the glazed face of each tooth lets the light in
      parts.push({ shape: 'box', at: [0, h + 0.2, z - toothDepth * 0.3], size: [w - 0.8, 0.8, 0.08], color: 0x2a2418, glow: true });
    }
    // a brick chimney at the back corner, with a band at the top
    const cx = w / 2 - 0.9;
    const cz = -(d / 2 - 0.9) * f;
    parts.push({ shape: 'cyl', at: [cx, h, cz], size: [0.55, 4.2, 0], color: trim });
    parts.push({ shape: 'cyl', at: [cx, h + 4.2, cz], size: [0.7, 0.35, 0], color: wall });
    // buttresses along the front
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) parts.push({ shape: 'box', at: [x, 0, 0], size: [0.3, h - 0.6, d + 0.2], color: trim });
    return parts;
  }

  if (style === 'shed') {
    const parts: Part[] = [body, { shape: 'gable', at: [0, h, 0], size: [w + 0.6, 1.3, d + 0.6], color: roof }];
    // a wide sliding door rail and a loading canopy over the front
    parts.push({ shape: 'box', at: [0, 3.4, (d / 2 + 0.7) * f], size: [Math.min(w - 0.6, 5), 0.14, 1.4], color: trim });
    // vertical ribs of corrugated sheet
    const ribs = Math.max(2, Math.floor(w / 1.2));
    for (let i = 1; i < ribs; i++) {
      parts.push({ shape: 'box', at: [-w / 2 + (w * i) / ribs, 0, (d / 2) * f], size: [0.08, h, 0.1], color: trim });
    }
    return parts;
  }

  // plain: the old box with a low hip roof
  return [body, { shape: 'hip', at: [0, h, 0], size: [w + 0.8, 1.5, d + 0.8], color: roof }];
}

/** A far-off thing on the sea. Positions are on the water plane; z is the sea going away from the quay. */
export interface SeaThing {
  kind: 'lighthouse' | 'ship' | 'buoy' | 'breakwater';
  at: Vec2;
  /** How big: ships are scaled by this. */
  scale: number;
  /** A little offset so nothing bobs in step. */
  phase: number;
}

/**
 * The sea line beyond the quay: a breakwater with a lighthouse, a few ships standing off the harbour and buoys marking the channel.
 * Everything comes from the town's bounds and waterline, so every player sees the same sea.
 */
export function seaLine(bounds: [number, number, number, number], waterline: number): SeaThing[] {
  const [minX, , maxX] = bounds;
  const span = maxX - minX;
  const at = (fx: number, away: number): Vec2 => [minX + span * fx, waterline - away];
  return [
    { kind: 'breakwater', at: at(0.86, 26), scale: 1, phase: 0 },
    { kind: 'lighthouse', at: at(0.86, 26), scale: 1, phase: 0 },
    { kind: 'ship', at: at(0.15, 44), scale: 1.3, phase: 0.8 },
    { kind: 'ship', at: at(0.5, 62), scale: 1.9, phase: 2.1 },
    { kind: 'ship', at: at(0.72, 38), scale: 0.8, phase: 4.2 },
    { kind: 'buoy', at: at(0.3, 14), scale: 1, phase: 1.3 },
    { kind: 'buoy', at: at(0.62, 17), scale: 1, phase: 3.4 },
    { kind: 'buoy', at: at(0.95, 12), scale: 1, phase: 5.2 },
  ];
}
