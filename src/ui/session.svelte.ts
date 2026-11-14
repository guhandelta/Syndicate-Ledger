import { nextStep } from '../engine/logic';
import type { Cell } from '../engine/types';
import type { CaseEvent, CaseFile, CastMember, MissedClue, Preset, PuzzleBook, Text } from '../game/caseTypes';
import { markCluesShown, markMistakes, pendingClues } from '../game/missedClues';
import {
  accuse, addFlag, buyTip, checkLead, newGame, puzzleOf, recoverSpeaker, rules, solveLead, spendFavors, startLead,
  type Game, type GameState,
} from '../game/state';
import { gridLabels, t, type Tone } from '../game/text';
import type { Pose } from '../town/townLogic';
import type { Town } from '../town/townTypes';
import { findWrong, zoneCombos } from './puzzleHelpers';

export type Screen = 'title' | 'intro' | 'board' | 'town' | 'puzzle' | 'accuse' | 'verdict';
/** The two places leads are opened from: the evidence board and the walkable town. */
export type Hub = 'board' | 'town';

export interface ModalAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface Modal {
  title: string;
  paragraphs: string[];
  /** Shown in a larger font, for the fact a solved lead gives. */
  fact?: string;
  note?: string;
  /** Shows the text as this person's dialogue, in a bubble beside their face (offers). */
  speaker?: CastMember;
  /** How the speaker says it; defaults to how they usually talk. */
  voice?: Voice;
  /** Use the Junior portraits. */
  friendly?: boolean;
  /** Escape closes it. */
  dismissible: boolean;
  actions: ModalAction[];
}

export interface PuzzleUi {
  sel: Cell | null;
  pencil: boolean;
  undo: string[];
  redo: string[];
  hint: { cell: Cell; text: string } | null;
  flashWrong: boolean;
  zoneInfo: { text: string; combos: number[][] } | null;
  pickStatementFor: 'undercover' | null;
  message: string | null;
}

export const SAVE_KEY = 'syndicate-ledger:save:v1';

const freshPui = (): PuzzleUi => ({
  sel: null, pencil: false, undo: [], redo: [], hint: null, flashWrong: false, zoneInfo: null, pickStatementFor: null, message: null,
});

/** Reads a saved game. v1 saves (version 1) load as they are. */
export function loadSave(cf: CaseFile): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1 || s.caseId !== cf.id) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * All UI state for one case. Game rules stay in src/game/state.ts: this class only calls them
 * on the reactive game state and keeps track of screens, dialogs and the puzzle cursor.
 */
export class Session {
  readonly cf: CaseFile;
  readonly book: PuzzleBook;
  /** The walkable place for this case, if it has one. */
  readonly town: Town | null;
  /** Where the player was standing in the town, so they return to the same spot. */
  townPose: Pose | null = null;

  s = $state<GameState | null>(null);
  screen = $state<Screen>('title');
  leadId = $state<string | null>(null);
  modals = $state<Modal[]>([]);
  pui = $state<PuzzleUi>(freshPui());
  titlePreset = $state<Preset>('inspector');
  /** Where closing a lead or backing out returns to. */
  hub = $state<Hub>('board');

  constructor(cf: CaseFile, book: PuzzleBook, town: Town | null = null) {
    this.cf = cf;
    this.book = book;
    this.town = town;
    this.s = loadSave(cf);
    if (this.s) this.titlePreset = this.s.preset;
  }

  get game(): Game | null {
    return this.s ? { cf: this.cf, book: this.book, s: this.s } : null;
  }

  /** The game, for screens that only render once a case has started. */
  get g(): Game {
    return this.game!;
  }

  get tone(): Tone {
    return this.game ? (rules(this.game).tone as Tone) : 'crime';
  }

  T = (x: Text) => t(x, this.tone);
  person = (id: string) => this.cf.cast.find((c) => c.id === id)!;

  save() {
    try {
      if (this.s) localStorage.setItem(SAVE_KEY, JSON.stringify($state.snapshot(this.s)));
    } catch {
      /* storage unavailable: play continues without saving */
    }
  }

  /** Remembers that a town story shot has played, so it never plays twice. */
  seeShot(id: string) {
    if (!this.s) return;
    this.s.shotsSeen = [...(this.s.shotsSeen ?? []), id];
    this.save();
  }

  // ---------- navigation ----------

  route(): string {
    if (this.screen === 'puzzle' && this.leadId) return `#/lead/${this.leadId}`;
    return this.screen === 'title' ? '#/' : `#/${this.screen}`;
  }

