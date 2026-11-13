import * as THREE from 'three';
import { cameraPose, forward, nearest, npcPosition, npcPresent, step, type Nearby, type Pose } from './townLogic';
import type { Building, CameraKind, Door, Npc, Prop, Town, Vec2 } from './townTypes';

/** How a door's marker is drawn. */
export type DoorState = 'open' | 'started' | 'solved' | 'locked' | 'plain';

export interface TownView {
  doorStates: Record<string, DoorState>;
  firedEvents: string[];
}

export interface TownSceneOptions {
  town: Town;
  /** Image URL for each cast member's standing figure. */
  figures: Record<string, string>;
  /** Cast colour, used for the ring under each person. */
  colors: Record<string, string>;
  /** Junior mode: daylight and no rain. */
  friendly: boolean;
  pose?: Pose;
  onNearby: (n: Nearby | null) => void;
}

interface Palette {
  sky: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunPower: number;
  ground: string;
  cobble: string;
  water: number;
  lamp: number;
  window: number;
  figureTint: number;
  rain: boolean;
}

const NIGHT: Palette = {
  sky: 0x0a111e, fogNear: 30, fogFar: 85, hemiSky: 0x7f95c4, hemiGround: 0x1b1d24, hemi: 1.5, sun: 0x9db3ff, sunPower: 1.1,
  ground: '#2b303b', cobble: '#232730', water: 0x0c2a3f, lamp: 2.2, window: 0xffc86a, figureTint: 0xd4dcf0, rain: true,
};
const DAY: Palette = {
  sky: 0x9fd3f0, fogNear: 60, fogFar: 140, hemiSky: 0xffffff, hemiGround: 0x8a8f7a, hemi: 2.4, sun: 0xfff2d0, sunPower: 2.2,
  ground: '#b9b2a0', cobble: '#a59d8a', water: 0x3f9fc4, lamp: 0, window: 0xfff3c4, figureTint: 0xffffff, rain: false,
};

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
  figure: THREE.Mesh;
  at: Vec2;
  present: boolean;
}

/** The 3D harbor. It draws what the town file describes and reports who or what the player is next to. */
export class TownScene {
  readonly pose: Pose;
  cameraKind: CameraKind;
  /** Set while a conversation or dialog is open: the player stands still. */
  paused = false;

