import * as THREE from 'three';
import type { Expression } from '../ui/voices';
import { poseAt, STEP_LENGTH, type Activity, type Pose } from './figure3d';

/**
 * A person made as a finished 3D model (a .glb from an image-to-3D tool, prepared by scripts/make-glb.py).
 * The model has no skeleton of its own, so one is added here: every point of the model follows the nearest bones,
 * and the bones are moved by the same walk, idle and mood poses as the figures built from the body pictures.
 */

export type V3 = [number, number, number];

/** Where the joints are, as shares of the person's height (x across, from the person's right to left; y up). A person stands in an easy A-pose, facing +z. */
export interface Joints {
  hip: number;
  waist: number;
  neck: number;
  top: number;
  shoulder: [x: number, y: number];
  elbow: [x: number, y: number];
  wrist: [x: number, y: number];
  leg: [x: number, ankle: number, knee: number];
}

export const HUMAN: Joints = {
  hip: 0.5,
  waist: 0.56,
  neck: 0.8,
  top: 0.985,
  shoulder: [0.085, 0.77],
  elbow: [0.13, 0.62],
  wrist: [0.17, 0.5],
  leg: [0.045, 0.04, 0.27],
};

/** The face's place on the head, in metres (x across, y up), where the expression picture goes. */
export interface FaceBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A soft bone in a bunch of hair: `hair<bunch>_<link>`, the bunch counted from the person's right to left and the link from the neck down. */
export type HairBone = `hair${number}_${number}`;
type BodyBone = 'hips' | 'spine' | 'neck' | 'head' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'legL' | 'shinL' | 'legR' | 'shinR';
export type BoneName = BodyBone | HairBone;

interface Segment {
  bone: BoneName;
  a: V3;
  b: V3;
  /** How thick the part is: the point's distance is measured in these, so a thin arm beside a wide chest still wins its own points. */
  radius: number;
}

interface Layout {
  /** Each bone's joint, in metres. */
  joint: Record<BoneName, V3>;
  parent: Record<BoneName, BoneName | null>;
  segments: Segment[];
}

/** How many bunches of hair swing on their own across the back, and how many bones each has from the neck down. */
export const HAIR_BUNCHES = 5;
export const HAIR_LINKS = 4;
/** Half the width the bunches cover, as a share of the person's height. */
const HAIR_SPREAD = 0.12;

const hairBone = (bunch: number, link: number): HairBone => `hair${bunch}_${link}`;
export const HAIR: HairBone[] = Array.from({ length: HAIR_BUNCHES * HAIR_LINKS }, (_, n) => hairBone(Math.floor(n / HAIR_LINKS), n % HAIR_LINKS));

