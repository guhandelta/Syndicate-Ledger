import type { CastMember, Condition, Line, Opinion } from './caseTypes';
import { trustOf, type Game } from './state';

/** Whether a line's condition holds now. No condition always holds. */
export function meets(g: Game, c: Condition | undefined): boolean {
  if (!c) return true;
  const solved = (id: string) => !!g.s.leads[id]?.solved;
  const flag = (f: string) => g.s.flags.includes(f);
  const accused = (id: string) => (g.s.accuseLog ?? []).some((a) => a.person === id) || g.s.accused === id;
  return (
    (c.solved ?? []).every(solved) &&
    !(c.unsolved ?? []).some(solved) &&
    (c.flags ?? []).every(flag) &&
    !(c.notFlags ?? []).some(flag) &&
    (c.accused ?? []).every(accused) &&
    !(c.notAccused ?? []).some(accused) &&
    (c.caught ?? []).every((id) => trustOf(g, id) === 'caught') &&
    (!c.character || c.character.includes(g.s.character ?? 'detective')) &&
    (!c.rank || c.rank.includes(g.s.preset))
  );
}

/** What a person says when the player walks up: the first greeting whose condition holds, else their usual one. */
export function greetingFor(g: Game, person: CastMember): Line | undefined {
  return (person.greetings ?? []).find((l) => meets(g, l.when)) ?? (meets(g, person.greeting?.when) ? person.greeting : undefined);
}

/** The opinions a person will give right now, one per person they talk about (the first that holds). */
export function opinionsOf(g: Game, person: CastMember): Opinion[] {
  const out: Opinion[] = [];
  for (const o of person.opinions ?? []) if (meets(g, o.when) && !out.some((x) => x.about === o.about)) out.push(o);
  return out;
}

const heardKey = (speaker: string, about: string) => `${speaker}:${about}`;

/** Remembers that the player heard what `speaker` thinks of `about`. */
export function hearOpinion(g: Game, speaker: string, about: string) {
  const k = heardKey(speaker, about);
  g.s.heard = g.s.heard ?? [];
  if (!g.s.heard.includes(k)) g.s.heard.push(k);
}

/** Everything the player has heard others say about a person, for the notebook: who said it and what, as it is now. */
export function heardAbout(g: Game, about: string): { speaker: CastMember; opinion: Opinion }[] {
  return g.cf.cast.flatMap((speaker) => {
    if (!(g.s.heard ?? []).includes(heardKey(speaker.id, about))) return [];
    const opinion = opinionsOf(g, speaker).find((o) => o.about === about);
    return opinion ? [{ speaker, opinion }] : [];
  });
}
