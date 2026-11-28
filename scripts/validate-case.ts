/**
 * Checks a case file and its generated puzzles against the rule book (sections 1 to 5).
 * Usage: npm run validate -- cases/case-01-harbor-ledger.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gradePuzzle } from '../src/engine/logic';
import { verifyUnique } from '../src/engine/generator';
import { verifyCipher } from '../src/engine/cipher';
import { verifyStakeout } from '../src/engine/stakeout';
import { verifyDecode, DECODE_VARIANTS } from '../src/engine/decode';
import { verifyNetwork } from '../src/engine/network';
import { isWalk, verifyTimeline } from '../src/engine/timeline';
import { FACES, LEAD_TYPES, PRESETS, VOICES, type CaseFile, type Condition, type Line, type Preset, type PuzzleBook, type Voice } from '../src/game/caseTypes';
import { CIPHER_RULES, DECODE_LEVEL, NET_RULES, PRESET_RULES, STAKEOUT_RULES } from '../src/game/presets';
import { carriedEvidence, caseForRank, partOf } from '../src/game/rankStory';
import { checkLinks, linkResolves, linksFor, type Answers } from '../src/game/links';
import { t } from '../src/game/text';
import { validateTown } from '../src/town/townLogic';
import type { Town } from '../src/town/townTypes';

const file = process.argv[2] ?? 'cases/case-01-harbor-ledger.json';
const cf: CaseFile = JSON.parse(readFileSync(file, 'utf8'));
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

const castIds = new Set(cf.cast.map((c) => c.id));
const nonAllies = cf.cast.filter((c) => c.role !== 'ally');

if (nonAllies.length < 5 || nonAllies.length > 11) fail(`cast has ${nonAllies.length} non-ally characters; the rule book wants 5 to 11`);
if (cf.cast.filter((c) => c.role === 'mastermind').length > 1) fail('a case has at most one mastermind');
if (cf.cast.filter((c) => c.role === 'boss').length !== 1) fail('a case needs exactly one boss');
for (const c of cf.cast) {
  if ((c.reliability === 'liar' || c.reliability === 'double-agent') && c.role !== 'boss' && c.role !== 'mastermind' && !c.protects) fail(`${c.id} lies but has no "protects" motive`);
  for (const r of c.ranks ?? []) if (!PRESETS.includes(r)) fail(`${c.id}: unknown rank "${r}"`);
  if (c.ranks && !c.ranks.length) fail(`${c.id}: is listed for no rank`);
  if (c.protects && !castIds.has(c.protects)) fail(`${c.id} protects unknown person ${c.protects}`);
}

// dialogue voices pick the bubble style, so an unknown one would draw nothing
const badVoice = (v: Voice | undefined) => v !== undefined && !VOICES.includes(v);
for (const c of cf.cast) {
  if (badVoice(c.voice)) fail(`${c.id}: unknown voice "${c.voice}"`);
  if (badVoice(c.greeting?.voice)) fail(`${c.id}: greeting has unknown voice "${c.greeting?.voice}"`);
}
/** Checks one story (the case file, or a rank's own story over it) for the ranks that play it. */
function checkStory(cf: CaseFile, presets: Preset[], label: string) {
  const fail = (msg: string) => errors.push(label ? `${label}: ${msg}` : msg);
  const leadIds = new Set(cf.leads.map((l) => l.id));
  // the biggest grid these ranks build (Chief, 7x7): every lead needs that many people, rows and rooms
  const MAX_SIZE = Math.max(...presets.map((p) => PRESET_RULES[p].size));

  for (const o of cf.offers) {
    if (badVoice(o.voice)) fail(`offer ${o.id}: unknown voice "${o.voice}"`);
    if (!castIds.has(o.from)) fail(`offer ${o.id}: from unknown person ${o.from}`);
  }

  for (const lead of cf.leads) {
    for (const id of [...lead.columns, ...lead.speakers]) if (!castIds.has(id)) fail(`${lead.id}: unknown person ${id}`);
    // an anchor is a fact the answer must have: it must be on a grid, inside every rank's grid, and the fact text must name it
    for (const a of lead.anchors ?? []) {
      const r = lead.rows.indexOf(a.time);
      const c = lead.columns.indexOf(a.person);
      const smallest = Math.min(...presets.map((x) => PRESET_RULES[x].size));
      if (lead.type !== 'ledger' && lead.type !== 'surveillance') fail(`${lead.id}: anchors only work on grid leads`);
      else if (r < 0 || c < 0 || r >= smallest || c >= smallest) fail(`${lead.id}: anchor ${a.time} ${a.person} is not inside every rank's grid`);
      else {
        const said = lead.rooms ? lead.rooms[a.value - 1] : String(a.value);
        if (!said) fail(`${lead.id}: anchor value ${a.value} names no room`);
        else for (const tone of ['crime', 'friendly'] as const) if (!t(lead.fact, tone).includes(said)) fail(`${lead.id}: the ${tone} fact must say ${said}`);
      }
    }
    for (const id of lead.opensAfter) if (!leadIds.has(id)) fail(`${lead.id}: opensAfter unknown lead ${id}`);
    // a link quotes a lead the player has already solved: one that opens strictly before this one
    const before = new Set<string>();
    const walk = (id: string) => {
      for (const o of cf.leads.find((l) => l.id === id)?.opensAfter ?? []) if (!before.has(o)) { before.add(o); walk(o); }
    };
    walk(lead.id);
    for (const spec of lead.links ?? []) {
      if (!before.has(spec.from)) fail(`${lead.id}: link quotes ${spec.from}, which does not open before it`);
      if (spec.valueFrom && !before.has(spec.valueFrom)) fail(`${lead.id}: link quotes ${spec.valueFrom}, which does not open before it`);
      if (spec.valueFrom && spec.take !== 'person') fail(`${lead.id}: "valueFrom" picks a person, so it needs "take": "person"`);
      if (spec.take === 'person' && (lead.type !== 'network' || spec.use !== 'linked')) fail(`${lead.id}: a person link belongs in a network lead as "linked"`);
      if (spec.take === 'number' && lead.type === 'network') fail(`${lead.id}: a network lead links to a person, not a number`);
      if (spec.take === 'number' && spec.use === 'linked') fail(`${lead.id}: "linked" is for people`);
    }
    if (!LEAD_TYPES.includes(lead.type)) fail(`${lead.id}: unknown type "${lead.type}"`);
    for (const [k, c] of (lead.clippings ?? []).entries()) {
      for (const tone of ['crime', 'friendly'] as const)
        if (!c.paper || !t(c.headline, tone) || t(c.body, tone).replace(/▒/g, '').trim().length < 40) fail(`${lead.id}: clipping ${k + 1} needs a paper, a headline and a readable body (${tone})`);
    }
    if (lead.type === 'timeline') {
      // a timeline has a time for each moment, and the moments are the columns
      if ((lead.moments?.length ?? 0) < MAX_SIZE || lead.rows.length < MAX_SIZE) fail(`${lead.id}: timeline leads need ${MAX_SIZE} moments and ${MAX_SIZE} times so every preset can be built`);
    } else if (lead.type === 'stakeout') {
      // a stakeout has districts, not people or times; the biggest map is the Chief's
      const most = STAKEOUT_RULES.chief.size;
      if ((lead.districts?.length ?? 0) < most) fail(`${lead.id}: stakeout leads need ${most} districts so every preset can be built`);
    } else if (lead.type === 'decode') {
      // a decode lead has exhibits, not people, times or witnesses
      if (!lead.decode || !DECODE_VARIANTS.includes(lead.decode.variant)) fail(`${lead.id}: a decode lead needs "decode": { "variant": one of ${DECODE_VARIANTS.join(', ')} }`);
      if (lead.speakers.length || lead.columns.length || lead.rows.length || (lead.links ?? []).length) fail(`${lead.id}: a decode lead has no speakers, rows, columns or links`);
    } else if (lead.type === 'cipher') {
      // a cipher has no people or times: its statements name the digits by place, or the people of its riddle
      if (lead.riddle) {
        if (lead.message !== undefined) fail(`${lead.id}: a riddle cannot also carry a message`);
        if (lead.riddle.people.length < MAX_SIZE) fail(`${lead.id}: a riddle needs ${MAX_SIZE} people so every preset can be built`);
        for (const id of lead.riddle.people) if (!castIds.has(id)) fail(`${lead.id}: riddle person ${id} is not in the cast`);
        if (!/^[a-z]+$/.test(lead.riddle.noun)) fail(`${lead.id}: the riddle noun must be one lowercase word`);
      }
      if (lead.message !== undefined) {
        if (!/^[A-Z]{4,7}$/.test(lead.message)) fail(`${lead.id}: the cipher message must be 4 to 7 capital letters`);
        else for (const tone of ['crime', 'friendly'] as const) if (!t(lead.fact, tone).toUpperCase().includes(lead.message)) fail(`${lead.id}: the ${tone} fact must say the message ${lead.message}`);
      }
    } else if (lead.type === 'network') {
      // the people of a network are the columns; it has no times
      if (lead.columns.length < MAX_SIZE) fail(`${lead.id}: network leads need ${MAX_SIZE} people so every preset can be built`);
    } else if (lead.columns.length < MAX_SIZE || lead.rows.length < MAX_SIZE) fail(`${lead.id}: needs ${MAX_SIZE} columns and ${MAX_SIZE} rows so every preset can be built`);
    if (lead.type === 'surveillance' && (lead.rooms?.length ?? 0) < MAX_SIZE) fail(`${lead.id}: surveillance leads need ${MAX_SIZE} rooms`);
    for (const preset of presets)
      for (const liar of lead.liars[preset] ?? []) {
        if (!lead.speakers.includes(liar)) fail(`${lead.id}:${preset}: liar ${liar} is not a speaker`);
        const who = cf.cast.find((c) => c.id === liar);
        if (who?.reliability === 'honest') fail(`${lead.id}:${preset}: ${liar} is honest but listed as a liar`);
      }
  }
  if (!cf.leads.some((l) => l.opensAfter.length === 0)) fail('no lead is open at the start');

  const personIds = castIds;
  for (const l of cf.leads) for (const w of l.pointsTo ?? []) if (!personIds.has(w)) fail(`lead ${l.id}: pointsTo ${w} is not a person`);
  for (const [who, pr] of Object.entries(cf.proof ?? {})) {
    if (!personIds.has(who)) fail(`proof: ${who} is not a person`);
    if (!pr.needs.length) fail(`proof: ${who} needs no evidence`);
    for (const id of pr.needs) {
      if (id.startsWith('carried:')) {
        const c = presets.map((p) => carriedEvidence(cf, p));
        if (c.some((x) => x?.id !== id)) fail(`proof: ${who} needs ${id}, but the rank below does not hand over an object that points at someone`);
        else if (c.some((x) => !x!.pointsTo!.includes(who))) fail(`proof: ${id} does not point to ${who}`);
        continue;
      }
      const l = cf.leads.find((x) => x.id === id);
      if (!l) fail(`proof: ${who} needs unknown lead ${id}`);
      else if (!l.pointsTo?.includes(who)) fail(`proof: lead ${id} does not point to ${who}`);
    }
  }
  if (!cf.lost) fail('case has no "lost" text for the case-lost screen');
  if (!Object.keys(cf.proof ?? {}).length) fail('case has no provable person');

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
  for (const preset of presets) {
    const t = total + PRESET_RULES[preset].extraHours;
    if (PRESET_RULES[preset].clock !== 'off' && allLeads > t) fail(`${preset}: working every lead takes ${allLeads} hours but the clock has ${t}`);
  }

  // puzzles
  const bookPath = join(dirname(file), cf.id, 'puzzles.json');
  if (!existsSync(bookPath)) fail(`missing ${bookPath}; run npm run generate`);
  else {
    const book: PuzzleBook = JSON.parse(readFileSync(bookPath, 'utf8'));
    for (const lead of cf.leads)
      for (const preset of presets) {
        const key = `${lead.id}:${preset}`;
        const p = book[key];
        if (!p) { fail(`${key}: no puzzle`); continue; }
        const rules = PRESET_RULES[preset];
        const wantSize = lead.type === 'stakeout' ? STAKEOUT_RULES[preset].size : rules.size;
        if (p.type !== 'decode' && p.size !== wantSize) fail(`${key}: size ${p.size}, preset wants ${wantSize}`);
        if (p.type !== lead.type) fail(`${key}: type ${p.type}, lead is ${lead.type}`);
        if (p.type === 'decode') {
          if (!verifyDecode(p)) fail(`${key}: the decode puzzle does not verify`);
          if (p.variant !== lead.decode?.variant) fail(`${key}: variant ${p.variant}, lead wants ${lead.decode?.variant}`);
          if (p.level !== DECODE_LEVEL[preset]) fail(`${key}: level ${p.level}, ${preset} wants ${DECODE_LEVEL[preset]}`);
          continue;
        }
        if (p.type === 'timeline') {
          const check = verifyTimeline(p);
          if (!check.ok) fail(`${key}: ${check.reason}`);
          // no easy path: every timeline needs at least "before", and only grown-up ranks get "right before" and "apart"
          if (!!lead.map !== !!p.edges) fail(`${key}: ${lead.map ? 'a map lead needs a floorplan; run npm run generate' : 'only a map lead has a floorplan'}`);
          if (p.edges && !isWalk(p.solution, p.edges)) fail(`${key}: the answer is not a walk along the corridors`);
          if (p.grade < 2 || p.grade > Math.min(rules.maxGrade, 3)) fail(`${key}: timeline grade ${p.grade} does not suit ${preset}`);
        } else if (p.type === 'stakeout') {
          const check = verifyStakeout(p);
          if (!check.ok) fail(`${key}: ${check.reason}`);
          const sr = STAKEOUT_RULES[preset];
          if (p.grade < sr.minGrade) fail(`${key}: stakeout is too easy for ${preset} (grade ${p.grade})`);
          if (p.baseSolutions < sr.minBase || p.baseSolutions > sr.maxBase) fail(`${key}: the map allows ${p.baseSolutions} layouts, ${preset} wants ${sr.minBase} to ${sr.maxBase}`);
        } else if (p.type === 'cipher') {
          const check = verifyCipher(p);
          if (!check.ok) fail(`${key}: ${check.reason}`);
          if (p.grade < CIPHER_RULES[preset].minGrade) fail(`${key}: cipher is too easy for ${preset} (grade ${p.grade})`);
          if (lead.message && lead.message.length === p.size && p.message?.plain !== lead.message) fail(`${key}: the code should hide the message ${lead.message}`);
        } else if (p.type === 'network') {
          const check = verifyNetwork(p);
          if (!check.ok) fail(`${key}: ${check.reason}`);
          if (p.baseSolutions < NET_RULES[preset].minBase || p.grade < NET_RULES[preset].minGrade) fail(`${key}: network is too easy for ${preset} (grade ${p.grade}, counts allow ${p.baseSolutions})`);
        } else {
          const check = verifyUnique(p);
          if (!check.ok) fail(`${key}: ${check.reason}`);
          const grade = gradePuzzle(p, p.truth);
          if (grade === 0 || grade > rules.maxGrade) fail(`${key}: needs technique ${grade || 'guessing'}, preset allows ${rules.maxGrade}`);
        }
        if (p.type === 'ledger' || p.type === 'surveillance')
          for (const a of lead.anchors ?? []) {
            const got = p.solution[lead.rows.indexOf(a.time)]?.[lead.columns.indexOf(a.person)];
            if (got !== a.value) fail(`${key}: the answer has ${a.person} at ${a.time} as ${got}, the anchor says ${a.value}`);
          }
        // link clues: quote the earlier answer exactly, are needed, and are not enough alone
        const answers: Answers = {};
        for (const l of cf.leads) answers[l.id] = book[`${l.id}:${preset}`];
        const linkStatements = p.statements.filter((s) => s.via);
        if (linkStatements.length < linksFor(lead, preset).length) fail(`${key}: has ${linkStatements.length} link clues, the case wants ${linksFor(lead, preset).length}; run npm run generate`);
        for (const st of linkStatements) {
          const bad = linkResolves(cf, lead, p, st as never, answers);
          if (bad) fail(`${key}: link clue ${bad}`);
        }
        const lc = checkLinks(p);
        if (!lc.ok) fail(`${key}: ${lc.reason}`);
        const lies = p.statements.filter((s, i) => !p.truth[i]).map((s) => s.speaker).sort();
        const expected = [...(lead.liars[preset] ?? [])].sort();
        if (lies.join() !== expected.join()) fail(`${key}: liars are [${lies}] but the case says [${expected}]`);
        for (const s of new Set(lead.speakers)) if (!p.statements.some((x) => x.speaker === s)) fail(`${key}: ${s} says nothing`);
      }
  }
}

