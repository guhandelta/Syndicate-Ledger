import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addExpressions, HAIR_BUNCHES, HAIR_LINKS, BASIS, FEATURES, FEELINGS, glbMaterial, GlbFigure, HAIR, MIP_LEVELS, shortMips, hairiness, hairTo, HUMAN, isHairColour, layoutFor, meshOf, skinTo } from '../src/town/glbFigure';
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
    // and can hold a movement back, where glasses or the like sit on the face
    const full = new THREE.BoxGeometry(0.6, 1.7, 0.3, 12, 40, 3);
    full.translate(0, 0.85, 0);
    const held = full.clone();
    addExpressions(full, face);
    addExpressions(held, face, FEATURES, { browUp: 0.5, lidClose: 0 });
    const sum = (g: THREE.BufferGeometry, name: (typeof BASIS)[number]) => Array.from(g.morphAttributes.position![BASIS.indexOf(name)].array).reduce((a, v) => a + Math.abs(v), 0);
    expect(sum(held, 'browUp')).toBeCloseTo(sum(full, 'browUp') / 2);
    expect(sum(held, 'lidClose')).toBe(0);
    expect(sum(held, 'smileL')).toBeCloseTo(sum(full, 'smileL'));
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

describe('3D model picture sizes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const fakeCanvases = (context: object | null) => {
    const made: { width: number; height: number }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const c = { width: 0, height: 0, getContext: () => context };
        made.push(c);
        return c;
      },
    });
    return made;
  };

  it('keeps only the full picture and a few halvings, so far-off patches do not bleed into each other', () => {
    const made = fakeCanvases({ drawImage: vi.fn() });
    const tex = new THREE.Texture({ width: 2048, height: 1024 } as unknown as HTMLImageElement);
    shortMips(tex);
    expect(tex.mipmaps).toHaveLength(MIP_LEVELS);
    expect(made.map((c) => [c.width, c.height])).toEqual(Array.from({ length: MIP_LEVELS - 1 }, (_, i) => [2048 >> (i + 1), 1024 >> (i + 1)]));
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  });

  it('stops at one pixel for a tiny picture', () => {
    fakeCanvases({ drawImage: vi.fn() });
    const tex = new THREE.Texture({ width: 2, height: 1 } as unknown as HTMLImageElement);
    shortMips(tex);
    expect(tex.mipmaps).toHaveLength(1);
  });

  it('leaves the picture alone with nothing to draw on, no picture yet, or no page', () => {
    fakeCanvases(null);
    const tex = new THREE.Texture({ width: 64, height: 64 } as unknown as HTMLImageElement);
    shortMips(tex);
    expect(tex.generateMipmaps).toBe(true);
    const empty = new THREE.Texture();
    shortMips(empty);
    expect(empty.generateMipmaps).toBe(true);
    shortMips(null);
    vi.unstubAllGlobals();
    shortMips(tex);
    expect(tex.generateMipmaps).toBe(true);
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

  it('glows as much as it is told, more in the dark', () => {
    const f = new GlbFigure(block(), { height: 1.68, skirt: false, face });
    const uniform = (f as unknown as { material: THREE.Material }).material.userData.uGlow as { value: number };
    expect(uniform.value).toBe(0.15);
    f.setGlow(0.22);
    expect(uniform.value).toBe(0.22);
    f.dispose();
  });

  it('swings less when the model says its hair lies close on the coat', () => {
    const dark = (): [number, number, number] => [34, 26, 26];
    const swing = (hairSwing?: number) => {
      const f = new GlbFigure(block(), { height: 1.68, skirt: false, face, hair: dark, hairSwing });
      f.update(0.016, still);
      for (let i = 0; i < 30; i++) {
        f.root.position.z += 0.04;
        f.update(0.016, { ...still, walk: 1, stride: i * 0.04 });
      }
      const x = Math.abs(f.bones['hair2_3'].rotation.x);
      f.dispose();
      return x;
    };
    expect(swing(0.5)).toBeCloseTo(swing() / 2);
  });
});

