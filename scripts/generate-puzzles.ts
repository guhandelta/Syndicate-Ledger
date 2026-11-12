/**
 * Generates every lead x preset puzzle for a case and writes cases/<case-id>/puzzles.json.
 * Usage: npm run generate -- cases/case-01-harbor-ledger.json
 * Puzzles are generated once and checked in, so every player gets the same case.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generatePuzzle, verifyUnique } from '../src/engine/generator';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { PRESET_RULES } from '../src/game/presets';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

const book: PuzzleBook = {};
for (const lead of cf.leads)
  for (const preset of PRESETS) {
    const rules = PRESET_RULES[preset];
    const liars = lead.liars[preset];
    const speakers = lead.speakers.map((id) => ({ id, lies: liars.filter((l) => l === id).length }));
    const p = generatePuzzle({
      size: rules.size,
      type: lead.type,
      speakers,
      liarRange: rules.liarRange,
      maxGrade: lead.opensAfter.length === 0 ? Math.min(rules.maxGrade, 3) : rules.maxGrade,
      minGrade: lead.hard && rules.size === 6 ? 3 : 1,
      maxStatements: rules.size === 4 ? 5 : rules.size === 5 ? 7 : 8,
      seed: hash(`${cf.id}:${lead.id}:${preset}`),
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
