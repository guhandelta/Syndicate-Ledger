import { evalClaim } from '../engine/claims';
import { randomClaim } from '../engine/generator';
import { enumerate } from '../engine/solver';
import { makeRng } from '../engine/rng';
import { fittingCodes, freshTrueCipherClaim, type CipherClaim, type CipherPuzzle } from '../engine/cipher';
import { fittingNetworks, freshTrueNetClaim, type NetClaim, type NetworkPuzzle } from '../engine/network';
import { fittingOrders, freshTrueTimeClaim, type TimeClaim, type TimelinePuzzle } from '../engine/timeline';
import type { Claim, GeneratedPuzzle, Grid } from '../engine/types';
import type { AnyClaim, AnyPuzzle, CaseEvent, CaseFile, Ending, Preset, PuzzleBook } from './caseTypes';
import { PRESET_RULES } from './presets';
import { carriedEvidence } from './rankStory';

export type Mark = 'unknown' | 'true' | 'lie';

export interface LeadProgress {
  started: boolean;
  solved: boolean;
  grid: Grid;
  /** pencil marks as bitmasks */
  notes: number[][];
  marks: Mark[];
  extraCost: number;
  /** extra statements bought from the informant (always true) */
  paidTips: { speaker: string; claim: AnyClaim }[];
  /** speakers removed by an event and not yet recovered */
  missingSpeakers: string[];
  revealed: [number, number][];
  /** Timeline leads: the time slot (1..N) the player put each moment at, 0 = not placed. Grid leads have none. */
  order?: number[];
  /** Timeline leads: moments shown in place by an ally or after a witness left. */
  shownMoments?: number[];
  /** Network leads: what the player decided about each pair of people (in `pairs` order): 0 undecided, 1 in contact, 2 never in contact. */
  links?: number[];
  /** Network leads: pairs shown as decided by an ally or after a witness left. */
  shownPairs?: number[];
  /** Cipher leads: the digit the player put at each position of the code, 0 = empty. */
  digits?: number[];
  /** Cipher leads: positions shown by an ally or after a witness left. */
  shownDigits?: number[];
}

export interface GameState {
  version: 1;
  caseId: string;
  preset: Preset;
  hoursUsed: number;
  favors: number;
  flags: string[];
  firedEvents: string[];
  offersSeen: string[];
  leads: Record<string, LeadProgress>;
  log: string[];
  hintsUsed: number;
  accused?: string;
  endingId?: string;
  /** Every accusation made so far, and whether it held up. */
  accuseLog?: { person: string; ok: boolean }[];
  /** Set when the case is lost: the clock ran out, or nobody who could win it is left to accuse. */
  lost?: 'time' | 'limits';
  /** Story shots already played in the town. */
  shotsSeen?: string[];
  /** Missed-clue nudges already shown. */
  cluesShown?: string[];
  /** Who the player is playing as (a PlayableCharacter id). Older saves have none: the detective. */
  character?: string;
  /** Opinions the player has heard, as "<speaker>:<about>". */
  heard?: string[];
}

export interface Game {
  cf: CaseFile;
  book: PuzzleBook;
  s: GameState;
}

export function newGame(cf: CaseFile, book: PuzzleBook, preset: Preset, character?: string): Game {
  const rules = PRESET_RULES[preset];
  const leads: Record<string, LeadProgress> = {};
  for (const lead of cf.leads) {
    const p = book[`${lead.id}:${preset}`];
    const common = { started: false, solved: false, marks: p.statements.map((): Mark => 'unknown'), extraCost: 0, paidTips: [], missingSpeakers: [], revealed: [] };
    if (p.type === 'timeline') {
      const order = p.solution.map(() => 0);
      for (const gv of p.givens) order[gv.m] = gv.slot;
      leads[lead.id] = { ...common, grid: [], notes: [], order, shownMoments: [] };
      continue;
    }
    if (p.type === 'cipher') {
      const digits = p.code.map(() => 0);
      for (const gv of p.givens) digits[gv.p] = gv.d;
      leads[lead.id] = { ...common, grid: [], notes: [], digits, shownDigits: [] };
      continue;
    }
    if (p.type === 'network') {
      leads[lead.id] = { ...common, grid: [], notes: [], links: p.links.map(() => 0), shownPairs: [] };
      continue;
    }
    leads[lead.id] = { ...common, grid: p.solution.map((row) => row.map(() => 0)), notes: p.solution.map((row) => row.map(() => 0)) };
    for (const g of p.givens) leads[lead.id].grid[g.cell[0]][g.cell[1]] = g.value;
  }
  return {
    cf,
    book,
    s: { version: 1, caseId: cf.id, preset, hoursUsed: 0, favors: rules.startFavors, flags: [], firedEvents: [], offersSeen: [], leads, log: [], hintsUsed: 0, ...(character ? { character } : {}) },
  };
}

