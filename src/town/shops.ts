import type { Part } from './buildingStyles';
import type { Building, Trade, Vec2 } from './townTypes';
import type { Action, OutfitId } from './workerActions';

/**
 * Port Calder's shops, built from Guha's sheets of each shop seen from all four sides (assets/shops, cut up by
 * scripts/make-shop-art.py). Each wall is that side's picture, cut round its outline and laid on a solid body; the roof,
 * awning, hanging sign, chimney and the things standing outside are 3D pieces in the picture's colours. Each shop has
 * someone at work outside.
 */

/** One wall as the sheet draws it: width and height in metres, and how high its roof line is at its two ends. */
export interface WallFacts {
  w: number;
  h: number;
  left: number;
  right: number;
}

/** A thing on the front wall: x from the wall's middle, y up from the ground to its bottom edge, its width and height. */
export interface FrontBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What scripts/make-shop-art.py read from a shop's sheet. Sizes are metres. */
export interface ShopFacts {
  trade: Trade;
  name: string;
  picture: string;
  width: number;
  depth: number;
  walls: Record<Side, WallFacts>;
  colours: { wall: string; roof: string; trim: string };
  door: { x: number; w: number };
  roof:
    | { kind: 'flat'; height: number }
    | { kind: 'shed'; front: number; back: number }
    | { kind: 'gable'; eave: number; ridge: number; front: { w: number; x: number }; back: { w: number; x: number } };
  awning?: FrontBox;
  sign?: FrontBox;
  chimney?: { x: number; z: number; w: number; top: number; colour: string };
  flag?: { x: number; z: number; top: number };
}

export const SIDES = ['front', 'east', 'back', 'west'] as const;
export type Side = (typeof SIDES)[number];

const factFiles = import.meta.glob<ShopFacts>('./shops/*.json', { eager: true, import: 'default' });
const pictureFiles = import.meta.glob<string>('./shops/*.webp', { eager: true, query: '?url', import: 'default' });

/** Every shop's facts, by trade. */
export const SHOPS: Partial<Record<Trade, ShopFacts>> = Object.fromEntries(Object.values(factFiles).map((f) => [f.trade, f]));

/** The URL of one picture cut from a shop's sheet: a wall (front, east, back, west), roof-front, roof-back, awning or sign. */
export const pieceUrl = (trade: Trade, id: string): string | undefined => pictureFiles[`./shops/${trade}-${id}.webp`];

/** Someone at work outside a shop. They are scenery: no name, no talk, but the detective can't walk through them. */
export interface WorkerSpot {
  action: Action;
  outfit: OutfitId;
  /** Where they stand (or sit) in the town, and which way they face: 0 faces south, π/2 east. */
  at: Vec2;
  heading: number;
}

const num = (hex: string) => parseInt(hex.replace('#', ''), 16);

/**
 * Turns a spot given in front space (x along the front from the middle, z out from the front wall, heading 0 facing
 * away from the wall) into town space. A shop whose door is on the north turns everything round.
 */
function placer(b: Building) {
  const f = b.doorSide === 'south' ? 1 : -1;
  const d = b.size[1];
  return {
    at: (x: number, z: number): Vec2 => [b.at[0] + x * f, b.at[1] + (d / 2 + z) * f],
    heading: (h: number) => (f > 0 ? h : h + Math.PI),
    /** A part's position relative to the building's middle, turned the same way. */
    part: (p: Part): Part => (f > 0 ? p : { ...p, at: [-p.at[0], p.at[1], -p.at[2]], turn: (p.turn ?? 0) + Math.PI }),
  };
}

/** How high the front wall stands where the name board goes: the eaves of a pitched roof, else the lower end of the wall's top. */
export function frontTop(b: Building, facts: ShopFacts): number {
  const k = b.size[0] / facts.width;
  return (facts.roof.kind === 'gable' ? facts.roof.eave : Math.min(facts.walls.front.left, facts.walls.front.right)) * k;
}

/**
 * A slope laid as a picture: its outer, lower edge at (x, y, z) on the front, running `run` back toward the middle
 * while it climbs `rise`. Used for roof slopes and awnings, which the sheets draw head on.
 */
