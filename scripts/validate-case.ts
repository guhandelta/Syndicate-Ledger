/**
 * Checks a case file and its generated puzzles against the rule book (sections 1 to 5).
 * Usage: npm run validate -- cases/case-01-harbor-ledger.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gradePuzzle } from '../src/engine/logic';
import { verifyUnique } from '../src/engine/generator';
import { PRESETS, type CaseFile, type PuzzleBook } from '../src/game/caseTypes';
import { PRESET_RULES } from '../src/game/presets';
import { validateTown } from '../src/town/townLogic';
import type { Town } from '../src/town/townTypes';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

const castIds = new Set(cf.cast.map((c) => c.id));
const leadIds = new Set(cf.leads.map((l) => l.id));
const nonAllies = cf.cast.filter((c) => c.role !== 'ally');

if (nonAllies.length < 5 || nonAllies.length > 8) fail(`cast has ${nonAllies.length} non-ally characters; the rule book wants 5 to 8`);
if (cf.cast.filter((c) => c.role === 'boss').length !== 1) fail('a case needs exactly one boss');
for (const c of cf.cast) {
  if ((c.reliability === 'liar' || c.reliability === 'double-agent') && c.role !== 'boss' && !c.protects) fail(`${c.id} lies but has no "protects" motive`);
  if (c.protects && !castIds.has(c.protects)) fail(`${c.id} protects unknown person ${c.protects}`);
}

for (const lead of cf.leads) {
  for (const id of [...lead.columns, ...lead.speakers]) if (!castIds.has(id)) fail(`${lead.id}: unknown person ${id}`);
  for (const id of lead.opensAfter) if (!leadIds.has(id)) fail(`${lead.id}: opensAfter unknown lead ${id}`);
  if (lead.columns.length < 6 || lead.rows.length < 6) fail(`${lead.id}: needs 6 columns and 6 rows so every preset can be built`);
  if (lead.type === 'surveillance' && (lead.rooms?.length ?? 0) < 6) fail(`${lead.id}: surveillance leads need 6 rooms`);
  for (const preset of PRESETS)
    for (const liar of lead.liars[preset] ?? []) {
      if (!lead.speakers.includes(liar)) fail(`${lead.id}:${preset}: liar ${liar} is not a speaker`);
      const who = cf.cast.find((c) => c.id === liar);
      if (who?.reliability === 'honest') fail(`${lead.id}:${preset}: ${liar} is honest but listed as a liar`);
    }
}
if (!cf.leads.some((l) => l.opensAfter.length === 0)) fail('no lead is open at the start');

for (const ev of cf.events) if (!ev.rumor) fail(`event ${ev.id} has no rumor (events must be shown ahead of time)`);

// clock: full bust reachable on the default (Inspector) clock without informants
const eventIds = new Set(cf.events.map((e) => e.id));
for (const clue of cf.missedClues ?? []) {
  const w = clue.when;
  if (!clue.presets.length) fail(`missed clue ${clue.id} has no presets`);
  if (w.kind === 'wrong-mark' || w.kind === 'unmarked') {
    if (!leadIds.has(w.lead)) fail(`missed clue ${clue.id}: unknown lead ${w.lead}`);
    if (!castIds.has(w.speaker)) fail(`missed clue ${clue.id}: unknown speaker ${w.speaker}`);
  }
  if (w.kind === 'event' && !eventIds.has(w.event)) fail(`missed clue ${clue.id}: unknown event ${w.event}`);
  if (w.kind === 'accuse') {
    if (w.person && !castIds.has(w.person)) fail(`missed clue ${clue.id}: unknown person ${w.person}`);
    for (const l of [w.unsolved, w.solved]) if (l && !leadIds.has(l)) fail(`missed clue ${clue.id}: unknown lead ${l}`);
  }
}

const total = cf.clock.days * cf.clock.hoursPerDay;
const allLeads = cf.leads.reduce((s, l) => s + l.cost, 0);
if (allLeads > total) fail(`working every lead takes ${allLeads} hours but the clock has ${total}`);
for (const preset of PRESETS) {
  const t = total + PRESET_RULES[preset].extraHours;
  if (PRESET_RULES[preset].clock !== 'off' && allLeads > t) fail(`${preset}: working every lead takes ${allLeads} hours but the clock has ${t}`);
}

// puzzles
const bookPath = join(dirname(file), cf.id, 'puzzles.json');
if (!existsSync(bookPath)) fail(`missing ${bookPath}; run npm run generate`);
else {
  const book: PuzzleBook = JSON.parse(readFileSync(bookPath, 'utf8'));
  for (const lead of cf.leads)
    for (const preset of PRESETS) {
      const key = `${lead.id}:${preset}`;
      const p = book[key];
      if (!p) { fail(`${key}: no puzzle`); continue; }
      const rules = PRESET_RULES[preset];
      if (p.size !== rules.size) fail(`${key}: size ${p.size}, preset wants ${rules.size}`);
      if (p.type !== lead.type) fail(`${key}: type ${p.type}, lead is ${lead.type}`);
      const check = verifyUnique(p);
      if (!check.ok) fail(`${key}: ${check.reason}`);
      const grade = gradePuzzle(p, p.truth);
      if (grade === 0 || grade > rules.maxGrade) fail(`${key}: needs technique ${grade || 'guessing'}, preset allows ${rules.maxGrade}`);
      const lies = p.statements.filter((s, i) => !p.truth[i]).map((s) => s.speaker).sort();
      const expected = [...(lead.liars[preset] ?? [])].sort();
      if (lies.join() !== expected.join()) fail(`${key}: liars are [${lies}] but the case says [${expected}]`);
      for (const s of new Set(lead.speakers)) if (!p.statements.some((x) => x.speaker === s)) fail(`${key}: ${s} says nothing`);
    }
}

// A case may have a walkable town. If it does, the town must match the case.
const townPath = join(dirname(file), cf.id, 'town.json');
let hasTown = false;
if (existsSync(townPath)) {
  hasTown = true;
  for (const e of validateTown(JSON.parse(readFileSync(townPath, 'utf8')) as Town, cf)) fail(`town: ${e}`);
}

if (errors.length) {
  console.error(`✗ ${cf.id}: ${errors.length} problem(s)`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ ${cf.id} passes the rule book checks (${cf.leads.length} leads × ${PRESETS.length} presets${hasTown ? ', town checked' : ''})`);
