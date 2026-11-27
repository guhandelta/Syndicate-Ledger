import type { Part } from './buildingStyles';
import type { Building, Trade, Vec2 } from './townTypes';
import type { Action, OutfitId } from './workerActions';

/**
 * Port Calder's shops, built from Guha's pictures of their fronts (assets/shops, cut up by scripts/make-shop-art.py).
 * The walls, roof, posts, awning and the things standing outside are solid 3D pieces in the picture's colours; the
 * flat details of the front (the sign, the door, windows, a notice board, nets hung on the wall) are cut from the
 * picture itself and laid on the wall where the picture has them. Each shop has someone at work outside.
 */

/** What scripts/make-shop-art.py read from a shop's picture. Positions are metres on the front wall: x from its middle, y up from the ground to the bottom of the piece. */
export interface ShopFacts {
  trade: Trade;
  picture: string;
  /** The building's width and height (to the eaves) the picture was measured at. */
  width: number;
  height: number;
  roof: 'gable' | 'flat';
  /** How high the roof rises above the eaves. */
  rise: number;
  colours: { wall: string; roof: string; trim: string; awning: string; stone: string };
  awnings: { x: number; y: number; w: number; h: number; colour: string }[];
  pieces: { id: string; x: number; y: number; w: number; h: number; mode: 'hard' | 'soft' | 'cut'; glow: boolean }[];
  chimney?: { x: number; y: number; w: number; h: number };
}

const factFiles = import.meta.glob<ShopFacts>('./shops/*.json', { eager: true, import: 'default' });
const pictureFiles = import.meta.glob<string>('./shops/*.webp', { eager: true, query: '?url', import: 'default' });

/** Every shop's facts, by trade. */
export const SHOPS: Partial<Record<Trade, ShopFacts>> = Object.fromEntries(Object.values(factFiles).map((f) => [f.trade, f]));

/** The URL of one cut piece of a shop's picture. */
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

/** The shell of a shop: walls, stone foot, timber frame, roof, chimney, awnings and the pieces cut from its picture. */
export function shopParts(b: Building, facts: ShopFacts, url: (id: string) => string | undefined = (id) => pieceUrl(facts.trade, id)): Part[] {
  const [w, d] = b.size;
  const h = b.height;
  const sx = w / facts.width;
  const sy = h / facts.height;
  const wall = num(b.color);
  const roof = num(b.roof);
  const trim = num(b.trim ?? facts.colours.trim);
  const stone = num(facts.colours.stone);
  const front = d / 2;
  const parts: Part[] = [
    { shape: 'box', at: [0, 0, 0], size: [w, h, d], color: wall },
    { shape: 'box', at: [0, 0, 0], size: [w + 0.1, 0.38, d + 0.1], color: stone },
  ];
  // timber posts on the corners and a beam along the eaves, with the ends of the roof joists showing
  for (const x of [-w / 2, w / 2]) for (const z of [-front, front]) parts.push({ shape: 'box', at: [x, 0, z], size: [0.26, h, 0.26], color: trim });
  parts.push({ shape: 'box', at: [0, h - 0.26, front + 0.04], size: [w + 0.3, 0.26, 0.3], color: trim });
  const joists = Math.max(3, Math.round(w / 1.4));
  for (let i = 0; i < joists; i++) parts.push({ shape: 'box', at: [-w / 2 + 0.5 + ((w - 1) * i) / (joists - 1), h - 0.5, front + 0.12], size: [0.18, 0.2, 0.36], color: trim });
  if (facts.roof === 'flat') {
    parts.push({ shape: 'box', at: [0, h, 0], size: [w + 0.4, 0.2, d + 0.4], color: roof });
    parts.push({ shape: 'box', at: [0, h, front + 0.1], size: [w + 0.5, facts.rise + 0.3, 0.32], color: trim });
  } else {
    parts.push({ shape: 'gable', at: [0, h, 0], size: [w + 0.7, facts.rise * sy + 0.2, d + 0.9], color: roof });
  }
  if (facts.chimney) {
    const c = facts.chimney;
    const cw = Math.max(0.45, c.w * sx);
    parts.push({ shape: 'box', at: [c.x * sx, h - 0.2, -d / 4], size: [cw, facts.rise * sy + 1.0, cw], color: 0x9a8f80 });
    parts.push({ shape: 'box', at: [c.x * sx, h + facts.rise * sy + 0.8, -d / 4], size: [cw + 0.12, 0.16, cw + 0.12], color: 0x6b625a });
  }
  // awnings slope out from the wall; the depth is ours, the width, height and colour are the picture's
  for (const a of facts.awnings) {
    const out = 1.35;
    const drop = Math.max(0.35, a.h * sy);
    const top = (a.y + a.h) * sy;
    const len = Math.hypot(out, drop);
    const tilt = Math.atan2(drop, out);
    const aw = a.w * sx;
    const colour = num(a.colour);
    parts.push({ shape: 'box', at: [a.x * sx, top - drop / 2 - 0.03, front + out / 2], size: [aw, 0.06, len], color: colour, tilt });
    // the scalloped edge hanging off the front, a shade darker
    parts.push({ shape: 'box', at: [a.x * sx, top - drop - 0.2, front + out], size: [aw, 0.22, 0.04], color: shade(colour, 0.82) });
    // a timber bracket under each end
    for (const x of [a.x * sx - aw / 2 + 0.1, a.x * sx + aw / 2 - 0.1]) {
      parts.push({ shape: 'box', at: [x, top - drop - 0.55, front + out * 0.4], size: [0.08, 0.08, Math.hypot(out * 0.8, 0.6)], color: trim, tilt: -Math.atan2(0.6, out * 0.8) });
    }
  }
  // the flat details from the picture, laid on the front wall; hanging signs swing out on an arm
  for (const p of facts.pieces) {
    const tex = url(p.id);
    if (!tex) continue;
    const pw = p.w * sx;
    const ph = p.h * sy;
    const x = p.x * sx;
    const y = p.y * sy;
    const hanging = p.mode === 'cut';
    const z = front + (hanging ? 0.45 : p.glow ? 0.03 : 0.02 + (p.mode === 'soft' ? 0.01 : 0));
    parts.push({ shape: 'panel', at: [x, y, z], size: [pw, ph, 0], color: 0xffffff, tex, edge: p.mode, glow: p.glow || undefined });
    if (hanging) {
      // a timber arm out from the wall (or from the corner post, for a sign beyond the wall) holding the sign's chains
      const fromX = Math.max(-w / 2, Math.min(w / 2, x));
      const armLen = Math.abs(x - fromX) + 0.5;
      parts.push({ shape: 'box', at: [(fromX + x) / 2, y + ph + 0.02, front + 0.3], size: [Math.max(0.1, armLen), 0.1, 0.1], color: trim });
      parts.push({ shape: 'box', at: [fromX, y + ph + 0.02, front + 0.2], size: [0.1, 0.1, 0.5], color: trim });
    }
  }
  return parts;
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
    { shape: 'box', at: [x + 0.62, 0.62, z], size: [0.26, 0.18, 0.24], color: 0x8a6a3a },
  ];
}

