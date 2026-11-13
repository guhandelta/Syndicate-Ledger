import { describe, expect, it } from 'vitest';
import caseFile from '../cases/case-01-harbor-ledger.json';
import townFile from '../cases/case-01-harbor-ledger/town.json';
import type { CaseFile } from '../src/game/caseTypes';
import { cameraPose, nearest, npcPosition, npcPresent, step, validateTown } from '../src/town/townLogic';
import type { Town } from '../src/town/townTypes';

const cf = caseFile as unknown as CaseFile;
const town = townFile as unknown as Town;

describe('Case 1 town file', () => {
  it('matches its case: every lead has a door and every cast member has a spot', () => {
    expect(validateTown(town, cf)).toEqual([]);
  });

  it('reports a door that opens a lead the case does not have', () => {
    const broken = { ...town, doors: [...town.doors, { id: 'x', at: [0, 0] as [number, number], label: 'X', lead: 'L9' }] };
    expect(validateTown(broken, cf)).toContain('Door "x" opens unknown lead L9');
  });
});

describe('walking', () => {
  it('stops at a building wall', () => {
    const hall = town.buildings.find((b) => b.id === 'fish-hall')!;
    let at = town.start.at;
    for (let i = 0; i < 200; i++) at = step(town, at, 0, -0.1);
    const wall = hall.at[1] + hall.size[1] / 2;
    expect(at[1]).toBeGreaterThan(wall);
    expect(at[1]).toBeLessThan(wall + 0.6);
  });

  it('stays out of the water and on the ground', () => {
    let at: [number, number] = [0, -9.6];
    for (let i = 0; i < 200; i++) at = step(town, at, -0.2, -0.2);
    expect(at[1]).toBeGreaterThan(town.waterline);
    expect(at[0]).toBeGreaterThan(town.bounds[0]);
  });

  it('cannot walk through a person', () => {
    const at = step(town, [0, 1], 0, -0.9, [[0, 0]]);
    expect(Math.hypot(at[0], at[1])).toBeGreaterThanOrEqual(0.94);
  });
});

describe('people and doors', () => {
  it('offers the nearest door or person within reach', () => {
    const door = town.doors.find((d) => d.lead === 'L1')!;
    expect(nearest(town, door.at, [])).toMatchObject({ kind: 'door', door: { lead: 'L1' } });
    expect(nearest(town, [0, 12], [])).toBeNull();
    const rosa = town.npcs.find((n) => n.cast === 'rosa')!;
    expect(nearest(town, [rosa.at[0], rosa.at[1] + 1], [{ npc: rosa, at: rosa.at }])).toMatchObject({ kind: 'npc', npc: { cast: 'rosa' } });
  });

  it('moves a person along their path and back', () => {
    const kane = town.npcs.find((n) => n.cast === 'kane')!;
    expect(npcPosition(kane, 0).at).toEqual(kane.at);
    const mid = npcPosition(kane, 4.5);
    expect(mid.moving).toBe(true);
    expect(mid.at[1]).toBeGreaterThan(kane.at[1]);
    expect(mid.at[1]).toBeLessThan(kane.path![0][1]);
    const far = npcPosition(kane, 3 + 3.9 / 1.1 + 1);
    expect(far.at).toEqual(kane.path![0]);
  });

  it('removes a witness once their leaving event has fired', () => {
    const juno = town.npcs.find((n) => n.cast === 'juno')!;
    expect(npcPresent(juno, [])).toBe(true);
    expect(npcPresent(juno, ['juno-leaves'])).toBe(false);
  });
});

describe('cameras', () => {
  const player = { x: 2, z: 3, heading: 0 };
  it('follows from above when exploring', () => {
    const p = cameraPose('angled', town.cameras, player);
    expect(p.position).toEqual([2, town.cameras.angled.height, 3 + town.cameras.angled.back]);
    expect(p.target[0]).toBe(2);
  });
  it('sits behind the player and looks ahead in the behind view', () => {
    const p = cameraPose('behind', town.cameras, player);
    expect(p.position[2]).toBeCloseTo(3 + town.cameras.behind.back);
    expect(p.target[2]).toBeCloseTo(3 - town.cameras.behind.lookAhead);
  });
  it('looks at the person being talked to', () => {
    const p = cameraPose('talk', town.cameras, player, [2, 0]);
    expect(p.target).toEqual([2, 1.15, 0]);
    expect(p.position[2]).toBeGreaterThan(0);
  });
});