export const puzzleOf = (g: Game, leadId: string): AnyPuzzle => g.book[`${leadId}:${g.s.preset}`];
/** A grid lead's puzzle (ledger or camera log). */
export const gridOf = (g: Game, leadId: string) => puzzleOf(g, leadId) as GeneratedPuzzle;
/** A timeline lead's puzzle. */
export const timelineOf = (g: Game, leadId: string) => puzzleOf(g, leadId) as TimelinePuzzle;
/** A network lead's puzzle. */
export const networkOf = (g: Game, leadId: string) => puzzleOf(g, leadId) as NetworkPuzzle;
/** A cipher lead's puzzle. */
export const cipherOf = (g: Game, leadId: string) => puzzleOf(g, leadId) as CipherPuzzle;
export const rules = (g: Game) => PRESET_RULES[g.s.preset];
export const clockOn = (g: Game) => rules(g).clock !== 'off';
export const totalHours = (g: Game) => g.cf.clock.days * g.cf.clock.hoursPerDay + rules(g).extraHours;
export const hoursLeft = (g: Game) => Math.max(0, totalHours(g) - g.s.hoursUsed);

export function dayLabel(g: Game): string {
  const d = Math.min(g.cf.clock.days, Math.floor(g.s.hoursUsed / g.cf.clock.hoursPerDay) + 1);
  return `Day ${d}`;
}

export function leadOpen(g: Game, leadId: string): boolean {
  const lead = g.cf.leads.find((l) => l.id === leadId)!;
  return lead.opensAfter.every((id) => g.s.leads[id].solved);
}

export function leadCost(g: Game, leadId: string): number {
  const lead = g.cf.leads.find((l) => l.id === leadId)!;
  return lead.cost + g.s.leads[leadId].extraCost;
}

export function caseOver(g: Game) {
  return !!g.s.endingId || !!g.s.lost;
}

/** Spend clock time; returns events that fired as a result. */
export function spendHours(g: Game, hours: number): CaseEvent[] {
  if (!clockOn(g)) return [];
  g.s.hoursUsed += hours;
  return fireEvents(g);
}

/**
 * Cells that must be shown once some witnesses are gone, so the lead still has exactly one answer.
 * Greedy: each added cell is the one that rules out the most grids that still fit.
 */
export function gapCells(g: Game, leadId: string): [number, number][] {
  const p = gridOf(g, leadId);
  const lp = g.s.leads[leadId];
  const said = p.statements.filter((s) => !lp.missingSpeakers.includes(s.speaker));
  const shown = [...p.givens.map((x) => x.cell), ...lp.revealed];
  const base = enumerate({ size: p.size, zones: p.zones, givens: p.givens }, 10_000);
  let fits = base.filter((grid) => {
    if (shown.some(([r, c]) => grid[r][c] !== p.solution[r][c])) return false;
    return p.liarCounts.includes(said.filter((s) => !evalClaim(s.claim, grid)).length);
  });
  const added: [number, number][] = [];
  while (fits.length > 1) {
    let best: [number, number] | null = null;
    let bestLeft = fits.length;
    for (let r = 0; r < p.size; r++)
      for (let c = 0; c < p.size; c++) {
        if (shown.some(([sr, sc]) => sr === r && sc === c) || added.some(([sr, sc]) => sr === r && sc === c)) continue;
        const left = fits.filter((grid) => grid[r][c] === p.solution[r][c]).length;
        if (left < bestLeft) {
          bestLeft = left;
          best = [r, c];
        }
      }
    const [r, c] = best!;
    fits = fits.filter((grid) => grid[r][c] === p.solution[r][c]);
    added.push([r, c]);
  }
  return added;
}

