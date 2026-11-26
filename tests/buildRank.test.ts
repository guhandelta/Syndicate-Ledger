import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRank, buildRankFresh, leadSeed } from '../src/game/buildRank';
import type { CaseFile, PuzzleBook } from '../src/game/caseTypes';
import { answerRequest, buildInWorker, FRESH_RANKS, type RankReply, type RankRequest, type WorkerLike } from '../src/game/rankClient';
import { verifyUnique } from '../src/engine/generator';
import type { GeneratedPuzzle } from '../src/engine/types';

const cf: CaseFile = JSON.parse(readFileSync('cases/case-01-harbor-ledger.json', 'utf8'));
const shipped: PuzzleBook = JSON.parse(readFileSync('cases/case-01-harbor-ledger/puzzles.json', 'utf8'));

/** The case with one lead of the Junior story quoting a lead that does not exist, so its links can never be planned. */
function broken(): CaseFile {
  const c: CaseFile = JSON.parse(JSON.stringify(cf));
  const lead = c.rankStories!.junior!.leads!.find((l) => l.links?.length)!;
  lead.links![0].from = 'NOPE';
  return c;
}

describe('building a rank', () => {
  it('rebuilds the shipped puzzles from seed 0, in lead order', () => {
    const order: string[] = [];
    for (const preset of ['junior', 'detective'] as const) {
      const book = buildRank(cf, preset, { onBuilt: (key) => order.push(key) });
      for (const [key, p] of Object.entries(book)) expect(p, key).toEqual(shipped[key]);
    }
    expect(order).toEqual(['J1:junior', 'J2:junior', 'J3:junior', 'J4:junior', 'J5:junior', 'J6:junior', 'L1:detective', 'L2:detective', 'L3:detective', 'L4:detective']);
  });

  it('gives a fresh seed its own puzzles, the same every time', () => {
    const lead = cf.leads[0];
    expect(leadSeed(cf, lead, 'junior', 0)).not.toBe(leadSeed(cf, lead, 'junior', 7));
    const a = buildRank(cf, 'detective', { runSeed: 7 });
    expect(buildRank(cf, 'detective', { runSeed: 7 })).toEqual(a);
    expect(a['L1:detective']).not.toEqual(shipped['L1:detective']);
    for (const key of ['L1:detective', 'L3:detective']) expect(verifyUnique(a[key] as GeneratedPuzzle), key).toEqual({ ok: true });
  });

  it('gives up on a lead whose links cannot be planned', () => {
    expect(() => buildRank(broken(), 'junior')).toThrow(/could not be built with its links/);
  });

  it('moves to another seed when one cannot be built, and says which one worked', () => {
    // seed 628 is a Junior seed whose stakeout clues cannot be linked
    const r = buildRankFresh(cf, 'junior', 628);
    expect(r.seed).not.toBe(628);
    expect(Object.keys(r.book)).toHaveLength(6);
    expect(buildRankFresh(cf, 'junior', 11).seed).toBe(11);
    expect(() => buildRankFresh(cf, 'junior', 628, 1)).toThrow(/no seed built junior/);
  });
});

describe('building in a worker', () => {
  it('builds fresh puzzles for the ranks that can be built in a few seconds, not for Chief', () => {
    expect(FRESH_RANKS).toEqual(['junior', 'detective', 'inspector']);
  });

  const req: RankRequest = { cf, preset: 'junior', seed: 11 };

  /** A worker that answers with `reply` when it is asked, or never. */
  function fake(reply?: RankReply | 'error'): WorkerLike & { terminated: boolean } {
    const w = {
      terminated: false,
      onmessage: null as WorkerLike['onmessage'],
      onerror: null as WorkerLike['onerror'],
      terminate() {
        w.terminated = true;
      },
      postMessage() {
        if (reply === 'error') w.onerror?.();
        else if (reply) w.onmessage?.({ data: reply });
      },
    };
    return w;
  }

  it('answers a request with the puzzles and the seed that built them, or with the reason it could not', () => {
    const ok = answerRequest(req);
    expect(ok).toMatchObject({ ok: true, seed: 11 });
    const bad = answerRequest({ cf: broken(), preset: 'junior', seed: 11 });
    expect(bad).toMatchObject({ ok: false });
    expect((bad as { error: string }).error).toMatch(/no seed built/);
  });

  it('hands back what the worker built and stops the worker', async () => {
    const w = fake({ ok: true, seed: 5, book: shipped });
    expect(await buildInWorker(req, () => w)).toEqual({ seed: 5, book: shipped });
    expect(w.terminated).toBe(true);
  });

  it('gives nothing back when the worker fails, errors, is slow, is missing or cannot start', async () => {
    const failed = fake({ ok: false, error: 'x' });
    expect(await buildInWorker(req, () => failed)).toBeNull();
    expect(failed.terminated).toBe(true);
    expect(await buildInWorker(req, () => fake('error'))).toBeNull();
    const slow = fake();
    expect(await buildInWorker(req, () => slow, 5)).toBeNull();
    expect(slow.terminated).toBe(true);
    expect(await buildInWorker(req, () => null)).toBeNull();
    expect(await buildInWorker(req, () => { throw new Error('no workers here'); })).toBeNull();
  });
});
