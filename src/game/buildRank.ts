/**
 * Builds one rank's puzzles for a case, lead by lead, with their link clues (docs/LINKED-PUZZLES.md).
 * Shared by `npm run generate` (which ships seed 0) and the browser (which builds a fresh seed for each new game).
 * A seed rebuilds exactly the same puzzles, so a saved game only needs to remember it.
 */
import { generateCipher, verifyCipher } from '../engine/cipher';
import { generatePuzzle, verifyUnique } from '../engine/generator';
import { generateNetwork, verifyNetwork } from '../engine/network';
import { makeRng } from '../engine/rng';
import { generateTimeline, verifyTimeline } from '../engine/timeline';
import type { GridType } from '../engine/types';
import type { AnyPuzzle, CaseFile, Lead, Preset, PuzzleBook } from './caseTypes';
import { checkLinks, linkResolves, linksFor, planLinks, type Answers } from './links';
import { CIPHER_RULES, MAP_RULES, NET_RULES, PRESET_RULES } from './presets';
import { caseForRank } from './rankStory';

/** What each grid size asks of its generators (the rule book's sizes, 4 to 7). Plain tables, so a size has one place to be tuned. */
const GRID_STATEMENTS: Record<number, number> = { 4: 5, 5: 7, 6: 8, 7: 9 };
const TIMELINE_STATEMENTS: Record<number, number> = { 4: 8, 5: 9, 6: 10, 7: 13 };
/** Every rank needs at least "before" in a timeline (no easy path), and the bigger ones the harder reading. */
const TIMELINE_MIN_GRADE: Record<number, number> = { 4: 2, 5: 2, 6: 3, 7: 3 };
/** The 7-moment Chief timeline starts with one moment pinned, so the statement list stays readable. */
const TIMELINE_GIVENS: Record<number, number> = { 4: 0, 5: 0, 6: 0, 7: 1 };
/** A 7x7 opener needs a few filled cells to stay at the gentle opening grade. */
const OPENER_GIVENS: Record<number, number> = { 4: 0, 5: 0, 6: 0, 7: 7 };
/** A "hard" lead is held to the harder reading on the bigger grids. */
const HARD_MIN_GRADE: Record<number, number> = { 4: 1, 5: 1, 6: 3, 7: 3 };

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

/** The seed a lead is built from. Seed 0 is the shipped case; any other seed is a fresh play of it. */
export const leadSeed = (cf: CaseFile, lead: Lead, preset: Preset, runSeed = 0) => hash(runSeed ? `${cf.id}:${lead.id}:${preset}:${runSeed}` : `${cf.id}:${lead.id}:${preset}`);

/**
 * Builds a lead's puzzle with its link clues. The links are picked from the earlier answers of the same
 * rank; if a pick can't be built, or the proofs fail, another pick is tried.
 */
function withLinks<P extends { statements: { via?: unknown }[] }>(cfr: CaseFile, preset: Preset, lead: Lead, size: number, seed: number, built: PuzzleBook, build: (planted: ReturnType<typeof planLinks>) => P): P {
  const answers: Answers = {};
  for (const l of cfr.leads) {
    const a = built[`${l.id}:${preset}`];
    if (a) answers[l.id] = a as Answers[string];
  }
  if (!linksFor(lead, preset).length) return build([]);
  let last = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const planted = planLinks(cfr, preset, lead, size, answers, makeRng((seed ^ 0x9e3779b9) + attempt * 7919));
      const p = build(planted);
      const check = checkLinks(p as never);
      if (!check.ok) {
        last = check.reason!;
        continue;
      }
      for (const st of p.statements) {
        if (!st.via) continue;
        const bad = linkResolves(cfr, lead, p as never, st as never, answers);
        /* v8 ignore next -- planLinks fills each claim from the answer it quotes; this guards against a future change */
        if (bad) throw new Error(`${lead.id}:${preset} link ${bad}`);
      }
      return p;
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(`${lead.id}:${preset} could not be built with its links: ${last}`);
}

export interface BuildOptions {
  /** 0 (the default) is the shipped case. */
  runSeed?: number;
  /** Called after each lead, in order. */
  onBuilt?: (key: string, p: AnyPuzzle, lead: Lead) => void;
}

