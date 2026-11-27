/**
 * What the shop workers do, as poses over time. Pure numbers, no drawing: the town turns a pose into joint angles.
 * Every action is a loop: the pose at t and at t + its period are the same.
 */

export const ACTIONS = ['pour', 'sip', 'repair', 'gut', 'arrange', 'pin', 'mend', 'sew'] as const;
export type Action = (typeof ACTIONS)[number];

/** Seconds each action takes before it starts again. */
export const PERIOD: Record<Action, number> = { pour: 3, sip: 6, repair: 2, gut: 1.1, arrange: 4.5, pin: 3.2, mend: 1.4, sew: 2.2 };

/** How a worker holds themselves (radians, and 0 to 1 amounts). Arms: fwd raises the arm forward, side swings it out, elbow bends the forearm up. */
export interface Pose {
  armL: { fwd: number; side: number; elbow: number };
  armR: { fwd: number; side: number; elbow: number };
  /** Forward bend at the waist, and a turn of the shoulders (positive turns to the worker's left). */
  lean: number;
  twist: number;
  /** Head turn (positive to their left) and nod (positive looks down). */
  yaw: number;
  pitch: number;
  /** How they are set: standing, sitting on a stool or squatting by their work. */
  stance: 'stand' | 'sit' | 'squat';
  /** The action's own moment, 0 to 1: how far the tea is poured, whether a flower is in hand, and so on. */
  beat: number;
}

/** A smooth rise and fall from 0 to 1 and back over [from, to] of a period; 0 outside it. */
export function bump(u: number, from: number, to: number): number {
  if (u <= from || u >= to) return 0;
  return Math.sin(((u - from) / (to - from)) * Math.PI);
}

const TAU = Math.PI * 2;

/** The pose of a worker doing `action`, `t` seconds in. `seed` keeps neighbours out of step. */
export function workerPose(action: Action, t: number, seed = 0): Pose {
  const p = PERIOD[action];
  const tt = t + seed;
  // 0..1 through this loop
  const u = (((tt / p) % 1) + 1) % 1;
  const wave = Math.sin(u * TAU);
  // a slow look about and a breath, both on whole loops of the action so the pose still repeats with it
  const breath = 0.015 * Math.sin(u * TAU * 2);
  const look = 0.18 * Math.sin(u * TAU + seed);
  const base: Pose = {
    armL: { fwd: 0.1, side: 0.08, elbow: 0.15 },
    armR: { fwd: 0.1, side: 0.08, elbow: 0.15 },
    lean: breath,
    twist: 0,
    yaw: look,
    pitch: 0.1,
    stance: 'stand',
    beat: 0,
  };
  switch (action) {
    case 'pour': {
      // pulling the tea: the kettle hand rises high and the stream stretches down into the tumbler, then back
      const up = 0.5 - 0.5 * Math.cos(u * TAU);
      return { ...base, armR: { fwd: 0.9 + 1.5 * up, side: 0.15, elbow: 0.5 - 0.35 * up }, armL: { fwd: 0.75, side: -0.05, elbow: 1.0 }, pitch: 0.25 - 0.15 * up, yaw: 0, beat: up };
    }
    case 'sip': {
      const k = bump(u, 0.2, 0.45);
      return { ...base, stance: 'sit', armR: { fwd: 0.45 + 0.65 * k, side: 0.1, elbow: 0.9 + 1.2 * k }, armL: { fwd: 0.55, side: 0.05, elbow: 0.6 }, pitch: 0.05 - 0.25 * k, beat: k };
    }
    case 'repair':
      // squatting by the spinning wheel, turning a spoke key round and round
      return {
        ...base,
        stance: 'squat',
        armR: { fwd: 1.25 + 0.25 * wave, side: 0.15 + 0.12 * Math.cos(u * TAU), elbow: 0.7 },
        armL: { fwd: 1.3, side: -0.05, elbow: 0.35 },
        lean: 0.25 + breath,
        pitch: 0.3,
        yaw: 0.1 * wave,
        beat: u,
      };
    case 'gut': {
      // a quick cut down, a slower lift back
      const cut = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
      return { ...base, lean: 0.3 + breath, armL: { fwd: 0.95, side: -0.1, elbow: 0.9 }, armR: { fwd: 1.35 - 0.6 * cut, side: 0.1, elbow: 1.5 - 0.8 * cut }, pitch: 0.45, yaw: 0, beat: cut };
    }
    case 'arrange': {
      // bend to the bucket at the side, lift a stem, set it on the table in front
      const reach = bump(u, 0, 0.4);
      const place = bump(u, 0.45, 0.85);
      return {
        ...base,
        lean: 0.6 * reach + 0.15 * place + breath,
        twist: 0.55 * reach,
        armR: { fwd: 0.35 + 0.5 * reach + 0.9 * place, side: 0.25 * reach, elbow: 0.3 + 0.3 * place },
        armL: { fwd: 0.35, side: 0.05, elbow: 0.6 },
        yaw: 0.35 * reach,
        pitch: 0.35 + 0.2 * reach,
        beat: u > 0.22 && u < 0.72 ? 1 : 0,
      };
    }
    case 'pin': {
      // reaching up to the board and pressing a pin home, papers held to the chest
      const press = bump(u, 0.35, 0.6);
      return { ...base, armR: { fwd: 2.35 + 0.2 * press, side: 0.1, elbow: 0.35 - 0.25 * press }, armL: { fwd: 0.55, side: 0.02, elbow: 1.55 }, pitch: -0.35, yaw: 0.1 * wave, beat: press };
    }
    case 'mend':
      // both hands at the net, the shuttle passing from one to the other
      return {
        ...base,
        stance: 'sit',
        armL: { fwd: 1.15 + 0.2 * wave, side: -0.05, elbow: 0.6 + 0.25 * Math.cos(u * TAU) },
        armR: { fwd: 1.15 - 0.2 * wave, side: -0.05, elbow: 0.6 - 0.25 * Math.cos(u * TAU) },
        pitch: 0.2,
        yaw: 0.05 * wave,
        beat: u,
      };
    case 'sew': {
      // the needle goes in, the thread is drawn out long and high, and back to the cloth
      const pull = bump(u, 0.15, 0.75);
      return { ...base, stance: 'sit', lean: 0.15 + breath, armL: { fwd: 0.85, side: 0, elbow: 0.95 }, armR: { fwd: 0.85 + 0.55 * pull, side: 0.1 + 0.55 * pull, elbow: 0.95 - 0.65 * pull }, pitch: 0.4, yaw: -0.2 * pull, beat: pull };
    }
  }
}

