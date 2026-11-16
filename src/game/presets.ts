import type { Preset } from './caseTypes';

/** Rule book section 5. */
export interface PresetRules {
  label: string;
  age: string;
  size: number;
  /** Which statements get an "Unverified" flag: the actual liars, anyone who might lie, or nobody. */
  flagLiars: 'exact' | 'possible' | 'none';
  clock: 'off' | 'generous' | 'normal' | 'tight';
  /** Extra hours added to the case clock. */
  extraHours: number;
  events: 'hints' | 'rumors' | 'some-hidden';
  mistakes: 'instant' | 'on-request' | 'off';
  startFavors: number;
  tone: 'friendly' | 'crime';
  liarRange: boolean;
  maxGrade: number;
  /** Accusation limits: how many different people can be accused, and how many times each. */
  accuse: { people: number; perPerson: number };
}

export const PRESET_RULES: Record<Preset, PresetRules> = {
  junior: { label: 'Junior', age: '7+', size: 4, flagLiars: 'exact', clock: 'off', extraHours: 0, events: 'hints', mistakes: 'instant', startFavors: 6, tone: 'friendly', liarRange: false, maxGrade: 2, accuse: { people: 4, perPerson: 3 } },
  detective: { label: 'Detective', age: '10+', size: 5, flagLiars: 'possible', clock: 'generous', extraHours: 2, events: 'rumors', mistakes: 'on-request', startFavors: 4, tone: 'crime', liarRange: false, maxGrade: 3, accuse: { people: 3, perPerson: 2 } },
  inspector: { label: 'Inspector', age: '14+', size: 6, flagLiars: 'none', clock: 'normal', extraHours: 0, events: 'rumors', mistakes: 'off', startFavors: 3, tone: 'crime', liarRange: false, maxGrade: 4, accuse: { people: 4, perPerson: 2 } },
  chief: { label: 'Chief', age: 'Adult', size: 7, flagLiars: 'none', clock: 'normal', extraHours: 0, events: 'some-hidden', mistakes: 'off', startFavors: 2, tone: 'crime', liarRange: true, maxGrade: 4, accuse: { people: 5, perPerson: 2 } },
};

/** A map lead's floorplan by rank: extra corridors (more of them, more wrong walks) and the fewest walks that must be possible. */
export const MAP_RULES: Record<Preset, { extraCorridors: number; minAlternatives: number }> = {
  junior: { extraCorridors: 1, minAlternatives: 3 },
  detective: { extraCorridors: 2, minAlternatives: 4 },
  inspector: { extraCorridors: 4, minAlternatives: 6 },
  chief: { extraCorridors: 5, minAlternatives: 8 },
};

/** A network lead by rank: how many networks the contact counts alone must allow (so the statements are needed), and the hardest reading skill asked. */
export const NET_RULES: Record<Preset, { minBase: number; minGrade: number }> = {
  junior: { minBase: 2, minGrade: 1 },
  detective: { minBase: 6, minGrade: 2 },
  inspector: { minBase: 12, minGrade: 3 },
  chief: { minBase: 25, minGrade: 3 },
};
