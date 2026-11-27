import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import caseJson from '../cases/case-01-harbor-ledger.json';
import type { CaseFile } from '../src/game/caseTypes';
import { Worker } from '../src/town/workers';
import townJson from '../cases/case-01-harbor-ledger/town.json';
import { pieceUrl, shade, SHOPS, SIDES, shopParts, shopProps, shopSolids, shopWorkers } from '../src/town/shops';
import { ACTIONS, OUTFITS, PERIOD, workerPose } from '../src/town/workerActions';
import { PLAYER_RADIUS, step, validateTown } from '../src/town/townLogic';
import { TRADES, type Building, type Town } from '../src/town/townTypes';

const town = townJson as unknown as Town;
const shops = town.buildings.filter((b) => b.trade);
const inside = (p: [number, number], b: Building, pad = 0) => Math.abs(p[0] - b.at[0]) < b.size[0] / 2 + pad && Math.abs(p[1] - b.at[1]) < b.size[1] / 2 + pad;

describe('shops from Guha\'s sheets', () => {
  it('has facts and all four walls for every trade', () => {
    for (const trade of TRADES) {
      const facts = SHOPS[trade]!;
      expect(facts, trade).toBeDefined();
      for (const side of SIDES) expect(pieceUrl(trade, side), `${trade}-${side}`).toBeTypeOf('string');
      if (facts.roof.kind === 'gable') for (const s of ['roof-front', 'roof-back']) expect(pieceUrl(trade, s), `${trade}-${s}`).toBeTypeOf('string');
      if (facts.awning) expect(pieceUrl(trade, 'awning')).toBeTypeOf('string');
      if (facts.sign) expect(pieceUrl(trade, 'sign')).toBeTypeOf('string');
      expect(facts.width).toBeGreaterThan(4);
      expect(facts.depth).toBeGreaterThan(2.5);
    }
  });

  it('puts all eleven shops in Port Calder, each once, front walls on the street line', () => {
    expect(shops.map((b) => b.trade).sort()).toEqual([...TRADES].sort());
    expect(TRADES).toHaveLength(11);
    for (const b of shops) {
      expect(b.size[0]).toBeCloseTo(SHOPS[b.trade!]!.width, 1);
      expect(b.at[1] + b.size[1] / 2).toBeCloseTo(-4, 2);
    }
  });

  it('keeps the shops apart, signs and all', () => {
    const row = [...town.buildings].filter((b) => b.doorSide === 'south').sort((a, b) => a.at[0] - b.at[0]);
    for (let i = 1; i < row.length; i++) {
      // how far a building reaches east (+1) or west (-1) of its middle, counting a sign hung off its wall
      const reach = (b: Building, dir: number) => {
        const sign = b.trade ? SHOPS[b.trade]!.sign : undefined;
        const out = sign && Math.sign(sign.x) === dir ? Math.abs(sign.x) + sign.w / 2 : 0;
        return Math.max(b.size[0] / 2, out);
      };
      expect(row[i].at[0] - row[i - 1].at[0], `${row[i - 1].id} to ${row[i].id}`).toBeGreaterThan(reach(row[i - 1], 1) + reach(row[i], -1) + 0.5);
    }
  });

  it('wraps the four pictured walls round the body, with a roof, facing the door side', () => {
    const b = shops.find((s) => s.trade === 'marine')!;
    const parts = shopParts(b, SHOPS.marine!, (id) => `x/${id}`);
    const [w, d] = b.size;
    expect(parts[0]).toMatchObject({ shape: 'box', size: [w, expect.any(Number), d] });
    const panels = parts.filter((p) => p.shape === 'panel');
    for (const side of SIDES) expect(panels.map((p) => p.tex)).toContain(`x/${side}`);
    const front = panels.find((p) => p.tex === 'x/front')!;
    expect(front.at[2] - b.at[1]).toBeGreaterThan(0);
    expect(front.size[0]).toBe(w);
    expect(panels.find((p) => p.tex === 'x/east')!.turn).toBeCloseTo(Math.PI / 2);
    expect(parts.some((p) => p.shape === 'gable')).toBe(true);
    // both roof slopes lean back toward the ridge
    const slopes = panels.filter((p) => p.tex?.startsWith('x/roof'));
    expect(slopes).toHaveLength(2);
    for (const p of slopes) expect(p.tilt!).toBeLessThan(-0.3);
    expect(panels.some((p) => p.tex === 'x/awning' && p.twoSided)).toBe(true);
    for (const p of parts) expect(p.size.every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
    // the same shop turned to face north puts its front, props and workers on the north side
    const north: Building = { ...b, at: [0, 0], doorSide: 'north' };
    expect(shopParts(north, SHOPS.marine!, (id) => `x/${id}`).find((p) => p.tex === 'x/front')!.at[2]).toBeLessThan(0);
    expect(shopProps(north).every((p) => p.at[2] < 0)).toBe(true);
    expect(shopWorkers(north).every((w) => w.at[1] < 0)).toBe(true);
  });

  it('builds flat and sloping roofs over the walls', () => {
    const fish = shops.find((s) => s.trade === 'fish')!;
    const flat = shopParts(fish, SHOPS.fish!, () => undefined);
    expect(flat.some((p) => p.shape === 'gable' || p.shape === 'panel')).toBe(false);
    const tea = shops.find((s) => s.trade === 'tea')!;
    const shed = shopParts(tea, SHOPS.tea!, () => undefined);
    // the tea stall's roof is higher at the front, so its south end is lifted
    expect(shed.some((p) => p.shape === 'box' && (p.tilt ?? 0) < 0)).toBe(true);
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

  it('gives every shop its own trade at work outside', () => {
    expect(new Set(shops.flatMap((b) => shopWorkers(b).map((w) => w.action))).size).toBeGreaterThanOrEqual(11);
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
    expect(workerPose('pump', 0).stance).toBe('squat');
    expect(workerPose('measure', PERIOD.measure * 0.25).armR.side).toBeGreaterThan(0.5);
  });
});

describe('shop details', () => {
  const fish = shops.find((s) => s.trade === 'fish')!;
  const harbor = shops.find((s) => s.trade === 'harbor')!;

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
    const outfit: Record<string, keyof typeof OUTFITS> = { pour: 'teaMaker', sip: 'customer', repair: 'mechanic', gut: 'fishSeller', arrange: 'florist', pin: 'clerk', mend: 'netMender', sew: 'tailor', pump: 'bikeHand', measure: 'suitMaker', press: 'presser', coil: 'chandler' };
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
