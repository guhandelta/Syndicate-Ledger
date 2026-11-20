import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAST3D, faceOf } from '../src/town/cast3d';
import { Figure3D, figureMaterial, partGeometry, poseAt, splitAt, wobble, type Activity, type Rig, type Ring } from '../src/town/figure3d';
import type { Expression } from '../src/ui/voices';

const rings: Ring[] = [
  [1, 0, 0, 0.1, 0.1],
  [0.5, 0, 0, 0.2, 0.1],
  [0, 0.1, 0, 0.1, 0.2],
];

const view = { u0: 0, u1: 0.25, from: -0.3, to: 0.3 };
const tiny: Rig = {
  height: 1.7,
  skirt: false,
  swing: { armL: true, armR: false },
  joints: {},
  parts: {},
  views: { front: view, back: view, 'side-left': view, 'side-right': view },
  face: { x0: -0.1, x1: 0.1, y0: 1.4, y1: 1.65 },
  faces: {},
};

const still: Activity = { t: 1, walk: 0, stride: 0, mood: null, look: null };

describe('3D figure shape', () => {
  it('builds a closed tube through the rings, moved to its joint, keeping the model position for the paint', () => {
    const geo = partGeometry(rings, [0, 0.5, 0]);
    const pos = geo.getAttribute('position');
    const rest = geo.getAttribute('rest');
    // 12 points per ring plus a centre for each cap
    expect(pos.count).toBe(3 * 12 + 2);
    expect(geo.getIndex()!.count).toBe((2 * 12 * 2 + 2 * 12) * 3);
    expect(rest.getY(0)).toBe(1);
    expect(pos.getY(0)).toBeCloseTo(0.5);
    // the first point of a ring is straight in front (+z), at the ring's depth
    expect(rest.getZ(12)).toBeCloseTo(0.1);
    expect(geo.getAttribute('normal').count).toBe(pos.count);
    // with no joint given it stays where it is
    expect(partGeometry(rings).getAttribute('position').getY(0)).toBe(1);
  });

  it('splits a leg at the knee, sharing the slice there', () => {
    const [up, low] = splitAt(rings, 0.25);
    expect(up.map((r) => r[0])).toEqual([1, 0.5, 0.25]);
    expect(low.map((r) => r[0])).toEqual([0.25, 0]);
    expect(up[2][3]).toBeCloseTo(0.15);
    // a knee above or below the whole leg leaves one side empty
    expect(splitAt(rings, 2)).toEqual([[], rings]);
    expect(splitAt(rings, -1)).toEqual([rings, []]);
  });
});

describe('3D figure paint', () => {
  it('adds the four-view paint and the face to the lit material, and shares one program between people', () => {
    const atlas = new THREE.Texture();
    const { material, uniforms } = figureMaterial(tiny, atlas, 0.2);
    expect(uniforms.uAtlas.value).toBe(atlas);
    expect(uniforms.uNeck.value).toBeCloseTo(1.7 * 0.82);
    expect(uniforms.uFront.value.toArray()).toEqual([0, 0.25, -0.3, 0.3]);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {\n#include <map_fragment>\n#include <emissivemap_fragment>\n}',
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.uFaceOn).toBe(uniforms.uFaceOn);
    expect(shader.vertexShader).toContain('vRest = rest;');
    expect(shader.fragmentShader).toContain('uFaceMap');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    expect(material.customProgramCacheKey()).toBe('figure3d');
    expect(figureMaterial({ ...tiny, joints: { neck: [0, 1.4, 0] } }, null, 0).uniforms.uNeck.value).toBe(1.4);
  });
});

describe('3D figure movement', () => {
  it('stands still and breathes, glancing around now and then', () => {
    const p = poseAt(still);
    expect(p.legL).toBeCloseTo(0);
    expect(p.kneeL).toBe(0);
    expect(p.drop).toBe(0);
    expect(p.neck[1]).toBeCloseTo(wobble(1, 0) * 0.55);
    expect(Math.abs(wobble(3, 2))).toBeLessThanOrEqual(1);
  });

  it('walks with legs and arms swinging in opposition, and shorter steps in a skirt', () => {
    const mid = { ...still, walk: 1, stride: 1.25 / 4 };
    const p = poseAt(mid);
    expect(p.legL).toBeCloseTo(-0.42);
    expect(p.legR).toBeCloseTo(0.42);
    expect(p.armL[0]).toBeGreaterThan(0);
    expect(p.armR[0]).toBeLessThan(0);
    expect(p.drop).toBeGreaterThan(0);
    expect(poseAt({ ...mid, skirt: true }).legL).toBeCloseTo(-0.3);
    // the swinging leg bends at the knee
    expect(poseAt({ ...still, walk: 1, stride: 0 }).kneeL).toBeCloseTo(0.6);
    expect(poseAt({ ...still, walk: 1, stride: 1.25 / 2 }).kneeR).toBeCloseTo(0.6);
  });

  it('looks where it is told', () => {
    expect(poseAt({ ...still, look: 0.8 }).neck[1]).toBeCloseTo(0.8);
  });

  it('shows each feeling in the body', () => {
    const at = (mood: Expression) => poseAt({ ...still, look: 0, mood });
    const base = poseAt({ ...still, look: 0 });
    expect(at('neutral').neck[0]).toBeGreaterThanOrEqual(base.neck[0]);
    expect(at('suspicious').neck[2]).toBeCloseTo(0.14);
    expect(at('caught-lying').neck[0]).toBeGreaterThan(0.25);
    expect(at('nervous').armL[0]).toBeLessThan(base.armL[0]);
    expect(at('angry').spine[0]).toBeGreaterThan(0.1);
    expect(at('angry').armL[2]).toBeGreaterThan(0);
    expect(at('scared').spine[0]).toBeLessThan(-0.1);
    expect(at('scared').drop).toBeGreaterThan(0);
    expect(at('smug').neck[0]).toBeLessThan(-0.1);
  });
});

