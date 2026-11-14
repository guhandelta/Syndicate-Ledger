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
  inspector: { label: 'Inspector', age: '14+', size: 6, flagLiars: 'none', clock: 'normal', extraHours: 0, events: 'rumors', mistakes: 'off', startFavors: 3, tone: 'crime', liarRange: false, maxGrade: 4, accuse: { people: 3, perPerson: 2 } },
  chief: { label: 'Chief', age: 'Adult', size: 6, flagLiars: 'none', clock: 'tight', extraHours: -1, events: 'some-hidden', mistakes: 'off', startFavors: 2, tone: 'crime', liarRange: true, maxGrade: 4, accuse: { people: 3, perPerson: 2 } },
};