/** Every lead of the rank's story, keyed `${leadId}:${preset}` like puzzles.json. Throws when a lead cannot be built. */
export function buildRank(cf: CaseFile, preset: Preset, opts: BuildOptions = {}): PuzzleBook {
  const cfr = caseForRank(cf, preset);
  const rules = PRESET_RULES[preset];
  const built: PuzzleBook = {};
  for (const lead of cfr.leads) {
    const liars = lead.liars[preset];
    const speakers = lead.speakers.map((id) => ({ id, lies: liars.filter((l) => l === id).length }));
    const seed = leadSeed(cf, lead, preset, opts.runSeed);
    const n = rules.size;
    let p: AnyPuzzle;
    if (lead.type === 'timeline') {
      const t = withLinks(cfr, preset, lead, n, seed, built, (planted) => generateTimeline({
        size: n,
        speakers,
        liarRange: rules.liarRange,
        // Junior reads only "at" and "before"
        maxGrade: Math.min(rules.maxGrade, 3),
        minGrade: TIMELINE_MIN_GRADE[n],
        maxStatements: TIMELINE_STATEMENTS[n],
        givens: TIMELINE_GIVENS[n],
        ...(lead.map ? MAP_RULES[preset] : {}),
        planted: planted as never,
        seed,
      }, 800));
      const tc = verifyTimeline(t);
      /* v8 ignore next -- the generator only returns a puzzle that verifies; this is a second opinion */
      if (!tc.ok) throw new Error(`${lead.id}:${preset} failed: ${tc.reason}`);
      p = t;
    } else if (lead.type === 'cipher') {
      const cp = withLinks(cfr, preset, lead, n, seed, built, (planted) => generateCipher({ size: n, speakers, liarRange: rules.liarRange, maxGrade: Math.min(rules.maxGrade, 3), ...CIPHER_RULES[preset], planted: planted as never, seed }, 800));
      const cc = verifyCipher(cp);
      /* v8 ignore next -- the generator only returns a puzzle that verifies; this is a second opinion */
      if (!cc.ok) throw new Error(`${lead.id}:${preset} failed: ${cc.reason}`);
      p = cp;
    } else if (lead.type === 'network') {
      const net = withLinks(cfr, preset, lead, n, seed, built, (planted) => generateNetwork({ size: n, speakers, liarRange: rules.liarRange, maxGrade: Math.min(rules.maxGrade, 3), ...NET_RULES[preset], planted: planted as never, seed }, 800));
      const nc = verifyNetwork(net);
      /* v8 ignore next -- the generator only returns a puzzle that verifies; this is a second opinion */
      if (!nc.ok) throw new Error(`${lead.id}:${preset} failed: ${nc.reason}`);
      p = net;
    } else {
      const g = withLinks(cfr, preset, lead, n, seed, built, (planted) => generatePuzzle({
        size: n,
        type: lead.type as GridType,
        speakers,
        liarRange: rules.liarRange,
        maxGrade: lead.opensAfter.length === 0 ? Math.min(rules.maxGrade, 3) : rules.maxGrade,
        minGrade: lead.hard ? HARD_MIN_GRADE[n] : 1,
        maxStatements: GRID_STATEMENTS[n],
        anchors: (lead.anchors ?? []).map((a) => ({ cell: [lead.rows.indexOf(a.time), lead.columns.indexOf(a.person)] as [number, number], value: a.value })),
        ledgerGivens: lead.type === 'ledger' && lead.opensAfter.length === 0 ? OPENER_GIVENS[n] : 0,
        planted: planted as never,
        seed,
      }, lead.anchors?.length || planted.length ? 1500 : 300)); // an anchor or a link is one more condition, so it needs more tries
      const check = verifyUnique(g);
      /* v8 ignore next -- the generator only returns a puzzle that verifies; this is a second opinion */
      if (!check.ok) throw new Error(`${lead.id}:${preset} failed: ${check.reason}`);
      p = g;
    }
    const key = `${lead.id}:${preset}`;
    built[key] = p;
    opts.onBuilt?.(key, p, lead);
  }
  return built;
}

/** How many seeds a fresh play tries before it gives up. A rare seed can't be built with its links; the next one usually can. */
export const SEED_TRIES = 6;

/**
 * Builds a rank from a fresh seed, moving to a neighbouring seed when one can't be built.
 * Returns the seed that worked: that is the one to save, because it rebuilds the same puzzles.
 */
export function buildRankFresh(cf: CaseFile, preset: Preset, runSeed: number, tries = SEED_TRIES): { seed: number; book: PuzzleBook } {
  let last = '';
  for (let k = 0; k < tries; k++) {
    const seed = k === 0 ? runSeed : (Math.imul(runSeed, 31) + k) >>> 0;
    try {
      return { seed, book: buildRank(cf, preset, { runSeed: seed }) };
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(`no seed built ${preset}: ${last}`);
}