/** When a witness leaves, show the cells that keep the lead solvable (no hint is spent). */
function fillGapLeft(g: Game, leadId: string) {
  const lp = g.s.leads[leadId];
  if (puzzleOf(g, leadId).type === 'timeline') {
    const p = timelineOf(g, leadId);
    for (const m of gapMoments(g, leadId)) {
      lp.order![m] = p.solution[m];
      lp.shownMoments!.push(m);
    }
    return;
  }
  if (puzzleOf(g, leadId).type === 'cipher') {
    const p = cipherOf(g, leadId);
    for (const k of gapDigits(g, leadId)) {
      lp.digits![k] = p.code[k];
      lp.shownDigits!.push(k);
    }
    return;
  }
  if (puzzleOf(g, leadId).type === 'network') {
    const p = networkOf(g, leadId);
    for (const k of gapPairs(g, leadId)) {
      lp.links![k] = 2 - p.links[k]; // 1 in contact, 2 never in contact
      lp.shownPairs!.push(k);
    }
    return;
  }
  const p = gridOf(g, leadId);
  for (const [r, c] of gapCells(g, leadId)) {
    lp.grid[r][c] = p.solution[r][c];
    lp.revealed.push([r, c]);
  }
}

/** Cipher version of gapCells: positions to show so the statements left still give one code. */
export function gapDigits(g: Game, leadId: string): number[] {
  const p = cipherOf(g, leadId);
  const lp = g.s.leads[leadId];
  const said = p.statements.filter((s) => !lp.missingSpeakers.includes(s.speaker)).map((s) => s.claim);
  const shown = [...p.givens.map((x) => x.p), ...lp.shownDigits!];
  const pin = (ps: number[]) => ({ ...p, givens: ps.map((k) => ({ p: k, d: p.code[k] })) });
  let fits = fittingCodes(pin(shown), said);
  const added: number[] = [];
  while (fits.length > 1) {
    let best = -1;
    let bestLeft = fits.length;
    for (let k = 0; k < p.size; k++) {
      if (shown.includes(k) || added.includes(k)) continue;
      const left = fits.filter((c) => c[k] === p.code[k]).length;
      if (left < bestLeft) {
        bestLeft = left;
        best = k;
      }
    }
    fits = fits.filter((c) => c[best] === p.code[best]);
    added.push(best);
  }
  return added;
}

/** Network version of gapCells: pairs to show as decided so the statements left still give one network. */
export function gapPairs(g: Game, leadId: string): number[] {
  const p = networkOf(g, leadId);
  const lp = g.s.leads[leadId];
  const said = p.statements.filter((s) => !lp.missingSpeakers.includes(s.speaker)).map((s) => s.claim);
  const shown = lp.shownPairs!;
  let fits = fittingNetworks(p, said).filter((l) => shown.every((k) => l[k] === p.links[k]));
  const added: number[] = [];
  while (fits.length > 1) {
    let best = -1;
    let bestLeft = fits.length;
    for (let k = 0; k < p.links.length; k++) {
      if (shown.includes(k) || added.includes(k)) continue;
      const left = fits.filter((l) => l[k] === p.links[k]).length;
      if (left < bestLeft) {
        bestLeft = left;
        best = k;
      }
    }
    fits = fits.filter((l) => l[best] === p.links[best]);
    added.push(best);
  }
  return added;
}

/** Timeline version of gapCells: moments to show in place so the statements left still give one order. */
export function gapMoments(g: Game, leadId: string): number[] {
  const p = timelineOf(g, leadId);
  const lp = g.s.leads[leadId];
  const said = p.statements.filter((s) => !lp.missingSpeakers.includes(s.speaker)).map((s) => s.claim);
  const shown = [...p.givens.map((x) => x.m), ...lp.shownMoments!];
  const pin = (ms: number[]) => ({ ...p, givens: ms.map((m) => ({ m, slot: p.solution[m] })) });
  let fits = fittingOrders(pin(shown), said);
  const added: number[] = [];
  while (fits.length > 1) {
    let best = -1;
    let bestLeft = fits.length;
    for (let m = 0; m < p.size; m++) {
      if (shown.includes(m) || added.includes(m)) continue;
      const left = fits.filter((o) => o[m] === p.solution[m]).length;
      if (left < bestLeft) {
        bestLeft = left;
        best = m;
      }
    }
    fits = fits.filter((o) => o[best] === p.solution[best]);
    added.push(best);
  }
  return added;
}

