/**
 * Generates every lead x preset puzzle for a case and writes cases/<case-id>/puzzles.json.
 * Usage: npm run generate -- cases/case-01-harbor-ledger.json
 * Puzzles are generated once and checked in, so every player gets the same case.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generatePuzzle, verifyUnique } from '../src/engine/generator';
import { generateCipher, verifyCipher } from '../src/engine/cipher';
import { generateNetwork, verifyNetwork } from '../src/engine/network';
import { generateTimeline, verifyTimeline } from '../src/engine/timeline';
import type { GridType } from '../src/engine/types';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { CIPHER_RULES, MAP_RULES, NET_RULES, PRESET_RULES } from '../src/game/presets';
import { caseForRank } from '../src/game/rankStory';
import { checkLinks, linkResolves, linksFor, planLinks, type Answers } from '../src/game/links';
import { makeRng } from '../src/engine/rng';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

// each rank plays its own story's leads (the case file's when the story keeps them), lead by lead
const only = process.env.ONLY_PRESET;
const jobs = PRESETS.filter((p) => !only || p === only).flatMap((preset) => caseForRank(cf, preset).leads.map((lead) => ({ lead, preset })));
const order = [...new Set(jobs.map((j) => j.lead.id))];
jobs.sort((a, b) => order.indexOf(a.lead.id) - order.indexOf(b.lead.id) || PRESETS.indexOf(a.preset) - PRESETS.indexOf(b.preset));

const book: PuzzleBook = {};

/**
 * Builds a lead's puzzle with its link clues (docs/LINKED-PUZZLES.md). The links are picked from the earlier answers of the same
 * rank; if a pick can't be built, or the proofs fail, another pick is tried.
 */
function withLinks<P extends { statements: { via?: unknown }[] }>(cfr: CaseFile, preset: (typeof PRESETS)[number], lead: CaseFile['leads'][number], size: number, seed: number, build: (planted: ReturnType<typeof planLinks>) => P): P {
  const answers: Answers = {};
  for (const l of cfr.leads) {
    const a = book[`${l.id}:${preset}`];
    if (a) answers[l.id] = a as Answers[string];
  }
  if (!linksFor(lead, preset).length) return build([]);
  let last = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const planted = planLinks(cfr, preset, lead, size, answers, makeRng((seed ^ 0x9e3779b9) + attempt * 7919));
    try {
      const p = build(planted);
      const check = checkLinks(p as never);
      if (!check.ok) { last = check.reason!; if (process.env.DEBUG) console.log(`  ${lead.id}:${preset} attempt ${attempt}: ${last}`); continue; }
      for (const st of p.statements) {
        if (!st.via) continue;
        const bad = linkResolves(cfr, lead, p as never, st as never, answers);
        if (bad) throw new Error(`${lead.id}:${preset} link ${bad}`);
      }
      return p;
    } catch (e) {
      last = (e as Error).message;
    }
    if (process.env.DEBUG) console.log(`  ${lead.id}:${preset} attempt ${attempt}: ${last}`);
  }
  throw new Error(`${lead.id}:${preset} could not be built with its links: ${last}`);
}

