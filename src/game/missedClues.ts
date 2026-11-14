import type { ClueEvent, ClueWhen, MissedClue } from './caseTypes';
import { puzzleOf, type Game } from './state';

/** Mistakes the player just made on a lead's statements, after a failed check. */
export function markMistakes(g: Game, leadId: string): ClueEvent[] {
  const p = puzzleOf(g, leadId);
  const lp = g.s.leads[leadId];
  const out: ClueEvent[] = [];
  p.statements.forEach((s, i) => {
    if (lp.missingSpeakers.includes(s.speaker)) return;
    const m = lp.marks[i];
    if (m === 'unknown') {
      out.push({ kind: 'unmarked', lead: leadId, speaker: s.speaker });
    } else if ((m === 'lie') !== !p.truth[i]) {
      out.push({ kind: 'wrong-mark', lead: leadId, speaker: s.speaker, marked: m === 'lie' ? 'lie' : 'true' });
    }
  });
  return out;
}

/** True when the accused has no statement in any solved lead. */
function uncheckedBy(g: Game, personId: string): boolean {
  return !g.cf.leads.some((lead) => g.s.leads[lead.id].solved && puzzleOf(g, lead.id).statements.some((s) => s.speaker === personId));
}

function matches(g: Game, w: ClueWhen, ev: ClueEvent): boolean {
  if (w.kind !== ev.kind) return false;
  switch (w.kind) {
    case 'wrong-mark':
      return ev.kind === 'wrong-mark' && w.lead === ev.lead && w.speaker === ev.speaker && w.marked === ev.marked;
    case 'unmarked':
      return ev.kind === 'unmarked' && w.lead === ev.lead && w.speaker === ev.speaker;
    case 'event':
      return ev.kind === 'event' && w.event === ev.event && (!w.flag || g.s.flags.includes(w.flag));
    case 'accuse': {
      if (ev.kind !== 'accuse') return false;
      if (w.person && w.person !== ev.person) return false;
      if (w.unsolved && g.s.leads[w.unsolved].solved) return false;
      if (w.solved && !g.s.leads[w.solved].solved) return false;
      if (w.missingFlag && g.s.flags.includes(w.missingFlag)) return false;
      if (w.unchecked && !uncheckedBy(g, ev.person)) return false;
      return true;
    }
  }
}

/**
 * Clues for an observed action. Pure: nothing is recorded here, so the caller
 * calls markCluesShown for the ones it actually shows. Accusation nudges repeat
 * on every accusation prompt, so they are never filtered by what was shown.
 */
export function pendingClues(g: Game, ev: ClueEvent): MissedClue[] {
  const shown = g.s.cluesShown ?? [];
  return (g.cf.missedClues ?? []).filter(
    (c) => c.presets.includes(g.s.preset) && (ev.kind === 'accuse' || !shown.includes(c.id)) && matches(g, c.when, ev),
  );
}

export function markCluesShown(g: Game, clues: MissedClue[]) {
  const shown = g.s.cluesShown ?? [];
  g.s.cluesShown = [...shown, ...clues.map((c) => c.id).filter((id) => !shown.includes(id))];
}