/** What stands outside each shop and who works there, laid out after the shop's picture. */
function tradeScene(trade: Trade): TradeScene {
  switch (trade) {
    case 'tea':
      // the tea maker behind a counter under the awning, a customer on the bench, chests of tea leaf
      return {
        props: [
          ...table(-0.95, 1.05, 2.3, 0.5, 1.02),
          { shape: 'cyl', at: [-1.7, 1.02, 1.05], size: [0.05, 0.08, 0], color: 0xeee6d8 },
          { shape: 'cyl', at: [-1.55, 1.02, 1.05], size: [0.05, 0.08, 0], color: 0xeee6d8 },
          { shape: 'cyl', at: [-0.15, 1.02, 1.0], size: [0.14, 0.26, 0], color: 0x9a948a },
          ...table(-1.0, 2.35, 1.9, 0.38, 0.45),
          { shape: 'box', at: [1.75, 0, 0.4], size: [0.62, 0.48, 0.48], color: 0xa0703f },
          { shape: 'box', at: [1.4, 0, 0.95], size: [0.62, 0.48, 0.48], color: 0xa0703f },
          { shape: 'box', at: [1.6, 0.48, 0.45], size: [0.56, 0.44, 0.44], color: 0xb07a46 },
        ],
        workers: [
          { action: 'pour', outfit: 'teaMaker', x: -1.0, z: 0.45, heading: 0 },
          { action: 'sip', outfit: 'customer', x: -0.55, z: 2.35, heading: Math.PI },
        ],
        solid: [[-1.6, 1.05], [-0.3, 1.05], [-1.6, 2.35], [1.6, 0.6]],
      };
    case 'cycle':
      // a wheel spinning on its stand while the mechanic trues it, a green bicycle leaning on the wall, the pump
      return {
        props: [
          ...bicycle(-1.0, 0.3, 0x4f6a3a),
          { shape: 'box', at: [1.0, 0, 1.0], size: [0.06, 0.78, 0.06], color: 0x3a3e44 },
          { shape: 'box', at: [1.0, 0, 1.0], size: [0.5, 0.05, 0.3], color: 0x3a3e44 },
          { shape: 'ring', at: [1.0, 0.45, 1.0], size: [0.34, 0.03, 0], color: 0x2a2620, anim: 'spin' },
          { shape: 'box', at: [1.0, 0.78, 1.0], size: [0.04, 0.04, 0.04], color: METAL, anim: 'spin' },
          { shape: 'cyl', at: [0.2, 0, 0.35], size: [0.04, 0.75, 0], color: 0xb23a2c },
          { shape: 'box', at: [0.2, 0.75, 0.35], size: [0.32, 0.04, 0.04], color: 0x2a2620 },
          { shape: 'box', at: [3.0, 0, 0.35], size: [0.6, 0.36, 0.4], color: 0x9a7040 },
          { shape: 'ring', at: [3.0, 0.3, 0.35], size: [0.14, 0.04, 0], color: METAL },
        ],
        workers: [{ action: 'repair', outfit: 'mechanic', x: 1.55, z: 1.0, heading: -Math.PI / 2 }],
        solid: [[1.0, 1.0], [-1.0, 0.3]],
      };
    case 'fish':
      // gutting the catch on a table by the ice chests; baskets and a coil of rope by the wall
      return {
        props: [
          ...table(2.35, 0.95, 1.4, 0.6, 0.9, 0x8a6a48),
          ...[2.0, 2.3, 2.62].map((x, i): Part => ({ shape: 'ball', at: [x, 0.9, 0.95 + (i % 2) * 0.12], size: [0.2, 0.06, 0], color: 0x8fa2b4, turn: 0.3 * i })),
          { shape: 'box', at: [1.15, 0, 0.35], size: [0.85, 0.62, 0.6], color: 0x7d8fa8 },
          { shape: 'box', at: [1.15, 0.62, 0.35], size: [0.9, 0.08, 0.64], color: 0x93a4b8 },
          { shape: 'cyl', at: [-2.9, 0, 0.35], size: [0.32, 0.5, 0], color: 0xb08a4a },
          { shape: 'cyl', at: [-2.3, 0, 0.3], size: [0.24, 0.32, 0], color: 0xb08a4a },
          { shape: 'ring', at: [3.25, 0.04, 0.4], size: [0.22, 0.07, 0], color: 0xc8a86a, tilt: Math.PI / 2 },
          { shape: 'ring', at: [3.25, 0.12, 0.4], size: [0.18, 0.07, 0], color: 0xc8a86a, tilt: Math.PI / 2 },
        ],
        workers: [{ action: 'gut', outfit: 'fishSeller', x: 2.35, z: 0.38, heading: 0 }],
        solid: [[2.0, 0.95], [2.7, 0.95], [1.15, 0.35]],
      };
    case 'flower':
      // making up bunches: a stem from the buckets, then onto the table with the wrapped bouquets
      return {
        props: [
          ...table(-0.2, 1.15, 1.3, 0.5, 0.8),
          ...[-0.6, -0.2, 0.2].map((x, i): Part => ({ shape: 'ball', at: [x, 0.8, 1.15], size: [0.13, 0.2, 0], color: [0xe87a5a, 0xf0c23a, 0xf0a0b8][i] })),
          ...bucket(-1.0, 0.45, 0xe87a5a),
          ...bucket(-2.35, 0.4, 0xf4f0e0),
          ...bucket(-1.75, 0.45, 0xe8584a),
          ...bucket(0.95, 0.4, 0xf0c23a),
          { shape: 'cyl', at: [2.75, 0, 0.3], size: [0.17, 0.26, 0], color: 0xb4603a },
          { shape: 'ball', at: [2.75, 0.3, 0.3], size: [0.18, 0, 0], color: 0xf0a0b8 },
        ],
        workers: [{ action: 'arrange', outfit: 'florist', x: -0.25, z: 0.5, heading: 0 }],
        solid: [[-0.5, 1.15], [0.1, 1.15], [-1.75, 0.45]],
      };
    case 'harbor':
      // the clerk pinning the day's notices on the board; a stool and a crate, the harbour flag on the roof
      return {
        props: [
          ...stool(-2.35, 0.35, 0.55),
          { shape: 'box', at: [2.6, 0, 0.35], size: [0.75, 0.62, 0.6], color: 0x8a5a30 },
        ],
        workers: [{ action: 'pin', outfit: 'clerk', x: 1.45, z: 0.5, heading: Math.PI + 0.25 }],
        solid: [[2.6, 0.35]],
      };
    case 'nets':
      // mending a net stretched on its frame; more nets drying over the bench
      return {
        props: [
          ...table(-1.4, 0.45, 2.4, 0.55, 0.72),
          { shape: 'box', at: [-1.6, 0.72, 0.5], size: [1.6, 0.08, 0.62], color: 0xc8a86a },
          { shape: 'box', at: [-0.9, 0.3, 0.73], size: [0.5, 0.42, 0.04], color: 0xc8a86a },
          { shape: 'ball', at: [-2.3, 0.75, 0.45], size: [0.14, 0, 0], color: 0xb23a2c },
          { shape: 'ring', at: [-1.2, 0.1, 0.45], size: [0.16, 0.06, 0], color: 0xc8a86a, tilt: Math.PI / 2 },
          // the mending frame: two posts, two rails and the net laced between them
          { shape: 'box', at: [0.95, 0, 0.75], size: [0.08, 1.35, 0.08], color: DARK_WOOD },
          { shape: 'box', at: [0.95, 0, 1.55], size: [0.08, 1.35, 0.08], color: DARK_WOOD },
          { shape: 'box', at: [0.95, 1.25, 1.15], size: [0.08, 0.08, 0.9], color: DARK_WOOD },
          { shape: 'box', at: [0.95, 0.35, 1.15], size: [0.08, 0.08, 0.9], color: DARK_WOOD },
          ...[0, 1, 2, 3, 4].map((i): Part => ({ shape: 'box', at: [0.95, 0.35, 0.85 + i * 0.15], size: [0.015, 0.9, 0.015], color: 0xd8c08a })),
          ...[0, 1, 2, 3, 4].map((i): Part => ({ shape: 'box', at: [0.95, 0.5 + i * 0.16, 1.15], size: [0.015, 0.015, 0.72], color: 0xd8c08a })),
          ...stool(0.3, 1.15, 0.45),
        ],
        workers: [{ action: 'mend', outfit: 'netMender', x: 0.3, z: 1.15, heading: Math.PI / 2 }],
        solid: [[-1.4, 0.45], [0.95, 1.15]],
      };
    case 'tailor':
      // the tailor sewing at a table by the door, cloth hung out to show on the rail
      return {
        props: [
          { shape: 'box', at: [0.25, 0, 0.35], size: [0.07, 1.15, 0.07], color: DARK_WOOD },
          { shape: 'box', at: [1.55, 0, 0.35], size: [0.07, 1.15, 0.07], color: DARK_WOOD },
          { shape: 'box', at: [0.9, 1.1, 0.35], size: [1.4, 0.05, 0.05], color: DARK_WOOD },
          ...[0x9a3a2c, 0xc8962a, 0x4a6a8a].map((c, i): Part => ({ shape: 'box', at: [0.48 + i * 0.42, 0.45, 0.35], size: [0.34, 0.65, 0.03], color: c })),
          ...table(2.15, 1.35, 1.0, 0.55, 0.76),
          { shape: 'box', at: [2.45, 0.76, 1.4], size: [0.36, 0.2, 0.16], color: 0x24262a },
          { shape: 'box', at: [2.58, 0.76, 1.4], size: [0.08, 0.3, 0.13], color: 0x24262a },
          { shape: 'box', at: [2.0, 0.76, 1.3], size: [0.45, 0.02, 0.4], color: 0xc8b48a },
          ...stool(2.15, 0.75, 0.45),
          { shape: 'box', at: [2.65, 0, 0.35], size: [0.7, 0.5, 0.5], color: 0x8a5a30 },
        ],
        workers: [{ action: 'sew', outfit: 'tailor', x: 2.15, z: 0.75, heading: 0 }],
        solid: [[2.15, 1.35], [0.9, 0.35]],
      };
  }
}

/** The things standing outside a shop, as building parts (relative to the middle of its footprint). */
export function shopProps(b: Building): Part[] {
  if (!b.trade) return [];
  const place = placer(b);
  const front = b.size[1] / 2;
  const scene = tradeScene(b.trade);
  const props = scene.props.map((p) => place.part({ ...p, at: [p.at[0], p.at[1], front + p.at[2]] }));
  if (b.trade === 'harbor') {
    // the harbour flag on the ridge, flapping
    const facts = SHOPS.harbor!;
    const ridge = b.height + facts.rise * (b.height / facts.height) + 0.2;
    props.push(place.part({ shape: 'cyl', at: [b.size[0] / 2 - 0.8, ridge - 0.3, 0], size: [0.05, 1.6, 0], color: DARK_WOOD }));
    props.push(place.part({ shape: 'box', at: [b.size[0] / 2 - 0.4, ridge + 0.8, 0], size: [0.75, 0.42, 0.03], color: 0x2a3a6a, anim: 'flap' }));
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