function slope(x: number, y: number, z: number, w: number, run: number, rise: number, tex: string | undefined, extra: Partial<Part> = {}): Part {
  const len = Math.hypot(run, rise);
  const lean = Math.atan2(run, rise);
  return { shape: 'panel', at: [x, y + rise / 2 - len / 2, z - run / 2], size: [w, len, 0], color: 0xffffff, tex, edge: 'cut', tilt: -lean, ...extra };
}

/** The shell of a shop: body, its four pictured walls, roof, chimney, awning and hanging sign, facing the door side. */
export function shopParts(b: Building, facts: ShopFacts, url: (id: string) => string | undefined = (id) => pieceUrl(facts.trade, id)): Part[] {
  const place = placer(b);
  const [w, d] = b.size;
  // the town may stretch a shop a little; heights follow its width
  const k = w / facts.width;
  const wall = num(facts.colours.wall);
  const roofColour = num(facts.colours.roof);
  const trim = num(b.trim ?? facts.colours.trim);
  const roof = facts.roof;
  const body = (roof.kind === 'gable' ? roof.eave : roof.kind === 'shed' ? Math.min(roof.front, roof.back) : roof.height) * k - 0.08;
  const parts: Part[] = [{ shape: 'box', at: [0, 0, 0], size: [w, body, d], color: wall }];
  // the four walls; each picture covers its wall corner to corner, so they meet at the corners
  const out = 0.02;
  const wallAt: Record<Side, { at: [number, number, number]; span: number; turn: number }> = {
    front: { at: [0, 0, d / 2 + out], span: w, turn: 0 },
    east: { at: [w / 2 + out, 0, 0], span: d, turn: Math.PI / 2 },
    back: { at: [0, 0, -d / 2 - out], span: w, turn: Math.PI },
    west: { at: [-w / 2 - out, 0, 0], span: d, turn: -Math.PI / 2 },
  };
  for (const side of SIDES) {
    const tex = url(side);
    if (!tex) continue;
    const { at, span, turn } = wallAt[side];
    parts.push({ shape: 'panel', at, size: [span, facts.walls[side].h * k, 0], color: 0xffffff, tex, edge: 'cut', glow: true, glowTint: 0x8a7a60, turn });
  }
  if (roof.kind === 'flat') {
    parts.push({ shape: 'box', at: [0, roof.height * k - 0.14, 0], size: [w - 0.02, 0.1, d - 0.02], color: roofColour });
  } else if (roof.kind === 'shed') {
    // one slope from the front wall's top to the back wall's
    const hf = roof.front * k;
    const hb = roof.back * k;
    const run = d + 0.3;
    parts.push({ shape: 'box', at: [0, (hf + hb) / 2 - 0.1, 0], size: [w + 0.3, 0.12, Math.hypot(run, hf - hb)], color: roofColour, tilt: Math.atan2(hb - hf, run) });
  } else {
    const eave = roof.eave * k;
    const ridge = roof.ridge * k;
    // a solid core under the slopes, so the roof never shows daylight through
    parts.push({ shape: 'gable', at: [0, eave - 0.08, 0], size: [w - 0.04, ridge - eave, d - 0.04], color: wall });
    const over = 0.3;
    for (const [s, sign] of [['front', 1], ['back', -1]] as const) {
      const r = roof[s];
      const tex = url(`roof-${s}`);
      if (!tex) continue;
      const p = slope(r.x * k * sign, eave - 0.06, (d / 2 + over) * sign, r.w * k, d / 2 + over, ridge - eave + 0.1, tex);
      if (sign < 0) {
        p.at = [p.at[0], p.at[1], -p.at[2]];
        p.turn = Math.PI;
      }
      parts.push(p);
    }
  }
  if (facts.chimney) {
    const c = facts.chimney;
    const base = (roof.kind === 'gable' ? roof.eave : roof.kind === 'shed' ? Math.min(roof.front, roof.back) : roof.height) * k - 0.2;
    const cw = c.w * k;
    const z = Math.max(-d / 2 + cw / 2, Math.min(d / 2 - cw / 2, c.z * (d / facts.depth)));
    parts.push({ shape: 'box', at: [c.x * k, base, z], size: [cw, c.top * k - base, cw], color: num(c.colour) });
    parts.push({ shape: 'box', at: [c.x * k, c.top * k, z], size: [cw + 0.12, 0.12, cw + 0.12], color: 0x5a524c });
  }
  const awning = url('awning');
  if (facts.awning && awning) {
    // the awning slopes out from the wall at the height the front picture has it
    const a = facts.awning;
    const top = (a.y + a.h) * k;
    const drop = Math.max(0.4, a.h * k);
    const outward = 1.15;
    parts.push(slope(a.x * k, top - drop, d / 2 + outward, a.w * k, outward, drop, awning, { twoSided: true }));
    // a thin iron bracket under each end
    for (const x of [a.x * k - (a.w * k) / 2 + 0.12, a.x * k + (a.w * k) / 2 - 0.12]) {
      parts.push({ shape: 'box', at: [x, top - drop - 0.35, d / 2 + outward * 0.45], size: [0.05, 0.05, Math.hypot(outward * 0.9, 0.5)], color: 0x2a2826, tilt: -Math.atan2(0.5, outward * 0.9) });
    }
  }
  if (facts.sign) {
    const s = facts.sign;
    const tex = url('sign');
    if (tex) {
      const x = s.x * k;
      const y = s.y * k;
      const sw = s.w * k;
      const sh = s.h * k;
      parts.push({ shape: 'panel', at: [x, y, d / 2 + 0.45], size: [sw, sh, 0], color: 0xffffff, tex, edge: 'cut', twoSided: true });
      // a timber arm out from the corner of the wall, holding the sign
      const fromX = Math.max(-w / 2, Math.min(w / 2, x));
      parts.push({ shape: 'box', at: [(fromX + x) / 2, y + sh + 0.02, d / 2 + 0.45], size: [Math.abs(x - fromX) + sw / 2, 0.07, 0.07], color: trim });
      parts.push({ shape: 'box', at: [fromX, y + sh + 0.02, d / 2 + 0.22], size: [0.08, 0.08, 0.5], color: trim });
    }
  }
  return parts.map(place.part);
}

