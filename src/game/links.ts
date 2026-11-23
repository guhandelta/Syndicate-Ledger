/**
 * Linked puzzles (docs/LINKED-PUZZLES.md, "chain"): clues in a later puzzle that quote an earlier answer.
 * `planLinks` picks them from the earlier answers; the generators plant them (true on the new answer, said first);
 * `describeLinked` words them as pointers back; `checkLinks` proves they are real.
 */
import type { CipherClaim } from '../engine/cipher';
import { verifyCipher } from '../engine/cipher';
import type { NetClaim } from '../engine/network';
import { verifyNetwork } from '../engine/network';
import type { Rng } from '../engine/rng';
import type { StakeClaim } from '../engine/stakeout';
import { verifyStakeout } from '../engine/stakeout';
import type { TimeClaim } from '../engine/timeline';
import { verifyTimeline } from '../engine/timeline';
import type { Claim, GeneratedPuzzle } from '../engine/types';
import { verifyUnique } from '../engine/generator';
import { refHolder, refNumber, type AnyAnswered, type LinkRef, type Via } from '../engine/via';
import type { CaseFile, Lead, LinkSpec, Preset } from './caseTypes';
import { LINK_RULES } from './presets';
import { at, describeStatement, gridLabels, networkPeople, stakeoutLabels, t, timelineLabels, the, type Tone } from './text';

export interface Planted<C> {
  speaker: string;
  claim: C;
  via: Via;
}

/** The earlier answers, by lead id, for the rank being built. */
export type Answers = Record<string, AnyAnswered | undefined>;

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** The link specs a lead has at a rank. */
export const linksFor = (lead: Lead, preset: Preset): LinkSpec[] => (lead.links ?? []).filter((l) => !l.ranks || l.ranks.includes(preset));

/** Who says a link clue: the spec's speaker, else a witness who tells no lie at this rank. */
function speakerFor(cf: CaseFile, lead: Lead, preset: Preset, spec: LinkSpec): string {
  if (spec.speaker) return spec.speaker;
  const liars = lead.liars[preset] ?? [];
  // not someone an event can send away: the clue would be lost with them
  const leaves = cf.events.flatMap((e) => (e.effect.type === 'removeSpeaker' && e.effect.lead === lead.id ? [e.effect.speaker] : []));
  return lead.speakers.find((s) => !liars.includes(s) && !leaves.includes(s)) ?? lead.speakers.find((s) => !liars.includes(s)) ?? lead.speakers[0];
}

/** Picks a ref in an earlier answer whose number is in [lo, hi]. Null when it has none. */
function pickNumber(src: AnyAnswered, rng: Rng, lo: number, hi: number, indirect: boolean): { ref: LinkRef; value: number } | null {
  for (let tries = 0; tries < 60; tries++) {
    let ref: LinkRef;
    if (src.type === 'timeline') ref = { kind: 'slot', m: rng.int(0, src.size - 1) };
    else if (src.type === 'network') ref = { kind: 'degree', p: rng.int(0, src.size - 1) };
    else if (src.type === 'cipher') ref = { kind: 'digit', p: rng.int(0, src.size - 1) };
    else if (src.type === 'stakeout') ref = { kind: 'spot', z: rng.int(0, src.size - 1), axis: rng.pick(['row', 'col'] as const) };
    else {
      const r = rng.int(0, src.size - 1);
      const c = rng.int(0, src.size - 1);
      const c2 = (c + 1) % src.size;
      ref = { kind: 'cell', r, c, ...(indirect && src.size > 1 ? { by: { c: c2, v: src.solution[r][c2] } } : {}) };
    }
    const value = refNumber(src, ref);
    if (value >= lo && value <= hi) return { ref, value };
  }
  return null;
}

/**
 * Chooses a lead's link clues at a rank from the earlier answers. Throws when an earlier lead is missing:
 * links only ever quote leads that open before this one.
 */