export function fireEvents(g: Game): CaseEvent[] {
  const fired: CaseEvent[] = [];
  for (const ev of g.cf.events) {
    if (g.s.firedEvents.includes(ev.id)) continue;
    const at = ev.effect.type === 'endCase' ? totalHours(g) : ev.at;
    if (g.s.hoursUsed < at) continue;
    g.s.firedEvents.push(ev.id);
    if (ev.ifFlag && !g.s.flags.includes(ev.ifFlag)) continue;
    if (ev.unlessSolved && g.s.leads[ev.unlessSolved].solved) continue;
    const e = ev.effect;
    // once a lead is being worked, its evidence and witnesses are already in hand
    if (e.type !== 'endCase' && g.s.leads[e.lead].started) continue;
    if (e.type === 'removeSpeaker') {
      g.s.leads[e.lead].missingSpeakers.push(e.speaker);
      fillGapLeft(g, e.lead);
    }
    if (e.type === 'addCost') g.s.leads[e.lead].extraCost += e.hours;
    fired.push(ev);
  }
  return fired;
}

export function startLead(g: Game, leadId: string): CaseEvent[] | 'no-time' {
  const lp = g.s.leads[leadId];
  if (lp.started) return [];
  const cost = leadCost(g, leadId);
  if (clockOn(g) && hoursLeft(g) < cost) return 'no-time';
  lp.started = true;
  return spendHours(g, cost);
}

export function recoverSpeaker(g: Game, leadId: string, speaker: string): CaseEvent[] | 'cant' {
  const ev = g.cf.events.find((e) => e.effect.type === 'removeSpeaker' && e.effect.lead === leadId && e.effect.speaker === speaker);
  if (!ev || ev.effect.type !== 'removeSpeaker') return 'cant';
  const { hours, favors } = ev.effect.recover;
  if (g.s.favors < favors || (clockOn(g) && hoursLeft(g) < hours)) return 'cant';
  g.s.favors -= favors;
  g.s.leads[leadId].missingSpeakers = g.s.leads[leadId].missingSpeakers.filter((s) => s !== speaker);
  return spendHours(g, hours);
}

export function spendFavors(g: Game, n: number): boolean {
  if (g.s.favors < n) return false;
  g.s.favors -= n;
  return true;
}

export type CheckResult = 'solved' | 'grid-wrong' | 'grid-incomplete' | 'marks-wrong' | 'marks-incomplete';

export function checkLead(g: Game, leadId: string): CheckResult {
  const p = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  if (p.type === 'timeline') {
    if (lp.order!.some((v) => !v)) return 'grid-incomplete';
    if (lp.order!.some((v, m) => v !== p.solution[m])) return 'grid-wrong';
  } else if (p.type === 'cipher') {
    if (lp.digits!.some((v) => !v)) return 'grid-incomplete';
    if (lp.digits!.some((v, k) => v !== p.code[k])) return 'grid-wrong';
  } else if (p.type === 'network') {
    if (lp.links!.some((v) => !v)) return 'grid-incomplete';
    if (lp.links!.some((v, k) => (v === 1) !== (p.links[k] === 1))) return 'grid-wrong';
  } else {
    if (lp.grid.some((row) => row.some((v) => !v))) return 'grid-incomplete';
    if (lp.grid.some((row, r) => row.some((v, c) => v !== p.solution[r][c]))) return 'grid-wrong';
  }
  const visible = p.statements.map((s) => !lp.missingSpeakers.includes(s.speaker));
  if (lp.marks.some((m, i) => visible[i] && m === 'unknown')) return 'marks-incomplete';
  if (lp.marks.some((m, i) => visible[i] && (m === 'lie') !== !p.truth[i])) return 'marks-wrong';
  return 'solved';
}

export function solveLead(g: Game, leadId: string) {
  const p = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  lp.solved = true;
  const lies = p.truth.filter((t) => !t).length;
  if (lies) g.s.favors += 1; // exposing a liar earns a favor (rule book section 3)
  for (const [i, s] of p.statements.entries()) {
    const who = g.cf.cast.find((c) => c.id === s.speaker);
    if (!p.truth[i] && who?.reliability === 'double-agent') addFlag(g, `${who.id}-exposed`);
  }
}

export function addFlag(g: Game, f: string) {
  if (!g.s.flags.includes(f)) g.s.flags.push(f);
}

export type Trust = 'unknown' | 'suspicious' | 'caught' | 'mistaken' | 'verified' | 'refuses';

