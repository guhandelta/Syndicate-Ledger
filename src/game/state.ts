import { evalClaim } from '../engine/claims';
import { randomClaim } from '../engine/generator';
import { makeRng } from '../engine/rng';
import type { Claim, GeneratedPuzzle, Grid } from '../engine/types';
import type { CaseEvent, CaseFile, Ending, Preset, PuzzleBook } from './caseTypes';
import { PRESET_RULES } from './presets';

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
  paidTips: { speaker: string; claim: Claim }[];
  /** speakers removed by an event and not yet recovered */
  missingSpeakers: string[];
  revealed: [number, number][];
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
}

export interface Game {
  cf: CaseFile;
  book: PuzzleBook;
  s: GameState;
}

export function newGame(cf: CaseFile, book: PuzzleBook, preset: Preset): Game {
  const rules = PRESET_RULES[preset];
  const leads: Record<string, LeadProgress> = {};
  for (const lead of cf.leads) {
    const p = book[`${lead.id}:${preset}`];
    leads[lead.id] = {
      started: false,
      solved: false,
      grid: p.solution.map((row) => row.map(() => 0)),
      notes: p.solution.map((row) => row.map(() => 0)),
      marks: p.statements.map(() => 'unknown'),
      extraCost: 0,
      paidTips: [],
      missingSpeakers: [],
      revealed: [],
    };
    for (const g of p.givens) leads[lead.id].grid[g.cell[0]][g.cell[1]] = g.value;
  }
  return {
    cf,
    book,
    s: { version: 1, caseId: cf.id, preset, hoursUsed: 0, favors: rules.startFavors, flags: [], firedEvents: [], offersSeen: [], leads, log: [], hintsUsed: 0 },
  };
}

export const puzzleOf = (g: Game, leadId: string): GeneratedPuzzle => g.book[`${leadId}:${g.s.preset}`];
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
    if (e.type === 'removeSpeaker') g.s.leads[e.lead].missingSpeakers.push(e.speaker);
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
  if (lp.grid.some((row) => row.some((v) => !v))) return 'grid-incomplete';
  if (lp.grid.some((row, r) => row.some((v, c) => v !== p.solution[r][c]))) return 'grid-wrong';
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
export function buyTip(g: Game, leadId: string, informant: string): Claim | 'cant' {
  const p = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  if (g.s.flags.includes(`${informant}-exposed`)) return 'cant';
  if (g.s.favors < 1 || (clockOn(g) && hoursLeft(g) < 1)) return 'cant';
  const rng = makeRng(g.s.hoursUsed * 131 + lp.paidTips.length * 977 + p.seed);
  const known = new Set(p.statements.map((s) => JSON.stringify(s.claim)));
  for (let i = 0; i < 500; i++) {
    const c = randomClaim(p.solution, p.type, rng);
    if (!evalClaim(c, p.solution) || known.has(JSON.stringify(c))) continue;
    // must say something not already obvious from the player's grid
    g.s.favors -= 1;
    spendHours(g, 1);
    lp.paidTips.push({ speaker: informant, claim: c });
    return c;
  }
  return 'cant';
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
    const lead = g.cf.leads.find((l) => l.id === id);
    return !!lead && g.s.leads[id].solved && !!lead.pointsTo?.includes(personId);
  });
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
