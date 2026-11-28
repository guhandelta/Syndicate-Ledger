/**
 * The calculation family of decode puzzles: a little forensic arithmetic over the exhibits, one numeric answer.
 *
 * DESIGN NOTE
 *   receipt     - a torn receipt: some prices, one torn away, the tax rate, the note handed over and the change given back.
 *                 The missing price is what makes the total come out right.
 *   zone        - a watch stopped by a struggle and never reset, plus a ticket showing two time zones. The answer is
 *                 the real local time the watch should have shown (24-hour, four digits).
 *   cooling     - a cup (or a body) found at a temperature, a steady loss per hour and a starting temperature. The answer
 *                 is the time it was poured or set out (four digits).
 *   triangulate - cell-tower reports on a street grid: each says the hideout is exactly this many blocks away, counted
 *                 along the streets. The answer is the one crossing that fits every report ("X Y").
 *   dice        - the roll log of several dice. The rigged die is the only one whose commonest face came up at least twice
 *                 as often as a fair die would show. The answer is that die's number.
 *
 * Why each has exactly one answer: every rule is plain arithmetic over the data, so `solveCalc` recomputes the answer
 * from the data alone and returns '' when the rule fails (a torn price that is not a whole number, a half-hour that does
 * not fit, two crossings or none that fit the reports, two dice or none that look rigged). The generators only keep
 * puzzles where that check gives one answer.
 */
import type { Rng } from './rng';

export type CalcVariant = 'receipt' | 'zone' | 'cooling' | 'triangulate' | 'dice';
export const CALC_VARIANTS: CalcVariant[] = ['receipt', 'zone', 'cooling', 'triangulate', 'dice'];

export type CalcData =
  | { variant: 'receipt'; items: { name: string; price: number | null }[]; rate: number; paid: number; change: number }
  | { variant: 'zone'; watch: string; from: { city: string; offset: number }; to: { city: string; offset: number } }
  | { variant: 'cooling'; found: string; foundTemp: number; startTemp: number; perHour: number }
  | { variant: 'triangulate'; size: number; towers: { x: number; y: number; d: number }[] }
  | { variant: 'dice'; rolls: number; dice: number[][] };

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Minutes after midnight -> "HHMM", wrapping past a day. */
export const clock = (minutes: number): string => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return pad2(Math.floor(m / 60)) + pad2(m % 60);
};
const hm = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const showHm = (minutes: number): string => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
const utc = (o: number) => `UTC${o < 0 ? '-' : '+'}${Math.abs(o)}`;

/** Recomputes the answer from the data alone; '' when the rule does not give exactly one answer. */
export function solveCalc(d: CalcData): string {
  switch (d.variant) {
    case 'receipt': {
      const torn = d.items.filter((i) => i.price === null);
      const total = d.paid - d.change;
      if (torn.length !== 1 || (total * 100) % (100 + d.rate) !== 0) return '';
      const subtotal = (total * 100) / (100 + d.rate);
      const missing = subtotal - d.items.reduce((s, i) => s + (i.price ?? 0), 0);
      return missing > 0 ? String(missing) : '';
    }
    case 'zone':
      return clock(hm(d.watch) + Math.round((d.to.offset - d.from.offset) * 60));
    case 'cooling': {
      const hours = (d.startTemp - d.foundTemp) / d.perHour;
      return (hours * 2) % 1 === 0 && hours > 0 ? clock(hm(d.found) - Math.round(hours * 60)) : '';
    }
    case 'triangulate': {
      const hits: string[] = [];
      for (let x = 0; x < d.size; x++)
        for (let y = 0; y < d.size; y++) if (d.towers.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) === t.d)) hits.push(`${x} ${y}`);
      return hits.length === 1 ? hits[0] : '';
    }
    case 'dice': {
      const expected = d.rolls / 6;
      const rigged = d.dice.map((faces, i) => (Math.max(...faces) >= 2 * expected ? i + 1 : 0)).filter(Boolean);
      return rigged.length === 1 ? String(rigged[0]) : '';
    }
  }
}