const BODY: BodyBone[] = ['hips', 'spine', 'neck', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
const ORDER: BoneName[] = [...BODY, ...HAIR];

/** How stiff each bunch of hair is, compared with the others, so they do not all move alike. */
const LOCKS = [1, 0.8, 1.15, 0.9, 1.05];

/** Where the hair ends, as a share of the person's height. */
const HAIR_END = 0.4;

/** The skeleton for a person of this height: the bone joints and the lines each bone owns. */
export function layoutFor(height: number, j: Joints = HUMAN): Layout {
  const H = height;
  const p = (x: number, y: number): V3 => [x * H, y * H, 0];
  const side = (s: 1 | -1) => {
    const sh = p(s * j.shoulder[0], j.shoulder[1]);
    const el = p(s * j.elbow[0], j.elbow[1]);
    const wr = p(s * j.wrist[0], j.wrist[1]);
    const hand: V3 = [wr[0] + (wr[0] - el[0]) * 0.8, wr[1] + (wr[1] - el[1]) * 0.8, 0];
    const hipJ = p(s * j.leg[0], j.hip);
    const knee = p(s * j.leg[0], j.leg[2]);
    const ankle = p(s * j.leg[0], j.leg[1]);
    return { sh, el, wr, hand, hipJ, knee, ankle };
  };
  const L = side(1);
  const R = side(-1);
  const hip = p(0, j.hip);
  const waist = p(0, j.waist);
  const neck = p(0, j.neck);
  const top = p(0, j.top);
  const floor = (v: V3): V3 => [v[0], 0, v[2]];
  // a bunch hangs at its own place across the back; `across` is -1 on the person's right to 1 on their left
  const hairJoints = Object.fromEntries(
    HAIR.map((b, n) => [b, p(((Math.floor(n / HAIR_LINKS) / (HAIR_BUNCHES - 1)) * 2 - 1) * HAIR_SPREAD, j.neck - (j.neck - HAIR_END) * ((n % HAIR_LINKS) / HAIR_LINKS))]),
  ) as Record<HairBone, V3>;
  const joint: Record<BoneName, V3> = {
    hips: hip,
    spine: waist,
    neck,
    head: p(0, j.neck + (j.top - j.neck) * 0.25),
    armL: L.sh,
    foreL: L.el,
    armR: R.sh,
    foreR: R.el,
    legL: L.hipJ,
    shinL: L.knee,
    legR: R.hipJ,
    shinR: R.knee,
    ...hairJoints,
  };
  const hairParents = Object.fromEntries(HAIR.map((b, n) => [b, n % HAIR_LINKS === 0 ? 'neck' : HAIR[n - 1]])) as Record<HairBone, BoneName>;
  const parent: Record<BoneName, BoneName | null> = {
    hips: null,
    spine: 'hips',
    neck: 'spine',
    head: 'neck',
    armL: 'spine',
    foreL: 'armL',
    armR: 'spine',
    foreR: 'armR',
    legL: 'hips',
    shinL: 'legL',
    legR: 'hips',
    shinR: 'legR',
    ...hairParents,
  };
  const seg = (bone: BoneName, a: V3, b: V3, radius: number): Segment => ({ bone, a, b, radius: radius * H });
  const segments = [
    seg('hips', hip, waist, 0.1),
    seg('spine', waist, neck, 0.1),
    seg('neck', neck, p(0, j.neck + (j.top - j.neck) * 0.3), 0.05),
    seg('head', p(0, j.neck + (j.top - j.neck) * 0.3), top, 0.1),
    seg('armL', L.sh, L.el, 0.03),
    seg('foreL', L.el, L.hand, 0.03),
    seg('armR', R.sh, R.el, 0.03),
    seg('foreR', R.el, R.hand, 0.03),
    seg('legL', L.hipJ, L.knee, 0.05),
    seg('shinL', L.knee, floor(L.ankle), 0.045),
    seg('legR', R.hipJ, R.knee, 0.05),
    seg('shinR', R.knee, floor(R.ankle), 0.045),
  ];
  return { joint, parent, segments };
}

const SEGMENT_CLOSEST = new THREE.Vector3();
const SEGMENT_LINE = new THREE.Line3();
const POINT = new THREE.Vector3();

/** How far (in the part's own thickness) a point is from the line a bone owns. */
function nearness(seg: Segment, x: number, y: number, z: number): number {
  SEGMENT_LINE.start.set(seg.a[0], seg.a[1], seg.a[2]);
  SEGMENT_LINE.end.set(seg.b[0], seg.b[1], seg.b[2]);
  POINT.set(x, y, z);
  SEGMENT_LINE.closestPointToPoint(POINT, true, SEGMENT_CLOSEST);
  return SEGMENT_CLOSEST.distanceTo(POINT) / seg.radius;
}

/** How far past the nearest bone another still shares a point (in thicknesses): smaller gives stiffer joints, larger softer ones. */
const BLEND = 0.6;

/**
 * Gives the geometry skin weights: each point follows the bones whose lines it is close to, blending where two meet.
 * Four bones at most per point.
 */
export function skinTo(geo: THREE.BufferGeometry, layout: Layout): void {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const bones = ORDER.map((b) => layout.segments.filter((s) => s.bone === b));
  const near: number[] = new Array(ORDER.length);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let best = Infinity;
    for (let b = 0; b < ORDER.length; b++) {
      near[b] = Math.min(...bones[b].map((s) => nearness(s, x, y, z)));
      best = Math.min(best, near[b]);
    }
    const ranked = near
      .map((d, b) => ({ b, w: Math.max(0, 1 - (d - best) / BLEND) ** 2 }))
      .filter((r) => r.w > 0)
      .sort((p, q) => q.w - p.w)
      .slice(0, 4);
    const total = ranked.reduce((s, r) => s + r.w, 0);
    ranked.forEach((r, k) => {
      index[i * 4 + k] = r.b;
      weight[i * 4 + k] = r.w / total;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
}

/** Reads a colour from the model's picture at a spot on it (u across, v down, each 0 to 1), as red, green and blue from 0 to 255. */
export type Sampler = (u: number, v: number) => [number, number, number];

/** Hair is nearly black and nearly grey; the skirt, boots and scarf are lighter or have a colour. */
export function isHairColour([r, g, b]: [number, number, number]): boolean {
  const hi = Math.max(r, g, b);
  return hi < 64 && r - g < 22 && b - g < 4;
}

/**
 * How much each point is hair, 0 to 1: dark and grey in the picture, below the neck, and not the belt tie at the front of the waist.
 * The colours of hair and a dark skirt are close, so the answer is smoothed across neighbouring points: an edge fades instead of tearing.
 */
export function hairiness(geo: THREE.BufferGeometry, layout: Layout, sample: Sampler): Float32Array {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const n = pos.count;
  const top = layout.joint[HAIR[0]][1];
  const waist = layout.joint.spine[1];
  let h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const frontOfWaist = pos.getZ(i) > 0 && pos.getY(i) < waist * 1.15;
    // from the neck to just below where the hair ends: the boots and the hem of the skirt are dark too
    h[i] = pos.getY(i) < top && pos.getY(i) > layout.joint[HAIR[HAIR_LINKS - 1]][1] * 0.85 && !frontOfWaist && isHairColour(sample(uv.getX(i), uv.getY(i))) ? 1 : 0;
  }
  const next: number[][] = Array.from({ length: n }, () => []);
  const tri = geo.getIndex()!;
  for (let t = 0; t < tri.count; t += 3) {
    const [a, b, c] = [tri.getX(t), tri.getX(t + 1), tri.getX(t + 2)];
    next[a].push(b, c);
    next[b].push(a, c);
    next[c].push(a, b);
  }
  for (let pass = 0; pass < 4; pass++) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const around = next[i];
      const mean = around.reduce((sum, j) => sum + h[j], 0) / around.length;
      out[i] = h[i] * 0.5 + mean * 0.5;
    }
    h = out;
  }
  return h;
}

