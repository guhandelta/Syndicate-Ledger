import * as THREE from 'three';
import { CAST3D, faceOf } from '../../src/town/cast3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Figure3D } from '../../src/town/figure3d';
import { GlbFigure, meshOf } from '../../src/town/glbFigure';
import { samplerOf } from '../../src/town/glbPixels';
import type { Expression } from '../../src/ui/voices';

const NAMES: Record<string, string> = {
  meena: 'Meena Selvi', nevethitha: 'Nevethitha Rajan', kavya: 'Kavya Narayanan', lin: 'Dr. Lin Abara', kane: 'Sethu Raman',
  vex: 'Arun Kumar', tip: 'Sakthivel Siva', crane: 'Sivaram Chetllamuthu', dex: 'Sgt. Devan Rajan', cole: 'Arul Prakash',
  karunakaran: 'Capt. Karunakaran Velu', thenmozhi: 'Thenmozhi Selvam',
};
const SHORT: Record<string, string> = Object.fromEntries(Object.entries(NAMES).map(([id, n]) => [id, n.replace(/^(Dr\.|Sgt\.|Capt\.) /, '').split(' ')[0]]));
const MOODS: Expression[] = ['neutral', 'suspicious', 'caught-lying', 'nervous', 'angry', 'scared', 'smug'];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1420);
scene.fog = new THREE.Fog(0x0d1420, 14, 40);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0x9fb2dd, 0x2a2d36, 2.2));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
sun.position.set(-4, 8, 6);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x2b303b }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const FIRST = ['meena', 'nevethitha', 'kavya', 'lin', 'karunakaran', 'thenmozhi'];
const only = new URLSearchParams(location.search).get('only');
const ids = Object.keys(CAST3D).filter((id) => !only || only.split(',').includes(id)).sort((a, b) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99));
const people: { id: string; fig: Figure3D | GlbFigure; home: THREE.Vector3; heading: number; stride: number; walk: number }[] = [];
const loader = new THREE.TextureLoader();
const gap = 1.3;
function place(id: string, i: number, fig: Figure3D | GlbFigure) {
  const holder = new THREE.Group();
  const perRow = Math.ceil(ids.length / 2);
  const row = Math.floor(i / perRow);
  const home = new THREE.Vector3((i % perRow - (perRow - 1) / 2) * gap + row * gap * 0.5, 0, -row * 1.8);
  holder.position.copy(home);
  holder.add(fig.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  holder.add(shadow);
  scene.add(holder);
  people.push({ id, fig, home, heading: 0, stride: 0, walk: 0 });
  applyMood();
}
ids.forEach((id, i) => {
  const made = CAST3D[id];
  if (made.glb) {
    // a finished 3D model: it gets its skeleton here
    new GLTFLoader().load(made.glb, (gltf) => {
      const mesh = meshOf(gltf.scene)!;
      place(id, i, new GlbFigure(mesh, { height: made.rig.height, skirt: made.rig.skirt, face: made.rig.face, ...made.fit, hair: samplerOf((mesh.material as THREE.MeshStandardMaterial).map), seed: i * 1.7, glow: 0.1 }));
    });
    return;
  }
  const fig = new Figure3D(made.rig, null, { seed: i * 1.7, glow: 0.12 });
  fig.root.visible = false;
  loader.load(made.atlas, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    fig.setAtlas(t);
    fig.root.visible = true;
  });
  place(id, i, fig);
});

let mode: 'idle' | 'walk' | 'look' = 'idle';
let mood: Expression | null = null;
const faceCache = new Map<string, THREE.Texture>();
function applyMood() {
  for (const p of people) {
    if (p.fig instanceof GlbFigure) {
      p.fig.setExpression(mood);
      continue;
    }
    if (!mood) {
      p.fig.setFace(null);
      continue;
    }
    const url = faceOf(p.id, mood, false);
    if (!url) continue;
    let tex = faceCache.get(url);
    if (!tex) {
      tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      faceCache.set(url, tex);
    }
    p.fig.setFace(tex);
  }
}

