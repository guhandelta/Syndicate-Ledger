import { describe, expect, it } from 'vitest';
import { buildingParts, seaLine, STYLE_TRIM } from '../src/town/buildingStyles';
import { BUILDING_STYLES, type Building } from '../src/town/townTypes';

const base: Building = { id: 'x', name: 'X', at: [0, 0], size: [8, 5], height: 4, color: '#aabbcc', roof: '#112233', doorSide: 'south' };

describe('building styles', () => {
  it('every style has a trim colour and builds pieces with a body', () => {
    for (const style of BUILDING_STYLES) {
      expect(STYLE_TRIM[style]).toBeTypeOf('number');
      const parts = buildingParts({ ...base, style });
      expect(parts[0]).toMatchObject({ shape: 'box', size: [8, 4, 5], color: 0xaabbcc });
      for (const p of parts) expect(p.size.every((n) => n >= 0 && Number.isFinite(n))).toBe(true);
    }
  });

  it('leaves the old plain box when no style is given', () => {
    const parts = buildingParts(base);
    expect(parts.map((p) => p.shape)).toEqual(['box', 'hip']);
  });

  it('uses the town file trim, else the style trim', () => {
    expect(buildingParts({ ...base, style: 'madras', trim: '#ff0000' }).some((p) => p.color === 0xff0000)).toBe(true);
    expect(buildingParts({ ...base, style: 'madras' }).some((p) => p.color === STYLE_TRIM.madras)).toBe(true);
  });

  it('puts the front toward the door side', () => {
    const front = (doorSide: 'north' | 'south') => buildingParts({ ...base, style: 'bungalow', doorSide }).filter((p) => p.size[0] === 0.22).map((p) => p.at[2]);
    expect(front('south').every((z) => z > 2.5)).toBe(true);
    expect(front('north').every((z) => z < -2.5)).toBe(true);
  });

  it('gives a mill a tooth per 2.4 m of depth, lit, and a chimney', () => {
    const parts = buildingParts({ ...base, style: 'mill' });
    expect(parts.filter((p) => p.shape === 'gable')).toHaveLength(2);
    expect(parts.filter((p) => p.glow)).toHaveLength(2);
    expect(parts.some((p) => p.shape === 'cyl' && p.size[1] > 4)).toBe(true);
  });

  it('ribs a shed by its width and gives a madras office domes', () => {
    expect(buildingParts({ ...base, style: 'shed' }).filter((p) => p.size[0] === 0.08)).toHaveLength(5);
    expect(buildingParts({ ...base, style: 'madras' }).filter((p) => p.shape === 'dome')).toHaveLength(3);
  });
});

describe('sea line', () => {
  it('is the same every time and lies beyond the quay', () => {
    const a = seaLine([-30, -14, 30, 16], -11);
    expect(a).toEqual(seaLine([-30, -14, 30, 16], -11));
    expect(a.every((t) => t.at[1] < -11 && t.at[0] >= -30 && t.at[0] <= 30)).toBe(true);
    expect(new Set(a.map((t) => t.kind))).toEqual(new Set(['lighthouse', 'breakwater', 'ship', 'buoy']));
  });
});