/** The exhibit lines that carry the data, so a puzzle is worded from it. */
export function calcLines(d: CalcData): string[] {
  switch (d.variant) {
    case 'receipt':
      return [...d.items.map((i) => `${i.name}: ${i.price === null ? '$▒▒ (torn off)' : `$${i.price}`}`), `Tax: ${d.rate}% of the subtotal`, `Paid: $${d.paid}`, `Change given: $${d.change}`];
    case 'zone':
      return [`The watch stopped at ${d.watch}`, `Ticket: ${d.from.city} (${utc(d.from.offset)}) to ${d.to.city} (${utc(d.to.offset)})`];
    case 'cooling':
      return [`Found at ${d.found}, reading ${d.foundTemp} degrees`, `Poured at ${d.startTemp} degrees`, `Loses ${d.perHour} degrees every hour`];
    case 'triangulate':
      return d.towers.map((t) => `Tower at ${t.x}, ${t.y}: the signal came from exactly ${t.d} blocks away`);
    case 'dice':
      return d.dice.map((faces, i) => `Die ${i + 1} (${d.rolls} rolls): ${faces.map((c, f) => `${f + 1}s ${c}`).join(', ')}`);
  }
}

type Built = { data: CalcData; exhibits: { title: string; lines: string[] }[]; question: string };

const ITEMS = ['Train ticket', 'Coffee', 'Lighter', 'Rope', 'Gloves', 'Torch', 'Map', 'Newspaper', 'Batteries', 'Padlock', 'Umbrella', 'Sandwich', 'Rail pass', 'Postcards'];
const CITIES: [string, number][] = [['Port Calder', 5.5], ['Lisbon', 0], ['Dubai', 4], ['Reykjavik', 0], ['Nairobi', 3], ['Singapore', 8], ['Lima', -5], ['Denver', -7], ['Auckland', 12], ['Cairo', 2], ['Mumbai', 5.5], ['Tokyo', 9], ['Halifax', -4], ['Perth', 8]];

export function genReceipt(level: number, rng: Rng): Built {
  const rate = rng.pick(level >= 3 ? [5, 8, 12, 25] : [10, 20, 25]);
  for (;;) {
    const count = 3 + level;
    const names = rng.shuffle(ITEMS.slice()).slice(0, count);
    const prices = names.map(() => rng.int(2, 6 + level * 6));
    const subtotal = prices.reduce((a, b) => a + b, 0);
    if ((subtotal * rate) % 100 !== 0) continue;
    const total = subtotal + (subtotal * rate) / 100;
    const paid = Math.ceil((total + 1) / 10) * 10 + (level >= 3 ? 10 : 0);
    const torn = rng.int(0, count - 1);
    const data: CalcData = { variant: 'receipt', items: names.map((name, i) => ({ name, price: i === torn ? null : prices[i] })), rate, paid, change: paid - total };
    return {
      data,
      exhibits: [
        { title: 'The torn receipt', lines: calcLines(data) },
        { title: 'Reading it', lines: ['Tax is added on top of the subtotal (the prices added together). Total = subtotal + tax. Change = money paid - total.'] },
      ],
      question: 'What was the price of the item that was torn off? Type the number of dollars.',
    };
  }
}

export function genZone(level: number, rng: Rng): Built {
  const pool = level >= 3 ? CITIES : CITIES.filter(([, o]) => Number.isInteger(o));
  const from = rng.pick(pool);
  let to = rng.pick(pool);
  while (to[1] === from[1]) to = rng.pick(pool);
  const minutes = rng.int(0, 23) * 60 + (level >= 2 ? rng.pick([0, 15, 30, 45]) : 0);
  const data: CalcData = { variant: 'zone', watch: showHm(minutes), from: { city: from[0], offset: from[1] }, to: { city: to[0], offset: to[1] } };
  return {
    data,
    exhibits: [
      { title: 'The broken wristwatch and the ticket', lines: calcLines(data) },
      { title: 'Reading it', lines: [`The watch was never reset after the flight, so it still shows ${from[0]} time. Time zones are hours (and half-hours) ahead of or behind UTC. The clock wraps at midnight.`] },
    ],
    question: `What was the real local time in ${to[0]} when the watch stopped? Type four digits, 24-hour (for example 0415).`,
  };
}

