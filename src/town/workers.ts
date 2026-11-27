import * as THREE from 'three';
import { OUTFITS, workerPose, type Action, type Outfit, type OutfitId } from './workerActions';

/**
 * A shop worker: a simple low-poly person built from boxes (like the detective), with jointed arms and legs, a thing
 * in hand for their trade, and a loop of work. Stand-ins until Guha's own background people arrive.
 */

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
}

const HIP = 0.86;
/** How high the hips sit on a stool, or squatting. */
const SEAT = 0.5;
const SQUAT = 0.48;

export class Worker {
  readonly root = new THREE.Group();
  /** Every material, so the town can light them up a little at night. */
  readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL: Arm;
  private readonly armR: Arm;
  private readonly legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private skirt: THREE.Mesh | null = null;
  /** Things that show only at a moment of the work: a flower in hand, the stream of tea. */
  private held: THREE.Object3D | null = null;
  private stream: THREE.Mesh | null = null;
  private readonly seed: number;

  constructor(
    readonly action: Action,
    outfitId: OutfitId,
    seed: number,
  ) {
    this.seed = seed;
    const o: Outfit = OUTFITS[outfitId];
    const mat = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      this.materials.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, y = 0, z = 0, x = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const skin = mat(o.skin);
    const top = mat(o.top);
    const bottom = mat(o.bottom);
    const hair = mat(o.hair);
    const feet = mat(0x2a2420);

    this.root.add(this.hips);
    this.hips.position.y = HIP;
    // legs: thigh and shin on hip and knee joints
    for (const x of [-0.1, 0.1]) {
      const hip = new THREE.Group();
      hip.position.x = x;
      hip.add(box(0.15, 0.42, 0.16, bottom, -0.21));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      knee.add(box(0.13, 0.4, 0.14, bottom, -0.2), box(0.13, 0.06, 0.24, feet, -0.41, 0.05));
      hip.add(knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }
    if (o.skirt) {
      // a saree falls to the ankles while standing
      this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, 0.82, 8), bottom);
      this.skirt.position.y = -0.41;
      this.hips.add(this.skirt);
    }
    // body
    this.hips.add(this.torso);
    this.torso.add(box(0.36, 0.56, 0.22, top, 0.28));
    if (o.skirt) this.torso.add(box(0.1, 0.56, 0.235, top, 0.28, 0, 0.12)); // the pallu over one shoulder
    if (o.apron) this.torso.add(box(0.3, 0.62, 0.02, mat(o.apron), 0.06, 0.12));
    if (o.towel) this.torso.add(box(0.12, 0.05, 0.24, mat(o.towel), 0.57, 0, -0.12));
    if (o.tape) this.torso.add(box(0.05, 0.36, 0.235, mat(o.tape), 0.38, 0, 0.07), box(0.05, 0.36, 0.235, mat(o.tape), 0.38, 0, -0.07));
    // head, hair, face
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    this.head.add(box(0.08, 0.08, 0.08, skin, 0.02), box(0.21, 0.25, 0.22, skin, 0.17));
    this.head.add(box(0.23, 0.08, 0.24, hair, 0.31), box(0.23, 0.2, 0.06, hair, 0.22, -0.1));
    const eye = mat(0x1a1410);
    this.head.add(box(0.035, 0.03, 0.01, eye, 0.19, 0.111, -0.05), box(0.035, 0.03, 0.01, eye, 0.19, 0.111, 0.05));
    if (o.glasses) this.head.add(box(0.19, 0.012, 0.01, eye, 0.205, 0.116));
    if (o.cap) this.head.add(box(0.24, 0.07, 0.25, mat(o.cap), 0.35), box(0.2, 0.025, 0.1, mat(o.cap), 0.32, 0.15));
    if (o.scarf) this.head.add(box(0.25, 0.14, 0.26, mat(o.scarf), 0.32, -0.005), box(0.25, 0.22, 0.05, mat(o.scarf), 0.2, -0.12));
    if (o.skirt && !o.scarf) this.head.add(box(0.12, 0.12, 0.1, hair, 0.24, -0.15)); // a bun
    if (o.bloom) this.head.add(box(0.07, 0.07, 0.07, mat(o.bloom), 0.27, -0.17, 0.06));
    // arms: upper arm on the shoulder, forearm on the elbow, a hand to hold things
    const arm = (x: number): Arm => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 0.52, 0);
      shoulder.add(box(0.1, 0.3, 0.1, top, -0.13));
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      elbow.add(box(0.085, 0.26, 0.085, skin, -0.13));
      const hand = new THREE.Group();
      hand.position.y = -0.28;
      hand.add(box(0.08, 0.08, 0.06, skin));
      elbow.add(hand);
      shoulder.add(elbow);
      this.torso.add(shoulder);
      return { shoulder, elbow, hand };
    };
    // facing south (+z), the worker's left hand is on the east (+x)
    this.armL = arm(0.24);
    this.armR = arm(-0.24);
    this.addTools(mat);
    // a soft shadow under them
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);
    this.update(0);
  }

  /** The things each trade holds. Hands hang down (-y), so a held thing points along -y from the palm. */
  private addTools(mat: (c: number) => THREE.MeshLambertMaterial) {
    const R = this.armR.hand;
    const L = this.armL.hand;
    const put = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat(color));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const cup = () => new THREE.CylinderGeometry(0.04, 0.035, 0.1, 8);
    switch (this.action) {
      case 'pour': {
        const kettle = put(R, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), 0x9a948a, 0, -0.1, 0.02);
        put(kettle, new THREE.CylinderGeometry(0.015, 0.02, 0.14, 5), 0x9a948a, 0, -0.04, 0.1).rotation.x = 1.0;
        put(L, cup(), 0xd8d2c4, 0, -0.06, 0.03);
        // the long stream of tea between kettle and tumbler, stretched each frame
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshBasicMaterial({ color: 0xb07a40, transparent: true, opacity: 0.85 }));
        this.root.add(s);
        this.stream = s;
        break;
      }
      case 'sip':
        put(R, cup(), 0xd8d2c4, 0, -0.06, 0.03);
        break;
      case 'repair':
        put(R, new THREE.BoxGeometry(0.03, 0.18, 0.02), 0x8a9096, 0, -0.1);
        break;
      case 'gut':
        put(R, new THREE.BoxGeometry(0.02, 0.2, 0.04), 0xc8ccd0, 0, -0.12);
        put(L, new THREE.SphereGeometry(0.1, 6, 4), 0x8fa2b4, 0, -0.06, 0.06).scale.set(0.5, 1.8, 0.5);
        break;
      case 'arrange': {
        const stem = new THREE.Group();
        put(stem, new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), 0x4f7a3a, 0, -0.12);
        put(stem, new THREE.SphereGeometry(0.07, 6, 4), 0xe87a5a, 0, -0.28);
        R.add(stem);
        this.held = stem;
        break;
      }
      case 'pin':
        put(R, new THREE.BoxGeometry(0.16, 0.2, 0.01), 0xf0e6cc, 0, -0.12, 0.05);
        put(L, new THREE.BoxGeometry(0.2, 0.26, 0.04), 0xf0e6cc, 0, -0.1, 0.08);
        break;
      case 'mend':
        put(R, new THREE.BoxGeometry(0.03, 0.14, 0.02), 0xc8a86a, 0, -0.07);
        break;
      case 'sew':
        put(L, new THREE.BoxGeometry(0.3, 0.02, 0.22), 0xc8b48a, -0.05, -0.04, 0.08);
        put(R, new THREE.BoxGeometry(0.008, 0.08, 0.008), 0xe0e0e0, 0, -0.06);
        break;
      case 'pump':
        // the pump's T-handle across both hands
        put(R, new THREE.BoxGeometry(0.5, 0.04, 0.04), 0x2a2620, 0.24, -0.05);
        break;
      case 'measure':
        // the tape stretched between the two hands
        put(R, new THREE.BoxGeometry(0.5, 0.012, 0.03), 0xe0c040, 0.24, -0.06);
        break;
      case 'press':
        put(R, new THREE.BoxGeometry(0.12, 0.08, 0.22), 0x9aa0a8, 0, -0.08, 0.04);
        break;
      case 'coil':
        put(R, new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5), 0xc8a86a, 0, -0.2);
        put(L, new THREE.TorusGeometry(0.14, 0.03, 4, 12), 0xc8a86a, 0, -0.12, 0.04);
        break;
    }
  }

  /** Strikes the pose for time t. */
  update(t: number) {
    const p = workerPose(this.action, t, this.seed);
    const setArm = (a: Arm, s: { fwd: number; side: number; elbow: number }, left: boolean) => {
      a.shoulder.rotation.set(-s.fwd, 0, left ? s.side : -s.side);
      a.elbow.rotation.x = -s.elbow;
    };
    setArm(this.armL, p.armL, true);
    setArm(this.armR, p.armR, false);
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.head.rotation.set(p.pitch, p.yaw, 0);
    const sit = p.stance === 'sit';
    const squat = p.stance === 'squat';
    this.hips.position.y = sit ? SEAT : squat ? SQUAT : HIP;
    this.legs.forEach((leg, i) => {
      // sitting: thighs forward, shins down; squatting: knees up high, one foot back a little
      leg.hip.rotation.x = sit ? -1.5 : squat ? -1.9 + i * 0.3 : 0;
      leg.knee.rotation.x = sit ? 1.5 : squat ? 2.3 - i * 0.2 : 0;
      leg.hip.rotation.z = sit || squat ? (i ? 0.12 : -0.12) : 0;
    });
    if (this.skirt) this.skirt.visible = !sit && !squat;
    if (this.held) this.held.visible = p.beat > 0.5;
    if (this.stream) {
      // from the kettle's spout down to the tumbler, only while the tea is pulled high
      this.root.updateMatrixWorld(true);
      const a = this.root.worldToLocal(this.armR.hand.localToWorld(new THREE.Vector3(0, -0.12, 0.12)));
      const b = this.root.worldToLocal(this.armL.hand.localToWorld(new THREE.Vector3(0, -0.02, 0.03)));
      const len = a.distanceTo(b);
      this.stream.visible = p.beat > 0.25 && len > 0.1;
      this.stream.position.copy(a).add(b).multiplyScalar(0.5);
      this.stream.scale.set(1, len, 1);
      this.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}
