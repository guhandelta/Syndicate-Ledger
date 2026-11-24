import { describe, expect, it } from 'vitest';
import { DAY, DAY_HOUR, NIGHT, NIGHT_HOUR, easeHour, hourLabel, lookAt, storyHour } from '../src/town/looks';
import type { TownTime } from '../src/town/townTypes';

const none = { solved: [], open: [], firedEvents: [] };
const time: TownTime = {
  start: 18.5,
  moments: [
    { when: { leadOpens: 'L2' }, hour: 20 },
    { when: { event: 'burns' }, hour: 23.5 },
    { when: { leadSolved: 'L4' }, hour: 30.5 },
  ],
};

describe('looks of the day', () => {
  it('is the old night in the dark hours and the old daylight at midday', () => {
    expect(lookAt(NIGHT_HOUR)).toEqual(NIGHT);
    expect(lookAt(2)).toEqual(NIGHT);
    expect(lookAt(DAY_HOUR)).toEqual(DAY);
  });

  it('blends between hours: dusk is between day and night, and the lamps come on as it darkens', () => {
    const dusk = lookAt(19.5);
    expect(dusk.daylight).toBeGreaterThan(0);
    expect(dusk.daylight).toBeLessThan(1);
    expect(dusk.lamp).toBeGreaterThan(DAY.lamp);
    expect(lookAt(12).lamp).toBe(0);
    expect(lookAt(23).lamp).toBe(NIGHT.lamp);
    // dawn is lighter than the middle of the night and darker than noon
    expect(lookAt(6.5).daylight).toBeGreaterThan(0);
    expect(lookAt(6.5).daylight).toBeLessThan(1);
  });

  it('wraps past midnight, so 29.5 is half past five the next morning', () => {
    expect(lookAt(29.5)).toEqual(lookAt(5.5));
    expect(lookAt(-1)).toEqual(lookAt(23));
  });

  it('says the hour in words', () => {
    expect(hourLabel(18.5)).toBe('6:30 pm');
    expect(hourLabel(0)).toBe('12:00 am');
    expect(hourLabel(12)).toBe('12:00 pm');
    expect(hourLabel(29.5)).toBe('5:30 am');
    expect(hourLabel(8.999)).toBe('9:00 am');
  });
});

describe('the story sets the hour', () => {
  it('stays dark as before when the town has no time, and opens at the start hour when it has', () => {
    expect(storyHour(undefined, none)).toBe(NIGHT_HOUR);
    expect(storyHour(time, none)).toBe(18.5);
    expect(storyHour({ start: 7 }, none)).toBe(7);
  });

  it('moves on as moments come, never back, whatever order they come in', () => {
    expect(storyHour(time, { ...none, open: ['L2'] })).toBe(20);
    expect(storyHour(time, { ...none, firedEvents: ['burns'] })).toBe(23.5);
    expect(storyHour(time, { solved: [], open: ['L2'], firedEvents: ['burns'] })).toBe(23.5);
    expect(storyHour(time, { solved: ['L4'], open: ['L2'], firedEvents: ['burns'] })).toBe(30.5);
  });
});

describe('easing the hour', () => {
  it('moves forward toward the story hour and arrives, and never runs backwards', () => {
    let h = 20;
    for (let i = 0; i < 300; i++) h = easeHour(h, 23.5, 0.016);
    expect(h).toBe(23.5);
    expect(easeHour(23.5, 20, 0.016)).toBe(20);
    expect(easeHour(20, 20, 0.016)).toBe(20);
    const first = easeHour(20, 23.5, 0.016);
    expect(first).toBeGreaterThan(20);
    expect(first).toBeLessThan(23.5);
  });

  it('takes about two seconds for a few hours', () => {
    let h = 20;
    let t = 0;
    while (h < 23.4 && t < 10) {
      h = easeHour(h, 23.5, 0.016);
      t += 0.016;
    }
    expect(t).toBeGreaterThan(0.8);
    expect(t).toBeLessThan(4);
  });
});
