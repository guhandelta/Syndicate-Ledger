import { PRESETS, STORY_FIELDS, type CaseFile, type CasePart, type Preset } from './caseTypes';

const merged = new WeakMap<CaseFile, Map<Preset, CaseFile>>();

/**
 * The case as one rank plays it: the rank story's fields over the case file's.
 * A rank story that replaces nothing plays the case file as it is (the same object).
 */
export function caseForRank(cf: CaseFile, preset: Preset): CaseFile {
  const story = cf.rankStories?.[preset];
  const hides = cf.cast.some((c) => c.ranks && !c.ranks.includes(preset));
  if (!hides && (!story || !STORY_FIELDS.some((f) => story[f] !== undefined))) return cf;
  let byPreset = merged.get(cf);
  if (!byPreset) merged.set(cf, (byPreset = new Map()));
  let out = byPreset.get(preset);
  if (!out) {
    out = { ...cf };
    if (hides) out.cast = cf.cast.filter((c) => !c.ranks || c.ranks.includes(preset));
    for (const f of STORY_FIELDS) if (story?.[f] !== undefined) (out as unknown as Record<string, unknown>)[f] = story![f];
    byPreset.set(preset, out);
  }
  return out;
}

export const partOf = (cf: CaseFile, preset: Preset): CasePart | undefined => cf.rankStories?.[preset]?.part;

/** Which rank stories of a case have been solved, kept across games. Losing one rank never wipes the others. */
export interface CaseProgress {
  caseId: string;
  parts: Partial<Record<Preset, { ending: string; at: string; character?: string }>>;
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
export function recordPart(
  cf: CaseFile,
  p: CaseProgress,
  preset: Preset,
  ending: string,
  character?: string,
  at = new Date().toISOString(),
): CaseProgress {
  if (!partOf(cf, preset)) return p;
  return { ...p, parts: { ...p.parts, [preset]: { ending, at, ...(character ? { character } : {}) } } };
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

/**
 * Ranks are played in order (decided 2026-11-16): Junior is always open, and each rank opens once the
 * rank below it is uncovered. A case without parts keeps every rank open.
 */
export function rankUnlocked(cf: CaseFile, p: CaseProgress, preset: Preset): boolean {
  if (!partsTotal(cf).length) return true;
  const i = PRESETS.indexOf(preset);
  return i === 0 || !!p.parts[PRESETS[i - 1]];
}

/** The rank to play next: the lowest open rank whose part is still hidden, or the top rank once all are found. */
export const nextRank = (cf: CaseFile, p: CaseProgress): Preset =>
  PRESETS.find((r) => rankUnlocked(cf, p, r) && !p.parts[r]) ?? PRESETS[PRESETS.length - 1];

/** One line of the case board on the start screen. */
export interface BoardRow {
  preset: Preset;
  /** 1-based place in the case, for "Part 3 of 4". */
  number: number;
  /** found: its part is uncovered. open: it is the one to work on now. hidden: not reached, so nothing is given away. */
  state: 'found' | 'open' | 'hidden';
  part?: CasePart;
}

/**
 * The case board shows only what the player has earned: the parts uncovered so far, the question of the rank
 * that is open now, and hidden slots for the rest. A later rank's question stays unseen until the part below it
 * is uncovered, because that question is built from what the earlier rank found (decided 2026-11-16).
 */
export function caseBoard(cf: CaseFile, p: CaseProgress): BoardRow[] {
  return partsTotal(cf).map((preset, i) => {
    const part = partOf(cf, preset)!;
    if (p.parts[preset]) return { preset, number: i + 1, state: 'found', part };
    return rankUnlocked(cf, p, preset) ? { preset, number: i + 1, state: 'open', part } : { preset, number: i + 1, state: 'hidden' };
  });
}

/** What the rank below hands over to this one: the object it carried and where it came from. */
export function carriedInto(cf: CaseFile, preset: Preset) {
  const from = PRESETS[PRESETS.indexOf(preset) - 1];
  const carried = from ? cf.rankStories?.[from]?.handover?.carried : undefined;
  return carried ? { ...carried, from } : undefined;
}

/** The handed-over object as accusation evidence: it can be leaned on only when it says who it points at. */
export function carriedEvidence(cf: CaseFile, preset: Preset) {
  const c = carriedInto(cf, preset);
  return c?.pointsTo?.length ? { ...c, id: `carried:${c.from}` } : undefined;
}

/** The rank a solved part opens, if there is one above it. */
export const rankAbove = (preset: Preset): Preset | undefined => PRESETS[PRESETS.indexOf(preset) + 1];
