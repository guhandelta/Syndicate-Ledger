import * as THREE from 'three';
import type { Expression } from '../ui/voices';
import { CAST3D, faceOf } from './cast3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildingParts, seaLine, type Part } from './buildingStyles';
import { Figure3D } from './figure3d';
import { GlbFigure, meshOf } from './glbFigure';
import { samplerOf } from './glbPixels';
import { SHOPS, shopParts, shopProps, shopSolids, shopWorkers } from './shops';
import { Worker } from './workers';
import { DAY, DAY_HOUR, NIGHT, NIGHT_HOUR, easeHour, lookAt, type Look } from './looks';
import { cameraPose, forward, nearest, npcPosition, npcPresent, shotFocus, shotPose, step, type Nearby, type Pose } from './townLogic';
import type { Building, CameraKind, Door, Npc, Prop, Shot, Town, Vec2 } from './townTypes';

/** How a door's marker is drawn. */
export type DoorState = 'open' | 'started' | 'solved' | 'locked' | 'plain';

export interface TownView {
  doorStates: Record<string, DoorState>;
  firedEvents: string[];
  /** The hour the story has reached; the town's light eases toward it. */
  hour?: number;
}

export interface TownSceneOptions {
  town: Town;
  /** Image URL for each cast member's standing figure. */
  figures: Record<string, string>;
  /** Cast colour, used for the ring under each person. */
  colors: Record<string, string>;
  /** Junior mode: daylight and no rain. */
  friendly: boolean;
  /** The hour of the day the story has reached (see storyHour); the town opens at it. */
  hour?: number;
  pose?: Pose;
  onNearby: (n: Nearby | null) => void;
}

/** Night-time colour of the pier's wooden edge and its daytime colour. */
const EDGE_NIGHT = 0x4a3a2a;
const EDGE_DAY = 0x9a7a52;

/** A colour as a CSS string. */
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const WALK = 4.6;
const RUN = 7.5;
const TURN = 2.6;
const FIGURE_HEIGHT = 1.85;

const DOOR_COLORS: Record<DoorState, number> = { open: 0xf0c050, started: 0xf0c050, solved: 0x5fae6e, locked: 0x8a4a44, plain: 0x8fb7e8 };

interface Person {
  npc: Npc;
  group: THREE.Group;
  /** Turns and tilts the flat figure toward the camera, about its feet. */
  pivot: THREE.Group;
  /** A flat picture, for someone with no 3D figure yet. */
  figure?: THREE.Mesh;
  /** The 3D figure, when there is one. */
  body?: Figure3D | GlbFigure;
  /** Which way a 3D figure faces (radians; 0 faces south, toward the usual camera). */
  heading: number;
  stride: number;
  walk: number;
  /** Each person's own clock offset, so nobody sways in step. */
  seed: number;
  at: Vec2;
  present: boolean;
}

/** How close the player must be before people look at them. */
const NOTICE = 6;

/** The 3D harbor. It draws what the town file describes and reports who or what the player is next to. */
export class TownScene {
  readonly pose: Pose;
  cameraKind: CameraKind;
  /** Set while a conversation or dialog is open: the player stands still. */
  paused = false;

