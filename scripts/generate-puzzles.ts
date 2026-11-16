/**
 * Generates every lead x preset puzzle for a case and writes cases/<case-id>/puzzles.json.
 * Usage: npm run generate -- cases/case-01-harbor-ledger.json
 * Puzzles are generated once and checked in, so every player gets the same case.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generatePuzzle, verifyUnique } from '../src/engine/generator';
import { generateTimeline, verifyTimeline } from '../src/engine/timeline';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { MAP_RULES, PRESET_RULES } from '../src/game/presets';
import { caseForRank } from '../src/game/rankStory';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

// each rank plays its own story's leads (the case file's when the story keeps them), lead by lead
const jobs = PRESETS.flatMap((preset) => caseForRank(cf, preset).leads.map((lead) => ({ lead, preset })));
const order = [...new Set(jobs.map((j) => j.lead.id))];
jobs.sort((a, b) => order.indexOf(a.lead.id) - order.indexOf(b.lead.id) || PRESETS.indexOf(a.preset) - PRESETS.indexOf(b.preset));

const book: PuzzleBook = {};
for (const { lead, preset } of jobs) {
    const rules = PRESET_RULES[preset];
    const liars = lead.liars[preset];
    const speakers = lead.speakers.map((id) => ({ id, lies: liars.filter((l) => l === id).length }));
    const seed = hash(`${cf.id}:${lead.id}:${preset}`);
    if (lead.type === 'timeline') {
      const n = rules.size;
      const t = generateTimeline({
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
        seed,
      });
      const tc = verifyTimeline(t);
      if (!tc.ok) throw new Error(`${lead.id}:${preset} failed: ${tc.reason}`);
      book[`${lead.id}:${preset}`] = t;
      console.log(`${lead.id}:${preset.padEnd(9)} ${n} moments  ${lead.map ? 'map     ' : 'timeline'}     grade ${t.grade}  statements ${t.statements.length}  lies ${t.truth.filter((x) => !x).length}`);
      continue;
    }
    const p = generatePuzzle({
      size: rules.size,
      type: lead.type,
      speakers,
      liarRange: rules.liarRange,
      maxGrade: lead.opensAfter.length === 0 ? Math.min(rules.maxGrade, 3) : rules.maxGrade,
      minGrade: lead.hard && rules.size >= 6 ? 3 : 1,
      maxStatements: rules.size === 4 ? 5 : rules.size === 5 ? 7 : rules.size === 6 ? 8 : 9,
      // a 7x7 opener needs a few filled cells to stay at the gentle opening grade
      ledgerGivens: lead.type === 'ledger' && lead.opensAfter.length === 0 && rules.size >= 7 ? 7 : 0,
      seed,
    });
    const check = verifyUnique(p);
    if (!check.ok) throw new Error(`${lead.id}:${preset} failed: ${check.reason}`);
    book[`${lead.id}:${preset}`] = p;
    console.log(`${lead.id}:${preset.padEnd(9)} ${p.size}x${p.size} ${lead.type.padEnd(12)} grade ${p.grade}  statements ${p.statements.length}  lies ${p.truth.filter((x) => !x).length}  base grids ${p.baseSolutions}`);
  }

const out = join(dirname(file), cf.id, 'puzzles.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(book) + '\n');
console.log(`wrote ${out}`);
