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
  /** Everything the player can do on this screen, one short line each. */
  can: string[];
}

export interface IdleContext {
  game: Game | null;
  screen: 'title' | 'intro' | 'board' | 'town' | 'puzzle' | 'accuse' | 'verdict' | 'lost';
  leadId: string | null;
  town: Town | null;
  /** A dialog is waiting for an answer. */
  dialog: boolean;
  tone: Tone;
}

/** What the player can do right now and what they should do next, for the screen they are on. */
export function idleHint(ctx: IdleContext): IdleHint {
  return { ...whatToDo(ctx), can: canDo(ctx) };
}

/** Everything possible on this screen, so a player who is lost can see their options. */
function canDo(ctx: IdleContext): string[] {
  const g = ctx.game;
  if (ctx.dialog) return ['Read the message, then press one of its buttons.'];
  if (!g || ctx.screen === 'title') {
    return ['Pick a rank: Junior is the gentlest, Chief the hardest.', 'Open the case (or Continue / Start over if you have a saved one).', 'Read How to play, or press ? for full help.'];
  }
  switch (ctx.screen) {
    case 'intro':
      return ['Read what happened.', 'Go to the evidence board to start investigating.'];
    case 'board':
      return [
        'Open a lead with Work this lead. Locked leads open once the ones before them are solved.',
        'Read your case notes and rumors for what you have proven and what is coming.',
        'Check the People cards: each shows how far you can trust them.',
        ...(ctx.town ? ['Walk the town (PC) to open leads from its doors.'] : []),
        'Make an accusation when the facts point to someone.',
      ];
    case 'town':
      return ['Walk with WASD or the arrow keys, Shift to run.', 'Press E near a person to talk, or at a door to open its lead.', 'Press C to change camera and B for the case board.', 'The Harbor police desk is where you make your accusation.'];
    case 'puzzle': {
      const lp = ctx.leadId ? g.s.leads[ctx.leadId] : null;
      if (lp?.solved) return ['Read the fact this lead proved.', 'Go back and pick the next lead.'];
      return [
        'Click a cell, then a number. Arrow keys and 1–9 work too.',
        'Erase, Notes (pencil marks, key P), Undo and Redo are under the grid.',
        'Mark each witness statement True or Lie.',
        'Call an ally with a favor: Mara lists what a zone can hold, Dex explains the next step, Lin reveals a cell, Cole checks a statement.',
        'Close this lead when the grid is full and every statement is marked.',
      ];
    }
    case 'accuse':
      return ['Pick who you think is behind it.', 'Then tick the leads whose facts prove it: a right name with weak proof is refused.', 'Go back to the board if you are not ready.'];
    default:
      return ['Read how your case ended.', 'Start over from the menu (☰) to try another rank or ending.'];
  }
}

function whatToDo(ctx: IdleContext): Omit<IdleHint, 'can'> {
  const { game: g, screen, tone } = ctx;
  const kid = tone === 'friendly';
  if (ctx.dialog) return { where: 'A message is waiting', todo: 'Read it, then pick one of its buttons to carry on.' };
  if (!g || screen === 'title') {
    return { where: 'The start screen', todo: 'Pick a rank (Junior is the gentlest), then press Open the case. Press ? any time for help.' };
  }
  if (screen === 'intro') return { where: 'The case briefing', todo: 'Read what happened, then go on to the evidence board to pick your first lead.' };
  if (screen === 'lost') return { where: 'The case is lost', todo: 'The investigation is over and your notes are gone. Start over from the menu (☰) to try again.' };
  if (screen === 'verdict') return { where: 'The case is closed', todo: 'Read your ending. Start over from the menu (☰) to try another rank or chase a different ending.' };

  const leadName = (l: Lead) => t(l.title, tone);
  const door = (l: Lead) => ctx.town?.doors.find((d) => d.lead === l.id)?.label;
  const started = g.cf.leads.find((l) => g.s.leads[l.id].started && !g.s.leads[l.id].solved);
  const open = g.cf.leads.filter((l) => leadOpen(g, l.id) && !g.s.leads[l.id].started);
  const allSolved = g.cf.leads.every((l) => g.s.leads[l.id].solved);

  if (screen === 'accuse') {
    return allSolved
      ? { where: 'The accusation', todo: 'Every lead is solved. Pick who the facts point to, then tick the leads that prove it.' }
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