/**
 * Hands the hair below the neck to the soft bones: each point goes to the bunches nearest across the back and, down each bunch,
 * to the bones nearest its height. The higher a point is on the hair, the more it stays with the head. Points that are not hair keep their weights.
 */
export function hairTo(geo: THREE.BufferGeometry, layout: Layout, sample: Sampler, height: number): void {
  const pos = geo.getAttribute('position');
  const index = geo.getAttribute('skinIndex');
  const weight = geo.getAttribute('skinWeight');
  const first = ORDER.indexOf(HAIR[0]);
  const top = layout.joint[HAIR[0]][1];
  const span = top - HAIR_END * height;
  const hair = hairiness(geo, layout, sample);
  for (let i = 0; i < pos.count; i++) {
    const t = (top - pos.getY(i)) / span;
    if (t <= 0 || hair[i] < 0.05) continue;
    const ramp = THREE.MathUtils.smoothstep(t, 0, 0.15) * hair[i];
    // down the bunch: the two links either side of this height
    const u = Math.min(t * HAIR_LINKS, HAIR_LINKS - 1);
    const lo = Math.floor(u);
    const links: [number, number][] = [[lo, 1 - (u - lo)]];
    links.push([lo + 1 < HAIR_LINKS ? lo + 1 : lo, u - lo]);
    // across the back: the two bunches either side of this place
    const across = THREE.MathUtils.clamp((pos.getX(i) / height + HAIR_SPREAD) / (2 * HAIR_SPREAD), 0, 1) * (HAIR_BUNCHES - 1);
    const left = Math.min(Math.floor(across), HAIR_BUNCHES - 2);
    const bunches: [number, number][] = [
      [left, 1 - (across - left)],
      [left + 1, across - left],
    ];
    const mix = new Map<number, number>();
    const add = (bone: number, w: number) => mix.set(bone, (mix.get(bone) ?? 0) + w);
    for (let k = 0; k < 4; k++) add(index.getComponent(i, k), weight.getComponent(i, k) * (1 - ramp));
    for (const [bunch, wb] of bunches) for (const [link, wl] of links) add(first + bunch * HAIR_LINKS + link, ramp * wb * wl);
    const top4 = [...mix.entries()].filter(([, w]) => w > 1e-6).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top4.reduce((sum, [, w]) => sum + w, 0);
    for (let k = 0; k < 4; k++) {
      index.setComponent(i, k, top4[k]?.[0] ?? 0);
      weight.setComponent(i, k, (top4[k]?.[1] ?? 0) / total);
    }
  }
}

