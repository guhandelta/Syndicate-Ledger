import * as THREE from 'three';
import type { Expression } from '../ui/voices';

/**
 * Low-poly 3D people for the town, built from each character's four body views (scripts/make-figures.py).
 * The shape is a stack of elliptical slices per body part; the four views are painted onto it from the
 * front, back and both sides. Parts hang from joints, so the person can walk, sway, turn their head and
 * show how they feel while you talk to them.
 */

/** One slice: height, centre x, centre z, half width, half depth (metres; the person faces +z). */
export type Ring = [y: number, cx: number, cz: number, rx: number, rz: number];

export type PartName = 'head' | 'body' | 'armL' | 'armR' | 'legL' | 'legR';
export type JointName = 'neck' | 'hip' | 'armL' | 'armR' | 'legL' | 'legR' | 'kneeL' | 'kneeR';
export type ViewName = 'front' | 'back' | 'side-left' | 'side-right';

/** Where one view sits in the texture: u0..u1 across, and the model coordinate at its left and right edge. */
export interface ViewSpan {
  u0: number;
  u1: number;
  from: number;
  to: number;
}

export interface Rig {
  height: number;
  /** A skirt or long coat: shorter steps. */
  skirt: boolean;
  /** Which arms are free to swing (an arm that isn't has no part of its own). */
  swing: Partial<Record<'armL' | 'armR', boolean>>;
  joints: Partial<Record<JointName, [number, number, number]>>;
  parts: Partial<Record<PartName, Ring[]>>;
  views: Record<ViewName, ViewSpan>;
  /** Where the expression face goes on the head: x0..x1 across, y0..y1 up. */
  face: { x0: number; x1: number; y0: number; y1: number };
  /** Which expression faces exist, per tone. */
  faces: Partial<Record<'crime' | 'friendly', Expression[]>>;
}

const SIDES = 12;

/**
 * A closed tube through the rings, with caps, in model coordinates moved so `origin` is at (0, 0, 0).
 * The `rest` attribute keeps the model position, which the paint is looked up by, however the part moves.
 */