describe('3D model hair', () => {
  const dark = (): [number, number, number] => [34, 26, 26];
  const skirt = (): [number, number, number] => [52, 34, 48];
  /** A block in metres, 1.7 tall, with its points skinned to the skeleton. */
  function skinned() {
    const geo = new THREE.BoxGeometry(0.6, 1.7, 0.3, 6, 40, 3);
    geo.translate(0, 0.85, 0);
    const layout = layoutFor(1.7);
    skinTo(geo, layout);
    return { geo, layout };
  }

  it('tells hair from a dark skirt, a boot or a scarf by its colour', () => {
    expect(isHairColour([34, 26, 26])).toBe(true);
    expect(isHairColour([52, 34, 48])).toBe(false);
    expect(isHairColour([180, 40, 80])).toBe(false);
  });

  it('finds the hair below the neck, not the front of the waist, and fades its edge', () => {
    const { geo, layout } = skinned();
    const h = hairiness(geo, layout, dark);
    const pos = geo.getAttribute('position');
    let back = 0;
    let frontWaist = 0;
    let above = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 1.5) above += h[i];
      else if (pos.getZ(i) > 0.1 && pos.getY(i) < 0.7) frontWaist = Math.max(frontWaist, h[i]);
      else if (pos.getZ(i) < -0.1 && pos.getY(i) > 0.9 && pos.getY(i) < 1.2) back = Math.max(back, h[i]);
    }
    expect(back).toBeGreaterThan(0.9);
    expect(frontWaist).toBeLessThan(0.5);
    expect(above).toBe(0);
    expect(Math.max(...hairiness(geo, layout, skirt))).toBe(0);
  });

  it('hands hair to the soft bones, more the lower it hangs, and leaves other points as they were', () => {
    const { geo, layout } = skinned();
    const before = Array.from(geo.getAttribute('skinIndex').array);
    hairTo(geo, layout, dark, 1.7);
    const idx = geo.getAttribute('skinIndex');
    const wt = geo.getAttribute('skinWeight');
    const pos = geo.getAttribute('position');
    const first = 12;
    let used = 0;
    let tail = 0;
    for (let i = 0; i < pos.count; i++) {
      let sum = 0;
      let onChain = 0;
      for (let k = 0; k < 4; k++) {
        sum += wt.getComponent(i, k);
        if (idx.getComponent(i, k) >= first && idx.getComponent(i, k) < first + HAIR.length) onChain += wt.getComponent(i, k);
      }
      expect(sum).toBeCloseTo(1);
      if (onChain > 0) used++;
      if (pos.getY(i) < 0.9 && pos.getZ(i) < -0.1 && onChain > 0.5) tail++;
      // above the neck is the head's
      if (pos.getY(i) > 1.5) expect(onChain).toBe(0);
    }
    expect(used).toBeGreaterThan(0);
    expect(HAIR.length).toBe(HAIR_BUNCHES * HAIR_LINKS);
    // points at the left and right of the back go to different bunches
    const bunches = new Set<number>();
    for (let i = 0; i < pos.count; i++) for (let k = 0; k < 4; k++) if (wt.getComponent(i, k) > 0.3 && idx.getComponent(i, k) >= first) bunches.add(Math.floor((idx.getComponent(i, k) - first) / HAIR_LINKS));
    expect(bunches.size).toBeGreaterThan(2);
    expect(tail).toBeGreaterThan(0);
    // none of it is hair here, so nothing changes
    const plain = skinned();
    hairTo(plain.geo, plain.layout, skirt, 1.7);
    expect(Array.from(plain.geo.getAttribute('skinIndex').array)).toEqual(before);
  });

  it('swings with the head: the hair lags when she walks off, sways with her steps, and settles', () => {
    const f = new GlbFigure(block(), { height: 1.68, skirt: false, face, hair: dark });
    f.update(0.016, still);
    // nothing moves while she stands
    for (let i = 0; i < 20; i++) f.update(0.016, still);
    expect(Math.abs(f.bones['hair2_0'].rotation.x)).toBeLessThan(0.01);
    // a time with no time passing leaves it alone
    f.update(0, still);
    // she walks forward: the hair is left behind (it tips back), then sways with each step
    for (let i = 0; i < 30; i++) {
      f.root.position.z += 0.04;
      f.update(0.016, { ...still, walk: 1, stride: i * 0.04 });
    }
    expect(f.bones['hair2_3'].rotation.x).toBeGreaterThan(0.02);
    expect(Math.abs(f.bones['hair2_3'].rotation.z)).toBeGreaterThan(0.005);
    // the bunches across the back do not move alike
    expect(Math.abs(f.bones['hair0_3'].rotation.z - f.bones['hair4_3'].rotation.z)).toBeGreaterThan(0.003);
    // sideways pushes it the other way; a big frame time is taken in small steps
    f.root.position.x += 0.5;
    f.update(0.1, still);
    expect(f.bones['hair2_1'].rotation.z).toBeLessThan(0);
    // and it settles when she stops
    for (let i = 0; i < 300; i++) f.update(0.016, still);
    expect(Math.abs(f.bones['hair2_3'].rotation.x)).toBeLessThan(0.01);
    f.dispose();
  });
});