export function planLinks(cf: CaseFile, preset: Preset, lead: Lead, size: number, answers: Answers, rng: Rng): Planted<never>[] {
  const out: Planted<never>[] = [];
  const indirect = LINK_RULES[preset].indirect;
  for (const spec of linksFor(lead, preset)) {
    const src = answers[spec.from];
    if (!src) throw new Error(`${lead.id}: link quotes ${spec.from}, which is not built yet`);
    const srcLead = cf.leads.find((l) => l.id === spec.from)!;
    const speaker = speakerFor(cf, lead, preset, spec);
    const herring = spec.herring ? { herring: true as const } : {};
    const cellOf = (): [number, number] => [rng.int(0, size - 1), rng.int(0, size - 1)];
    const done = (claim: unknown, ref: LinkRef) => out.push({ speaker, claim, via: { lead: spec.from, ref, ...herring, ...(spec.story ? { story: spec.story } : {}) } } as Planted<never>);
    const two = (n: number): [number, number] => {
      const a = rng.int(0, n - 1);
      return [a, (a + 1 + rng.int(0, n - 2)) % n];
    };

    if (spec.take === 'person') {
      if (lead.type !== 'network' || spec.use !== 'linked') throw new Error(`${lead.id}: a person link is used in a network lead as "linked"`);
      if (src.type !== 'ledger' && src.type !== 'surveillance') throw new Error(`${lead.id}: a person link quotes a grid lead`);
      // whoever has this value in this row, if the network has them
      let placed = false;
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const ref: LinkRef = { kind: 'holder', r: rng.int(0, src.size - 1), v: rng.int(1, src.size) };
        const id = srcLead.columns[refHolder(src, ref)];
        const a = lead.columns.slice(0, size).indexOf(id);
        if (a < 0) continue;
        const [b] = two(size).filter((x) => x !== a);
        const claim: NetClaim = { kind: 'linked', a, b };
        done(claim, ref);
        placed = true;
      }
      if (!placed) throw new Error(`${lead.id}: no person of ${spec.from} is in this network`);
      continue;
    }

    if (lead.type === 'ledger' || lead.type === 'surveillance') {
      if (spec.use === 'sum') {
        const n = pickNumber(src, rng, 3, 2 * size - 1, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number to add up to`);
        const r = rng.int(0, size - 1);
        const [a, b] = two(size);
        done({ kind: 'sum', cells: [[r, a], [r, b]], value: n.value } satisfies Claim, n.ref);
      } else {
        const n = pickNumber(src, rng, 1, size, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a cell`);
        done({ kind: 'is', cell: cellOf(), value: n.value } satisfies Claim, n.ref);
      }
    } else if (lead.type === 'timeline') {
      if (spec.use === 'is') {
        // Junior timelines never need "two apart", so the number names the time itself
        const n = pickNumber(src, rng, 1, size, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a time`);
        done({ kind: 'at', m: rng.int(0, size - 1), slot: n.value } satisfies TimeClaim, n.ref);
      } else {
        const n = pickNumber(src, rng, 1, size - 1, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a gap`);
        const [a, b] = two(size);
        done({ kind: 'apart', a, b, gap: n.value } satisfies TimeClaim, n.ref);
      }
    } else if (lead.type === 'cipher') {
      const [a, b] = two(size);
      if (spec.use === 'apart') {
        const n = pickNumber(src, rng, 1, size, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a gap`);
        done({ kind: 'apart', a, b, gap: n.value } satisfies CipherClaim, n.ref);
      } else {
        const n = pickNumber(src, rng, 1, size, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a digit`);
        done({ kind: 'is', p: a, d: n.value } satisfies CipherClaim, n.ref);
      }
    } else if (lead.type === 'stakeout') {
      const axis = rng.pick(['row', 'col'] as const);
      if (spec.use === 'apart') {
        const n = pickNumber(src, rng, 1, size - 1, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a gap`);
        const [a, b] = two(size);
        done({ kind: 'gap', axis, a, b, gap: n.value } satisfies StakeClaim, n.ref);
      } else if (spec.use === 'is') {
        const n = pickNumber(src, rng, 1, size, indirect);
        if (!n) throw new Error(`${lead.id}: ${spec.from} has no number for a row or column`);
        done({ kind: axis, z: rng.int(0, size - 1), value: n.value } satisfies StakeClaim, n.ref);
      } else throw new Error(`${lead.id}: a stakeout lead uses a number as "is" or "apart"`);
    } else {
      throw new Error(`${lead.id}: a number link cannot be used in a ${lead.type} lead`);
    }
  }
  return out;
}

/** The earlier answer, in words: a number or a person, named by where it comes from. */
function phrase(cf: CaseFile, via: Via, answers: Answers, tone: Tone): string {
  const src = answers[via.lead]!;
  const lead = cf.leads.find((l) => l.id === via.lead)!;
  const title = `“${t(lead.title, tone)}”`;
  const { ref } = via;
  if (ref.kind === 'slot') {
    const L = timelineLabels(lead, src.size, tone);
    return `the place in the night (1st is the earliest) of ${`“${L.moments[ref.m]}”`} in ${title}`;
  }
  if (ref.kind === 'degree') return `how many people ${networkPeople(cf, lead, src.size)[ref.p]} was in contact with in ${title}`;
  if (ref.kind === 'digit') return `the ${ORDINALS[ref.p]} digit of the code in ${title}`;
  if (ref.kind === 'spot') {
    const L = stakeoutLabels(lead, src.size, tone);
    return `the ${ref.axis === 'row' ? 'row' : 'column'} number of ${L.districts[ref.z]}’s ${L.one} in ${title}`;
  }
  const L = gridLabels(cf, lead, src.size, tone);
  const ledger = lead.type === 'ledger';
  if (ref.kind === 'holder')
    return ledger
      ? `the person who moved ${L.value(ref.v)} ${at(L.times[ref.r])} in ${title}`
      : `whoever was in ${the(L.value(ref.v))} ${at(L.times[ref.r])} in ${title}`;
  // a cell
  const P = L.people[ref.c];
  if (ref.by) {
    const Q = L.people[ref.by.c];
    return ledger
      ? `what ${P} moved in the hour ${Q} moved ${L.value(ref.by.v)} in ${title}`
      : `the number of the room ${P} was in when ${Q} was in ${the(L.value(ref.by.v))} in ${title}`;
  }
  return ledger ? `what ${P} moved ${at(L.times[ref.r])} in ${title}` : `the number of the room ${P} was in ${at(L.times[ref.r])} in ${title}`;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A link clue in plain words, quoting where the number or person comes from. */
export function describeLinked(cf: CaseFile, lead: Lead, p: AnyAnswered, st: { claim: unknown; via: Via }, answers: Answers, tone: Tone): string {
  const q = phrase(cf, st.via, answers, tone);
  const story = st.via.story;
  const told = (fill: { a?: string; b?: string; when?: string }) =>
    (tone === 'friendly' ? story!.friendly ?? story!.crime : story!.crime).replace(/\{(a|b|when|q)\}/g, (_, k: string) => (k === 'q' ? q : fill[k as 'a' | 'b' | 'when'] ?? ''));
  if (p.type === 'timeline') {
    const c = st.claim as TimeClaim;
    const L = timelineLabels(lead, p.size, tone);
    if (story && c.kind === 'at') return told({ a: `“${L.moments[c.m]}”` });
    if (story && c.kind === 'apart') return told({ a: `“${L.moments[c.a]}”`, b: `“${L.moments[c.b]}”` });
    if (c.kind === 'at') return `“${L.moments[c.m]}” happened at the time numbered ${q} (the first time is 1).`;
    if (c.kind !== 'apart') return describeStatement(cf, lead, p as never, c, tone);
    return `“${L.moments[c.a]}” and “${L.moments[c.b]}” were as many ${L.step}s apart as ${q}.`;
  }
  if (p.type === 'cipher') {
    const c = st.claim as CipherClaim;
    const D = (k: number) => `the ${ORDINALS[k]} digit`;
    if (story && c.kind === 'is') return told({ a: D(c.p) });
    if (story && c.kind === 'apart') return told({ a: D(c.a), b: D(c.b) });
    if (c.kind === 'is') return `${cap(D(c.p))} is ${q}.`;
    if (c.kind === 'apart') return `${cap(D(c.a))} and ${D(c.b)} are ${q} apart.`;
  }
  if (p.type === 'stakeout') {
    const c = st.claim as StakeClaim;
    const L = stakeoutLabels(lead, p.size, tone);
    const W = (z: number) => `${L.districts[z]}’s ${L.one}`;
    if (story && c.kind === 'gap') return told({ a: W(c.a), b: W(c.b), when: c.axis === 'row' ? 'rows' : 'columns' });
    if (story && (c.kind === 'row' || c.kind === 'col')) return told({ a: W(c.z), when: c.kind === 'row' ? 'row' : 'column' });
    if (c.kind === 'row') return `${W(c.z)} stood in the row whose number is ${q} (the top row is 1).`;
    if (c.kind === 'col') return `${W(c.z)} stood in the column whose number is ${q} (the left column is 1).`;
    // the only other link clue is a gap
    const g = c as StakeClaim & { kind: 'gap' };
    return `${W(g.a)} and ${W(g.b)} stood as many ${g.axis === 'row' ? 'rows' : 'columns'} apart as ${q}.`;
  }
  if (p.type === 'network') {
    const c = st.claim as NetClaim & { kind: 'linked' };
    const people = networkPeople(cf, lead, p.size);
    if (story) return told({ a: people[c.b] });
    return `${people[c.b]} was in contact with ${q}.`;
  }
  const L = gridLabels(cf, lead, p.size, tone);
  const c = st.claim as Claim;
  if (story && c.kind === 'is') return told({ a: L.people[c.cell[1]], when: at(L.times[c.cell[0]]) });
  if (story && c.kind === 'sum') return told({ a: L.people[c.cells[0][1]], b: L.people[c.cells[1][1]], when: at(L.times[c.cells[0][0]]) });
  if (c.kind === 'is') return p.type === 'ledger' ? `${L.people[c.cell[1]]}’s ${L.times[c.cell[0]]} figure equals ${q}.` : `${L.people[c.cell[1]]}’s room number ${at(L.times[c.cell[0]])} equals ${q}.`;
  if (c.kind === 'sum') return `${cap(at(L.times[c.cells[0][0]]))}, ${L.people[c.cells[0][1]]}’s and ${L.people[c.cells[1][1]]}’s figures add up to ${q}.`;
  return describeStatement(cf, lead, p, c, tone);
}

/** A statement in words, quoting earlier answers when it is a link clue. */
export function wordStatement(cf: CaseFile, lead: Lead, p: AnyAnswered, st: { claim: unknown; via?: Via }, answers: Answers, tone: Tone): string {
  if (st.via && answers[st.via.lead]) return describeLinked(cf, lead, p, { claim: st.claim, via: st.via }, answers, tone);
  return describeStatement(cf, lead, p as never, st.claim as never, tone);
}

export interface LinkCheck {
  ok: boolean;
  reason?: string;
}

/** The puzzle with only some of its statements, for the two proofs below. */
function trimmed(p: AnyAnswered, keep: (i: number) => boolean, liarCounts?: number[]): AnyAnswered {
  const idx = p.statements.map((_, i) => i).filter(keep);
  return { ...p, statements: idx.map((i) => p.statements[i]), truth: idx.map((i) => p.truth[i]), ...(liarCounts ? { liarCounts } : {}) } as AnyAnswered;
}

const unique = (p: AnyAnswered): boolean =>
  (p.type === 'timeline' ? verifyTimeline(p) : p.type === 'cipher' ? verifyCipher(p) : p.type === 'stakeout' ? verifyStakeout(p) : p.type === 'network' ? verifyNetwork(p) : verifyUnique(p as GeneratedPuzzle)).ok;

/**
 * The two proofs that make a link real:
 *  - needed: without the link clues the puzzle has more than one answer, so the player can't skip the link;
 *  - not enough alone: the link clues (with the base clues) don't settle it, so the player can't skip the puzzle.
 * A herring is a true clue left out of the first proof.
 */
export function checkLinks(p: AnyAnswered): LinkCheck {
  const hasLink = p.statements.some((s) => s.via);
  if (!hasLink) return { ok: true };
  const needed = p.statements.some((s) => s.via && !s.via.herring);
  if (needed && unique(trimmed(p, (i) => !(p.statements[i].via && !p.statements[i].via!.herring)))) return { ok: false, reason: 'the puzzle is solved without its link clues' };
  if (unique(trimmed(p, (i) => !!p.statements[i].via, [0]))) return { ok: false, reason: 'the link clues alone settle the puzzle' };
  return { ok: true };
}

/** A link's claim must carry the same number or person its `via` points at in the earlier answer. */
export function linkResolves(cf: CaseFile, lead: Lead, p: AnyAnswered, st: { claim: unknown; via: Via }, answers: Answers): string | null {
  const src = answers[st.via.lead];
  const srcLead = cf.leads.find((l) => l.id === st.via.lead);
  if (!src || !srcLead) return `quotes ${st.via.lead}, which is not there`;
  const { ref } = st.via;
  if (ref.kind === 'holder') {
    const id = srcLead.columns[refHolder(src, ref)];
    const a = (st.claim as NetClaim & { kind: 'linked' }).a;
    return lead.columns[a] === id ? null : `points at ${id}, but the clue is about ${lead.columns[a]}`;
  }
  const want = refNumber(src, ref);
  const c = st.claim as Record<string, unknown>;
  const got = (c.value ?? c.gap ?? c.d ?? c.slot) as number;
  return got === want ? null : `quotes ${want}, but the clue says ${got}`;
}