export function partGeometry(rings: Ring[], origin: [number, number, number] = [0, 0, 0], sideViews = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  for (const [y, cx, cz, rx, rz] of rings) {
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      pos.push(cx + Math.sin(a) * rx, y, cz + Math.cos(a) * rz);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < SIDES; i++) {
      const a = r * SIDES + i;
      const b = r * SIDES + ((i + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      // rings run top to bottom, so this winding faces outward
      index.push(a, c, b, b, c, d);
    }
  }
  // caps: a centre point at the top and bottom
  const cap = (ring: Ring, base: number, down: boolean) => {
    const centre = pos.length / 3;
    pos.push(ring[1], ring[0], ring[2]);
    for (let i = 0; i < SIDES; i++) {
      const a = base + i;
      const b = base + ((i + 1) % SIDES);
      if (down) index.push(centre, b, a);
      else index.push(centre, a, b);
    }
  };
  cap(rings[0], 0, false);
  cap(rings[rings.length - 1], (rings.length - 1) * SIDES, true);

  const geo = new THREE.BufferGeometry();
  const rest = new Float32Array(pos);
  const moved = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    moved[i] = pos[i] - origin[0];
    moved[i + 1] = pos[i + 1] - origin[1];
    moved[i + 2] = pos[i + 2] - origin[2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(moved, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
  geo.setAttribute('sides', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(sideViews ? 1 : 0), 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Splits a leg's rings at the knee into thigh and shin, sharing the slice at the knee. */
export function splitAt(rings: Ring[], y: number): [upper: Ring[], lower: Ring[]] {
  const upper = rings.filter((r) => r[0] >= y);
  const lower = rings.filter((r) => r[0] < y);
  if (!upper.length || !lower.length) return [upper, lower];
  const a = upper[upper.length - 1];
  const b = lower[0];
  const t = (a[0] - y) / (a[0] - b[0]);
  const mid = a.map((v, i) => v + (b[i] - v) * t) as Ring;
  mid[0] = y;
  return [[...upper, mid], [mid, ...lower]];
}

// ---------- paint ----------

const VERTEX_HEAD = /* glsl */ `
attribute vec3 rest;
attribute float sides;
varying float vSides;
varying vec3 vRest;
varying vec3 vRestN;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uAtlas;
uniform sampler2D uFaceMap;
uniform vec4 uFront;
uniform vec4 uBack;
uniform vec4 uLeft;
uniform vec4 uRight;
uniform vec4 uFaceBox;
uniform float uFaceOn;
uniform float uHeight;
uniform float uGlow;
varying float vSides;
varying vec3 vRest;
varying vec3 vRestN;
vec3 view(vec4 s, float across, float v) {
  float u = clamp((across - s.z) / (s.w - s.z), 0.0, 1.0);
  return texture2D(uAtlas, vec2(mix(s.x, s.y, u), v)).rgb;
}
`;

const PAINT = /* glsl */ `
{
  vec3 n = normalize(vRestN);
  vec4 w = pow(max(vec4(n.z, -n.z, n.x, -n.x), 0.0), vec4(8.0)) + 0.0005;
  // the side pictures show the arms over the body and the face in profile, so the head and body never use them:
  // there the front and back pictures wrap round to meet at the sides
  if (vSides < 0.5) {
    vec2 fb = max(vec2(n.z, -n.z), 0.0);
    w = vec4(fb * fb + 0.001, 0.0, 0.0);
  }
  w /= w.x + w.y + w.z + w.w;
  float v = clamp(vRest.y / uHeight, 0.002, 0.998);
  vec3 c = w.x * view(uFront, vRest.x, v) + w.y * view(uBack, vRest.x, v)
         + w.z * view(uLeft, vRest.z, v) + w.w * view(uRight, vRest.z, v);
  vec2 f = vec2((vRest.x - uFaceBox.x) / (uFaceBox.y - uFaceBox.x), (vRest.y - uFaceBox.z) / (uFaceBox.w - uFaceBox.z));
  if (uFaceOn > 0.0 && f.x > 0.0 && f.x < 1.0 && f.y > 0.0 && f.y < 1.0) {
    vec2 d = (f - vec2(0.5, 0.5)) / vec2(0.44, 0.5);
    float m = (1.0 - smoothstep(0.62, 1.0, length(d))) * smoothstep(0.25, 0.65, n.z) * uFaceOn;
    c = mix(c, texture2D(uFaceMap, f).rgb, m);
  }
  diffuseColor.rgb *= c;
}
`;

export interface FigureUniforms {
  uAtlas: { value: THREE.Texture | null };
  uFaceMap: { value: THREE.Texture | null };
  uFront: { value: THREE.Vector4 };
  uBack: { value: THREE.Vector4 };
  uLeft: { value: THREE.Vector4 };
  uRight: { value: THREE.Vector4 };
  uFaceBox: { value: THREE.Vector4 };
  uFaceOn: { value: number };
  uHeight: { value: number };
  uGlow: { value: number };
}

const span = (s: ViewSpan) => new THREE.Vector4(s.u0, s.u1, s.from, s.to);

/** A flat-shaded material that paints the four views onto the model, and an expression face on the head. */
export function figureMaterial(rig: Rig, atlas: THREE.Texture | null, glow: number): { material: THREE.MeshLambertMaterial; uniforms: FigureUniforms } {
  const uniforms: FigureUniforms = {
    uAtlas: { value: atlas },
    uFaceMap: { value: null },
    uFront: { value: span(rig.views.front) },
    uBack: { value: span(rig.views.back) },
    uLeft: { value: span(rig.views['side-left']) },
    uRight: { value: span(rig.views['side-right']) },
    uFaceBox: { value: new THREE.Vector4(rig.face.x0, rig.face.x1, rig.face.y0, rig.face.y1) },
    uFaceOn: { value: 0 },
    uHeight: { value: rig.height },
    uGlow: { value: glow },
  };
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;\nvRestN = normal;\nvSides = sides;');
    shader.fragmentShader =
      FRAGMENT_HEAD +
      shader.fragmentShader
        .replace('#include <map_fragment>', PAINT)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;');
  };
  // every person uses the same program; only the uniforms differ
  material.customProgramCacheKey = () => 'figure3d';
  return { material, uniforms };
}

// ---------- movement ----------

/** What the person is doing this frame. */
export interface Activity {
  /** Seconds, on the person's own clock (each person is offset so they don't move in step). */
  t: number;
  /** 0 standing still .. 1 walking. */
  walk: number;
  /** Metres walked so far: drives the steps. */
  stride: number;
  /** How they feel while being talked to; null when no one is talking to them. */
  mood: Expression | null;
  /** Where to look, in radians to the left (+) or right (-) of where the body faces; null to glance around. */
  look: number | null;
  /** Shorter steps (a skirt or long coat). A figure takes this from its rig. */
  skirt?: boolean;
}

/** Joint angles in radians (x tips forward, y turns to the person's left, z swings an arm outward on the left) and how far the body sinks. */
export interface Pose {
  spine: [number, number, number];
  neck: [number, number, number];
  armL: [number, number, number];
  armR: [number, number, number];
  legL: number;
  legR: number;
  kneeL: number;
  kneeR: number;
  drop: number;
}

export const STEP_LENGTH = 1.25;

/** A smooth, repeatable wobble in -1..1, so idle glances differ per person and over time. */
export function wobble(t: number, seed: number): number {
  return Math.sin(t * 0.37 + seed) * 0.6 + Math.sin(t * 0.83 + seed * 2.1) * 0.4;
}

/** The pose for one moment. Pure, so it is the same on every machine and easy to test. */
export function poseAt(a: Activity, seed = 0): Pose {
  const { t, walk } = a;
  const phase = (a.stride / STEP_LENGTH) * Math.PI * 2;
  const fwd = Math.sin(phase) * walk;
  const lift = Math.cos(phase) * walk;
  const legSwing = a.skirt ? 0.3 : 0.42;
  const still = 1 - walk;

  const p: Pose = {
    // breathing and a slow shift of weight from foot to foot
    spine: [Math.sin(t * 1.7 + seed) * 0.012 * still + 0.03 * walk, fwd * 0.07, Math.sin(t * 0.45 + seed) * 0.03 * still],
    neck: [0, 0, 0],
    armL: [fwd * 0.32 + Math.sin(t * 1.7 + seed) * 0.02 * still, 0, 0],
    armR: [-fwd * 0.32 + Math.sin(t * 1.7 + seed + 1) * 0.02 * still, 0, 0],
    legL: -fwd * legSwing,
    legR: fwd * legSwing,
    kneeL: Math.max(0, lift) * 0.6,
    kneeR: Math.max(0, -lift) * 0.6,
    drop: walk * 0.025 * (1 - Math.abs(Math.cos(phase))),
  };

  // where they look: at you when you are near, otherwise around them now and then
  p.neck[1] = a.look ?? wobble(t, seed) * 0.55 * still;
  p.neck[0] = 0.02 * walk;

  switch (a.mood) {
    case 'neutral':
      // small nods while listening
      p.neck[0] += Math.max(0, Math.sin(t * 2.4)) ** 3 * 0.08;
      break;
    case 'suspicious':
      p.neck[2] = 0.14;
      p.neck[1] += 0.12;
      p.spine[0] -= 0.05;
      break;
    case 'caught-lying':
      // eyes down and away, shoulders in
      p.neck[0] += 0.3;
      p.neck[1] += 0.4 + Math.sin(t * 1.3) * 0.05;
      p.spine[0] += 0.07;
      p.armL[2] = -0.06;
      p.armR[2] = 0.06;
      break;
    case 'nervous':
      // fidgets: quick glances, shifting weight, hands that won't keep still
      p.neck[1] += Math.sin(t * 5.3) * 0.12 + Math.sin(t * 8.1) * 0.05;
      p.spine[2] += Math.sin(t * 3.1) * 0.04;
      p.armL[0] -= 0.2 + Math.sin(t * 7) * 0.08;
      p.armR[0] -= 0.2 + Math.sin(t * 7 + 1.5) * 0.08;
      break;
    case 'angry':
      // leans in, arms held out from the body, breathing hard
      p.spine[0] += 0.12 + Math.sin(t * 4) * 0.015;
      p.neck[0] -= 0.08;
      p.armL[2] = 0.22;
      p.armR[2] = -0.22;
      break;
    case 'scared':
      // pulls back and shrinks, hands up, trembling
      p.spine[0] -= 0.12;
      p.neck[0] += 0.08 + Math.sin(t * 31) * 0.012;
      p.armL[0] = -0.55 + Math.sin(t * 29) * 0.03;
      p.armR[0] = -0.55 + Math.sin(t * 27) * 0.03;
      p.drop += 0.03;
      break;
    case 'smug':
      // chin up, head tilted, chest out
      p.neck[0] -= 0.16;
      p.neck[2] = -0.1;
      p.spine[0] -= 0.06;
      p.armL[0] += 0.1;
      p.armR[0] += 0.1;
      break;
  }
  return p;
}

// ---------- the person ----------

const at = (j: [number, number, number] | undefined, fallback: [number, number, number]): [number, number, number] => j ?? fallback;

/** One 3D person, standing at their feet. Call update every frame. */
export class Figure3D {
  readonly root = new THREE.Group();
  readonly uniforms: FigureUniforms;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly spine = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly arms: Partial<Record<'armL' | 'armR', THREE.Group>> = {};
  private readonly legs: Partial<Record<'legL' | 'legR', THREE.Group>> = {};
  private readonly knees: Partial<Record<'kneeL' | 'kneeR', THREE.Group>> = {};
  private readonly rig: Rig;
  private readonly seed: number;
  private now: Pose | null = null;
  private faceTarget = 0;

  constructor(rig: Rig, atlas: THREE.Texture | null, opts: { glow?: number; seed?: number } = {}) {
    this.rig = rig;
    this.seed = opts.seed ?? 0;
    const { material, uniforms } = figureMaterial(rig, atlas, opts.glow ?? 0.15);
    this.material = material;
    this.uniforms = uniforms;
    const H = rig.height;
    const hip = at(rig.joints.hip, [0, H * 0.5, 0]);
    const neck = at(rig.joints.neck, [0, H * 0.82, 0]);

    const mesh = (rings: Ring[] | undefined, origin: [number, number, number], sideViews = true) => {
      if (!rings || rings.length < 2) return null;
      return new THREE.Mesh(partGeometry(rings, origin, sideViews), material);
    };
    const place = (g: THREE.Object3D, j: [number, number, number], parent: [number, number, number]) => {
      g.position.set(j[0] - parent[0], j[1] - parent[1], j[2] - parent[2]);
    };

    // hips carry the body; the body carries head and arms
    place(this.spine, hip, [0, 0, 0]);
    this.root.add(this.spine);
    const body = mesh(rig.parts.body, hip, false);
    if (body) this.spine.add(body);
    place(this.neck, neck, hip);
    this.spine.add(this.neck);
    const head = mesh(rig.parts.head, neck, false);
    if (head) this.neck.add(head);

    for (const side of ['armL', 'armR'] as const) {
      const j = rig.joints[side];
      const m = j && mesh(rig.parts[side], j);
      if (!j || !m) continue;
      const g = new THREE.Group();
      place(g, j, hip);
      g.add(m);
      this.spine.add(g);
      this.arms[side] = g;
    }
    for (const side of ['legL', 'legR'] as const) {
      const j = rig.joints[side];
      const rings = rig.parts[side];
      if (!j || !rings) continue;
      const kneeName = side === 'legL' ? 'kneeL' : 'kneeR';
      const k = at(rig.joints[kneeName], [j[0], H * 0.28, j[2]]);
      const [thigh, shin] = splitAt(rings, k[1]);
      const g = new THREE.Group();
      place(g, j, [0, 0, 0]);
      const top = mesh(thigh, j);
      if (top) g.add(top);
      const kg = new THREE.Group();
      place(kg, k, j);
      const low = mesh(shin, k);
      if (low) kg.add(low);
      g.add(kg);
      this.root.add(g);
      this.legs[side] = g;
      this.knees[kneeName] = kg;
    }
  }

  /** Shows an expression face on the head (fades in), or none to go back to the face in the body art. */
  setFace(face: THREE.Texture | null) {
    if (face) this.uniforms.uFaceMap.value = face;
    this.faceTarget = face ? 1 : 0;
  }

  setAtlas(atlas: THREE.Texture) {
    this.uniforms.uAtlas.value = atlas;
  }

  /** Moves every joint part of the way toward the pose for this moment, so changes of mood and pace blend. */
  update(dt: number, a: Activity) {
    const want = poseAt({ ...a, skirt: this.rig.skirt }, this.seed);
    const k = this.now ? 1 - Math.exp(-dt * 9) : 1;
    const mix = (x: number, y: number) => x + (y - x) * k;
    const mix3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
    const n = this.now ?? want;
    // steps follow the feet exactly; only the upper body eases
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
    this.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
    this.neck.rotation.set(p.neck[0], p.neck[1], p.neck[2], 'YXZ');
    this.root.position.y = -p.drop;
    // an arm held against the body (holding something) has no part of its own, so it stays with the body
    this.arms.armL?.rotation.set(p.armL[0], 0, p.armL[2]);
    this.arms.armR?.rotation.set(p.armR[0], 0, p.armR[2]);
    this.legs.legL?.rotation.set(p.legL, 0, 0);
    this.legs.legR?.rotation.set(p.legR, 0, 0);
    this.knees.kneeL?.rotation.set(p.kneeL, 0, 0);
    this.knees.kneeR?.rotation.set(p.kneeR, 0, 0);
    const f = this.uniforms.uFaceOn;
    f.value += (this.faceTarget - f.value) * Math.min(1, dt * 6);
    if (Math.abs(f.value - this.faceTarget) < 0.01) f.value = this.faceTarget;
  }

  /** The pose shown last frame (for tests and debugging). */
  get pose(): Pose | null {
    return this.now;
  }

  dispose() {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
  }
}