/** A colour made darker (k < 1) or lighter. */
export function shade(c: number, k: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

interface TradeScene {
  /** The 3D things standing outside, in front space (z out from the front wall, heading 0 facing away from it). */
  props: Part[];
  workers: { action: Action; outfit: OutfitId; x: number; z: number; heading: number }[];
  /** Tables, counters and stands the detective walks round, as points in front space. */
  solid: [number, number][];
}

const WOOD = 0x7a5a36;
const DARK_WOOD = 0x5a3e26;
const METAL = 0x8a9096;
const ROPE = 0xc8a86a;

/** A wooden table: top and four legs. x, z is the middle of its foot; top is its height. */
function table(x: number, z: number, w: number, deep: number, top: number, color = WOOD): Part[] {
  const legs: Part[] = [];
  for (const lx of [x - w / 2 + 0.08, x + w / 2 - 0.08]) for (const lz of [z - deep / 2 + 0.08, z + deep / 2 - 0.08]) legs.push({ shape: 'box', at: [lx, 0, lz], size: [0.08, top - 0.06, 0.08], color: DARK_WOOD });
  return [{ shape: 'box', at: [x, top - 0.06, z], size: [w, 0.06, deep], color }, ...legs];
}

/** A low stool. */
const stool = (x: number, z: number, h = 0.45): Part[] => table(x, z, 0.36, 0.36, h);

/** A bunch of flowers in a bucket. */
function bucket(x: number, z: number, bloom: number): Part[] {
  return [
    { shape: 'cyl', at: [x, 0, z], size: [0.2, 0.36, 0], color: METAL },
    { shape: 'ball', at: [x, 0.3, z], size: [0.24, 0.26, 0], color: 0x4f7a3a },
    ...[-0.1, 0.1, 0].map((dx, i): Part => ({ shape: 'ball', at: [x + dx, 0.42 + (i === 2 ? 0.06 : 0), z + (i === 2 ? 0.05 : 0)], size: [0.1, 0, 0], color: bloom })),
  ];
}

/** A bicycle standing side-on: two wheels and a frame in its colour. */
function bicycle(x: number, z: number, frame: number): Part[] {
  const r = 0.33;
  return [
    { shape: 'ring', at: [x - 0.5, 0.03, z], size: [r, 0.03, 0], color: 0x2a2620 },
    { shape: 'ring', at: [x + 0.5, 0.03, z], size: [r, 0.03, 0], color: 0x2a2620 },
    { shape: 'box', at: [x, 0.5, z], size: [0.95, 0.05, 0.05], color: frame },
    { shape: 'box', at: [x - 0.12, 0.36, z], size: [0.05, 0.36, 0.05], color: frame },
    { shape: 'box', at: [x - 0.12, 0.72, z], size: [0.22, 0.05, 0.12], color: 0x6a4a2c },
    { shape: 'box', at: [x + 0.45, 0.5, z], size: [0.05, 0.36, 0.05], color: frame },
    { shape: 'box', at: [x + 0.45, 0.86, z], size: [0.05, 0.04, 0.42], color: 0x2a2620 },
  ];
}

/** A clothes rail with garments hung on it. */
function rail(x: number, z: number, colours: number[]): Part[] {
  const w = 0.42 * colours.length + 0.2;
  return [
    { shape: 'box', at: [x - w / 2, 0, z], size: [0.06, 1.5, 0.06], color: 0x3a3430 },
    { shape: 'box', at: [x + w / 2, 0, z], size: [0.06, 1.5, 0.06], color: 0x3a3430 },
    { shape: 'box', at: [x, 1.46, z], size: [w, 0.04, 0.04], color: 0x9a8050 },
    ...colours.map((c, i): Part => ({ shape: 'box', at: [x - w / 2 + 0.31 + i * 0.42, 0.55, z], size: [0.36, 0.86, 0.12], color: c })),
  ];
}

/** A tailor's dummy on its stand. */
function dummy(x: number, z: number, cloth: number): Part[] {
  return [
    { shape: 'cyl', at: [x, 0, z], size: [0.18, 0.04, 0], color: 0x3a3430 },
    { shape: 'cyl', at: [x, 0.04, z], size: [0.025, 0.95, 0], color: 0x9a8050 },
    { shape: 'box', at: [x, 0.95, z], size: [0.4, 0.55, 0.24], color: cloth },
    { shape: 'cyl', at: [x, 1.5, z], size: [0.05, 0.1, 0], color: 0x9a8050 },
  ];
}

/** What stands outside each shop and who works there, laid out either side of its door. */
function tradeScene(trade: Trade): TradeScene {
  switch (trade) {
    case 'bikes':
      // pumping up the tyre of a customer's bicycle; wheels waiting on a rack by the window
      return {
        props: [
          ...bicycle(-2.2, 1.45, 0x3a6a8a),
          { shape: 'cyl', at: [-1.75, 0, 1.0], size: [0.05, 0.55, 0], color: 0xb23a2c },
          { shape: 'box', at: [-1.75, 0, 1.0], size: [0.3, 0.03, 0.12], color: 0x2a2620 },
          { shape: 'box', at: [2.2, 0, 0.35], size: [1.4, 0.05, 0.3], color: 0x3a3e44 },
          { shape: 'box', at: [1.55, 0, 0.35], size: [0.05, 0.8, 0.05], color: 0x3a3e44 },
          { shape: 'box', at: [2.85, 0, 0.35], size: [0.05, 0.8, 0.05], color: 0x3a3e44 },
          ...[1.75, 2.2, 2.65].map((x): Part => ({ shape: 'ring', at: [x, 0.05, 0.35], size: [0.33, 0.03, 0], color: 0x2a2620, turn: Math.PI / 2 })),
        ],
        workers: [{ action: 'pump', outfit: 'bikeHand', x: -2.0, z: 0.75, heading: 0 }],
        solid: [[-2.2, 1.45], [2.2, 0.35]],
      };
    case 'flower':
      // making up bunches: a stem from the buckets, then onto the table with the wrapped bouquets
      return {
        props: [
          ...table(-1.75, 1.2, 1.1, 0.5, 0.8),
          ...[-2.1, -1.75, -1.4].map((x, i): Part => ({ shape: 'ball', at: [x, 0.8, 1.2], size: [0.13, 0.2, 0], color: [0xe87a5a, 0xf0c23a, 0xf0a0b8][i] })),
          ...bucket(-2.3, 0.4, 0xf4f0e0),
          ...bucket(1.55, 0.4, 0xe8584a),
          ...bucket(2.05, 0.45, 0xf0c23a),
          ...bucket(1.8, 0.95, 0xf0a0b8),
        ],
        workers: [{ action: 'arrange', outfit: 'florist', x: -1.75, z: 0.55, heading: 0 }],
        solid: [[-1.75, 1.2], [1.8, 0.6]],
      };
    case 'tailor':
      // the tailor sewing at a table by the door, cloth hung out to show on the rail
      return {
        props: [
          ...rail(-2.0, 0.45, [0x9a3a2c, 0xc8962a, 0x2a3a6a]),
          ...table(1.95, 1.4, 1.0, 0.55, 0.76),
          { shape: 'box', at: [2.25, 0.76, 1.45], size: [0.36, 0.2, 0.16], color: 0x24262a },
          { shape: 'box', at: [2.38, 0.76, 1.45], size: [0.08, 0.3, 0.13], color: 0x24262a },
          { shape: 'box', at: [1.8, 0.76, 1.35], size: [0.45, 0.02, 0.4], color: 0xc8b48a },
          ...stool(1.95, 0.8, 0.45),
        ],
        workers: [{ action: 'sew', outfit: 'tailor', x: 1.95, z: 0.8, heading: 0 }],
        solid: [[1.95, 1.4], [-2.0, 0.45]],
      };
    case 'cycle':
      // a wheel spinning on its stand while the mechanic trues it; a bicycle leaning on the wall
      return {
        props: [
          ...bicycle(-2.1, 0.35, 0x4f6a3a),
          { shape: 'box', at: [1.95, 0, 1.0], size: [0.06, 0.78, 0.06], color: 0x3a3e44 },
          { shape: 'box', at: [1.95, 0, 1.0], size: [0.5, 0.05, 0.3], color: 0x3a3e44 },
          { shape: 'ring', at: [1.95, 0.45, 1.0], size: [0.34, 0.03, 0], color: 0x2a2620, anim: 'spin' },
          { shape: 'box', at: [1.95, 0.78, 1.0], size: [0.04, 0.04, 0.04], color: METAL, anim: 'spin' },
          { shape: 'box', at: [2.6, 0, 0.3], size: [0.6, 0.36, 0.4], color: 0x9a7040 },
        ],
        workers: [{ action: 'repair', outfit: 'mechanic', x: 2.5, z: 1.0, heading: -Math.PI / 2 }],
        solid: [[1.95, 1.0], [-2.1, 0.35]],
      };
    case 'tea':
      // the tea maker pulling tea at the counter, a customer on the bench, chests of tea leaf
      return {
        props: [
          ...table(-2.0, 1.0, 1.6, 0.5, 1.02),
          { shape: 'cyl', at: [-2.5, 1.02, 1.0], size: [0.05, 0.08, 0], color: 0xeee6d8 },
          { shape: 'cyl', at: [-2.35, 1.02, 1.0], size: [0.05, 0.08, 0], color: 0xeee6d8 },
          { shape: 'cyl', at: [-1.45, 1.02, 0.95], size: [0.14, 0.26, 0], color: 0x9a948a },
          ...table(2.0, 1.55, 1.4, 0.38, 0.45),
          { shape: 'box', at: [2.35, 0, 0.35], size: [0.56, 0.44, 0.44], color: 0xa0703f },
        ],
        workers: [
          { action: 'pour', outfit: 'teaMaker', x: -2.0, z: 0.42, heading: 0 },
          { action: 'sip', outfit: 'customer', x: 1.7, z: 1.55, heading: Math.PI },
        ],
        solid: [[-2.4, 1.0], [-1.6, 1.0], [2.3, 1.55], [2.35, 0.35]],
      };
    case 'fish':
      // gutting the catch on a table by the ice chest; baskets and a coil of rope by the wall
      return {
        props: [
          ...table(2.3, 1.0, 1.3, 0.6, 0.9, 0x8a6a48),
          ...[2.0, 2.3, 2.6].map((x, i): Part => ({ shape: 'ball', at: [x, 0.9, 1.0 + (i % 2) * 0.12], size: [0.2, 0.06, 0], color: 0x8fa2b4, turn: 0.3 * i })),
          { shape: 'box', at: [-1.9, 0, 0.4], size: [0.85, 0.62, 0.6], color: 0x7d8fa8 },
          { shape: 'box', at: [-1.9, 0.62, 0.4], size: [0.9, 0.08, 0.64], color: 0x93a4b8 },
          { shape: 'cyl', at: [-2.8, 0, 0.4], size: [0.3, 0.5, 0], color: 0xb08a4a },
          { shape: 'ring', at: [-2.8, 0.04, 1.0], size: [0.22, 0.07, 0], color: ROPE, tilt: Math.PI / 2 },
        ],
        workers: [{ action: 'gut', outfit: 'fishSeller', x: 2.3, z: 0.43, heading: 0 }],
        solid: [[2.0, 1.0], [2.6, 1.0], [-1.9, 0.4]],
      };
    case 'harbor':
      // the clerk pinning the day's notices on the board outside; a bench and a crate of files
      return {
        props: [
          { shape: 'box', at: [1.55, 0, 0.45], size: [0.07, 1.9, 0.07], color: DARK_WOOD },
          { shape: 'box', at: [2.55, 0, 0.45], size: [0.07, 1.9, 0.07], color: DARK_WOOD },
          { shape: 'box', at: [2.05, 0.95, 0.47], size: [1.1, 0.8, 0.06], color: 0xa07a4a },
          ...[[1.75, 1.45], [2.05, 1.3], [2.35, 1.5], [1.9, 1.05], [2.3, 1.1]].map(([x, y]): Part => ({ shape: 'box', at: [x, y, 0.51], size: [0.2, 0.26, 0.01], color: 0xf0e6cc })),
          ...table(-2.1, 0.45, 1.2, 0.36, 0.45),
          { shape: 'box', at: [-2.5, 0.45, 0.45], size: [0.4, 0.3, 0.3], color: 0x8a5a30 },
        ],
        workers: [{ action: 'pin', outfit: 'clerk', x: 2.05, z: 1.05, heading: Math.PI }],
        solid: [[2.05, 0.45], [-2.1, 0.45]],
      };
    case 'outfitter':
      // fitting a jacket on the dummy: the tape across its shoulders, down its back; finished suits on a rail
      return {
        props: [...dummy(-2.05, 1.05, 0x2a3450), ...rail(2.0, 0.45, [0x2a3450, 0x8a8478, 0x4a4440])],
        workers: [{ action: 'measure', outfit: 'suitMaker', x: -2.05, z: 1.6, heading: Math.PI }],
        solid: [[-2.05, 1.05], [2.0, 0.45]],
      };
    case 'nets':
      // mending a net stretched on its frame; more nets drying over the bench
      return {
        props: [
          ...table(-2.0, 0.45, 2.0, 0.55, 0.72),
          { shape: 'box', at: [-2.1, 0.72, 0.5], size: [1.5, 0.08, 0.62], color: ROPE },
          { shape: 'box', at: [-1.5, 0.3, 0.73], size: [0.5, 0.42, 0.04], color: ROPE },
          { shape: 'ball', at: [-2.75, 0.75, 0.45], size: [0.14, 0, 0], color: 0x3a8a7a },
          // the mending frame: two posts, two rails and the net laced between them
          { shape: 'box', at: [2.3, 0, 0.75], size: [0.08, 1.35, 0.08], color: DARK_WOOD },
          { shape: 'box', at: [2.3, 0, 1.55], size: [0.08, 1.35, 0.08], color: DARK_WOOD },
          { shape: 'box', at: [2.3, 1.25, 1.15], size: [0.08, 0.08, 0.9], color: DARK_WOOD },
          { shape: 'box', at: [2.3, 0.35, 1.15], size: [0.08, 0.08, 0.9], color: DARK_WOOD },
          ...[0, 1, 2, 3, 4].map((i): Part => ({ shape: 'box', at: [2.3, 0.35, 0.85 + i * 0.15], size: [0.015, 0.9, 0.015], color: 0xd8c08a })),
          ...[0, 1, 2, 3, 4].map((i): Part => ({ shape: 'box', at: [2.3, 0.5 + i * 0.16, 1.15], size: [0.015, 0.015, 0.72], color: 0xd8c08a })),
          ...stool(1.65, 1.15, 0.45),
        ],
        workers: [{ action: 'mend', outfit: 'netMender', x: 1.65, z: 1.15, heading: Math.PI / 2 }],
        solid: [[-2.0, 0.45], [2.3, 1.15]],
      };
    case 'atelier':
      // pressing a length of cloth on the ironing board; bolts of cloth stood in a basket
      return {
        props: [
          ...table(-2.3, 1.15, 1.3, 0.4, 0.86, 0xd8d0c0),
          { shape: 'box', at: [-2.45, 0.86, 1.15], size: [0.8, 0.02, 0.36], color: 0x2a3450 },
          { shape: 'cyl', at: [2.5, 0, 0.4], size: [0.32, 0.4, 0], color: 0xb08a4a },
          ...[[0x2a3450, -0.1, -0.05], [0x8a8478, 0.1, 0.05], [0xc8b48a, 0, 0.12]].map(([c, dx, dz]): Part => ({ shape: 'cyl', at: [2.5 + dx, 0.3, 0.4 + dz], size: [0.07, 1.0, 0], color: c })),
        ],
        workers: [{ action: 'press', outfit: 'presser', x: -2.3, z: 0.55, heading: 0 }],
        solid: [[-2.6, 1.15], [-2.0, 1.15], [2.5, 0.4]],
      };
    case 'marine':
      // coiling a mooring line down on the step; a buoy, a barrel and spare coils by the window
      return {
        props: [
          ...[0, 1, 2].map((i): Part => ({ shape: 'ring', at: [2.0, 0.03 + i * 0.07, 1.55], size: [0.3 - i * 0.03, 0.06, 0], color: ROPE, tilt: Math.PI / 2 })),
          { shape: 'cyl', at: [-2.3, 0, 0.4], size: [0.28, 0.72, 0], color: 0x6a4a2c },
          { shape: 'ring', at: [-1.65, 0.0, 0.25], size: [0.28, 0.08, 0], color: 0xd84a3a },
          { shape: 'ring', at: [-2.3, 0.04, 1.05], size: [0.24, 0.07, 0], color: 0x2a3a6a, tilt: Math.PI / 2 },
          { shape: 'ring', at: [-2.3, 0.12, 1.05], size: [0.2, 0.07, 0], color: ROPE, tilt: Math.PI / 2 },
        ],
        workers: [{ action: 'coil', outfit: 'chandler', x: 2.0, z: 0.95, heading: 0 }],
        solid: [[2.0, 1.55], [-2.3, 0.4], [-2.3, 1.05]],
      };
  }
}

/** The things standing outside a shop, as building parts (relative to the middle of its footprint). */
export function shopProps(b: Building): Part[] {
  if (!b.trade) return [];
  const place = placer(b);
  const front = b.size[1] / 2;
  const props = tradeScene(b.trade).props.map((p) => place.part({ ...p, at: [p.at[0], p.at[1], front + p.at[2]] }));
  const facts = SHOPS[b.trade];
  if (facts?.flag) {
    // a pennant on its pole over the roof, flapping
    const k = b.size[0] / facts.width;
    const f = facts.flag;
    const roofTop = facts.roof.kind === 'flat' ? facts.roof.height * k : frontTop(b, facts);
    const z = f.z * (b.size[1] / facts.depth);
    props.push(place.part({ shape: 'cyl', at: [f.x * k, roofTop - 0.2, z], size: [0.05, f.top * k - roofTop + 0.2, 0], color: 0x9a7040 }));
    props.push(place.part({ shape: 'box', at: [f.x * k + 0.4, f.top * k - 0.55, z], size: [0.75, 0.38, 0.03], color: 0x2a3a6a, anim: 'flap' }));
  }
  return props;
}

/** Who works outside a shop, in town space. */
export function shopWorkers(b: Building): WorkerSpot[] {
  if (!b.trade) return [];
  const place = placer(b);
  return tradeScene(b.trade).workers.map((w) => ({ action: w.action, outfit: w.outfit, at: place.at(w.x, w.z), heading: place.heading(w.heading) }));
}

/** Points the detective walks round outside a shop: its workers, tables and stands. */
export function shopSolids(b: Building): Vec2[] {
  if (!b.trade) return [];
  const place = placer(b);
  const scene = tradeScene(b.trade);
  return [...scene.workers.map((w) => place.at(w.x, w.z)), ...scene.solid.map(([x, z]) => place.at(x, z))];
}