/** The first mesh found in a loaded model. */
export function meshOf(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

// ---------- the expression face ----------

/** The small movements of the face that every feeling is made from. */
export const BASIS = ['browDown', 'browUp', 'browInnerUp', 'browInnerDown', 'lidClose', 'lidWide', 'smileL', 'smileR', 'frown', 'lipDown'] as const;
export type Basis = (typeof BASIS)[number];

/** How far each basic movement goes for a feeling, 0 to 1. A feeling that is not here leaves the face as the model made it. */
export const FEELINGS: Partial<Record<Expression, Partial<Record<Basis, number>>>> = {
  suspicious: { browDown: 0.6, lidClose: 0.8, frown: 0.3 },
  'caught-lying': { browInnerUp: 0.9, frown: 0.5, lidWide: 0.3 },
  nervous: { browInnerUp: 0.6, frown: 0.3, lipDown: 0.25 },
  angry: { browDown: 1, browInnerDown: 0.9, lidClose: 0.6, frown: 0.8 },
  scared: { browUp: 0.8, browInnerUp: 0.7, lidWide: 1, lipDown: 0.8 },
  smug: { smileL: 1, smileR: 0.35, browUp: 0.25, lidClose: 0.35 },
};

/** Where the features are on the face, as shares of the face's width and height from its lower left, as seen from the front. */
export interface Features {
  browL: [number, number];
  browR: [number, number];
  innerL: [number, number];
  innerR: [number, number];
  eyeL: [number, number];
  eyeR: [number, number];
  mouthL: [number, number];
  mouthR: [number, number];
  lip: [number, number];
  cheekL: [number, number];
}

export const FEATURES: Features = {
  browL: [0.72, 0.6],
  browR: [0.2, 0.6],
  innerL: [0.58, 0.58],
  innerR: [0.35, 0.58],
  eyeL: [0.71, 0.5],
  eyeR: [0.21, 0.5],
  mouthL: [0.7, 0.165],
  mouthR: [0.3, 0.165],
  lip: [0.5, 0.135],
  cheekL: [0.74, 0.3],
};

/** How far each basic movement goes on one model, compared with usual (1): less where something sits on the face, such as glasses. */
export type Reach = Partial<Record<Basis, number>>;

/**
 * Gives the geometry a morph target for each basic movement, made by nudging the points of the face the model already has
 * (brows, lids, mouth corners), so the face shows a feeling without a picture laid over it.
 */
export function addExpressions(geo: THREE.BufferGeometry, box: FaceBox, at: Features = FEATURES, reach: Reach = {}): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const spot = (f: [number, number]): [number, number] => [box.x0 + f[0] * w, box.y0 + f[1] * h];
  // a soft round patch of the face: 1 at its middle, 0 at its edge
  const blob = (c: [number, number], sx: number, sy: number) => {
    const [cx, cy] = spot(c);
    return (x: number, y: number) => Math.exp(-(((x - cx) / (sx * w)) ** 2 + ((y - cy) / (sy * w)) ** 2));
  };
  type Move = { patch: (x: number, y: number) => number; by: V3 };
  const browSpread = (c: [number, number], by: V3): Move => ({ patch: blob(c, 0.13, 0.06), by });
  const inner = (c: [number, number], by: V3): Move => ({ patch: blob(c, 0.09, 0.07), by });
  const lid = (c: [number, number], up: number): Move => ({ patch: blob([c[0], c[1] + 0.025], 0.09, 0.035), by: [0, up, 0] });
  const corner = (c: [number, number], by: V3): Move => ({ patch: blob(c, 0.075, 0.07), by });
  // the model's face is made of few points, so the movements are broad and strong enough to read at a glance
  const mm = (v: number) => (v * 2.6) / 1000;
  const moves: Record<Basis, Move[]> = {
    browDown: [browSpread(at.browL, [0, -mm(7), 0]), browSpread(at.browR, [0, -mm(7), 0])],
    browUp: [browSpread(at.browL, [0, mm(10), 0]), browSpread(at.browR, [0, mm(10), 0])],
    browInnerUp: [inner(at.innerL, [0, mm(10), 0]), inner(at.innerR, [0, mm(10), 0])],
    browInnerDown: [inner(at.innerL, [0, -mm(8), 0]), inner(at.innerR, [0, -mm(8), 0])],
    lidClose: [lid(at.eyeL, -mm(4)), lid(at.eyeR, -mm(4))],
    lidWide: [lid(at.eyeL, mm(4)), lid(at.eyeR, mm(4))],
    smileL: [corner(at.mouthL, [mm(4), mm(8), 0]), { patch: blob(at.cheekL, 0.07, 0.06), by: [0, mm(4), 0] }],
    smileR: [corner(at.mouthR, [-mm(4), mm(8), 0])],
    frown: [corner(at.mouthL, [0, -mm(7), 0]), corner(at.mouthR, [0, -mm(7), 0])],
    lipDown: [{ patch: blob(at.lip, 0.12, 0.04), by: [0, -mm(6), 0] }],
  };
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = BASIS.map((name) => {
    const delta = new Float32Array(pos.count * 3);
    const far = reach[name] ?? 1;
    for (let i = 0; i < pos.count; i++) {
      // only the front of the face moves, never the hair behind it
      const front = THREE.MathUtils.smoothstep(nor.getZ(i), 0.15, 0.5);
      if (front <= 0) continue;
      const x = pos.getX(i);
      const y = pos.getY(i);
      for (const m of moves[name]) {
        const k = m.patch(x, y) * front * far;
        delta[i * 3] += m.by[0] * k;
        delta[i * 3 + 1] += m.by[1] * k;
        delta[i * 3 + 2] += m.by[2] * k;
      }
    }
    return new THREE.Float32BufferAttribute(delta, 3);
  });
}