  private readonly town: Town;
  private readonly opts: TownSceneOptions;
  private readonly pal: Palette;
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
  private readonly buildings: { b: Building; mats: THREE.Material[]; opacity: number }[] = [];
  private rain: THREE.Points | null = null;
  private focus: Vec2 | undefined;
  private explore: CameraKind;
  private time = 0;
  private stride = 0;
  private last = 0;
  private raf = 0;
  private lastNearby = '';
  private introLeft = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: TownSceneOptions) {
    this.opts = opts;
    this.town = opts.town;
    this.pal = opts.friendly ? DAY : NIGHT;
    this.explore = this.town.moments.explore;
    this.pose = opts.pose ? { ...opts.pose } : { x: this.town.start.at[0], z: this.town.start.at[1], heading: this.town.start.heading };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(this.pal.sky);
    this.scene.fog = new THREE.Fog(this.pal.sky, this.pal.fogNear, this.pal.fogFar);

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
    }
    for (const p of this.town.props) this.addProp(p);
    for (const d of this.town.doors) this.addMarker(d);
    for (const n of this.town.npcs) this.addPerson(n);
    this.buildPlayer();
    if (this.pal.rain) this.buildRain();

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
    this.introLeft = 0;
    this.cameraKind = person ? this.town.moments.talk : this.explore;
    if (person) {
      // turn to face them
      this.pose.heading = Math.atan2(person.at[0] - this.pose.x, -(person.at[1] - this.pose.z));
    }
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
      p.at = at;
      p.group.position.set(at[0], 0, at[1]);
      p.figure.position.y = FIGURE_HEIGHT / 2 + (moving ? Math.abs(Math.sin(this.time * 7)) * 0.07 : 0);
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
        const next = step(this.town, here, dx, dz, this.people.filter((p) => p.present).map((p) => p.at));
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
    const want = cameraPose(this.cameraKind, this.town.cameras, this.pose, this.focus);
    const k = 1 - Math.exp(-dt * (this.cameraKind === 'behind' ? 6 : 3.5));
    this.camera.position.lerp(new THREE.Vector3(...want.position), k);
    this.camTarget.lerp(new THREE.Vector3(...want.target), k);
    this.camera.lookAt(this.camTarget);

    // buildings between the camera and the player fade, so they never hide the detective
    for (const it of this.buildings) {
      const blocks =
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

  // ---------- building the scene ----------

  private lambert(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000, power = 1) {
    return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: power, flatShading: true });
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(this.pal.hemiSky, this.pal.hemiGround, this.pal.hemi));
    const sun = new THREE.DirectionalLight(this.pal.sun, this.pal.sunPower);
    sun.position.set(-18, 30, 12);
    this.scene.add(sun);
  }

  private cobbleTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = this.pal.cobble;
    g.fillRect(0, 0, 256, 256);
    // deterministic scatter of stones, so every player sees the same street
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const shade = 0.82 + rnd() * 0.36;
        g.fillStyle = this.pal.ground;
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
    const street = new THREE.Mesh(new THREE.BoxGeometry(w, 1, depth), new THREE.MeshLambertMaterial({ map: tex }));
    street.position.set((minX + maxX) / 2, -0.5, wl + depth / 2);
    this.scene.add(street);
    // wooden edge of the pier
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 1.02, 1.6), this.lambert(this.opts.friendly ? 0x9a7a52 : 0x4a3a2a));
    edge.position.set((minX + maxX) / 2, -0.5, wl + 0.8);
    this.scene.add(edge);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 200, 160),
      new THREE.MeshPhongMaterial({ color: this.pal.water, shininess: 90, specular: 0x6688aa, flatShading: true }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((minX + maxX) / 2, -0.55, wl - 80);
    this.scene.add(water);
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), this.lambert(b.color));
    body.position.y = b.height / 2;
    group.add(body);
    // low hip roof: a four-sided cone stretched over the footprint
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.5, 4), this.lambert(b.roof));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((w / 2 + 0.4) / Math.SQRT1_2, 1, (d / 2 + 0.4) / Math.SQRT1_2);
    roof.position.y = b.height + 0.75;
    group.add(roof);

    const face = b.doorSide === 'south' ? 1 : -1;
    const wallZ = (d / 2) * face;
    const front = new THREE.Group();
    front.position.z = wallZ + 0.03 * face;
    if (face < 0) front.rotation.y = Math.PI;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.12), this.lambert(0x1c1410));
    door.position.y = 1.2;
    front.add(door);
    const glow = this.opts.friendly ? 0.25 : 1;
    for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.08), this.lambert(0x2a2418, this.pal.window, glow));
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

  private addProp(p: Prop) {
    const g = new THREE.Group();
    g.position.set(p.at[0], 0, p.at[1]);
    if (p.kind === 'lamp') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 6), this.lambert(0x20242c));
      pole.position.y = 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), this.lambert(0x332a18, 0xffb45a, this.opts.friendly ? 0.2 : 2));
      bulb.position.y = 4.05;
      g.add(pole, bulb);
      if (this.pal.lamp) {
        const light = new THREE.PointLight(0xffa850, this.pal.lamp * 14, 17, 1.6);
        light.position.y = 3.8;
        g.add(light);
        // warm pool on the wet street
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(4.2, 24),
          new THREE.MeshBasicMaterial({ color: 0xffa850, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
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
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.4), this.lambert(0xd9d2c0, this.pal.window, this.opts.friendly ? 0 : 0.25));
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
    const mat = new THREE.MeshBasicMaterial({ color: this.pal.figureTint, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const figure = new THREE.Mesh(new THREE.PlaneGeometry(1, FIGURE_HEIGHT), mat);
    figure.position.y = FIGURE_HEIGHT / 2;
    const url = this.opts.figures[npc.cast];
    if (url) {
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
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    // ring in the person's own colour, the same one their grid column uses
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: this.opts.colors[npc.cast] ?? '#ffffff', side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.add(figure);
    group.add(shadow, ring, pivot);
    group.position.set(npc.at[0], 0, npc.at[1]);
    this.scene.add(group);
    this.people.push({ npc, group, pivot, figure, at: npc.at, present: true });
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