/** Trust meter (rule book section 3), from solved leads plus the player's current marks. */
export function trustOf(g: Game, personId: string): Trust {
  if (refusing(g, personId)) return 'refuses';
  let saidSomething = false;
  let caught = false;
  let mistaken = false;
  let suspicious = false;
  const person = g.cf.cast.find((c) => c.id === personId);
  for (const lead of g.cf.leads) {
    const p = puzzleOf(g, lead.id);
    const lp = g.s.leads[lead.id];
    p.statements.forEach((s, i) => {
      if (s.speaker !== personId) return;
      if (lp.solved) {
        saidSomething = true;
        if (!p.truth[i]) person?.reliability === 'mistaken' ? (mistaken = true) : (caught = true);
      } else if (lp.started && lp.marks[i] === 'lie') suspicious = true;
    });
  }
  if (caught) return 'caught';
  if (mistaken) return 'mistaken';
  if (suspicious) return 'suspicious';
  return saidSomething ? 'verified' : 'unknown';
}

/** The informant sells one extra (true) statement for the current puzzle. */
export function buyTip(g: Game, leadId: string, informant: string): AnyClaim | 'cant' {
  const any = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  if (g.s.flags.includes(`${informant}-exposed`)) return 'cant';
  if (g.s.favors < 1 || (clockOn(g) && hoursLeft(g) < 1)) return 'cant';
  const rng = makeRng(g.s.hoursUsed * 131 + lp.paidTips.length * 977 + any.seed);
  if (any.type === 'timeline') {
    const have = [...any.statements.map((s) => s.claim), ...(lp.paidTips.map((x) => x.claim) as TimeClaim[])];
    const tc = freshTrueTimeClaim(any, have, rng);
    /* v8 ignore next -- a 4-moment timeline still has fresh true claims left */
    if (!tc) return 'cant';
    g.s.favors -= 1;
    spendHours(g, 1);
    lp.paidTips.push({ speaker: informant, claim: tc });
    return tc;
  }
  if (any.type === 'cipher') {
    const have = [...any.statements.map((s) => s.claim), ...(lp.paidTips.map((x) => x.claim) as CipherClaim[])];
    const cc = freshTrueCipherClaim(any, have, rng);
    /* v8 ignore next -- a 4-digit code still has fresh true claims left */
    if (!cc) return 'cant';
    g.s.favors -= 1;
    spendHours(g, 1);
    lp.paidTips.push({ speaker: informant, claim: cc });
    return cc;
  }
  if (any.type === 'network') {
    const have = [...any.statements.map((s) => s.claim), ...(lp.paidTips.map((x) => x.claim) as NetClaim[])];
    const nc = freshTrueNetClaim(any, have, rng);
    /* v8 ignore next -- a 4-person network still has fresh true claims left */
    if (!nc) return 'cant';
    g.s.favors -= 1;
    spendHours(g, 1);
    lp.paidTips.push({ speaker: informant, claim: nc });
    return nc;
  }
  const p = any;
  const known = new Set(p.statements.map((s) => JSON.stringify(s.claim)));
  // draws a few hundred random claims and keeps the first true one the player doesn't already have
  const draws = Array.from({ length: 500 }, () => randomClaim(p.solution, p.type, rng));
  const c = draws.find((d) => evalClaim(d, p.solution) && !known.has(JSON.stringify(d)));
  /* v8 ignore next -- 500 random draws always find a fresh true claim on real puzzles */
  if (!c) return 'cant';
  g.s.favors -= 1;
  spendHours(g, 1);
  lp.paidTips.push({ speaker: informant, claim: c });
  return c;
}

// ---------- accusations (rule book section 3) ----------

export const timeUp = (g: Game) => clockOn(g) && hoursLeft(g) <= 0;
/** Someone who was accused without proof stops helping the player. */
export const refusing = (g: Game, personId: string) => g.s.flags.includes(`refuses:${personId}`);
export const failedTries = (g: Game, personId: string) => (g.s.accuseLog ?? []).filter((t) => t.person === personId && !t.ok).length;
export const accusedPeople = (g: Game) => [...new Set((g.s.accuseLog ?? []).map((t) => t.person))];
export const triesLeft = (g: Game, personId: string) => Math.max(0, rules(g).accuse.perPerson - failedTries(g, personId));

/** Whether this person can be accused now, and if not, why not. */
export function accuseStatus(g: Game, personId: string): 'ok' | 'locked' | 'no-room' {
  if (triesLeft(g, personId) === 0) return 'locked';
  if (!accusedPeople(g).includes(personId) && accusedPeople(g).length >= rules(g).accuse.people) return 'no-room';
  return 'ok';
}
export const canAccuse = (g: Game, personId: string) => accuseStatus(g, personId) === 'ok';

