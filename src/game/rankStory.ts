import { PRESETS, STORY_FIELDS, type CaseFile, type CasePart, type Preset } from './caseTypes';

const merged = new WeakMap<CaseFile, Map<Preset, CaseFile>>();

/**
 * The case as one rank plays it: the rank story's fields over the case file's.
 * A rank story that replaces nothing plays the case file as it is (the same object).
 */
export function caseForRank(cf: CaseFile, preset: Preset): CaseFile {
  const story = cf.rankStories?.[preset];
  if (!story || !STORY_FIELDS.some((f) => story[f] !== undefined)) return cf;
  let byPreset = merged.get(cf);
  if (!byPreset) merged.set(cf, (byPreset = new Map()));
  let out = byPreset.get(preset);
  if (!out) {
    out = { ...cf };
    for (const f of STORY_FIELDS) if (story[f] !== undefined) (out as unknown as Record<string, unknown>)[f] = story[f];
    byPreset.set(preset, out);
  }
  return out;
}

export const partOf = (cf: CaseFile, preset: Preset): CasePart | undefined => cf.rankStories?.[preset]?.part;

/** Which rank stories of a case have been solved, kept across games. Losing one rank never wipes the others. */
export interface CaseProgress {
  caseId: string;
  parts: Partial<Record<Preset, { ending: string; at: string }>>;
}

export const progressKey = (caseId: string) => `syndicate-ledger:case:${caseId}`;
export const emptyProgress = (cf: CaseFile): CaseProgress => ({ caseId: cf.id, parts: {} });

/** Reads progress written by `progressKey`; anything unreadable counts as no progress. */
export function parseProgress(cf: CaseFile, raw: string | null): CaseProgress {
  try {
    const p = raw ? (JSON.parse(raw) as CaseProgress) : null;
    if (!p || p.caseId !== cf.id || typeof p.parts !== 'object' || !p.parts) return emptyProgress(cf);
    return p;
  } catch {
    return emptyProgress(cf);
  }
}

/** Records that a rank's story was won. Only ranks with a part count. */
export function recordPart(cf: CaseFile, p: CaseProgress, preset: Preset, ending: string, at = new Date().toISOString()): CaseProgress {
  if (!partOf(cf, preset)) return p;
  return { ...p, parts: { ...p.parts, [preset]: { ending, at } } };
}

/** The ranks whose part is uncovered, in rank order. */
export const partsUncovered = (cf: CaseFile, p: CaseProgress): Preset[] => PRESETS.filter((r) => partOf(cf, r) && p.parts[r]);

/** The ranks that have a part at all. */
export const partsTotal = (cf: CaseFile): Preset[] => PRESETS.filter((r) => partOf(cf, r));

/** The case is closed once every rank that has a part has it uncovered, with any character. */
export const caseClosed = (cf: CaseFile, p: CaseProgress): boolean => {
  const total = partsTotal(cf);
  return total.length > 0 && partsUncovered(cf, p).length === total.length;
};