/** How many sizes of each picture the GPU may use when the person is far away: the full size and one halving. */
export const MIP_LEVELS = 2;

/**
 * Image-to-3D tools pack the model's picture as patches that touch with no gap: the hair's black patch sits right
 * next to the coat's white one. The GPU's smallest copies of the picture blend neighbouring patches, which shows as
 * white flecks on dark hair and trousers once the person is a few steps away. Stopping at half the
 * size keeps the blend to a pixel or two of the full picture.
 */
export function shortMips(tex: THREE.Texture | null | undefined): void {
  const image = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!tex || !image?.width || typeof document === 'undefined') return;
  const levels: CanvasImageSource[] = [image];
  let from: CanvasImageSource = image;
  for (let i = 1, w = image.width, h = image.height; i < MIP_LEVELS && w > 1 && h > 1; i++) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(from, 0, 0, w, h);
    levels.push(c);
    from = c;
  }
  tex.mipmaps = levels as unknown as THREE.Texture['mipmaps'];
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
}

/** The model's own pictures, lit like the rest of the town. */
export function glbMaterial(source: THREE.Material | null, glow: number): THREE.MeshLambertMaterial {
  const from = source as THREE.MeshStandardMaterial | null;
  shortMips(from?.map);
  shortMips(from?.normalMap);
  const material = new THREE.MeshLambertMaterial({ map: from?.map ?? null, normalMap: from?.normalMap ?? null });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = { value: glow };
    shader.fragmentShader =
      'uniform float uGlow;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;');
  };
  material.customProgramCacheKey = () => 'glbfigure';
  return material;
}

