/**
 * Generates every lead x preset puzzle for a case and writes cases/<case-id>/puzzles.json.
 * Usage: npm run generate -- cases/case-01-harbor-ledger.json
 * Puzzles are generated once and checked in (seed 0), so a player who can't build fresh ones in the browser still gets the same case.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { buildRank } from '../src/game/buildRank';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const only = process.env.ONLY_PRESET;
const book: PuzzleBook = {};

const describe = (p: PuzzleBook[string]) => {
  const lies = p.truth.filter((x) => !x).length;
  const base = `grade ${p.grade}  statements ${p.statements.length}  lies ${lies}`;
  if (p.type === 'timeline') return `${p.size} moments  timeline     ${base}`;
  if (p.type === 'cipher') return `${p.size} digits   cipher       ${base}`;
  if (p.type === 'network') return `${p.size} people   network      ${base}  counts allow ${p.baseSolutions}`;
  return `${p.size}x${p.size} ${p.type.padEnd(12)} ${base}  base grids ${p.baseSolutions}`;
};

for (const preset of PRESETS.filter((r) => !only || r === only)) {
  Object.assign(book, buildRank(cf, preset, { onBuilt: (key, p) => console.log(`${key.padEnd(14)} ${describe(p)}`) }));
}

const out = process.env.OUT ?? join(dirname(file), cf.id, 'puzzles.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(book) + '\n');
console.log(`wrote ${out}`);