for (const { lead, preset } of jobs) {
    const cfr = caseForRank(cf, preset);
    const rules = PRESET_RULES[preset];
    const liars = lead.liars[preset];
    const speakers = lead.speakers.map((id) => ({ id, lies: liars.filter((l) => l === id).length }));
    const seed = hash(`${cf.id}:${lead.id}:${preset}`);
    if (lead.type === 'timeline') {
      const n = rules.size;
      const t = withLinks(cfr, preset, lead, n, seed, (planted) => generateTimeline({
        size: n,
        speakers,
        liarRange: rules.liarRange,
        // Junior reads only "at" and "before"; every rank needs at least "before" (no easy path)
        maxGrade: Math.min(rules.maxGrade, 3),
        minGrade: n >= 6 ? 3 : 2,
        maxStatements: n >= 7 ? 13 : n + 4,
        // the 7-moment Chief timeline starts with one moment pinned, so the statement list stays readable
        givens: n >= 7 ? 1 : 0,
        ...(lead.map ? MAP_RULES[preset] : {}),
        planted: planted as never,
        seed,
      }, planted.length ? 800 : 400));
      const tc = verifyTimeline(t);
      if (!tc.ok) throw new Error(`${lead.id}:${preset} failed: ${tc.reason}`);
      book[`${lead.id}:${preset}`] = t;
      console.log(`${lead.id}:${preset.padEnd(9)} ${n} moments  ${lead.map ? 'map     ' : 'timeline'}     grade ${t.grade}  statements ${t.statements.length}  lies ${t.truth.filter((x) => !x).length}`);
      continue;
    }
    if (lead.type === 'cipher') {
      const n = rules.size;
      const cp = withLinks(cfr, preset, lead, n, seed, (planted) => generateCipher({ size: n, speakers, liarRange: rules.liarRange, maxGrade: Math.min(rules.maxGrade, 3), ...CIPHER_RULES[preset], planted: planted as never, seed }, planted.length ? 800 : 400));
      const cc = verifyCipher(cp);
      if (!cc.ok) throw new Error(`${lead.id}:${preset} failed: ${cc.reason}`);
      book[`${lead.id}:${preset}`] = cp;
      console.log(`${lead.id}:${preset.padEnd(9)} ${n} digits   cipher       grade ${cp.grade}  statements ${cp.statements.length}  lies ${cp.truth.filter((x) => !x).length}`);
      continue;
    }
    if (lead.type === 'network') {
      const n = rules.size;
      const net = withLinks(cfr, preset, lead, n, seed, (planted) => generateNetwork({ size: n, speakers, liarRange: rules.liarRange, maxGrade: Math.min(rules.maxGrade, 3), ...NET_RULES[preset], planted: planted as never, seed }, planted.length ? 800 : 600));
      const nc = verifyNetwork(net);
      if (!nc.ok) throw new Error(`${lead.id}:${preset} failed: ${nc.reason}`);
      book[`${lead.id}:${preset}`] = net;
      console.log(`${lead.id}:${preset.padEnd(9)} ${n} people   network      grade ${net.grade}  statements ${net.statements.length}  lies ${net.truth.filter((x) => !x).length}  counts allow ${net.baseSolutions}`);
      continue;
    }
    const p = withLinks(cfr, preset, lead, rules.size, seed, (planted) => generatePuzzle({
      size: rules.size,
      type: lead.type as GridType,
      speakers,
      liarRange: rules.liarRange,
      maxGrade: lead.opensAfter.length === 0 ? Math.min(rules.maxGrade, 3) : rules.maxGrade,
      minGrade: lead.hard && rules.size >= 6 ? 3 : 1,
      maxStatements: rules.size === 4 ? 5 : rules.size === 5 ? 7 : rules.size === 6 ? 8 : 9,
      // a 7x7 opener needs a few filled cells to stay at the gentle opening grade
      anchors: (lead.anchors ?? []).map((a) => ({ cell: [lead.rows.indexOf(a.time), lead.columns.indexOf(a.person)] as [number, number], value: a.value })),
      ledgerGivens: lead.type === 'ledger' && lead.opensAfter.length === 0 && rules.size >= 7 ? 7 : 0,
      planted: planted as never,
      seed,
    }, lead.anchors?.length || planted.length ? 1500 : 300)); // an anchor or a link is one more condition, so it needs more tries
    const check = verifyUnique(p);
    if (!check.ok) throw new Error(`${lead.id}:${preset} failed: ${check.reason}`);
    book[`${lead.id}:${preset}`] = p;
    console.log(`${lead.id}:${preset.padEnd(9)} ${p.size}x${p.size} ${lead.type.padEnd(12)} grade ${p.grade}  statements ${p.statements.length}  lies ${p.truth.filter((x) => !x).length}  base grids ${p.baseSolutions}`);
  }

const out = process.env.OUT ?? join(dirname(file), cf.id, 'puzzles.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(book) + '\n');
console.log(`wrote ${out}`);
