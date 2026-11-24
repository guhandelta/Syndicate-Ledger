import { nextStep } from '../engine/logic';
import { cipherStep, wrongDigit } from '../engine/cipher';
import { stakeoutStep, wrongSpot } from '../engine/stakeout';
import { networkStep, pairs, wrongPair } from '../engine/network';
import { timelineStep, wrongMoment } from '../engine/timeline';
import type { Cell } from '../engine/types';
import type { AnyClaim, CaseEvent, CaseFile, CastMember, MissedClue, Preset, PuzzleBook, Text, Voice } from '../game/caseTypes';
import { markCluesShown, markMistakes, pendingClues } from '../game/missedClues';
import {
  accuseStatus, accusedPeople, addFlag, buyTip, checkLead, evidenceLeads, leadOpen, cipherOf, stakeoutOf, gridOf, networkOf, newGame, puzzleOf, recoverSpeaker, rules, solveLead, spendFavors, startLead,
  timelineOf,
  submitAccusation,
  proofProblems,
  type Game, type GameState,
} from '../game/state';
import { caseForRank, nextRank, parseProgress, progressKey, rankUnlocked, recordPart, type CaseProgress } from '../game/rankStory';
import { describeStatement, gridLabels, networkPeople, stakeoutLabels, t, timelineLabels, type Tone } from '../game/text';
import { wordStatement, type Answers } from '../game/links';
import { buildInWorker, FRESH_RANKS, type WorkerLike } from '../game/rankClient';
import RankWorker from '../game/rankWorker?worker&inline';
import { townForRank, type Pose } from '../town/townLogic';
import type { Town } from '../town/townTypes';
import { idleHint, IDLE_MS, type IdleHint } from './idleHint';
import { findWrong, zoneCombos } from './puzzleHelpers';

export type Screen = 'title' | 'intro' | 'board' | 'town' | 'puzzle' | 'accuse' | 'verdict' | 'lost';
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
  /** Shows the text as the detective's own thought bubble (no speaker). */
  thought?: boolean;
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
  /** Timeline leads: the moment the player picked (for allies that look at one moment). */
  moment: number | null;
  /** Network leads: the pair of people (index in `pairs`) the player picked, for allies. */
  pair: number | null;
  /** Cipher leads: the position of the code the player picked. */
  pos: number | null;
}

/** A worker that builds a rank's puzzles, or none where workers don't exist. */
const makeWorker = (): WorkerLike | null => (typeof Worker === 'undefined' ? null : (new RankWorker() as unknown as WorkerLike));

/**
 * The seed for a new game: a fresh one each time. The address can pin it for testing: `?seed=0` plays the shipped puzzles,
 * `?seed=N` replays one build.
 */
function pickSeed(): number {
  const q = new URLSearchParams(location.search).get('seed');
  if (q !== null && /^\d+$/.test(q)) return Number(q);
  return 1 + Math.floor(Math.random() * 2_000_000_000);
}

export const SAVE_KEY = 'syndicate-ledger:save:v1';