describe('3D person', () => {
  const meena = CAST3D.meena.rig;

  it('is built from the made figures, with every joint', () => {
    const f = new Figure3D(meena, null, { seed: 2 });
    let meshes = 0;
    f.root.traverse((o) => (meshes += (o as THREE.Mesh).isMesh ? 1 : 0));
    // body, head, two arms and two shins: Meena's thighs are under her skirt
    expect(meshes).toBe(6);
    expect(meena.skirt).toBe(true);
    f.update(0.016, { ...still, walk: 1, stride: 0.3 });
    const first = f.pose!;
    expect(first.legL).not.toBe(0);
    // the upper body eases toward a new mood instead of jumping
    f.update(0.016, { ...still, mood: 'angry' });
    expect(f.pose!.spine[0]).toBeLessThan(poseAt({ ...still, mood: 'angry' }).spine[0]);
    f.setAtlas(new THREE.Texture());
    expect(f.uniforms.uAtlas.value).not.toBeNull();
    f.dispose();
  });

  it('fades the expression face in and out', () => {
    const f = new Figure3D(meena, null);
    const face = new THREE.Texture();
    f.setFace(face);
    expect(f.uniforms.uFaceMap.value).toBe(face);
    f.update(0.05, still);
    expect(f.uniforms.uFaceOn.value).toBeGreaterThan(0);
    expect(f.uniforms.uFaceOn.value).toBeLessThan(1);
    for (let i = 0; i < 40; i++) f.update(0.05, still);
    expect(f.uniforms.uFaceOn.value).toBe(1);
    f.setFace(null);
    expect(f.uniforms.uFaceMap.value).toBe(face);
    for (let i = 0; i < 40; i++) f.update(0.05, still);
    expect(f.uniforms.uFaceOn.value).toBe(0);
  });

  it('copes with a figure missing parts and joints', () => {
    // nothing but a body: no head, arms or legs to move
    const bare = new Figure3D({ ...tiny, parts: { body: rings, head: [rings[0]] } }, null);
    bare.update(0.016, { ...still, walk: 1, stride: 0.4 });
    expect(bare.root.children.length).toBe(1);
    // legs without a knee joint bend at a default height; a leg wholly below it has no thigh; an arm without a joint is left off
    const legs = new Figure3D(
      {
        ...tiny,
        joints: { legL: [0.1, 0.8, 0], legR: [-0.1, 0.8, 0], armL: [0.3, 1.3, 0], armR: [-0.3, 1.3, 0] },
        parts: {
          legL: rings,
          legR: [
            [0.4, 0, 0, 0.1, 0.1],
            [0, 0, 0, 0.1, 0.1],
          ],
          armL: rings,
          armR: rings,
        },
      },
      null,
    );
    legs.update(0.016, { ...still, walk: 1, stride: 0.2 });
    let meshes = 0;
    legs.root.traverse((o) => (meshes += (o as THREE.Mesh).isMesh ? 1 : 0));
    // left thigh and shin, right shin, two arms
    expect(meshes).toBe(5);
    const noJoint = new Figure3D({ ...tiny, parts: { armL: rings, legL: rings } }, null);
    noJoint.update(0.016, still);
    expect(noJoint.root.children.length).toBe(1);
  });
});

describe('3D cast', () => {
  it('lists the made figures with their pictures', () => {
    expect(CAST3D.meena.atlas).toMatch(/meena/);
    expect(CAST3D.meena.rig.parts.head?.length).toBeGreaterThan(3);
  });

  it('finds the expression face for a head, with Junior faces first and the nearest face when one is missing', () => {
    expect(faceOf('meena', 'angry', false)).toMatch(/crime\/meena-angry/);
    expect(faceOf('meena', 'neutral', true)).toMatch(/friendly\/meena-neutral/);
    // Junior has only three faces: the rest come from the main set
    expect(faceOf('meena', 'angry', true)).toMatch(/crime\/meena-angry/);
    expect(faceOf('nobody', 'smug', false)).toBeUndefined();
    expect(faceOf('nobody', 'neutral', false)).toBeUndefined();
  });
});
