/**
 * Cloud save, pure part: which browser-stored keys make up a player's save, and how two copies
 * (this device and the cloud) combine. No browser or network code lives here, so it is fully tested.
 */

/** Everything the game stores for a player starts with this. */
export const SAVE_PREFIX = 'syndicate-ledger:';
/** Solved-rank progress keys: these are merged, never replaced. */
export const PROGRESS_PREFIX = 'syndicate-ledger:case:';
/** Largest save the cloud accepts (the Worker enforces the same limit). */
export const MAX_SAVE_BYTES = 200_000;

export type Bundle = Record<string, string>;

/** Picks the save keys out of a key/value store (a localStorage snapshot). */
export function pickBundle(entries: Iterable<[string, string]>): Bundle {
  const out: Bundle = {};
  for (const [k, v] of entries) if (k.startsWith(SAVE_PREFIX)) out[k] = v;
  return out;
}

/** A short fingerprint, to notice that the local save changed since the last sync. */
export function fingerprint(b: Bundle): string {
  const s = JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

type Parts = Record<string, { at?: string } & Record<string, unknown>>;
interface ProgressLike { caseId?: unknown; parts?: Parts }

function parse(raw: string): ProgressLike | null {
  try {
    const p = JSON.parse(raw) as ProgressLike;
    return p && typeof p === 'object' && p.parts && typeof p.parts === 'object' ? p : null;
  } catch {
    return null;
  }
}

/** Two copies of the solved ranks of one case: every rank solved on either side stays solved; the later `at` wins. */
export function mergeProgress(a: string, b: string): string {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa) return pb ? b : a;
  if (!pb) return a;
  const parts: Parts = { ...pa.parts };
  for (const [rank, part] of Object.entries(pb.parts!)) {
    const mine = parts[rank];
    if (!mine || String(part.at ?? '') > String(mine.at ?? '')) parts[rank] = part;
  }
  return JSON.stringify({ ...pa, parts });
}

/**
 * Combines this device's save with the cloud copy.
 * - Solved ranks are always unioned, so progress is never lost.
 * - Everything else (the running game, the notebook): if this device has changes the cloud has not seen
 *   (`localDirty`, e.g. a guest who just signed in, or play while offline), this device wins; otherwise the cloud wins.
 */
export function mergeBundles(local: Bundle, cloud: Bundle, localDirty: boolean): Bundle {
  const out: Bundle = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const l = local[k];
    const c = cloud[k];
    if (k.startsWith(PROGRESS_PREFIX) && l !== undefined && c !== undefined) out[k] = mergeProgress(l, c);
    else if (l === undefined) out[k] = c;
    else if (c === undefined) out[k] = l;
    else out[k] = localDirty ? l : c;
  }
  return out;
}

/** Checks a value from the cloud really is a bundle of save keys (a bad or foreign payload is ignored). */
export function parseBundle(raw: unknown): Bundle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Bundle = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith(SAVE_PREFIX) || typeof v !== 'string') return null;
    out[k] = v;
  }
  return out;
}
