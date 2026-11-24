import type { ShotFacts } from './townLogic';
import type { TownTime } from './townTypes';

/**
 * How the town looks at one moment of the day. The numbers are the ones the scene draws with
 * (colours as 0xRRGGBB), so the scene can blend between any two hours.
 */
export interface Look {
  sky: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunPower: number;
  ground: number;
  cobble: number;
  water: number;
  /** How strong the street lamps are: 0 puts them out. */
  lamp: number;
  window: number;
  figureTint: number;
  /** 0 in the dark of night, 1 in full daylight: lit windows and lamp glow fade with it. */
  daylight: number;
}

export const NIGHT: Look = {
  sky: 0x0a111e, fogNear: 30, fogFar: 85, hemiSky: 0x7f95c4, hemiGround: 0x1b1d24, hemi: 1.5, sun: 0x9db3ff, sunPower: 1.1,
  ground: 0x2b303b, cobble: 0x232730, water: 0x0c2a3f, lamp: 2.2, window: 0xffc86a, figureTint: 0xd4dcf0, daylight: 0,
};
export const DAY: Look = {
  sky: 0x9fd3f0, fogNear: 60, fogFar: 140, hemiSky: 0xffffff, hemiGround: 0x8a8f7a, hemi: 2.4, sun: 0xfff2d0, sunPower: 2.2,
  ground: 0xb9b2a0, cobble: 0xa59d8a, water: 0x3f9fc4, lamp: 0, window: 0xfff3c4, figureTint: 0xffffff, daylight: 1,
};
const DAWN: Look = {
  sky: 0xe8a98a, fogNear: 35, fogFar: 100, hemiSky: 0xc9a9b8, hemiGround: 0x4a4650, hemi: 1.7, sun: 0xffc08a, sunPower: 1.4,
  ground: 0x6d6a70, cobble: 0x5a5860, water: 0x3a5f78, lamp: 0.9, window: 0xffd890, figureTint: 0xf2e0d8, daylight: 0.45,
};
const EVENING: Look = {
  sky: 0xe58a5a, fogNear: 40, fogFar: 110, hemiSky: 0xd9a88e, hemiGround: 0x3d3a3e, hemi: 1.8, sun: 0xff9a55, sunPower: 1.5,
  ground: 0x8a7d78, cobble: 0x756a68, water: 0x2a4a63, lamp: 1.2, window: 0xffc070, figureTint: 0xf0d8c8, daylight: 0.55,
};

/** The looks the day passes through, by hour of the day (0 to 24, first and last are the same night). */
const KEYS: [hour: number, look: Look][] = [
  [0, NIGHT],
  [5, NIGHT],
  [6, DAWN],
  [8, DAY],
  [16.5, DAY],
  [18.5, EVENING],
  [20.5, NIGHT],
  [24, NIGHT],
];

const channel = (a: number, b: number, t: number, shift: number) => {
  const x = (a >> shift) & 255;
  const y = (b >> shift) & 255;
  return Math.round(x + (y - x) * t) << shift;
};
const mixColour = (a: number, b: number, t: number) => channel(a, b, t, 16) | channel(a, b, t, 8) | channel(a, b, t, 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The look at an hour of the day. Hours past 24 wrap to the next day, so a story can count on past midnight. */
export function lookAt(hour: number): Look {
  const h = ((hour % 24) + 24) % 24;
  let i = KEYS.findIndex(([at]) => at > h);
  if (i < 1) i = KEYS.length - 1;
  const [h0, a] = KEYS[i - 1];
  const [h1, b] = KEYS[i];
  const x = (h - h0) / (h1 - h0);
  const t = x * x * (3 - 2 * x);
  return {
    sky: mixColour(a.sky, b.sky, t),
    fogNear: mix(a.fogNear, b.fogNear, t),
    fogFar: mix(a.fogFar, b.fogFar, t),
    hemiSky: mixColour(a.hemiSky, b.hemiSky, t),
    hemiGround: mixColour(a.hemiGround, b.hemiGround, t),
    hemi: mix(a.hemi, b.hemi, t),
    sun: mixColour(a.sun, b.sun, t),
    sunPower: mix(a.sunPower, b.sunPower, t),
    ground: mixColour(a.ground, b.ground, t),
    cobble: mixColour(a.cobble, b.cobble, t),
    water: mixColour(a.water, b.water, t),
    lamp: mix(a.lamp, b.lamp, t),
    window: mixColour(a.window, b.window, t),
    figureTint: mixColour(a.figureTint, b.figureTint, t),
    daylight: mix(a.daylight, b.daylight, t),
  };
}

/** The hour the town is at when a town file says nothing about time: the dark of night, as it always was. */
export const NIGHT_HOUR = 22;
/** Junior's town stays in friendly daylight whatever the story says. */
export const DAY_HOUR = 12;

/**
 * The hour of the day the story has reached, counted on from the first day (so 29.5 is half past five the next morning).
 * It is the latest hour of the moments that have come, so it never goes back as the story goes on.
 */
export function storyHour(time: TownTime | undefined, facts: ShotFacts): number {
  if (!time) return NIGHT_HOUR;
  let hour = time.start;
  for (const m of time.moments ?? []) {
    const { leadOpens, leadSolved, event } = m.when;
    const came = leadOpens ? facts.open.includes(leadOpens) : leadSolved ? facts.solved.includes(leadSolved) : event ? facts.firedEvents.includes(event) : false;
    if (came && m.hour > hour) hour = m.hour;
  }
  return hour;
}

/** One step of the hand on the clock toward the hour the story has reached: quick at first, never backwards, settling in about two seconds. */
export function easeHour(shown: number, target: number, dt: number): number {
  if (target <= shown) return target;
  const left = target - shown;
  const step = Math.max(left * (1 - Math.exp(-dt * 1.4)), Math.min(left, dt * 0.6));
  return Math.min(target, shown + step);
}

/** An hour on the clock as words: "9:30 pm". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  const [hh, mm] = minutes === 60 ? [(whole + 1) % 24, 0] : [whole, minutes];
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}