// ---------- the person ----------

export interface GlbOptions {
  /** Height in metres. */
  height: number;
  /** Shorter steps (a skirt or long coat). */
  skirt: boolean;
  face: FaceBox;
  joints?: Joints;
  features?: Features;
  /** Reads the model's colour picture; with it the hair is found and swings. */
  hair?: Sampler;
  /** How far the hair swings, compared with usual (1): less for hair laid close on the coat, so the coat never shows through. */
  hairSwing?: number;
  reach?: Reach;
  seed?: number;
  glow?: number;
}

/** A finished 3D model that stands, walks, looks around and shows how it feels, with the same interface as a figure built from pictures. */
export class GlbFigure {
  readonly root = new THREE.Group();
  readonly influences: Record<Basis, number> = Object.fromEntries(BASIS.map((b) => [b, 0])) as Record<Basis, number>;
  readonly bones = {} as Record<BoneName, THREE.Bone>;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly skirt: boolean;
  private readonly seed: number;
  private now: Pose | null = null;
  private feeling: Partial<Record<Basis, number>> = {};
  private mesh: THREE.SkinnedMesh;
  private readonly swing = HAIR.map(() => ({ x: 0, z: 0, vx: 0, vz: 0 }));
  private readonly hairSwing: number;
  private anchor: THREE.Vector3 | null = null;
  private readonly here = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();