const bar = document.getElementById('bar')!;
function group(label: string, items: [string, () => void, () => boolean][]) {
  const b = document.createElement('b');
  b.textContent = label;
  bar.append(b);
  for (const [text, act, on] of items) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.onclick = () => {
      act();
      refresh();
    };
    btn.dataset.on = '';
    (btn as HTMLButtonElement & { isOn: () => boolean }).isOn = on;
    bar.append(btn);
  }
  const s = document.createElement('span');
  s.className = 'sep';
  bar.append(s);
}
function refresh() {
  bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLButtonElement & { isOn: () => boolean }).isOn()));
}
group('Move', [
  ['Stand', () => (mode = 'idle'), () => mode === 'idle'],
  ['Walk', () => (mode = 'walk'), () => mode === 'walk'],
  ['Look at camera', () => (mode = 'look'), () => mode === 'look'],
]);
group('Talking, face', [
  ['Off', () => ((mood = null), applyMood()), () => mood === null],
  ...MOODS.map((m) => [m.replace('-', ' '), () => ((mood = m), applyMood()), () => mood === m] as [string, () => void, () => boolean]),
]);
group('Zoom', [
  ['Everyone', () => setView(0), () => false],
  ...ids.map((id, i) => [SHORT[id] ?? id, () => setView(i + 1), () => false] as [string, () => void, () => boolean]),
]);
refresh();

// orbit camera
let yaw = 0.35, pitch = 0.18, dist = 7.5;
const target = new THREE.Vector3(0, 1.0, 0);
function setView(i: number) {
  if (i === 0) {
    target.set(0, 1, -0.9);
    dist = Math.max(6, ids.length * 0.75);
    pitch = 0.18;
  } else {
    target.set(people[i - 1].home.x, 1.45, people[i - 1].home.z);
    dist = 1.6;
    pitch = 0.05;
    yaw = 0.25;
  }
}
setView(0);
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= (e.clientX - drag.x) * 0.006;
  pitch = Math.max(-0.3, Math.min(1.2, pitch + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => {
  dist = Math.max(1.2, Math.min(30, dist * (1 + Math.sign(e.deltaY) * 0.1)));
  e.preventDefault();
}, { passive: false });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let t = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  for (const [i, p] of people.entries()) {
    const holder = p.fig.root.parent!;
    let walking = 0;
    if (mode === 'walk') {
      // walk a small loop around their spot
      const a = t * 0.5 + i;
      const r = 0.45;
      const nx = p.home.x + Math.sin(a) * r;
      const nz = p.home.z + Math.cos(a) * r * 1.6;
      const dx = nx - holder.position.x;
      const dz = nz - holder.position.z;
      p.stride += Math.hypot(dx, dz);
      p.heading = Math.atan2(dx, dz);
      holder.position.set(nx, 0, nz);
      walking = 1;
    } else {
      holder.position.lerp(p.home, Math.min(1, dt * 3));
      p.heading += (0 - p.heading) * Math.min(1, dt * 4);
    }
    p.walk += (walking - p.walk) * Math.min(1, dt * 6);
    holder.rotation.y = p.heading;
    let look: number | null = null;
    if (mode === 'look' || mood) {
      const want = Math.atan2(camera.position.x - holder.position.x, camera.position.z - holder.position.z) - p.heading;
      look = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(want), Math.cos(want))));
    }
    p.fig.update(dt, { t: t + i * 3.1, walk: p.walk, stride: p.stride, mood, look });
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { viewer: unknown }).viewer = { setView, people, set: (m: typeof mode, md: Expression | null) => ((mode = m), (mood = md), applyMood(), refresh()), camera: (y: number, p: number, d: number) => ((yaw = y), (pitch = p), (dist = d)) };