const freshPui = (): PuzzleUi => ({
  sel: null, pencil: false, undo: [], redo: [], hint: null, flashWrong: false, zoneInfo: null, pickStatementFor: null, message: null, moment: null, pair: null, pos: null,
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

/** Reads which rank stories of a case are solved. */
export function loadProgress(cf: CaseFile): CaseProgress {
  try {
    return parseProgress(cf, localStorage.getItem(progressKey(cf.id)));
  } catch {
    return parseProgress(cf, null);
  }
}

/**
 * All UI state for one case. Game rules stay in src/game/state.ts: this class only calls them
 * on the reactive game state and keeps track of screens, dialogs and the puzzle cursor.
 */
export class Session {
  /** The case file as written. Play uses `cf`, the rank's own story over it. */
  readonly base: CaseFile;
  /** The puzzles shipped with the case (seed 0): the fallback whenever fresh ones can't be built. */
  readonly shipped: PuzzleBook;
  /** The puzzles in play: the shipped ones, with this game's own rank over them. */
  book: PuzzleBook;
  /** Fresh puzzles are being built for a new game. */
  building = $state(false);
  /** The walkable place for this case, if it has one. */
  private readonly baseTown: Town | null;
  private townCache = new Map<Preset, Town>();
  /** Where the player was standing in the town, so they return to the same spot. */
  townPose: Pose | null = null;

  s = $state<GameState | null>(null);
  screen = $state<Screen>('title');
  leadId = $state<string | null>(null);
  modals = $state<Modal[]>([]);
  pui = $state<PuzzleUi>(freshPui());
  titlePreset = $state<Preset>('junior');
  /** Who the player will play as in a new case. */
  titleCharacter = $state('detective');
  /** Where closing a lead or backing out returns to. */
  hub = $state<Hub>('board');
  /** Who the player is about to accuse, and the proven facts they have picked to back it. */
  accuseTarget = $state<CastMember | null>(null);
  evidence = $state<string[]>([]);
  helpOpen = $state(false);
  /** The evidence panel: every solved lead's answer, to look back at while reading a linked clue. */
  evidenceOpen = $state(false);
  helpTab = $state<'play' | 'rank' | 'case' | 'controls'>('play');
  /** The corner tip shown after the player has been still for a while (src/ui/idleHint.ts). */
  idleTip = $state<IdleHint | null>(null);
  /** The tip was asked for (What now? button), so it also lists what the player can do here. */
  tipAsked = $state(false);
  lastActive = Date.now();
  /** Which rank stories of this case are solved, kept across games (src/game/rankStory.ts). */
  progress = $state<CaseProgress>({ caseId: '', parts: {} });

  constructor(cf: CaseFile, book: PuzzleBook, town: Town | null = null) {
    this.base = cf;
    this.shipped = book;
    this.book = { ...book };
    this.baseTown = town;
    this.s = loadSave(cf);
    // a saved game plays the puzzles it was built with
    if (this.s?.puzzles) Object.assign(this.book, this.s.puzzles);
    this.progress = loadProgress(cf);
    this.titlePreset = this.s ? this.s.preset : nextRank(cf, this.progress);
    this.titleCharacter = this.s?.character ?? cf.characters?.find((c) => c.ready)?.id ?? 'detective';
  }

  /** The town as the current rank plays it (its own lead doors). */
  get town(): Town | null {
    if (!this.baseTown) return null;
    const preset = this.s?.preset ?? this.titlePreset;
    let t = this.townCache.get(preset);
    if (!t) this.townCache.set(preset, (t = townForRank(this.baseTown, this.cf.leads, preset)));
    return t;
  }

  /** Ranks open in order: is this one open yet? */
  unlocked = (preset: Preset) => rankUnlocked(this.base, this.progress, preset);

  /** The case as the current rank plays it: the running game's rank, or the one picked on the title screen. */
  get cf(): CaseFile {
    return caseForRank(this.base, this.s?.preset ?? this.titlePreset);
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
      // a lost case leaves nothing behind: no save, no notes
      if (this.s?.lost) localStorage.removeItem(SAVE_KEY);
      else if (this.s) localStorage.setItem(SAVE_KEY, JSON.stringify($state.snapshot(this.s)));
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

  // ---------- help and idle tips ----------

  openHelp = (tab?: Session['helpTab']) => {
    if (tab) this.helpTab = tab;
    this.idleTip = null;
    this.tipAsked = false;
    this.helpOpen = true;
  };

  /** Any key, click or tap: the player is active, so the idle countdown starts again. */
  poke() {
    this.lastActive = Date.now();
  }

  dismissIdle() {
    this.idleTip = null;
    this.tipAsked = false;
    this.poke();
  }

  /** The What now? button: shows the tip for this screen straight away, or hides it if it is showing. */
  askForTip = () => {
    if (this.idleTip) return this.dismissIdle();
    this.helpOpen = false;
    this.tipAsked = true;
    this.idleTip = this.tipNow();
    this.poke();
  };

  private tipNow(): IdleHint {
    return idleHint({
      game: this.game, screen: this.screen, leadId: this.leadId, town: this.town, dialog: this.modals.length > 0, tone: this.tone,
    });
  }

  /** Called on a timer: shows a tip for the current screen once the player has been still for IDLE_MS. */
  checkIdle(now = Date.now()) {
    if (this.idleTip || this.helpOpen || now - this.lastActive < IDLE_MS) return;
    this.tipAsked = false;
    this.idleTip = this.tipNow();
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
    if (g.s.lost) return this.show('lost');
    if (g.s.endingId) return this.show(name === 'verdict' ? 'verdict' : 'title');
    if (name === 'lead' && arg && g.s.leads[arg]?.started) return this.openLead(arg);
    if (name === 'town' && this.town) return this.show('town');
    if (name === 'intro' || name === 'board' || name === 'accuse') return this.show(name);
    this.show('board');
  }

  show(screen: Exclude<Screen, 'puzzle'>) {
    this.screen = screen;
    this.idleTip = null;
    this.leadId = null;
    if (screen === 'board' || screen === 'town') this.hub = screen;
  }

  private openLead(id: string) {
    this.leadId = id;
    this.idleTip = null;
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
    for (const c of clues) {
      this.modals.push({
        title: "Detective's instinct",
        paragraphs: [this.T(c.message)],
        thought: true,
        dismissible: true,
        actions: [{ label: 'Got it', primary: true, run: this.closeModal }],
      });
    }
  }

  // ---------- title and board ----------

  async newCase() {
    if (!this.unlocked(this.titlePreset) || this.building) return;
    const preset = this.titlePreset;
    const seed = pickSeed();
    // fresh puzzles from a worker; when they can't be had in time the shipped ones play, so starting never fails
    let fresh = null;
    if (seed && FRESH_RANKS.includes(preset)) {
      this.building = true;
      fresh = await buildInWorker({ cf: this.base, preset, seed }, makeWorker);
      this.building = false;
    }
    this.book = { ...this.shipped, ...(fresh?.book ?? {}) };
    const game = newGame(this.cf, this.book, preset, this.titleCharacter);
    if (fresh) {
      game.s.seed = fresh.seed;
      game.s.puzzles = fresh.book;
    }
    this.s = game.s;
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

  /** The open lead's puzzle, whatever kind it is. */
  get anyPuzzle() {
    return puzzleOf(this.g, this.leadId!);
  }

  /** The open grid lead's puzzle (the grid screens only open for grid leads). */
  get puzzle() {
    return gridOf(this.g, this.leadId!);
  }

  /** The open timeline lead's puzzle. */
  get timeline() {
    return timelineOf(this.g, this.leadId!);
  }

  get isTimeline() {
    return this.anyPuzzle.type === 'timeline';
  }

  /** The open stakeout lead's puzzle. */
  get stakeout() {
    return stakeoutOf(this.g, this.leadId!);
  }

  get isStakeout() {
    return this.anyPuzzle.type === 'stakeout';
  }

  /** Stakeout: names of the districts and the watchers. */
  get stakeLabels() {
    return stakeoutLabels(this.lead, this.stakeout.size, this.tone);
  }

  /** Stakeout: is this row's watcher fixed (a given, shown by an ally or after a witness left, or the lead is solved)? */
  spotLocked(r: number) {
    return this.lp.solved || this.stakeout.givens.some((x) => x.r === r) || !!this.lp.shownSpots?.includes(r);
  }

  /** Stakeout: puts the row's watcher on a column (0 takes it off). Choosing the same square again takes it off. */
  placeSpot(r: number, c: number) {
    if (this.spotLocked(r)) return;
    this.pushUndo();
    const lp = this.lp;
    lp.spots![r] = lp.spots![r] === c ? 0 : c;
    this.pui.pos = r;
    this.pui.hint = null;
    this.pui.message = null;
  }

  /** The open cipher lead's puzzle. */
  get cipher() {
    return cipherOf(this.g, this.leadId!);
  }

  get isCipher() {
    return this.anyPuzzle.type === 'cipher';
  }

  /** Cipher: is this position fixed (a given, shown by an ally or after a witness left, or the lead is solved)? */
  digitLocked(k: number) {
    return this.lp.solved || this.cipher.givens.some((x) => x.p === k) || !!this.lp.shownDigits?.includes(k);
  }

  /** Cipher: puts a digit at a position (0 clears it). */
  placeDigit(k: number, d: number) {
    if (this.digitLocked(k)) return;
    this.pushUndo();
    this.lp.digits![k] = d;
    this.pui.pos = k;
    this.pui.hint = null;
    this.pui.message = null;
  }

  pickPos(k: number) {
    this.pui.pos = this.pui.pos === k ? null : k;
    this.pui.message = null;
  }

  /** The open network lead's puzzle. */
  get network() {
    return networkOf(this.g, this.leadId!);
  }

  get isNetwork() {
    return this.anyPuzzle.type === 'network';
  }

  /** The people of the open network lead, by name. */
  get netPeople() {
    return networkPeople(this.cf, this.lead, this.anyPuzzle.size);
  }

  /** Network: is this pair's answer fixed (shown by an ally or after a witness left, or the lead is solved)? */
  pairLocked(k: number) {
    return this.lp.solved || !!this.lp.shownPairs?.includes(k);
  }

  /** Network: decides a pair (1 in contact, 2 never in contact). Choosing the same answer again clears it. */
  setLink(k: number, v: number) {
    if (this.pairLocked(k)) return;
    this.pushUndo();
    this.lp.links![k] = this.lp.links![k] === v ? 0 : v;
    this.pui.pair = k;
    this.pui.hint = null;
    this.pui.message = null;
  }

  pickPair(k: number) {
    this.pui.pair = this.pui.pair === k ? null : k;
    this.pui.message = null;
  }

  get timeLabels() {
    return timelineLabels(this.lead, this.anyPuzzle.size, this.tone);
  }

  /** This rank's answers so far, by lead id: what a linked clue quotes. */
  get answers(): Answers {
    const out: Answers = {};
    if (!this.s) return out;
    for (const l of this.cf.leads) out[l.id] = this.book[`${l.id}:${this.s.preset}`];
    return out;
  }

  /** A statement in plain words; a linked clue quotes the earlier puzzle it comes from. */
  say(st: { claim: AnyClaim; via?: import('../engine/via').Via }): string {
    return wordStatement(this.cf, this.lead, this.anyPuzzle, st, this.answers, this.tone);
  }

  /** A statement in plain words, for either kind of puzzle. */
  describe(claim: AnyClaim): string {
    return describeStatement(this.cf, this.lead, this.anyPuzzle, claim, this.tone);
  }

  /** Timeline: is this moment fixed in place (given, shown by an ally, or the lead is solved)? */
  momentLocked(m: number) {
    const lp = this.lp;
    return lp.solved || this.timeline.givens.some((x) => x.m === m) || !!lp.shownMoments?.includes(m);
  }

  /** Timeline: puts a moment at a time (0 takes it off). A moment already there goes back to the pile. */
  placeMoment(m: number, slot: number) {
    if (this.momentLocked(m)) return;
    const order = this.lp.order!;
    const other = slot ? order.findIndex((s, k) => k !== m && s === slot) : -1;
    if (other >= 0 && this.momentLocked(other)) {
      this.pui.message = `${this.timeLabels.moments[other]} is already fixed at ${this.timeLabels.times[slot - 1]}.`;
      return;
    }
    this.pushUndo();
    if (other >= 0) order[other] = 0;
    order[m] = slot;
    this.pui.moment = m;
    this.pui.hint = null;
    this.pui.message = null;
  }

  pickMoment(m: number) {
    this.pui.moment = this.pui.moment === m ? null : m;
    this.pui.message = null;
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
    return JSON.stringify({ grid: lp.grid, notes: lp.notes, order: lp.order, links: lp.links, digits: lp.digits, spots: lp.spots });
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
    if (o.order) this.lp.order = o.order;
    if (o.links) this.lp.links = o.links;
    if (o.digits) this.lp.digits = o.digits;
    if (o.spots) this.lp.spots = o.spots;
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
    this.pui.flashWrong = true;
    if (this.isStakeout) {
      const bad = wrongSpot(this.stakeout, this.lp.spots!) >= 0;
      this.pui.message = bad ? 'Watchers on the wrong square are shown in red.' : 'Every watcher you have placed so far is on the right square.';
    } else if (this.isCipher) {
      const bad = wrongDigit(this.cipher, this.lp.digits!) >= 0;
      this.pui.message = bad ? 'Digits in the wrong place are shown in red.' : 'Every digit you have entered so far is correct.';
    } else if (this.isNetwork) {
      const bad = wrongPair(this.network, this.lp.links!) !== null;
      this.pui.message = bad ? 'Pairs decided the wrong way are shown in red.' : 'Everything you have decided so far is correct.';
    } else if (this.isTimeline) {
      const bad = wrongMoment(this.timeline, this.lp.order!) >= 0;
      this.pui.message = bad ? 'Moments at the wrong time are shown in red.' : 'Everything on the timeline so far is correct.';
    } else {
      const wrong = findWrong(this.puzzle, this.lp.grid);
      this.pui.message = wrong ? 'Wrong numbers are shown in red.' : 'Everything on the grid so far is correct.';
    }
    setTimeout(() => (this.pui.flashWrong = false), 2500);
  }

  /** Allies on a stakeout: forensics confirms the picked row's watcher, the partner points the way. */
  private useAllyOnStakeout(ally: CastMember) {
    const g = this.g;
    const p = this.stakeout;
    const lp = this.lp;
    const pui = this.pui;
    const L = this.stakeLabels;
    const rowName = (r: number) => `row ${r + 1}`;
    if (ally.ability === 'forensics') {
      const r = pui.pos;
      if (r === null || this.spotLocked(r)) {
        pui.message = `Pick a row of the map first, then call ${ally.name}.`;
        return;
      }
      if (!spendFavors(g, 1)) return;
      this.pushUndo();
      lp.spots![r] = p.cols[r] + 1;
      lp.shownSpots!.push(r);
      g.s.hintsUsed++;
      pui.message = `${ally.name} confirms: ${L.districts[p.regions[r][p.cols[r]]]}’s ${L.one} stood in ${rowName(r)}, column ${p.cols[r] + 1}.`;
      return;
    }
    // partner
    if (!spendFavors(g, 1)) return;
    g.s.hintsUsed++;
    const wrong = wrongSpot(p, lp.spots!);
    if (wrong >= 0) {
      pui.pos = wrong;
      pui.message = `${ally.name}: "Hold on. Look again at ${rowName(wrong)}. That doesn't fit the case."`;
      return;
    }
    const step = stakeoutStep(p, lp.spots!);
    if (!step) {
      pui.message = `${ally.name}: "Every ${L.one} is placed. Now check each statement against the map."`;
      return;
    }
    pui.pos = step.row;
    pui.message = `${ally.name}: "Look at ${rowName(step.row)}. Think about what ${this.person(p.statements[step.statement].speaker).name} said."`;
  }

  /** Allies on a cipher: forensics fills the picked position, the partner points the way. */
  private useAllyOnCipher(ally: CastMember) {
    const g = this.g;
    const p = this.cipher;
    const lp = this.lp;
    const pui = this.pui;
    const th = (k: number) => `the ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][k]} digit`;
    if (ally.ability === 'forensics') {
      const k = pui.pos;
      if (k === null || this.digitLocked(k)) {
        pui.message = `Pick a digit of the code first, then call ${ally.name}.`;
        return;
      }
      if (!spendFavors(g, 1)) return;
      this.pushUndo();
      lp.digits![k] = p.code[k];
      lp.shownDigits!.push(k);
      g.s.hintsUsed++;
      pui.message = `${ally.name} confirms: ${th(k)} is ${p.code[k]}.`;
      return;
    }
    // partner
    if (!spendFavors(g, 1)) return;
    g.s.hintsUsed++;
    const wrong = wrongDigit(p, lp.digits!);
    if (wrong >= 0) {
      pui.pos = wrong;
      pui.message = `${ally.name}: "Hold on. Look again at ${th(wrong)}. That doesn't fit the case."`;
      return;
    }
    const step = cipherStep(p, lp.digits!);
    if (!step) {
      pui.message = `${ally.name}: "The code looks complete. Now check each statement against it."`;
      return;
    }
    pui.pos = step.pos;
    pui.message = `${ally.name}: "Look at ${th(step.pos)}. Think about what ${this.person(p.statements[step.statement].speaker).name} said."`;
  }

  /** Allies on a network: forensics settles the picked pair, the partner points the way. */
  private useAllyOnNetwork(ally: CastMember) {
    const g = this.g;
    const p = this.network;
    const lp = this.lp;
    const names = this.netPeople;
    const ps = pairs(p.size);
    const pui = this.pui;
    const both = (k: number) => `${names[ps[k][0]]} and ${names[ps[k][1]]}`;
    if (ally.ability === 'forensics') {
      const k = pui.pair;
      if (k === null || this.pairLocked(k)) {
        pui.message = `Pick a pair of people first, then call ${ally.name}.`;
        return;
      }
      if (!spendFavors(g, 1)) return;
      this.pushUndo();
      lp.links![k] = p.links[k] ? 1 : 2;
      lp.shownPairs!.push(k);
      g.s.hintsUsed++;
      pui.message = `${ally.name} confirms: ${both(k)} were ${p.links[k] ? '' : 'never '}in contact.`;
      return;
    }
    // partner
    if (!spendFavors(g, 1)) return;
    g.s.hintsUsed++;
    const wrong = wrongPair(p, lp.links!);
    if (wrong) {
      const k = ps.findIndex(([a, b]) => a === wrong[0] && b === wrong[1]);
      pui.pair = k;
      pui.message = `${ally.name}: "Hold on. Look again at ${both(k)}. That doesn't fit the case."`;
      return;
    }
    const step = networkStep(p, lp.links!);
    if (!step) {
      pui.message = `${ally.name}: "Every pair is decided. Now check each statement against what you have."`;
      return;
    }
    const k = ps.findIndex(([a, b]) => a === step.pair[0] && b === step.pair[1]);
    pui.pair = k;
    const said = step.statement >= 0 ? ` Think about what ${this.person(p.statements[step.statement].speaker).name} said.` : '';
    pui.message = `${ally.name}: "Look at ${both(k)}.${said}"`;
  }

  /** Allies on a timeline: forensics pins the picked moment, the partner points the way. */
  private useAllyOnTimeline(ally: CastMember) {
    const g = this.g;
    const p = this.timeline;
    const lp = this.lp;
    const L = this.timeLabels;
    const pui = this.pui;
    if (ally.ability === 'forensics') {
      const m = pui.moment;
      if (m === null || this.momentLocked(m)) {
        pui.message = `Pick a moment first, then call ${ally.name}.`;
        return;
      }
      if (!spendFavors(g, 1)) return;
      this.pushUndo();
      const order = lp.order!;
      const other = order.findIndex((s, k) => k !== m && s === p.solution[m]);
      if (other >= 0) order[other] = 0;
      order[m] = p.solution[m];
      lp.shownMoments!.push(m);
      g.s.hintsUsed++;
      pui.message = `${ally.name} confirms: “${L.moments[m]}” was ${L.at(p.solution[m])}.`;
      return;
    }
    // partner
    if (!spendFavors(g, 1)) return;
    g.s.hintsUsed++;
    const wrong = wrongMoment(p, lp.order!);
    if (wrong >= 0) {
      pui.moment = wrong;
      pui.message = `${ally.name}: "Hold on. Look again at “${L.moments[wrong]}”. That time doesn't fit the case."`;
      return;
    }
    const step = timelineStep(p, lp.order!);
    if (!step) {
      pui.message = `${ally.name}: "The timeline looks complete. Now check each statement against it."`;
      return;
    }
    pui.moment = step.m;
    const who = this.person(p.statements[step.statement].speaker);
    pui.message = `${ally.name}: "Look at “${L.moments[step.m]}”. Think about what ${who.name} said."`;
  }

  useAlly(ally: CastMember) {
    if (this.isStakeout && ally.ability !== 'undercover') return this.useAllyOnStakeout(ally);
    if (this.isCipher && ally.ability !== 'undercover') return this.useAllyOnCipher(ally);
    if (this.isNetwork && ally.ability !== 'undercover') return this.useAllyOnNetwork(ally);
    if (this.isTimeline && ally.ability !== 'undercover') return this.useAllyOnTimeline(ally);
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
    const p = this.anyPuzzle;
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
    const tl = this.isTimeline;
    const nw = this.isNetwork;
    const cp = this.isCipher;
    const sk = this.isStakeout;
    const msgs: Record<string, string> = {
      'grid-incomplete': sk ? 'Some rows of the map still have no watcher.' : cp ? 'Some digits of the code are still empty.' : nw ? 'Some pairs are still undecided. Mark each pair as in contact or never in contact.' : tl ? 'Some moments are not on the timeline yet.' : 'The grid still has empty cells.',
      'grid-wrong': sk ? "Something doesn't add up. At least one watcher is on the wrong square." : cp ? "Something doesn't add up. At least one digit of the code is wrong." : nw ? "Something doesn't add up. At least one pair is decided the wrong way." : tl ? "Something doesn't add up. At least one moment is at the wrong time." : "Something doesn't add up. At least one number on the grid is wrong.",
      'marks-incomplete': 'Mark every statement as True or Lie before closing the lead.',
      'marks-wrong': sk ? "The map is right, but your read on the witnesses isn't. Check each statement against it." : cp ? "The code is right, but your read on the witnesses isn't. Check each statement against it." : nw ? "The network is right, but your read on the witnesses isn't. Check each statement against it." : tl ? "The timeline is right, but your read on the witnesses isn't. Check each statement against it." : "The grid is right, but your read on the witnesses isn't. Check each statement against the grid.",
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
    const next = this.cf.leads.find((l) => l.id === lead.then && leadOpen(g, l.id) && !g.s.leads[l.id].started);
    const lies = puzzleOf(g, id).truth.filter((x) => !x).length;
    this.modals.push({
      title: `Lead closed: ${this.T(lead.title)}`,
      paragraphs: [],
      fact: this.T(lead.fact),
      note: lies ? `Exposing ${lies === 1 ? 'a liar' : 'the liars'} earned you a favor.` : undefined,
      dismissible: true,
      actions: next
        ? [{ label: `On to: ${this.T(next.title)}`, primary: true, run: () => { this.closeModal(); this.work(next.id); } }, { label: 'Later', run: this.closeModal }]
        : [{ label: 'Continue', primary: true, run: this.closeModal }],
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

  /** Picks the person to accuse; the next step is choosing the facts that prove it. */
  pickAccused(who: CastMember) {
    if (accuseStatus(this.g, who.id) !== 'ok') return;
    this.accuseTarget = who;
    this.evidence = [];
  }

  backToPeople() {
    this.accuseTarget = null;
    this.evidence = [];
  }

  toggleEvidence(leadId: string) {
    this.evidence = this.evidence.includes(leadId) ? this.evidence.filter((id) => id !== leadId) : [...this.evidence, leadId];
  }

  /** Nudges about this accusation, shown above the evidence list. */
  accuseNudges(who: CastMember): string[] {
    return pendingClues(this.g, { kind: 'accuse', person: who.id }).map((c) => this.T(c.message));
  }

  /** Makes the accusation with the chosen facts. It holds only if the proof is valid. */
  submitAccuse() {
    const who = this.accuseTarget;
    if (!who || !this.evidence.length) return;
    const g = this.g;
    const res = submitAccusation(g, who.id, this.evidence);
    this.modals = [];
    if (res.kind === 'accepted') {
      // only the full bust uncovers this rank's part of the case
      if (g.s.endingId === g.cf.endings[0].id) this.savePart(g.s.preset, g.s.endingId, g.s.character);
      return this.show('verdict');
    }
    if (res.kind === 'blocked') return;
    if (res.lost) return this.loseCase();
    const clocked = rules(g).clock !== 'off';
    const paragraphs = [
      ...this.proofFeedback(who),
      res.locked
        ? `You can't accuse ${who.name} again.`
        : `You have ${res.triesLeft} ${res.triesLeft === 1 ? 'try' : 'tries'} left on ${who.name}.`,
      `You have accused ${accusedPeople(g).length} of ${rules(g).accuse.people} people you're allowed to.`,
    ];
    if (res.refuses)
      paragraphs.push(
        clocked
          ? `${who.name} is furious about being accused and won't talk to you freely now. Any lead where they speak costs 1 more hour.`
          : `${who.name} is upset about being accused and won't be so friendly now.`,
      );
    this.show('accuse');
    this.modals.push({ title: 'Not proven', paragraphs, dismissible: true, actions: [{ label: 'Got it', primary: true, run: this.closeModal }] });
  }

  /** Says what is wrong with a rejected proof, without revealing who a fact points at. */
  proofFeedback(who: CastMember): string[] {
    const { wrong, incomplete } = proofProblems(this.g, who.id, this.evidence);
    const title = (id: string) => this.g.cf.leads.find((l) => l.id === id)?.title ?? id;
    const out = ["That doesn't hold up."];
    if (wrong.length)
      out.push(`Not every fact you chose counts against ${who.name}: ${wrong.map(title).join(', ')}. Some facts are red herrings, or point at someone else.`);
    if (incomplete) out.push(`The proof also has gaps: something that ties ${who.name} to the crime is still missing.`);
    if (!wrong.length && !incomplete) out.push('Look at what your case notes really prove.');
    return out;
  }

  /** Records this rank's part of the case as uncovered. */
  savePart(preset: Preset, ending: string, character?: string) {
    this.progress = recordPart(this.base, this.progress, preset, ending, character);
    this.titlePreset = nextRank(this.base, this.progress);
    try {
      localStorage.setItem(progressKey(this.base.id), JSON.stringify($state.snapshot(this.progress)));
    } catch {
      /* storage unavailable: the part counts for this visit only */
    }
  }

  /** The case is lost: no save, no notes, and nothing about who did it. */
  loseCase() {
    this.modals = [];
    window.dispatchEvent(new Event('notepad-clear'));
    this.save();
    this.show('lost');
  }

  /** Leaves the lost-case screen for a fresh start. */
  afterLost() {
    this.s = null;
    this.townPose = null;
    this.show('title');
  }

}