  private readonly town: Town;
  private readonly opts: TownSceneOptions;
  /** The look of the day right now, and the hour it was made for. */
  private look: Look;
  private hourShown: number;
  private hourTarget: number;
  private readonly lamps: { bulb: THREE.MeshLambertMaterial; light?: THREE.PointLight; pool?: THREE.MeshBasicMaterial }[] = [];
  private readonly windows: THREE.MeshLambertMaterial[] = [];
  private readonly cabins: THREE.MeshLambertMaterial[] = [];
  /** Flat pictures of people, tinted by the light. */
  private readonly tints: THREE.MeshBasicMaterial[] = [];
  private hemi!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private streetMat!: THREE.MeshLambertMaterial;
  private edgeMat!: THREE.MeshLambertMaterial;
  private waterMat!: THREE.MeshPhongMaterial;
  private waterMesh!: THREE.Mesh;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  private readonly camTarget = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private readonly player = new THREE.Group();
  private readonly limbs: THREE.Object3D[] = [];
  private readonly people: Person[] = [];
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly boats: THREE.Object3D[] = [];
  /** Things floating out on the sea, each rocking from its own base height. */
  private readonly floaters: { obj: THREE.Object3D; y: number; phase: number }[] = [];
  /** Foam running in on the quay edge. */
  private readonly foam: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; z: number; phase: number }[] = [];
  /** The lighthouse beam, and the lantern it turns with. */
  private beam: { pivot: THREE.Object3D; mat: THREE.MeshBasicMaterial } | null = null;
  private readonly buildings: { b: Building; mats: THREE.Material[]; opacity: number }[] = [];
  /** The people at work outside the shops, and the points the detective walks round there. */
  private readonly workers: Worker[] = [];
  private readonly shopSolids: Vec2[] = [];
  /** Shop pictures that light up at dusk (windows, the stall's lamp), and things that move by themselves. */
  private readonly shopGlows: THREE.MeshLambertMaterial[] = [];
  private readonly movers: { obj: THREE.Object3D; anim: 'spin' | 'flap'; phase: number }[] = [];
  private readonly textures = new THREE.TextureLoader();
  private rain: THREE.Points | null = null;
  private focus: Vec2 | undefined;
  /** Who the player is talking to, and how they feel about it. */
  private talking: Person | undefined;
  private mood: Expression | null = null;
  private readonly faces = new Map<string, THREE.Texture>();
  private explore: CameraKind;
  private time = 0;
  private stride = 0;
  private last = 0;
  private raf = 0;
  private lastNearby = '';
  private introLeft = 0;
  private shot: Shot | null = null;
  private shotTime = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: TownSceneOptions) {
    this.opts = opts;
    this.town = opts.town;
    // Junior's town stays in friendly daylight; the grown-up town follows the story's hour (the dark of night when it has none)
    this.hourShown = this.hourTarget = opts.friendly ? DAY_HOUR : (opts.hour ?? NIGHT_HOUR);
    this.look = lookAt(this.hourShown);
    this.explore = this.town.moments.explore;
    this.pose = opts.pose ? { ...opts.pose } : { x: this.town.start.at[0], z: this.town.start.at[1], heading: this.town.start.heading };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(this.look.sky);
    this.scene.fog = new THREE.Fog(this.look.sky, this.look.fogNear, this.look.fogFar);

    this.buildLights();
    this.buildGround();
    for (const b of this.town.buildings) {
      const group = this.makeBuilding(b);
      const mats: THREE.Material[] = [];
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) {
          m.transparent = true;
          mats.push(m);
        }
      });
      this.buildings.push({ b, mats, opacity: 1 });
      this.scene.add(group);
      this.addWorkers(b);
    }
    for (const p of this.town.props) this.addProp(p);
    for (const d of this.town.doors) this.addMarker(d);
    for (const n of this.town.npcs) this.addPerson(n);
    this.buildPlayer();
    if (!opts.friendly && this.town.weather !== 'clear') this.buildRain();
    this.applyLook();

    // First visit opens on the wide shot, then settles on the player.
    if (opts.pose) {
      this.cameraKind = this.explore;
    } else {
      this.cameraKind = this.town.moments.enter;
      this.introLeft = 1.8;
    }
    const start = cameraPose(this.cameraKind, this.town.cameras, this.pose);
    this.camera.position.set(...start.position);
    this.camTarget.set(...start.target);
    this.camera.lookAt(this.camTarget);

    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public controls ----------

  setKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys() {
    this.keys.clear();
  }

  /** Switches between the angled and behind-the-player views while exploring. */
  toggleExplore(): CameraKind {
    this.explore = this.explore === 'behind' ? 'angled' : 'behind';
    if (!this.focus) this.cameraKind = this.explore;
    this.introLeft = 0;
    return this.explore;
  }

  get exploreKind(): CameraKind {
    return this.explore;
  }

  /** Moves the camera in on a person for a conversation; call with no one to go back to exploring. */
  talkTo(castId?: string) {
    const person = castId ? this.people.find((p) => p.npc.cast === castId) : undefined;
    this.focus = person?.at;
    if (this.talking !== person) this.talking?.body && this.showMood(this.talking.body, null);
    this.talking = person;
    if (!person) this.mood = null;
    else this.applyMood();
    this.introLeft = 0;
    this.cameraKind = person ? this.town.moments.talk : this.explore;
    if (person) {
      // turn to face them
      this.pose.heading = Math.atan2(person.at[0] - this.pose.x, -(person.at[1] - this.pose.z));
    }
  }

  /** How the person being talked to feels: their face and body language follow it. */
  setMood(mood: Expression | null) {
    this.mood = mood;
    this.applyMood();
  }

  private applyMood() {
    const body = this.talking?.body;
    if (body) this.showMood(body, this.mood);
  }

  /** Puts a feeling on a person's face: a finished 3D model moves its own face, a figure from pictures gets the expression picture. */
  private showMood(body: Figure3D | GlbFigure, mood: Expression | null) {
    if (body instanceof GlbFigure) return body.setExpression(mood);
    const url = mood ? faceOf(this.talking!.npc.cast, mood, this.opts.friendly) : undefined;
    if (!url) return body.setFace(null);
    let tex = this.faces.get(url);
    if (!tex) {
      tex = new THREE.TextureLoader().load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.faces.set(url, tex);
    }
    body.setFace(tex);
  }

  /** Plays a story shot until it is ended with no argument. The caller pauses the walk and times it. */
  playShot(shot?: Shot) {
    this.shot = shot ?? null;
    this.shotTime = 0;
    this.introLeft = 0;
    if (!this.focus) this.cameraKind = this.explore;
  }

  /** True while the opening wide shot is still on screen. */
  get inIntro(): boolean {
    return this.introLeft > 0;
  }

  setView(view: TownView) {
    for (const [id, mesh] of this.markers) {
      const state = view.doorStates[id] ?? 'plain';
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(DOOR_COLORS[state]);
      mesh.userData.pulse = state === 'open' || state === 'started' || state === 'plain';
    }
    for (const p of this.people) {
      p.present = npcPresent(p.npc, view.firedEvents);
      p.group.visible = p.present;
    }
    // the light eases toward the story's hour (Junior's stays in daylight)
    if (!this.opts.friendly && view.hour !== undefined) this.hourTarget = view.hour;
  }

  /** How much the figures glow in the light of now: more in the dark, so they stand out against the night. */
  private glow(): number {
    return 0.22 + (0.05 - 0.22) * this.look.daylight;
  }

  /** Paints the town in the light of the hour shown now. */
  private applyLook() {
    const k = (this.look = lookAt(this.hourShown));
    (this.scene.background as THREE.Color).setHex(k.sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(k.sky);
    fog.near = k.fogNear;
    fog.far = k.fogFar;
    this.hemi.color.setHex(k.hemiSky);
    this.hemi.groundColor.setHex(k.hemiGround);
    this.hemi.intensity = k.hemi;
    this.sunLight.color.setHex(k.sun);
    this.sunLight.intensity = k.sunPower;
    // the street is painted in daylight colours; the darker the hour, the more the ground is tinted down
    this.streetMat.color.setRGB(...[16, 8, 0].map((shift) => ((k.ground >> shift) & 255) / ((DAY.ground >> shift) & 255)) as [number, number, number]);
    const edge = new THREE.Color(EDGE_NIGHT).lerp(new THREE.Color(EDGE_DAY), k.daylight);
    this.edgeMat.color.copy(edge);
    this.waterMat.color.setHex(k.water);
    for (const w of this.windows) {
      w.emissive.setHex(k.window);
      w.emissiveIntensity = 1 + (0.25 - 1) * k.daylight;
    }
    for (const c of this.cabins) {
      c.emissive.setHex(k.window);
      c.emissiveIntensity = 0.25 * (1 - k.daylight);
    }
    for (const l of this.lamps) {
      l.bulb.emissiveIntensity = 2 + (0.2 - 2) * k.daylight;
      if (l.light) l.light.intensity = k.lamp * 14;
      if (l.pool) l.pool.opacity = 0.1 * Math.min(1, k.lamp / NIGHT.lamp);
    }
    if (this.beam) this.beam.mat.opacity = 0.12 * (1 - k.daylight);
    for (const t of this.tints) t.color.setHex(k.figureTint);
    for (const m of this.shopGlows) m.emissiveIntensity = 0.7 * (1 - k.daylight);
    const glow = this.glow();
    for (const w of this.workers) for (const m of w.materials) m.emissiveIntensity = glow * 0.9;
    for (const p of this.people) {
      if (p.body instanceof GlbFigure) p.body.setGlow(glow);
      else if (p.body) p.body.uniforms.uGlow.value = glow;
    }
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const p of this.people) p.body?.dispose();
    for (const w of this.workers) w.dispose();
    for (const t of this.faces.values()) t.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
  }

  // ---------- frame loop ----------

  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    if (this.hourShown !== this.hourTarget) {
      this.hourShown = easeHour(this.hourShown, this.hourTarget, dt);
      this.applyLook();
    }
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  private held(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  private update(dt: number) {
    // people first, so the player collides with where they are now
    for (const p of this.people) {
      const { at, moving } = npcPosition(p.npc, this.time);
      if (p.body) {
        this.moveBody(p, at, moving, dt);
        continue;
      }
      p.at = at;
      p.group.position.set(at[0], 0, at[1]);
      p.figure!.position.y = FIGURE_HEIGHT / 2 + (moving ? Math.abs(Math.sin(this.time * 7)) * 0.07 : 0);
      // a flat figure always turns to face the camera, and leans back when seen from above
      const cx = this.camera.position.x - at[0];
      const cz = this.camera.position.z - at[1];
      p.pivot.rotation.y = Math.atan2(cx, cz);
      p.pivot.rotation.x = -Math.min(1, Math.max(0, Math.atan2(this.camera.position.y - 1, Math.hypot(cx, cz)))) * 0.85;
    }

    let moving = false;
    if (!this.paused) {
      const up = this.held('KeyW', 'ArrowUp');
      const down = this.held('KeyS', 'ArrowDown');
      const left = this.held('KeyA', 'ArrowLeft');
      const right = this.held('KeyD', 'ArrowRight');
      const speed = this.held('ShiftLeft', 'ShiftRight') ? RUN : WALK;
      let dx = 0;
      let dz = 0;
      if (this.explore === 'behind') {
        // tank controls: turn with left and right, walk with up and down
        this.pose.heading += ((right ? 1 : 0) - (left ? 1 : 0)) * TURN * dt;
        const go = (up ? 1 : 0) - (down ? 0.6 : 0);
        const [fx, fz] = forward(this.pose.heading);
        dx = fx * go * speed * dt;
        dz = fz * go * speed * dt;
      } else {
        const ix = (right ? 1 : 0) - (left ? 1 : 0);
        const iz = (down ? 1 : 0) - (up ? 1 : 0);
        const len = Math.hypot(ix, iz);
        if (len) {
          dx = (ix / len) * speed * dt;
          dz = (iz / len) * speed * dt;
          const want = Math.atan2(ix, -iz);
          let diff = want - this.pose.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.pose.heading += diff * Math.min(1, dt * 12);
        }
      }
      if (dx || dz) {
        if (this.introLeft > 0) this.introLeft = 0;
        const here: Vec2 = [this.pose.x, this.pose.z];
        const next = step(this.town, here, dx, dz, [...this.people.filter((p) => p.present).map((p) => p.at), ...this.shopSolids]);
        moving = Math.hypot(next[0] - here[0], next[1] - here[1]) > 1e-4;
        this.stride += Math.hypot(next[0] - here[0], next[1] - here[1]);
        this.pose.x = next[0];
        this.pose.z = next[1];
      }
    }

    this.player.position.set(this.pose.x, 0, this.pose.z);
    this.player.rotation.y = -this.pose.heading;
    const swing = moving ? Math.sin(this.stride * 3.2) * 0.6 : 0;
    this.limbs.forEach((limb, i) => (limb.rotation.x += ((i % 2 ? -swing : swing) - limb.rotation.x) * Math.min(1, dt * 14)));

    // camera
    if (this.introLeft > 0) {
      this.introLeft -= dt;
      if (this.introLeft <= 0 && !this.focus) this.cameraKind = this.explore;
    }
    let want = cameraPose(this.cameraKind, this.town.cameras, this.pose, this.focus);
    if (this.shot) {
      this.shotTime += dt;
      const who = this.shot.focus.npc;
      want = shotPose(this.shot, shotFocus(this.shot, this.town, who ? this.people.find((p) => p.npc.cast === who)?.at : undefined), this.shotTime);
    }
    const k = 1 - Math.exp(-dt * (this.cameraKind === 'behind' && !this.shot ? 6 : 3.5));
    this.camera.position.lerp(new THREE.Vector3(...want.position), k);
    this.camTarget.lerp(new THREE.Vector3(...want.target), k);
    this.camera.lookAt(this.camTarget);

    // buildings between the camera and the player fade, so they never hide the detective
    for (const it of this.buildings) {
      const blocks =
        !this.shot &&
        this.cameraKind !== 'wide' &&
        this.camera.position.z > this.pose.z &&
        it.b.at[1] - it.b.size[1] / 2 > this.pose.z - 0.5 &&
        Math.abs(it.b.at[0] - this.pose.x) < it.b.size[0] / 2 + 7;
      const want = blocks ? 0.16 : 1;
      if (Math.abs(want - it.opacity) > 0.005) {
        it.opacity += (want - it.opacity) * Math.min(1, dt * 6);
        for (const m of it.mats) {
          m.opacity = it.opacity;
          m.depthWrite = it.opacity > 0.9;
        }
      }
    }

    // markers, boats, rain
    for (const mesh of this.markers.values()) {
      const s = mesh.userData.pulse ? 1 + Math.sin(this.time * 3) * 0.12 : 1;
      mesh.scale.setScalar(s);
    }
    for (const f of this.floaters) {
      f.obj.position.y = f.y + Math.sin(this.time * 0.9 + f.phase) * 0.12;
      f.obj.rotation.z = Math.sin(this.time * 0.7 + f.phase) * 0.03;
    }
    this.waterMesh.position.y = -0.55 + Math.sin(this.time * 0.6) * 0.03;
    for (const f of this.foam) {
      // each line of foam rolls in toward the quay, then fades away
      const t = (this.time * 0.25 + f.phase / 6.3) % 1;
      f.mesh.position.z = f.z - 2.4 * (1 - t);
      f.mat.opacity = Math.sin(t * Math.PI) * 0.4 * (0.35 + 0.65 * this.look.daylight);
    }
    if (this.beam) this.beam.pivot.rotation.y = this.time * 0.8;
    for (const w of this.workers) w.update(this.time);
    for (const m of this.movers) {
      if (m.anim === 'spin') m.obj.rotation.z = -this.time * 5;
      else m.obj.rotation.y = m.phase + Math.sin(this.time * 3.1) * 0.25 + Math.sin(this.time * 7.3) * 0.08;
    }
    this.boats.forEach((b, i) => {
      b.position.y = -0.25 + Math.sin(this.time * 1.1 + i * 2) * 0.08;
      b.rotation.z = Math.sin(this.time * 0.8 + i) * 0.04;
    });
    if (this.rain) {
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 22 * dt;
        if (y < 0) y += 18;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.rain.position.set(this.pose.x, 0, this.pose.z);
    }

    // who or what is within reach
    const near = this.paused
      ? null
      : nearest(this.town, [this.pose.x, this.pose.z], this.people.filter((p) => p.present).map((p) => ({ npc: p.npc, at: p.at })));
    const key = near ? (near.kind === 'door' ? `d:${near.door.id}` : `n:${near.npc.cast}`) : '';
    if (key !== this.lastNearby) {
      this.lastNearby = key;
      this.opts.onNearby(near);
    }
  }

  /** Walks, turns and animates a 3D person. */
  private moveBody(p: Person, at: Vec2, moving: boolean, dt: number) {
    const dx = at[0] - p.at[0];
    const dz = at[1] - p.at[1];
    const step = Math.hypot(dx, dz);
    p.at = at;
    p.group.position.set(at[0], 0, at[1]);
    const talking = this.talking === p;
    // in a conversation they speak toward the camera, which stands at the detective's shoulder
    const lookAt: Vec2 = talking ? [this.camera.position.x, this.camera.position.z] : [this.pose.x, this.pose.z];
    const toPlayer = Math.atan2(lookAt[0] - at[0], lookAt[1] - at[1]);
    const near = Math.hypot(this.pose.x - at[0], this.pose.z - at[1]) < NOTICE;
    // face where they walk; turn to face you when you talk to them
    let want = p.heading;
    if (moving && step > 1e-5 && !talking) want = Math.atan2(dx, dz);
    else if (talking) want = toPlayer;
    const turn = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    p.heading += turn * Math.min(1, dt * (talking ? 5 : 7));
    p.pivot.rotation.set(0, p.heading, 0);
    if (!talking) p.stride += step;
    p.walk += ((moving && !talking ? 1 : 0) - p.walk) * Math.min(1, dt * 6);
    let look: number | null = null;
    if (talking || near) {
      const rel = Math.atan2(Math.sin(toPlayer - p.heading), Math.cos(toPlayer - p.heading));
      look = Math.abs(rel) < 1.9 ? Math.max(-1.1, Math.min(1.1, rel)) : null;
    }
    p.body!.update(dt, { t: this.time + p.seed, walk: p.walk, stride: p.stride, mood: talking ? this.mood : null, look });
  }

  // ---------- building the scene ----------

  private lambert(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000, power = 1) {
    return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: power, flatShading: true });
  }

  private buildLights() {
    this.hemi = new THREE.HemisphereLight(this.look.hemiSky, this.look.hemiGround, this.look.hemi);
    this.sunLight = new THREE.DirectionalLight(this.look.sun, this.look.sunPower);
    this.sunLight.position.set(-18, 30, 12);
    this.scene.add(this.hemi, this.sunLight);
  }

  private cobbleTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = hex(DAY.cobble);
    g.fillRect(0, 0, 256, 256);
    // deterministic scatter of stones, so every player sees the same street
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const shade = 0.82 + rnd() * 0.36;
        g.fillStyle = hex(DAY.ground);
        g.globalAlpha = Math.min(1, shade * 0.9);
        const ox = (y % 2) * 16;
        g.beginPath();
        g.roundRect(x * 32 + 3 + ox - 16, y * 32 + 3, 26, 26, 7);
        g.fill();
      }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildGround() {
    const [minX, minZ, maxX, maxZ] = this.town.bounds;
    const w = maxX - minX + 40;
    const wl = this.town.waterline;
    const depth = maxZ - wl + 20;
    const tex = this.cobbleTexture();
    tex.repeat.set(w / 4, depth / 4);
    this.streetMat = new THREE.MeshLambertMaterial({ map: tex });
    const street = new THREE.Mesh(new THREE.BoxGeometry(w, 1, depth), this.streetMat);
    street.position.set((minX + maxX) / 2, -0.5, wl + depth / 2);
    this.scene.add(street);
    // wooden edge of the pier
    this.edgeMat = this.lambert(EDGE_DAY);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 1.02, 1.6), this.edgeMat);
    edge.position.set((minX + maxX) / 2, -0.5, wl + 0.8);
    this.scene.add(edge);
    this.waterMat = new THREE.MeshPhongMaterial({ color: this.look.water, shininess: 90, specular: 0x6688aa, flatShading: true });
    const water = (this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 200, 160), this.waterMat));
    water.rotation.x = -Math.PI / 2;
    water.position.set((minX + maxX) / 2, -0.55, wl - 80);
    this.scene.add(water);
    this.buildSea();
    void minZ;
  }

  private signTexture(text: string): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#2a2418';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 504, 88);
    g.fillStyle = '#2a2418';
    g.font = "bold 46px 'Courier New', ui-monospace, monospace";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text.toUpperCase(), 256, 50, 480);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private makeBuilding(b: Building): THREE.Group {
    const group = new THREE.Group();
    const [w, d] = b.size;
    const shop = b.trade ? SHOPS[b.trade] : undefined;
    if (shop) {
      // a shop is built from its picture: its own door, windows and sign, and its name on a board under the eaves
      for (const part of [...shopParts(b, shop), ...shopProps(b)]) group.add(this.partMesh(part));
      // the name stands on the eaves, in front of the roof, unless the shop's own sign already hangs there
      const face = b.doorSide === 'south' ? 1 : -1;
      const boardW = Math.min(w - 1.2, 3.2);
      const sx = w / shop.width;
      const sy = b.height / shop.height;
      const signThere = shop.pieces.some((p) => p.mode === 'cut' && Math.abs(p.x * sx) < boardW / 2 + 0.3 && (p.y + p.h) * sy > b.height - 0.3);
      if (!signThere) {
        const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, 0.5), new THREE.MeshBasicMaterial({ map: this.signTexture(b.name) }));
        board.position.set(0, b.height + 0.22, (d / 2 + 0.5) * face);
        if (face < 0) board.rotation.y = Math.PI;
        group.add(board);
      }
      group.position.set(b.at[0], 0, b.at[1]);
      return group;
    }
    for (const part of buildingParts(b)) group.add(this.partMesh(part));

    const face = b.doorSide === 'south' ? 1 : -1;
    const wallZ = (d / 2) * face;
    const front = new THREE.Group();
    front.position.z = wallZ + 0.03 * face;
    if (face < 0) front.rotation.y = Math.PI;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.12), this.lambert(0x1c1410));
    door.position.y = 1.2;
    front.add(door);
    for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) {
      const lit = this.lambert(0x2a2418, this.look.window, 1);
      this.windows.push(lit);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.08), lit);
      win.position.set(x, 2, 0);
      front.add(win);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 4.6), 0.82), new THREE.MeshBasicMaterial({ map: this.signTexture(b.name) }));
    sign.position.set(0, Math.min(b.height - 0.55, 3.2), 0.08);
    front.add(sign);
    group.add(front);
    group.position.set(b.at[0], 0, b.at[1]);
    return group;
  }

  /** One piece of a building or of the sea line as a mesh. */
  private partMesh(part: Part): THREE.Object3D {
    const [sx, sy, sz] = part.size;
    if (part.shape === 'panel') return this.panelMesh(part);
    const mat = part.glow ? this.lambert(0x2a2418, this.look.window, 1) : this.lambert(part.color);
    if (part.glow) this.windows.push(mat as THREE.MeshLambertMaterial);
    let mesh: THREE.Mesh;
    let rise = 0;
    if (part.shape === 'ball') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
      const tall = sy || sx * 2;
      mesh.scale.set(sx, tall / 2, sx);
      rise = tall / 2;
    } else if (part.shape === 'ring') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(sx, sy, 5, 18), mat);
      rise = sx + sy;
    } else if (part.shape === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      rise = sy / 2;
    } else if (part.shape === 'hip') {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), mat);
      mesh.rotation.y = Math.PI / 4;
      mesh.scale.set(sx / 2 / Math.SQRT1_2, sy, sz / 2 / Math.SQRT1_2);
      rise = sy / 2;
    } else if (part.shape === 'gable') {
      const tri = new THREE.Shape([new THREE.Vector2(-sz / 2, 0), new THREE.Vector2(sz / 2, 0), new THREE.Vector2(0, sy)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: sx, bevelEnabled: false });
      geo.translate(0, 0, -sx / 2);
      geo.rotateY(Math.PI / 2);
      mesh = new THREE.Mesh(geo, mat);
    } else if (part.shape === 'dome') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(sx, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(sx, sx, sy, 10), mat);
      rise = sy / 2;
    }
    mesh.position.set(part.at[0], part.at[1] + rise, part.at[2]);
    this.turnPart(mesh, part);
    return (mesh.userData.wrapper as THREE.Object3D | undefined) ?? mesh;
  }

  /** Leans and turns a piece about its own middle, and sets it moving if it moves by itself. */
  private turnPart(mesh: THREE.Object3D, part: Part) {
    if (part.tilt || part.turn) {
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y += part.turn ?? 0;
      mesh.rotation.x += part.tilt ?? 0;
    }
    if (part.anim) {
      // spin and flap act on a wrapper, so the piece keeps its own lean and turn
      const pivot = new THREE.Group();
      pivot.position.copy(mesh.position);
      pivot.rotation.copy(mesh.rotation);
      mesh.position.set(part.anim === 'flap' ? part.size[0] / 2 : 0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      if (part.anim === 'flap') pivot.position.x -= (part.size[0] / 2) * Math.cos(pivot.rotation.y);
      pivot.add(mesh);
      this.movers.push({ obj: pivot, anim: part.anim, phase: pivot.rotation.y });
      mesh.userData.wrapper = pivot;
    }
  }

  /** A piece cut from a shop's picture, laid flat on its wall. Windows and lamps in it glow at dusk. */
  private panelMesh(part: Part): THREE.Mesh {
    const [w, h] = part.size;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: part.edge !== 'hard', alphaTest: part.edge === 'cut' ? 0.4 : 0.01, side: THREE.FrontSide });
    if (part.glow) {
      mat.emissive.setHex(0xffd9a0);
      mat.emissiveIntensity = 0.7 * (1 - this.look.daylight);
      this.shopGlows.push(mat);
    }
    if (part.tex) {
      this.textures.load(part.tex, (tex) => {
        if (this.disposed) return tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        mat.map = tex;
        if (part.glow) mat.emissiveMap = tex;
        mat.needsUpdate = true;
      });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(part.at[0], part.at[1] + h / 2, part.at[2]);
    if (part.turn) mesh.rotation.y = part.turn;
    return mesh;
  }

  /** The people at work outside a shop. */
  private addWorkers(b: Building) {
    for (const spot of shopWorkers(b)) {
      const w = new Worker(spot.action, spot.outfit, this.workers.length * 1.7);
      w.root.position.set(spot.at[0], 0, spot.at[1]);
      w.root.rotation.y = spot.heading;
      for (const m of w.materials) m.emissive.copy(m.color);
      this.workers.push(w);
      this.scene.add(w.root);
    }
    this.shopSolids.push(...shopSolids(b));
  }

  /** Foam on the quay edge, a breakwater with a lighthouse, ships standing off the harbour and buoys in the channel. */
  private buildSea() {
    const wl = this.town.waterline;
    const [minX, , maxX] = this.town.bounds;
    const wide = maxX - minX + 60;
    const cx = (minX + maxX) / 2;
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wide, 0.35), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, -0.5, wl - 0.6);
      this.scene.add(mesh);
      this.foam.push({ mesh, mat, z: wl - 0.6, phase: i * 2.1 });
    }
    for (const t of seaLine(this.town.bounds, wl)) {
      const g = new THREE.Group();
      g.position.set(t.at[0], 0, t.at[1]);
      if (t.kind === 'breakwater') {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 2.4), this.lambert(0x6b6f72));
        wall.position.y = -0.1;
        g.add(wall);
      } else if (t.kind === 'lighthouse') {
        g.position.x += 5;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 9, 10), this.lambert(0xf1ece0));
        tower.position.y = 5.1;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 1.2, 1.6, 10), this.lambert(0xb23a2c));
        band.position.y = 4;
        const lanternMat = this.lambert(0x2a2418, this.look.window, 1);
        this.cabins.push(lanternMat);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.1, 10), lanternMat);
        lantern.position.y = 10.2;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 0.9, 10), this.lambert(0x3b2a24));
        cap.position.y = 11.2;
        g.add(tower, band, lantern, cap);
        // a long pale beam that turns at night
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 40, 12, 1, true), mat);
        cone.rotation.z = Math.PI / 2;
        cone.position.x = 20;
        const pivot = new THREE.Group();
        pivot.position.y = 10.2;
        pivot.add(cone);
        g.add(pivot);
        this.beam = { pivot, mat };
      } else if (t.kind === 'ship') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.2), this.lambert(0x2e3640));
        hull.position.y = 0.4;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.02, 0.25, 2.22), this.lambert(0x9a3328));
        stripe.position.y = 0.6;
        const houseMat = this.lambert(0x2a2418, this.look.window, 0.25);
        this.cabins.push(houseMat);
        const house = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), houseMat);
        house.position.set(-2, 1.9, 0);
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), this.lambert(0xd9c8a0));
        funnel.position.set(-2, 3.3, 0);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 5), this.lambert(0x20242c));
        mast.position.set(2.2, 2.5, 0);
        g.add(hull, stripe, house, funnel, mast);
        g.scale.setScalar(t.scale);
        g.rotation.y = Math.PI * (0.05 + t.phase * 0.02);
        this.floaters.push({ obj: g, y: -0.25, phase: t.phase });
      } else {
        const buoy = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 8), this.lambert(0xc23a2a));
        buoy.position.y = 0.35;
        const topMat = this.lambert(0x2a2418, 0xffb45a, 1.2);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), topMat);
        top.position.y = 1.05;
        g.add(buoy, top);
        this.floaters.push({ obj: g, y: -0.4, phase: t.phase });
      }
      this.scene.add(g);
    }
  }

  private addProp(p: Prop) {
    const g = new THREE.Group();
    g.position.set(p.at[0], 0, p.at[1]);
    if (p.kind === 'lamp') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 6), this.lambert(0x20242c));
      pole.position.y = 2;
      const bulbMat = this.lambert(0x332a18, 0xffb45a, 2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bulbMat);
      bulb.position.y = 4.05;
      g.add(pole, bulb);
      const lamp: (typeof this.lamps)[number] = { bulb: bulbMat };
      this.lamps.push(lamp);
      // Junior's town is always daylight: its lamps never need a light. The grown-up town keeps them all, so the lamp count never changes as the day does.
      if (!this.opts.friendly) {
        const light = new THREE.PointLight(0xffa850, this.look.lamp * 14, 17, 1.6);
        lamp.light = light;
        light.position.y = 3.8;
        g.add(light);
        // warm pool on the wet street
        lamp.pool = new THREE.MeshBasicMaterial({ color: 0xffa850, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
        const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), lamp.pool);
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.03;
        g.add(pool);
      }
    } else if (p.kind === 'camera') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), this.lambert(0x2a2f38));
      pole.position.y = 1.7;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.6), this.lambert(0xd8dce4));
      box.position.set(0, 3.4, -0.2);
      box.rotation.x = 0.35;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      led.position.set(0.1, 3.42, -0.52);
      g.add(pole, box, led);
    } else if (p.kind === 'crate') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), this.lambert(0x7a5a36));
      crate.position.y = 0.475;
      crate.rotation.y = (p.at[0] * 1.7 + p.at[1]) % 0.8;
      g.add(crate);
    } else if (p.kind === 'bollard') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 7), this.lambert(0x1e2228));
      post.position.y = 0.35;
      g.add(post);
    } else if (p.kind === 'boat') {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 0.9, 5, 1), this.lambert(0x6a3d2a));
      hull.scale.set(1, 1, 2.6);
      hull.position.y = 0.2;
      const cabinMat = this.lambert(0xd9d2c0, this.look.window, 0.25);
      this.cabins.push(cabinMat);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.4), cabinMat);
      cabin.position.set(0, 1, -0.6);
      g.add(hull, cabin);
      g.rotation.y = Math.PI / 2 + (p.at[0] % 3) * 0.1;
      this.boats.push(g);
    }
    this.scene.add(g);
  }

  private addMarker(d: Door) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.85, 28),
      new THREE.MeshBasicMaterial({ color: DOOR_COLORS.plain, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.at[0], 0.04, d.at[1]);
    this.scene.add(ring);
    this.markers.set(d.id, ring);
  }

  private addPerson(npc: Npc) {
    const group = new THREE.Group();
    const seed = this.people.length * 7.3;
    const made = CAST3D[npc.cast];
    if (made) {
      const body = new Figure3D(made.rig, null, { seed, glow: this.glow() });
      body.root.visible = false;
      new THREE.TextureLoader().load(made.atlas, (tex) => {
        if (this.disposed) return tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        body.setAtlas(tex);
        body.root.visible = true;
      });
      const pivot = new THREE.Group();
      pivot.add(body.root);
      group.add(this.groundMarks(npc), pivot);
      group.position.set(npc.at[0], 0, npc.at[1]);
      this.scene.add(group);
      const person: Person = { npc, group, pivot, body, heading: 0, stride: 0, walk: 0, seed, at: npc.at, present: true };
      this.people.push(person);
      // a finished 3D model takes over from the figure made from pictures once it has loaded
      if (made.glb) {
        new GLTFLoader().load(made.glb, (gltf) => {
          const mesh = meshOf(gltf.scene);
          if (this.disposed || !mesh) return;
          const fresh = new GlbFigure(mesh, { height: made.rig.height, skirt: made.rig.skirt, face: made.rig.face, ...made.fit, hair: samplerOf((mesh.material as THREE.MeshStandardMaterial).map), seed, glow: this.glow() });
          pivot.remove(body.root);
          body.dispose();
          pivot.add(fresh.root);
          person.body = fresh;
          if (this.talking === person) this.applyMood();
        });
      }
      return;
    }
    const mat = new THREE.MeshBasicMaterial({ color: this.look.figureTint, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const figure = new THREE.Mesh(new THREE.PlaneGeometry(1, FIGURE_HEIGHT), mat);
    figure.position.y = FIGURE_HEIGHT / 2;
    const url = this.opts.figures[npc.cast];
    if (url) {
      this.tints.push(mat);
      new THREE.TextureLoader().load(url, (tex) => {
        if (this.disposed) return tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.needsUpdate = true;
        figure.scale.x = (tex.image.width / tex.image.height) * FIGURE_HEIGHT;
      });
    } else {
      mat.color.set(this.opts.colors[npc.cast] ?? '#888888');
      figure.scale.x = 0.6;
    }
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.add(figure);
    group.add(this.groundMarks(npc), pivot);
    group.position.set(npc.at[0], 0, npc.at[1]);
    this.scene.add(group);
    this.people.push({ npc, group, pivot, figure, heading: 0, stride: 0, walk: 0, seed, at: npc.at, present: true });
  }

  /** The shadow under a person and the ring in their own colour, the same one their grid column uses. */
  private groundMarks(npc: Npc): THREE.Group {
    const marks = new THREE.Group();
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: this.opts.colors[npc.cast] ?? '#ffffff', side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    marks.add(shadow, ring);
    return marks;
  }

  /** The detective: a simple low-poly figure built from boxes, so it reads from every camera. */
  private buildPlayer() {
    const coat = this.lambert(0x24304a);
    const dark = this.lambert(0x161a22);
    const skin = this.lambert(0xc99a72);
    const hat = this.lambert(0x4a4f5a);
    const limb = (mat: THREE.Material, w: number, h: number, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      mesh.position.y = -h / 2;
      pivot.add(mesh);
      this.player.add(pivot);
      this.limbs.push(pivot);
    };
    limb(dark, 0.2, 0.8, -0.13, 0.8);
    limb(dark, 0.2, 0.8, 0.13, 0.8);
    limb(coat, 0.16, 0.7, -0.36, 1.45);
    limb(coat, 0.16, 0.7, 0.36, 1.45);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 0.95, 6), coat);
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.72;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 8), hat);
    brim.position.y = 1.88;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 8), hat);
    crown.position.y = 1.99;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.player.add(body, head, brim, crown, shadow);
    this.scene.add(this.player);
  }

  private buildRain() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 50;
      pos[i * 3 + 1] = rnd() * 18;
      pos[i * 3 + 2] = (rnd() - 0.5) * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb6d8, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }
}