/** True while someone who can be convicted is still open to accusation. */
export const canStillWin = (g: Game) => Object.keys(g.cf.proof ?? {}).some((p) => canAccuse(g, p));

/** The proven facts the player can lean on in an accusation: one per solved lead. */
export const evidenceLeads = (g: Game) => g.cf.leads.filter((l) => g.s.leads[l.id].solved);

/** Proof holds when it covers everything this person needs and every fact chosen points at them. */
export function proofHolds(g: Game, personId: string, evidence: string[]): boolean {
  const needs = g.cf.proof?.[personId]?.needs;
  if (!needs) return false;
  const chosen = new Set(evidence);
  if (!needs.every((id) => chosen.has(id))) return false;
  return evidence.every((id) => {
    if (id.startsWith('carried:')) {
      const c = carriedEvidence(g.cf, g.s.preset);
      return c?.id === id && !!c.pointsTo?.includes(personId);
    }
    const lead = g.cf.leads.find((l) => l.id === id);
    return !!lead && g.s.leads[id].solved && !!lead.pointsTo?.includes(personId);
  });
}

/** Why a proof fails: facts that don't count against this person, and whether something they need is missing. */
export function proofProblems(g: Game, personId: string, evidence: string[]): { wrong: string[]; incomplete: boolean } {
  const needs = g.cf.proof?.[personId]?.needs ?? [];
  const chosen = new Set(evidence);
  const wrong = evidence.filter((id) => {
    const lead = g.cf.leads.find((l) => l.id === id);
    return !(lead && g.s.leads[id].solved && lead.pointsTo?.includes(personId));
  });
  return { wrong, incomplete: !needs.length || !needs.every((id) => chosen.has(id)) };
}

export type AccuseResult =
  | { kind: 'blocked'; why: 'locked' | 'no-room' }
  | { kind: 'accepted'; ending: Ending }
  | { kind: 'rejected'; triesLeft: number; locked: boolean; refuses: boolean; lost?: 'time' | 'limits' };

/**
 * An accusation with the facts the player leans on. It only holds when the proof is valid; otherwise it costs a try.
 * An innocent person who is accused stops helping: leads where they speak cost one more hour.
 */
export function submitAccusation(g: Game, personId: string, evidence: string[]): AccuseResult {
  const status = accuseStatus(g, personId);
  if (status !== 'ok') return { kind: 'blocked', why: status };
  g.s.accuseLog ??= [];
  if (proofHolds(g, personId, evidence)) {
    g.s.accuseLog.push({ person: personId, ok: true });
    return { kind: 'accepted', ending: accuse(g, personId) };
  }
  g.s.accuseLog.push({ person: personId, ok: false });
  const innocent = !g.cf.proof?.[personId];
  if (innocent) {
    addFlag(g, `refuses:${personId}`);
    if (clockOn(g)) {
      for (const lead of g.cf.leads) {
        const lp = g.s.leads[lead.id];
        if (!lp.started && puzzleOf(g, lead.id).statements.some((s) => s.speaker === personId)) lp.extraCost += 1;
      }
    }
  }
  const lost = timeUp(g) ? 'time' : !canStillWin(g) ? 'limits' : undefined;
  if (lost) g.s.lost = lost;
  return { kind: 'rejected', triesLeft: triesLeft(g, personId), locked: triesLeft(g, personId) === 0, refuses: innocent, lost };
}

export function accuse(g: Game, personId: string): Ending {
  g.s.accused = personId;
  const has = (req: string) => g.s.flags.includes(req) || g.s.leads[req]?.solved;
  const ending =
    g.cf.endings.find((e) => e.accuse.includes(personId) && (e.requires ?? []).every(has)) ??
    g.cf.endings.find((e) => e.accuse.includes(personId) && !e.requires) ??
    g.cf.endings[g.cf.endings.length - 1];
  g.s.endingId = ending.id;
  return ending;
}

export function stars(g: Game): number {
  if (g.s.endingId !== g.cf.endings[0].id) return g.s.endingId === g.cf.endings[1]?.id ? 1 : 0;
  return g.s.hintsUsed === 0 ? 3 : g.s.hintsUsed <= 3 ? 2 : 1;
}
