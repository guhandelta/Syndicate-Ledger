/**
 * Building a rank's puzzles away from the page: the message the worker answers, and the call that waits for it.
 * The worker itself (rankWorker.ts) only passes messages here, so everything that can go wrong is in this file.
 */
import { buildRankFresh } from './buildRank';
import type { CaseFile, Preset, PuzzleBook } from './caseTypes';

export interface RankRequest {
  cf: CaseFile;
  preset: Preset;
  seed: number;
}

export type RankReply = { ok: true; seed: number; book: PuzzleBook } | { ok: false; error: string };

/** What the worker does with a request. */
export function answerRequest(req: RankRequest): RankReply {
  try {
    return { ok: true, ...buildRankFresh(req.cf, req.preset, req.seed) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** The part of a Worker this file uses, so a test can stand in for one. */
export interface WorkerLike {
  postMessage(req: RankRequest): void;
  terminate(): void;
  onmessage: ((e: { data: RankReply }) => void) | null;
  onerror: (() => void) | null;
}

/**
 * The ranks that are built fresh for each new game. Chief's 7x7 puzzles with link clues take many minutes to build
 * (docs/LINKED-PUZZLES.md), far more than a player will wait, so Chief plays the shipped puzzles.
 */
export const FRESH_RANKS: Preset[] = ['junior', 'detective', 'inspector'];

/** How long a fresh rank may take before the shipped puzzles are used instead. */
export const BUILD_BUDGET_MS = 45_000;

/**
 * Builds a rank's puzzles in a worker. Resolves to null when they can't be had in time (no worker, an error, a slow
 * device), so the caller falls back to the shipped puzzles and play is never blocked.
 */
export function buildInWorker(req: RankRequest, make: () => WorkerLike | null, budgetMs = BUILD_BUDGET_MS): Promise<{ seed: number; book: PuzzleBook } | null> {
  return new Promise((resolve) => {
    let worker: WorkerLike | null = null;
    try {
      worker = make();
    } catch {
      worker = null;
    }
    if (!worker) return resolve(null);
    const w = worker;
    const done = (result: { seed: number; book: PuzzleBook } | null) => {
      clearTimeout(timer);
      w.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => done(null), budgetMs);
    w.onmessage = (e) => done(e.data.ok ? { seed: e.data.seed, book: e.data.book } : null);
    w.onerror = () => done(null);
    w.postMessage(req);
  });
}
