import type { Trust } from '../../game/state';

export const TRUST_LABEL: Record<Trust, string> = {
  unknown: 'Unknown',
  suspicious: 'Suspicious',
  caught: 'Caught lying',
  mistaken: 'Honest mistake',
  verified: 'Verified',
  refuses: 'Won\'t talk',
};