  constructor(source: THREE.Mesh, opts: GlbOptions) {
    this.skirt = opts.skirt;
    this.hairSwing = opts.hairSwing ?? 1;
    this.seed = opts.seed ?? 0;
    this.material = glbMaterial(source.material as THREE.Material, opts.glow ?? 0.15);

    // stand it on the ground at the right height, wherever the tool put it
    const geo = source.geometry.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const k = opts.height / (box.max.y - box.min.y);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)));
    const layout = layoutFor(opts.height, opts.joints);
    skinTo(geo, layout);
    if (opts.hair) hairTo(geo, layout, opts.hair, opts.height);
    addExpressions(geo, opts.face, opts.features, opts.reach);
    this.geometry = geo;

    for (const name of ORDER) {
      const bone = new THREE.Bone();
      bone.name = name;
      const parent = layout.parent[name];
      const j = layout.joint[name];
      const pj = parent ? layout.joint[parent] : [0, 0, 0];
      bone.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      if (parent) this.bones[parent].add(bone);
      this.bones[name] = bone;
    }
    const mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh = mesh;
    mesh.frustumCulled = false;
    mesh.add(this.bones.hips);
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(ORDER.map((b) => this.bones[b])));
  }

  /** Shows a feeling on the face (it eases in), or none to go back to the face the model was made with. */
  setExpression(mood: Expression | null) {
    this.feeling = (mood && FEELINGS[mood]) || {};
  }

  /** Moves every joint part of the way toward the pose for this moment, so changes of mood and pace blend. */
  update(dt: number, a: Activity) {
    const want = poseAt({ ...a, skirt: this.skirt }, this.seed);
    const k = this.now ? 1 - Math.exp(-dt * 9) : 1;
    const mix = (x: number, y: number) => x + (y - x) * k;
    const mix3 = (x: V3, y: V3): V3 => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
    const n = this.now ?? want;
    const p: Pose = {
      spine: mix3(n.spine, want.spine),
      neck: mix3(n.neck, want.neck),
      armL: mix3(n.armL, want.armL),
      armR: mix3(n.armR, want.armR),
      legL: want.legL,
      legR: want.legR,
      kneeL: want.kneeL,
      kneeR: want.kneeR,
      drop: want.drop,
    };
    this.now = p;
    const b = this.bones;
    b.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
    b.neck.rotation.set(p.neck[0] * 0.4, p.neck[1] * 0.5, p.neck[2] * 0.5, 'YXZ');
    b.head.rotation.set(p.neck[0] * 0.6, p.neck[1] * 0.5, p.neck[2] * 0.5, 'YXZ');
    this.root.position.y = -p.drop;
    // arms hang a little away from the body at rest; the pose swings them from there, bending at the elbow as they come forward
    b.armL.rotation.set(p.armL[0], 0, p.armL[2]);
    b.armR.rotation.set(p.armR[0], 0, p.armR[2]);
    b.foreL.rotation.set(-Math.max(0, p.armL[0]) * 0.5, 0, 0);
    b.foreR.rotation.set(-Math.max(0, p.armR[0]) * 0.5, 0, 0);
    b.legL.rotation.set(p.legL, 0, 0);
    b.legR.rotation.set(p.legR, 0, 0);
    b.shinL.rotation.set(p.kneeL, 0, 0);
    b.shinR.rotation.set(p.kneeR, 0, 0);
    this.moveHair(dt, a);
    const ease = Math.min(1, dt * 6);
    BASIS.forEach((name, i) => {
      const goal = this.feeling[name] ?? 0;
      const v = this.influences[name] + (goal - this.influences[name]) * ease;
      this.influences[name] = Math.abs(v - goal) < 0.01 ? goal : v;
      this.mesh.morphTargetInfluences![i] = this.influences[name];
    });
  }

  /**
   * Swings the hair the way hair behind a moving head swings: the soft bones lag behind it. A spot in front of the head is followed,
   * so turning the head, walking and the bob of the steps all push the hair, and each bone springs back a little later than the one above.
   */
  private moveHair(dt: number, a: Activity) {
    if (dt <= 0) return;
    this.root.updateMatrixWorld(true);
    // a spot well out in front, so turning the head moves it a long way even though the head itself barely moves
    this.here.set(0, 0, 0.5);
    this.bones.head.localToWorld(this.here);
    const before = this.anchor;
    this.anchor = this.here.clone();
    if (!before) return;
    // how the head is moving, seen from the person: x to their left, z forward
    const v = this.here.clone().sub(before).divideScalar(dt);
    v.clampLength(0, 4).applyQuaternion(this.root.getWorldQuaternion(this.quat).invert());
    const steps = Math.min(4, Math.ceil(dt * 60));
    const h = dt / steps;
    this.swing.forEach((s, n) => {
      const bunch = Math.floor(n / HAIR_LINKS);
      const k = n % HAIR_LINKS;
      // every bunch has its own stiffness and rhythm, so neighbours swing out of step
      const own = LOCKS[bunch % LOCKS.length];
      const stiff = (150 - k * 30) * own;
      const damp = 2 * 0.35 * Math.sqrt(stiff);
      const gain = 0.03 + k * 0.005;
      const side = (0.2 + k * 0.02) * own;
      // each step sways the hair from side to side and bounces it a little, lower pieces later than the ones above (the spring does that)
      const phase = (a.stride / STEP_LENGTH) * Math.PI * 2 + bunch * 0.9;
      const sway = a.walk * (0.022 + k * 0.006) * Math.sin(phase);
      const bounce = a.walk * (0.02 + k * 0.005) * Math.abs(Math.cos(phase));
      for (let m = 0; m < steps; m++) {
        s.vx += (-stiff * (s.x - gain * v.z - bounce) - damp * s.vx) * h;
        s.vz += (-stiff * (s.z + side * v.x - sway) - damp * s.vz) * h;
        s.x += s.vx * h;
        s.z += s.vz * h;
      }
      s.x = THREE.MathUtils.clamp(s.x, -0.3, 0.3);
      s.z = THREE.MathUtils.clamp(s.z, -0.3, 0.3);
      this.bones[HAIR[n]].rotation.set(s.x * this.hairSwing, 0, s.z * this.hairSwing);
    });
  }

  /** The pose shown last frame (for tests and debugging). */
  get pose(): Pose | null {
    return this.now;
  }

  dispose() {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.normalMap?.dispose();
    this.material.dispose();
  }
}
