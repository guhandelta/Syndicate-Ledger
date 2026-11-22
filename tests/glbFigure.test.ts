import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addExpressions, BASIS, FEATURES, FEELINGS, glbMaterial, GlbFigure, HUMAN, layoutFor, meshOf, skinTo } from '../src/town/glbFigure';
import type { Activity } from '../src/town/figure3d';

const still: Activity = { t: 1, walk: 0, stride: 0, mood: null, look: null };
const face = { x0: -0.08, x1: 0.09, y0: 1.37, y1: 1.62 };

/** A tall block standing in for a made model: it has the points, normals and pictures a model has. */
function block(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.6, 1.7, 0.3, 12, 40, 3);
  geo.translate(0.3, 0.85, 0.2);
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture() });
  return new THREE.Mesh(geo, material);
}

describe('3D model skeleton', () => {
  it('places every joint on the person, one pair of arms and legs each side, with the model facing +z', () => {
    const l = layoutFor(1.7);
    expect(l.joint.hips[1]).toBeCloseTo(0.85);
    expect(l.joint.armL[0]).toBeGreaterThan(0);
    expect(l.joint.armR[0]).toBeLessThan(0);
    expect(l.joint.shinL[1]).toBeCloseTo(0.27 * 1.7);
    expect(l.parent.hips).toBeNull();
    expect(l.parent.foreL).toBe('armL');
    expect(l.segments.map((s) => s.bone)).toContain('shinR');
    // a model that stands differently can say where its joints are
    expect(layoutFor(2, { ...HUMAN, hip: 0.4 }).joint.hips[1]).toBeCloseTo(0.8);
  });

  it('gives each point to the bones it is near, blending where they meet', () => {
    const geo = new THREE.BufferGeometry();
    const H = 1.7;
    const at = (x: number, y: number): [number, number, number] => [x, y, 0];
    const points = [at(0.17 * 1.0, 0.1), at(0.04, 1.0), at(0.255, 0.95), at(0, 1.6), at(0, 0.88)];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    skinTo(geo, layoutFor(H));
    const idx = geo.getAttribute('skinIndex');
    const wt = geo.getAttribute('skinWeight');
    for (let i = 0; i < points.length; i++) {
      const sum = wt.getX(i) + wt.getY(i) + wt.getZ(i) + wt.getW(i);
      expect(sum).toBeCloseTo(1);
    }
    // bone numbers follow the order hips, spine, neck, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR
    expect(idx.getX(1)).toBe(1); // chest: the spine
    expect(idx.getX(3)).toBe(3); // above the neck: the head
    expect([4, 5]).toContain(idx.getX(2)); // out beside the body at forearm height: the left arm
    expect([8, 9]).toContain(idx.getX(0)); // low and to the left, a point on that leg
  });

  it('finds the first mesh in a loaded model', () => {
    const root = new THREE.Group();
    expect(meshOf(root)).toBeNull();
    const m = block();
    root.add(new THREE.Group().add(m), block());
    expect(meshOf(root)).toBe(m);
  });
});

describe('3D model face', () => {
  it('makes a morph target for each basic movement, moving only the front of the face', () => {
    const geo = new THREE.BoxGeometry(0.6, 1.7, 0.3, 12, 40, 3);
    geo.translate(0, 0.85, 0);
    addExpressions(geo, face);
    const targets = geo.morphAttributes.position!;
    expect(targets.length).toBe(BASIS.length);
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const brow = targets[BASIS.indexOf('browUp')];
    let moved = 0;
    let back = 0;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.abs(brow.getX(i)) + Math.abs(brow.getY(i)) + Math.abs(brow.getZ(i));
      if (nor.getZ(i) > 0.5 && d > 0.002) moved++;
      if (nor.getZ(i) < 0.1 && d > 0) back++;
    }
    expect(moved).toBeGreaterThan(0);
    expect(back).toBe(0);
    // a model with its features somewhere else can say so
    const geo2 = new THREE.BoxGeometry(0.6, 1.7, 0.3, 12, 40, 3);
    addExpressions(geo2, face, { ...FEATURES, browL: [0.1, 0.1] });
    expect(geo2.morphAttributes.position!.length).toBe(BASIS.length);
  });

  it('has a feeling for each expression it shows, and none for a plain face', () => {
    expect(FEELINGS.angry?.browDown).toBe(1);
    expect(FEELINGS.neutral).toBeUndefined();
  });
});

describe('3D model material', () => {
  it("uses the model's own pictures and adds the glow, sharing one program between people", () => {
    const src = block().material as THREE.MeshStandardMaterial;
    const m = glbMaterial(src, 0.2);
    expect(m.map).toBe(src.map);
    expect(m.normalMap).toBe(src.normalMap);
    const shader = { uniforms: {} as Record<string, { value: number }>, fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}' };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.uGlow.value).toBe(0.2);
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    expect(m.customProgramCacheKey()).toBe('glbfigure');
    // a model with no pictures is plain
    expect(glbMaterial(null, 0).map).toBeNull();
  });
});

describe('3D model person', () => {
  it('stands on the ground at its height, and walks with legs and arms swinging', () => {
    const f = new GlbFigure(block(), { height: 1.68, skirt: false, face, seed: 3 });
    const box = new THREE.Box3().setFromObject(f.root);
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeCloseTo(1.68, 1);
    f.update(0.016, { ...still, walk: 1, stride: 0.3 });
    expect(f.bones.legL.rotation.x).not.toBe(0);
    expect(f.pose!.legL).not.toBe(0);
    // arms swing both ways, bending at the elbow only as they come forward
    f.update(0.016, { ...still, walk: 1, stride: 0.3 });
    const swing = [f.bones.armL.rotation.x, f.bones.armR.rotation.x];
    expect(swing[0] * swing[1]).toBeLessThan(0);
    f.update(0.016, { ...still, walk: 1, stride: 1 });
    f.dispose();
  });

  it('turns its head toward a look, and eases the face into a feeling and back', () => {
    const f = new GlbFigure(block(), { height: 1.68, skirt: true, face, joints: HUMAN, features: FEATURES });
    f.update(0.016, { ...still, look: 0.8 });
    expect(f.bones.head.rotation.y).toBeGreaterThan(0.2);
    f.setExpression('angry');
    f.update(0.05, still);
    expect(f.influences.browDown).toBeGreaterThan(0);
    expect(f.influences.browDown).toBeLessThan(1);
    for (let i = 0; i < 60; i++) f.update(0.05, still);
    expect(f.influences.browDown).toBe(1);
    expect(f.influences.smileL).toBe(0);
    f.setExpression('neutral');
    for (let i = 0; i < 60; i++) f.update(0.05, still);
    expect(f.influences.browDown).toBe(0);
    f.setExpression(null);
    f.update(0.05, still);
    f.dispose();
  });
});