/** The look of each worker: generic townsfolk in muted, everyday clothes (none in the story cast's own colours). */
export const OUTFITS = {
  teaMaker: { skin: 0x8a5a3c, top: 0xe2dccb, bottom: 0x3c5a7a, hair: 0x1c1814, apron: 0x6a5a48 },
  customer: { skin: 0x9a6a48, top: 0x7a8a6a, bottom: 0x3a3a40, hair: 0x22201c, cap: 0x5a5048 },
  mechanic: { skin: 0x7a4e34, top: 0x5a6b7a, bottom: 0x6e6248, hair: 0x1c1814, towel: 0xd8d0b8 },
  fishSeller: { skin: 0x8a5a3c, top: 0x2f7a72, bottom: 0x2f7a72, hair: 0x141210, skirt: true, apron: 0x8a8a80 },
  florist: { skin: 0x9a6848, top: 0xc8963a, bottom: 0xc8963a, hair: 0x141210, skirt: true, bloom: 0xf4f0e0 },
  clerk: { skin: 0x8a5e42, top: 0xe8e4d8, bottom: 0x2c3038, hair: 0x22201c, glasses: true },
  netMender: { skin: 0x7a5038, top: 0x6a7a8a, bottom: 0x6a7a8a, hair: 0x8a8682, skirt: true, scarf: 0xd0c8b0 },
  tailor: { skin: 0x9a6a48, top: 0xc9b99a, bottom: 0x4a4440, hair: 0x5a5650, glasses: true, tape: 0xe0c040 },
} as const;
export type OutfitId = keyof typeof OUTFITS;
export interface Outfit {
  skin: number;
  top: number;
  bottom: number;
  hair: number;
  skirt?: boolean;
  apron?: number;
  cap?: number;
  scarf?: number;
  towel?: number;
  bloom?: number;
  tape?: number;
  glasses?: boolean;
}