export function genCooling(level: number, rng: Rng): Built {
  const perHour = rng.pick(level >= 3 ? [3, 4, 5, 6, 8] : [4, 5, 6, 10]);
  const half = level >= 3 && rng.next() < 0.5;
  const hours = rng.int(2, 3 + level) + (half ? 0.5 : 0);
  const startTemp = rng.int(80, 95);
  const foundTemp = startTemp - perHour * hours;
  const found = rng.int(0, 23) * 60 + (level >= 2 ? rng.pick([0, 15, 30, 45]) : 0);
  if (!Number.isInteger(foundTemp) || foundTemp <= 0) return genCooling(level, rng);
  const data: CalcData = { variant: 'cooling', found: showHm(found), foundTemp, startTemp, perHour };
  return {
    data,
    exhibits: [
      { title: 'The cup on the desk', lines: calcLines(data) },
      { title: 'Reading it', lines: ['The loss was steady, the same every hour, from the moment it was poured until it was found. Count back from the time it was found.'] },
    ],
    question: 'At what time was it poured? Type four digits, 24-hour (for example 2245).',
  };
}

export function genTriangulate(level: number, rng: Rng): Built {
  const size = [12, 20, 30, 50][level - 1];
  for (;;) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const towers: { x: number; y: number; d: number }[] = [];
    for (let k = 0; k < 8 && towers.length < 8; k++) {
      const t = { x: rng.int(0, size - 1), y: rng.int(0, size - 1), d: 0 };
      t.d = Math.abs(t.x - x) + Math.abs(t.y - y);
      if (t.d === 0 || towers.some((o) => o.x === t.x && o.y === t.y)) continue;
      towers.push(t);
      if (towers.length >= 2 && solveCalc({ variant: 'triangulate', size, towers }) === `${x} ${y}`) {
        const data: CalcData = { variant: 'triangulate', size, towers };
        return {
          data,
          exhibits: [
            { title: 'Cell tower log', lines: calcLines(data) },
            { title: 'The street grid', lines: [`Streets run on a grid, crossings numbered 0 to ${size - 1} both ways (x then y). "Blocks away" is counted along the streets: the difference in x plus the difference in y.`] },
          ],
          question: 'Where is the hideout? Type the crossing as x then y, with a space (for example 4 17).',
        };
      }
    }
  }
}

export function genDice(level: number, rng: Rng): Built {
  const count = 2 + level;
  const rolls = 60;
  const weight = [4, 3.5, 3, 2.6][level - 1];
  for (;;) {
    const rigged = rng.int(0, count - 1);
    const heavy = rng.int(0, 5);
    const dice = Array.from({ length: count }, (_, i) => {
      const faces = [0, 0, 0, 0, 0, 0];
      const weights = [1, 1, 1, 1, 1, 1].map((w, f) => (i === rigged && f === heavy ? weight : w));
      const total = weights.reduce((a, b) => a + b, 0);
      for (let r = 0; r < rolls; r++) {
        let pick = rng.next() * total;
        let f = 0;
        while (f < 5 && pick >= weights[f]) pick -= weights[f++];
        faces[f]++;
      }
      return faces;
    });
    const data: CalcData = { variant: 'dice', rolls, dice };
    if (solveCalc(data) !== String(rigged + 1)) continue;
    return {
      data,
      exhibits: [
        { title: 'The casino roll log', lines: calcLines(data) },
        { title: 'Reading it', lines: [`A fair die rolled ${rolls} times shows each face about ${rolls / 6} times. A die is rigged when its commonest face came up at least twice that often (${(rolls / 6) * 2} times or more). Exactly one die here is rigged.`] },
      ],
      question: 'Which die is rigged? Type its number.',
    };
  }
}

