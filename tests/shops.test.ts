import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import caseJson from '../cases/case-01-harbor-ledger.json';
import type { CaseFile } from '../src/game/caseTypes';
import { Worker } from '../src/town/workers';
import townJson from '../cases/case-01-harbor-ledger/town.json';
import { pieceUrl, shade, SHOPS, shopParts, shopProps, shopSolids, shopWorkers } from '../src/town/shops';
import { ACTIONS, OUTFITS, PERIOD, workerPose } from '../src/town/workerActions';
import { PLAYER_RADIUS, step, validateTown } from '../src/town/townLogic';
import { TRADES, type Building, type Town } from '../src/town/townTypes';

const town = townJson as unknown as Town;
const shops = town.buildings.filter((b) => b.trade);
const inside = (p: [number, number], b: Building, pad = 0) => Math.abs(p[0] - b.at[0]) < b.size[0] / 2 + pad && Math.abs(p[1] - b.at[1]) < b.size[1] / 2 + pad;

describe('shops from Guha\'s pictures', () => {
  it('has facts and cut pieces for every trade', () => {
    for (const trade of TRADES) {
      const facts = SHOPS[trade]!;
      expect(facts, trade).toBeDefined();
      expect(facts.pieces.some((p) => p.id === 'sign' && p.mode === 'cut'), `${trade} sign`).toBe(true);
      for (const p of facts.pieces) expect(pieceUrl(trade, p.id), `${trade}-${p.id}`).toBeTypeOf('string');
      expect(facts.awnings.length).toBeGreaterThan(0);
    }
  });

  it('puts all seven shops in Port Calder', () => {
    expect(new Set(shops.map((b) => b.trade))).toEqual(new Set(TRADES));
  });

  it('builds walls, roof, awning and picture pieces, facing the door side', () => {
    const b = shops.find((s) => s.trade === 'nets')!;
    const parts = shopParts(b, SHOPS.nets!, (id) => `x/${id}`);
    expect(parts[0]).toMatchObject({ shape: 'box', size: [7.5, b.height, 5] });
    expect(parts.some((p) => p.shape === 'gable')).toBe(true);
    expect(parts.some((p) => p.tilt && p.tilt > 0)).toBe(true);
    const panels = parts.filter((p) => p.shape === 'panel');
    expect(panels.map((p) => p.tex)).toContain('x/door');
    expect(panels.every((p) => p.at[2] > 2.5)).toBe(true);
    for (const p of parts) expect(p.size.every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
    // the same shop turned to face north puts its front, props and workers on the north side
    const north: Building = { ...b, at: [0, 0], doorSide: 'north' };
    expect(shopProps(north).every((p) => p.at[2] < 0)).toBe(true);
    expect(shopWorkers(north).every((w) => w.at[1] < 0)).toBe(true);
  });

  it('has a worker at every shop, outside the walls and on the street', () => {
    for (const b of shops) {
      const workers = shopWorkers(b);
      expect(workers.length, b.id).toBeGreaterThan(0);
      for (const w of workers) {
        expect(ACTIONS).toContain(w.action);
        expect(OUTFITS[w.outfit]).toBeDefined();
        for (const other of town.buildings) expect(inside(w.at, other), `${b.id} worker in ${other.id}`).toBe(false);
        expect(w.at[0]).toBeGreaterThan(town.bounds[0]);
        expect(w.at[0]).toBeLessThan(town.bounds[2]);
        expect(w.at[1]).toBeGreaterThan(town.waterline);
      }
    }
  });

  it('keeps every door, person and the start clear of the shop clutter', () => {
    const solids = shops.flatMap((b) => shopSolids(b));
    const keepClear = [...town.doors.map((d) => d.at), ...town.npcs.flatMap((n) => [n.at, ...(n.path ?? [])]), town.start.at];
    for (const p of keepClear) for (const s of solids) expect(Math.hypot(p[0] - s[0], p[1] - s[1]), `${p} near ${s}`).toBeGreaterThan(1.1);
  });

  it('lets the detective walk straight up to the fish hall door from the start', () => {
    const solids = shops.flatMap((b) => shopSolids(b));
    let at = town.start.at;
    for (let i = 0; i < 200; i++) at = step(town, at, 0, -0.05, solids);
    const door = town.doors.find((d) => d.id === 'fish-hall')!;
    expect(Math.hypot(at[0] - door.at[0], at[1] - door.at[1])).toBeLessThan(2.2);
    expect(at[1]).toBeCloseTo(-4 + PLAYER_RADIUS, 1);
  });
});

describe('worker actions', () => {
  it('loop over their period and stay in a sensible range', () => {
    for (const a of ACTIONS) {
      for (const t of [0, 0.37, 1.2, 2.9]) {
        const p = workerPose(a, t, 1.3);
        const q = workerPose(a, t + PERIOD[a], 1.3);
        expect(q.armR.fwd).toBeCloseTo(p.armR.fwd, 6);
        expect(q.lean).toBeCloseTo(p.lean, 6);
        expect(q.yaw).toBeCloseTo(p.yaw, 6);
        for (const n of [p.armL.fwd, p.armL.side, p.armL.elbow, p.armR.fwd, p.armR.side, p.armR.elbow, p.lean, p.twist, p.yaw, p.pitch]) {
          expect(Math.abs(n)).toBeLessThan(2.8);
        }
        expect(p.beat).toBeGreaterThanOrEqual(0);
        expect(p.beat).toBeLessThanOrEqual(1);
      }
    }
  });

  it('pulls the tea high and sits the customer, tailor and net mender down', () => {
    expect(workerPose('pour', PERIOD.pour / 2).armR.fwd).toBeGreaterThan(2);
    expect(workerPose('pour', 0).beat).toBeCloseTo(0);
    for (const a of ['sip', 'sew', 'mend'] as const) expect(workerPose(a, 0).stance).toBe('sit');
    expect(workerPose('repair', 0).stance).toBe('squat');
  });
});

describe('shop details', () => {
  const fish = shops.find((s) => s.trade === 'fish')!;
  const harbor = shops.find((s) => s.trade === 'harbor')!;

  it('gives the fish hall a flat roof with a parapet, and skips a piece with no picture', () => {
    const parts = shopParts(fish, SHOPS.fish!, () => undefined);
    expect(parts.some((p) => p.shape === 'gable')).toBe(false);
    expect(parts.some((p) => p.shape === 'panel')).toBe(false);
  });

  it('uses the cut pieces and the picture\'s trim by default', () => {
    const parts = shopParts({ ...fish, trim: undefined }, SHOPS.fish!);
    expect(parts.filter((p) => p.shape === 'panel').every((p) => typeof p.tex === 'string')).toBe(true);
    expect(parts.some((p) => p.color === parseInt(SHOPS.fish!.colours.trim.slice(1), 16))).toBe(true);
  });

  it('flies a flapping flag over the harbor office', () => {
    expect(shopProps(harbor).filter((p) => p.anim === 'flap')).toHaveLength(1);
    expect(shopProps({ ...harbor, trade: undefined })).toEqual([]);
    expect(shopWorkers({ ...harbor, trade: undefined })).toEqual([]);
    expect(shopSolids({ ...harbor, trade: undefined })).toEqual([]);
  });

  it('darkens a colour without leaving 0 to 255', () => {
    expect(shade(0xff8000, 0.5)).toBe(0x804000);
    expect(shade(0x808080, 3)).toBe(0xffffff);
  });

  it('checks a shop in the town file', () => {
    const cf = caseJson as unknown as CaseFile;
    const withShop = (b: Partial<Building>) => validateTown({ ...town, buildings: [{ ...shops[0], ...b }, ...town.buildings.filter((x) => x !== shops[0])] }, cf);
    expect(withShop({})).toEqual([]);
    expect(withShop({ trade: 'bakery' as never })).toContain(`Building ${shops[0].id} has unknown trade bakery`);
    expect(withShop({ style: 'shed' }).join()).toContain('takes no style');
  });
});

describe('shop workers', () => {
  it('builds every worker, poses them through their loop and lets them go', () => {
    const outfit: Record<string, keyof typeof OUTFITS> = { pour: 'teaMaker', sip: 'customer', repair: 'mechanic', gut: 'fishSeller', arrange: 'florist', pin: 'clerk', mend: 'netMender', sew: 'tailor' };
    for (const a of ACTIONS) {
      const w = new Worker(a, outfit[a], 1);
      expect(w.materials.length).toBeGreaterThan(5);
      for (const t of [0, PERIOD[a] * 0.3, PERIOD[a] * 0.5]) w.update(t);
      expect(w.root.children.length).toBeGreaterThan(0);
      w.dispose();
    }
  });

  it('shows the stream of tea only while it is pulled high', () => {
    const w = new Worker('pour', 'teaMaker', 0);
    const stream = w.root.children.find((c) => (c as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (c as THREE.Mesh).geometry instanceof THREE.CylinderGeometry)!;
    w.update(0);
    expect(stream.visible).toBe(false);
    w.update(PERIOD.pour / 2);
    expect(stream.visible).toBe(true);
  });
});