// every rank plays a story: group the ranks that play the same one and check each story once
const stories = new Map<CaseFile, Preset[]>();
for (const preset of PRESETS) {
  const sc = caseForRank(cf, preset);
  stories.set(sc, [...(stories.get(sc) ?? []), preset]);
}
for (const [sc, presets] of stories) checkStory(sc, presets, sc === cf ? '' : presets.join('+'));

for (const key of Object.keys(cf.rankStories ?? {})) if (!PRESETS.includes(key as Preset)) fail(`rankStories: unknown rank ${key}`);
if (cf.rankStories) {
  for (const preset of PRESETS) {
    const part = partOf(cf, preset);
    if (!part) fail(`rankStories: ${preset} has no part of the case`);
    else if (!part.title || !part.question || !part.reveal) fail(`rankStories: ${preset} part needs a title, question and reveal`);
  }
  // scenes: every speaker is in the cast, and the voices and faces are ones the game can draw
  for (const preset of PRESETS) {
    const story = cf.rankStories[preset];
    for (const [what, lines] of [['handover', story?.handover?.scene], ['opening', story?.opening]] as const)
      for (const [i, l] of (lines ?? []).entries()) {
        if (l.who && !castIds.has(l.who)) fail(`rankStories: ${preset} ${what} line ${i + 1} is by unknown person ${l.who}`);
        if (badVoice(l.voice)) fail(`rankStories: ${preset} ${what} line ${i + 1} has unknown voice "${l.voice}"`);
        if (l.face && !FACES.includes(l.face)) fail(`rankStories: ${preset} ${what} line ${i + 1} has unknown face "${l.face}"`);
      }
  }
  if (!cf.closing) fail('rankStories: case has no "closing" text for when every part is uncovered');
}

// who the player can be: the detective or an ally, each once, and at least one ready to play
const playable = cf.characters ?? [];
if (playable.length && !playable.some((c) => c.ready)) fail('characters: none is ready to play');
for (const [i, c] of playable.entries()) {
  if (playable.findIndex((x) => x.id === c.id) !== i) fail(`characters: ${c.id} is listed twice`);
  if (c.id !== 'detective' && cf.cast.find((x) => x.id === c.id)?.role !== 'ally') fail(`characters: ${c.id} is not the detective or an ally`);
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
console.log(`✓ ${cf.id} passes the rule book checks (${stories.size} ${stories.size === 1 ? 'story' : 'stories'}, ${cf.leads.length} leads × ${PRESETS.length} presets${hasTown ? ', town checked' : ''})`);
