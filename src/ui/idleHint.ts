import { nextStep } from '../engine/logic';
import type { Lead } from '../game/caseTypes';
import { checkLead, clockOn, hoursLeft, leadCost, leadOpen, puzzleOf, type Game } from '../game/state';
import { gridLabels, t, type Tone } from '../game/text';
import type { Town } from '../town/townTypes';
import { findWrong } from './puzzleHelpers';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const when = (time: string) => (DAYS.includes(time) ? `on ${time}` : /^[A-Z][a-z]{2}$/.test(time) ? `in ${time}` : `at ${time}`);

/** After this long with no key, click or tap, a nudge pops up in the corner. */
export const IDLE_MS = 5 * 60 * 1000;

export interface IdleHint {
  /** Where the player is, in a few words. */
  where: string;
  /** What to do next, in one or two sentences. Points the way, never gives an answer away. */
  todo: string;
}

export interface IdleContext {
  game: Game | null;
  screen: 'title' | 'intro' | 'board' | 'town' | 'puzzle' | 'accuse' | 'verdict';
  leadId: string | null;
  town: Town | null;
  /** A dialog is waiting for an answer. */
  dialog: boolean;
  tone: Tone;
}

/** What the player can do right now and what they should do next, for the screen they are on. */
export function idleHint(ctx: IdleContext): IdleHint {
  const { game: g, screen, tone } = ctx;
  const kid = tone === 'friendly';
  if (ctx.dialog) return { where: 'A message is waiting', todo: 'Read it, then pick one of its buttons to carry on.' };
  if (!g || screen === 'title') {
    return { where: 'The start screen', todo: 'Pick a rank (Junior is the gentlest), then press Open the case. Press ? any time for help.' };
  }
  if (screen === 'intro') return { where: 'The case briefing', todo: 'Read what happened, then go on to the evidence board to pick your first lead.' };
  if (screen === 'verdict') return { where: 'The case is closed', todo: 'Read your ending. Start over from the menu (☰) to try another rank or chase a different ending.' };

  const leadName = (l: Lead) => t(l.title, tone);
  const door = (l: Lead) => ctx.town?.doors.find((d) => d.lead === l.id)?.label;
  const started = g.cf.leads.find((l) => g.s.leads[l.id].started && !g.s.leads[l.id].solved);
  const open = g.cf.leads.filter((l) => leadOpen(g, l.id) && !g.s.leads[l.id].started);
  const allSolved = g.cf.leads.every((l) => g.s.leads[l.id].solved);

  if (screen === 'accuse') {
    return allSolved
      ? { where: 'The accusation', todo: 'Every lead is solved. Think about who the facts in your case notes point to, then name them.' }
      : { where: 'The accusation', todo: 'Some leads are still unsolved, so you may be accusing too early. Go back and solve them first unless the clock is about to run out.' };
  }

  if (screen === 'puzzle' && ctx.leadId) {
    const lead = g.cf.leads.find((l) => l.id === ctx.leadId)!;
    const lp = g.s.leads[lead.id];
    const where = `Working ${leadName(lead)}`;
    if (lp.solved) return { where, todo: 'This lead is solved. Go back to pick the next one.' };
    const p = puzzleOf(g, lead.id);
    const L = gridLabels(g.cf, lead, p.size, tone);
    const state = checkLead(g, lead.id);
    if (state === 'grid-incomplete' || state === 'grid-wrong') {
      if (findWrong(p, lp.grid)) {
        return { where, todo: 'One of your numbers doesn’t fit the case. Look for it, use Check my grid if you have it, or call your partner for a pointer.' };
      }
      const step = nextStep(p, p.truth, lp.grid.map((row) => row.slice()));
      if (step) {
        const [r, c] = step.cell;
        return { where, todo: `Look at ${L.people[c]} ${when(L.times[r])}: only one ${lead.type === 'ledger' ? (kid ? 'number' : 'amount') : 'room'} can go there. ${step.reason}` };
      }
      return { where, todo: 'Each number appears once in every row and column. Start with the row or column that has the most numbers filled in.' };
    }
    if (state === 'marks-incomplete') {
      return { where, todo: 'Your grid is complete. Now test each statement against it and mark it True or Lie.' };
    }
    if (state === 'marks-wrong') {
      return { where, todo: 'Read each statement again and check it against the grid: one of your True or Lie marks is off.' };
    }
    return { where, todo: 'Everything is filled in. Press Close this lead.' };
  }

  // board or town: which lead to work next
  const inTown = screen === 'town';
  const where = inTown ? 'Walking the town' : 'The evidence board';
  if (started) {
    return { where, todo: inTown ? `Go back into ${door(started) ?? leadName(started)} to finish ${leadName(started)}.` : `Finish ${leadName(started)}: press Keep working on its card.` };
  }
  if (open.length) {
    const next = open[0];
    const others = open.length > 1 ? ` You could also open ${open.slice(1).map(leadName).join(' or ')}.` : '';
    const time = clockOn(g) && hoursLeft(g) < leadCost(g, next.id) ? ' You are short on time, so you may need to make your accusation instead.' : '';
    return {
      where,
      todo: inTown
        ? `Walk to ${door(next) ?? 'the glowing door'} and press E to open ${leadName(next)}.${others}${time}`
        : `Open ${leadName(next)} with Work this lead.${others}${time}`,
    };
  }
  if (allSolved) {
    return { where, todo: inTown ? 'Every lead is solved. Walk to the Harbor police desk and press E to make your accusation.' : 'Every lead is solved. Press Make an accusation.' };
  }
  return { where, todo: 'No lead can be opened right now. Check your case notes, then make your accusation.' };
}