  /** Applies a URL hash (back button, reload), falling back to a screen the game allows. */
  applyRoute(hash: string) {
    const [, name, arg] = hash.replace(/^#/, '').split('/');
    const g = this.game;
    this.modals = [];
    if (!g || !name) return this.show('title');
    if (g.s.endingId) return this.show(name === 'verdict' ? 'verdict' : 'title');
    if (name === 'lead' && arg && g.s.leads[arg]?.started) return this.openLead(arg);
    if (name === 'town' && this.town) return this.show('town');
    if (name === 'intro' || name === 'board' || name === 'accuse') return this.show(name);
    this.show('board');
  }

  show(screen: Exclude<Screen, 'puzzle'>) {
    this.screen = screen;
    this.leadId = null;
    if (screen === 'board' || screen === 'town') this.hub = screen;
  }

  private openLead(id: string) {
    this.leadId = id;
    this.screen = 'puzzle';
    this.pui = freshPui();
  }

  goBoard = () => {
    this.modals = [];
    this.show(this.s?.endingId ? 'verdict' : this.hub);
  };

  goAccuse = () => {
    this.modals = [];
    this.show('accuse');
  };

  goTitle = () => {
    this.modals = [];
    this.show('title');
  };

  closeModal = () => {
    this.modals.shift();
  };

  private info(title: string, paragraphs: string[], label = 'Continue') {
    this.modals.push({ title, paragraphs, dismissible: true, actions: [{ label, primary: true, run: this.closeModal }] });
  }

  private eventModals(evs: CaseEvent[] | 'no-time' | 'cant') {
    if (!Array.isArray(evs)) return;
    for (const ev of evs) {
      if (ev.effect.type === 'endCase')
        this.modals.push({ title: 'Time is up', paragraphs: [this.T(ev.message)], dismissible: false, actions: [{ label: 'Make your accusation', primary: true, run: this.goAccuse }] });
      else {
        this.info('Breaking news', [this.T(ev.message)], 'Got it');
        this.clueModals(pendingClues(this.g, { kind: 'event', event: ev.id }));
      }
    }
  }

  /** Nudges for clues the player missed. Each one shows once, except accusation nudges. */
  private clueModals(clues: MissedClue[]) {
    if (!clues.length) return;
    markCluesShown(this.g, clues);
    for (const c of clues) this.info("Detective's instinct", [this.T(c.message)], 'Got it');
  }

  // ---------- title and board ----------

  newCase() {
    this.s = newGame(this.cf, this.book, this.titlePreset).s;
    this.townPose = null;
    this.hub = 'board';
    this.show('intro');
  }

  continueCase() {
    this.show('board');
  }

  work(id: string) {
    const res = startLead(this.g, id);
    if (res === 'no-time') {
      this.modals.push({
        title: 'Not enough time',
        paragraphs: ["There aren't enough hours left to work this lead. Make your accusation with what you have."],
        dismissible: true,
        actions: [{ label: 'Make an accusation', primary: true, run: this.goAccuse }, { label: 'Back', run: this.closeModal }],
      });
      return;
    }
    this.openLead(id);
    this.eventModals(res);
  }

  // ---------- puzzle ----------

  get puzzle() {
    return puzzleOf(this.g, this.leadId!);
  }

  get lp() {
    return this.g.s.leads[this.leadId!];
  }

  get lead() {
    return this.cf.leads.find((l) => l.id === this.leadId)!;
  }

  get labels() {
    return gridLabels(this.cf, this.lead, this.puzzle.size, this.tone);
  }

  isLocked(r: number, c: number) {
    const p = this.puzzle;
    const lp = this.lp;
    return lp.solved || p.givens.some((x) => x.cell[0] === r && x.cell[1] === c) || lp.revealed.some((x) => x[0] === r && x[1] === c);
  }

  select(cell: Cell) {
    this.pui.sel = cell;
    this.pui.message = null;
  }

  move(dr: number, dc: number) {
    const n = this.puzzle.size;
    const [r, c] = this.pui.sel ?? [0, 0];
    this.pui.sel = [(r + dr + n) % n, (c + dc + n) % n];
  }

  private snapshot() {
    const lp = this.lp;
    return JSON.stringify({ grid: lp.grid, notes: lp.notes });
  }

  private pushUndo() {
    this.pui.undo.push(this.snapshot());
    if (this.pui.undo.length > 200) this.pui.undo.shift();
    this.pui.redo = [];
  }

  private restore(snap: string) {
    const o = JSON.parse(snap);
    this.lp.grid = o.grid;
    this.lp.notes = o.notes;
  }

  undo() {
    if (!this.pui.undo.length) return;
    this.pui.redo.push(this.snapshot());
    this.restore(this.pui.undo.pop()!);
  }

  redo() {
    if (!this.pui.redo.length) return;
    this.pui.undo.push(this.snapshot());
    this.restore(this.pui.redo.pop()!);
  }

  /** Enters a number (or a pencil mark) in the selected cell; 0 erases. */
  enter(v: number) {
    if (!this.pui.sel) return;
    const [r, c] = this.pui.sel;
    if (this.isLocked(r, c)) return;
    const lp = this.lp;
    this.pushUndo();
    if (this.pui.pencil && v) {
      if (!lp.grid[r][c]) lp.notes[r][c] ^= 1 << v;
    } else {
      lp.grid[r][c] = lp.grid[r][c] === v ? 0 : v;
      if (v) {
        // clear this number from notes in the same row and column
        const n = lp.grid.length;
        for (let k = 0; k < n; k++) {
          lp.notes[r][k] &= ~(1 << v);
          lp.notes[k][c] &= ~(1 << v);
        }
      }
    }
    if (!v) {
      lp.grid[r][c] = 0;
      lp.notes[r][c] = 0;
    }
    this.pui.hint = null;
    this.pui.message = null;
  }

  togglePencil() {
    this.pui.pencil = !this.pui.pencil;
  }

  mark(i: number, m: 'true' | 'lie') {
    const lp = this.lp;
    lp.marks[i] = lp.marks[i] === m ? 'unknown' : m;
  }

  checkGrid() {
    const wrong = findWrong(this.puzzle, this.lp.grid);
    this.pui.flashWrong = true;
    this.pui.message = wrong ? 'Wrong numbers are shown in red.' : 'Everything on the grid so far is correct.';
    setTimeout(() => (this.pui.flashWrong = false), 2500);
  }

  useAlly(ally: CastMember) {
    const g = this.g;
    const p = this.puzzle;
    const lp = this.lp;
    const L = this.labels;
    const pui = this.pui;
    pui.zoneInfo = null;
    pui.hint = null;
    const sel = pui.sel;
    if (ally.ability === 'forensics') {
      if (!sel || this.isLocked(sel[0], sel[1])) {
        pui.message = `Select an empty cell first, then call ${ally.name}.`;
        return;
      }
      if (!spendFavors(g, 1)) return;
      const [r, c] = sel;
      this.pushUndo();
      lp.grid[r][c] = p.solution[r][c];
      lp.revealed.push([r, c]);
      g.s.hintsUsed++;
      pui.message = `${ally.name} confirms: ${L.people[c]} at ${L.times[r]} is ${L.value(p.solution[r][c])}.`;
    } else if (ally.ability === 'accountant') {
      if (!sel) {
        pui.message = `Select a cell inside a zone first, then call ${ally.name}.`;
        return;
      }
      const zone = p.zones.find((z) => z.cells.some(([r, c]) => r === sel[0] && c === sel[1]));
      if (!zone) return;
      if (!spendFavors(g, 1)) return;
      g.s.hintsUsed++;
      pui.zoneInfo = {
        text: `${ally.name}: This zone totals ${L.value(zone.sum)} over ${zone.cells.length} cells. With what's already in its rows and columns, it can only be made from:`,
        combos: zoneCombos(p.size, lp.grid, zone.cells, zone.sum),
      };
    } else if (ally.ability === 'undercover') {
      if (g.s.favors < 2) return;
      pui.pickStatementFor = 'undercover';
    } else if (ally.ability === 'partner') {
      const wrong = findWrong(p, lp.grid);
      if (!spendFavors(g, 1)) return;
      g.s.hintsUsed++;
      if (wrong) {
        pui.hint = { cell: wrong, text: `Hold on. Look again at ${L.people[wrong[1]]} at ${L.times[wrong[0]]}. That number doesn't fit the case.` };
        return;
      }
      const step = nextStep(p, p.truth, lp.grid.map((row) => row.slice()));
      if (!step) {
        pui.message = `${ally.name}: "The grid looks complete. Now check each statement against it."`;
        return;
      }
      pui.sel = step.cell;
      pui.hint = { cell: step.cell, text: `Look at ${L.people[step.cell[1]]} at ${L.times[step.cell[0]]}. ${step.reason}` };
    }
  }

  cancelPick() {
    this.pui.pickStatementFor = null;
  }

  pickStatement(i: number) {
    if (this.pui.pickStatementFor !== 'undercover') return;
    const g = this.g;
    const p = this.puzzle;
    if (!spendFavors(g, 2)) return;
    g.s.hintsUsed++;
    this.pui.pickStatementFor = null;
    this.lp.marks[i] = p.truth[i] ? 'true' : 'lie';
    const cop = this.cf.cast.find((c) => c.ability === 'undercover');
    this.pui.message = `${cop?.name ?? 'Your contact'} checked it: that statement is ${p.truth[i] ? 'true' : 'a lie'}.`;
  }

  buyTip() {
    const informant = this.cf.cast.find((c) => c.role === 'informant')!;
    const res = buyTip(this.g, this.leadId!, informant.id);
    this.pui.message = res === 'cant' ? `${informant.name} has nothing more to sell right now.` : `${informant.name} pockets the favor and leans in close.`;
  }

  recover(speaker: string) {
    const res = recoverSpeaker(this.g, this.leadId!, speaker);
    if (res === 'cant') this.pui.message = "You don't have the time or favors to track them down.";
    else this.eventModals(res);
  }

  closeLead() {
    const g = this.g;
    const id = this.leadId!;
    const res = checkLead(g, id);
    const msgs: Record<string, string> = {
      'grid-incomplete': 'The grid still has empty cells.',
      'grid-wrong': "Something doesn't add up. At least one number on the grid is wrong.",
      'marks-incomplete': 'Mark every statement as True or Lie before closing the lead.',
      'marks-wrong': "The grid is right, but your read on the witnesses isn't. Check each statement against the grid.",
    };
    if (res === 'marks-wrong' || res === 'marks-incomplete') {
      const kind = res === 'marks-wrong' ? 'wrong-mark' : 'unmarked';
      this.clueModals(markMistakes(g, id).filter((ev) => ev.kind === kind).flatMap((ev) => pendingClues(g, ev)));
    }
    if (res !== 'solved') {
      this.pui.message = msgs[res];
      return;
    }
    const lead = this.lead;
    solveLead(g, id);
    const lies = puzzleOf(g, id).truth.filter((x) => !x).length;
    this.modals.push({
      title: `Lead closed: ${this.T(lead.title)}`,
      paragraphs: [],
      fact: this.T(lead.fact),
      note: lies ? `Exposing ${lies === 1 ? 'a liar' : 'the liars'} earned you a favor.` : undefined,
      dismissible: true,
      actions: [{ label: 'Continue', primary: true, run: this.closeModal }],
    });
    this.show(this.hub);
    const offer = this.cf.offers.find((o) => o.after === id && !g.s.offersSeen.includes(o.id));
    if (!offer) return;
    const from = this.person(offer.from);
    const answer = (yes: boolean) => () => {
      g.s.offersSeen.push(offer.id);
      this.modals.shift();
      if (yes) {
        spendFavors(g, offer.cost.favors);
        addFlag(g, offer.id);
      }
      this.info(from.name, [this.T(yes ? offer.accept : offer.decline)]);
    };
    this.modals.push({
      title: `${from.name} wants a word`,
      paragraphs: [this.T(offer.text)],
      speaker: from,
      voice: offer.voice,
      friendly: this.tone === 'friendly',
      note: `Costs ${offer.cost.favors} favor. You have ${g.s.favors}.`,
      dismissible: false,
      actions: [
        { label: 'Decline', run: answer(false) },
        ...(g.s.favors >= offer.cost.favors ? [{ label: 'Accept', primary: true, run: answer(true) }] : []),
      ],
    });
  }

  // ---------- accusation ----------

  askAccuse(who: CastMember) {
    this.modals.push({
      title: `Accuse ${who.name}?`,
      paragraphs: [
        'This ends the case. There is no going back.',
        ...pendingClues(this.g, { kind: 'accuse', person: who.id }).map((c) => this.T(c.message)),
      ],
      dismissible: true,
      actions: [
        { label: 'Cancel', run: this.closeModal },
        {
          label: 'Accuse',
          primary: true,
          run: () => {
            accuse(this.g, who.id);
            this.modals = [];
            this.show('verdict');
          },
        },
      ],
    });
  }
}
