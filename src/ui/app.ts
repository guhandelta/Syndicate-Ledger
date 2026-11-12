import { nextStep } from '../engine/logic';
import type { Cell, GeneratedPuzzle } from '../engine/types';
import type { CaseEvent, CaseFile, CastMember, Lead, Preset, PuzzleBook } from '../game/caseTypes';
import { PRESETS } from '../game/caseTypes';
import { PRESET_RULES } from '../game/presets';
import {
  accuse, addFlag, buyTip, checkLead, clockOn, dayLabel, hoursLeft, leadCost, leadOpen, newGame, puzzleOf,
  recoverSpeaker, rules, solveLead, spendFavors, stars, startLead, totalHours, trustOf,
  type Game, type GameState, type Trust,
} from '../game/state';
import { describeClaim, gridLabels, t, type Tone } from '../game/text';

type Screen = 'title' | 'intro' | 'board' | 'puzzle' | 'accuse' | 'verdict';

interface Modal {
  title: string;
  body: string;
  actions: { label: string; action: string; primary?: boolean }[];
}

interface PuzzleUi {
  sel: Cell | null;
  pencil: boolean;
  undo: string[];
  redo: string[];
  hint: { cell: Cell; text: string } | null;
  flashWrong: boolean;
  zoneInfo: string | null;
  pickStatementFor: 'undercover' | null;
  message: string | null;
}

const SAVE_KEY = 'syndicate-ledger:save:v1';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function mountApp(root: HTMLElement, cf: CaseFile, book: PuzzleBook) {
  let game: Game | null = loadGame(cf, book);
  let screen: Screen = 'title';
  let leadId: string | null = null;
  let modals: Modal[] = [];
  let pui: PuzzleUi = freshPui();
  let titlePreset: Preset = game?.s.preset ?? 'inspector';

  function freshPui(): PuzzleUi {
    return { sel: null, pencil: false, undo: [], redo: [], hint: null, flashWrong: false, zoneInfo: null, pickStatementFor: null, message: null };
  }

  const tone = (): Tone => (game ? (rules(game).tone as Tone) : 'crime');
  const T = (x: Parameters<typeof t>[0]) => esc(t(x, tone()));
  const person = (id: string) => cf.cast.find((c) => c.id === id)!;
  const save = () => {
    try {
      if (game) localStorage.setItem(SAVE_KEY, JSON.stringify(game.s));
    } catch { /* storage unavailable: play continues without saving */ }
  };

  function eventModals(evs: CaseEvent[] | 'no-time' | 'cant') {
    if (!Array.isArray(evs)) return;
    for (const ev of evs) {
      if (ev.effect.type === 'endCase') {
        modals.push({ title: 'Time is up', body: `<p>${T(ev.message)}</p>`, actions: [{ label: 'Make your accusation', action: 'go-accuse', primary: true }] });
      } else modals.push({ title: 'Breaking news', body: `<p>${T(ev.message)}</p>`, actions: [{ label: 'Got it', action: 'close-modal', primary: true }] });
    }
  }

  // ---------- rendering ----------

  function render() {
    save();
    let html = '';
    if (screen === 'title') html = renderTitle();
    else if (!game) html = renderTitle();
    else if (screen === 'intro') html = renderIntro(game);
    else if (screen === 'board') html = renderBoard(game);
    else if (screen === 'puzzle' && leadId) html = renderPuzzle(game, leadId);
    else if (screen === 'accuse') html = renderAccuse(game);
    else if (screen === 'verdict') html = renderVerdict(game);
    if (modals.length) {
      const m = modals[0];
      html += `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${m.title}</h2>${m.body}
        <div class="modal-actions">${m.actions.map((a) => `<button class="btn ${a.primary ? 'primary' : ''}" data-action="${a.action}">${esc(a.label)}</button>`).join('')}</div>
      </div></div>`;
    }
    root.innerHTML = html;
    root.querySelector<HTMLElement>('.modal [data-action]')?.focus();
  }

  function renderTitle(): string {
    const hasSave = !!game && !game.s.endingId;
    return `<main class="title-screen">
      <div class="title-card">
        <p class="eyebrow">Case file 01</p>
        <h1>Syndicate Ledger</h1>
        <p class="lede">Crack the syndicate's books. Catch the liars. Close the case before the ship sails.</p>
        <h2 class="small-h">Choose your rank</h2>
        <div class="preset-grid" role="radiogroup" aria-label="Difficulty">
          ${PRESETS.map((p) => {
            const r = PRESET_RULES[p];
            const desc = {
              junior: '4×4 grids, friendly story, the fibber is marked, no clock.',
              detective: '5×5 grids, one liar per lead, suspects are flagged.',
              inspector: '6×6 grids, liars unmarked, the clock is on.',
              chief: '6×6 grids, you only know a range of liars, tight clock.',
            }[p];
            return `<button class="preset ${titlePreset === p ? 'on' : ''}" role="radio" aria-checked="${titlePreset === p}" data-action="pick-preset" data-preset="${p}">
              <span class="preset-name">${r.label}</span><span class="preset-age">${r.age}</span><span class="preset-desc">${desc}</span></button>`;
          }).join('')}
        </div>
        <div class="title-actions">
          ${hasSave ? `<button class="btn primary" data-action="continue">Continue case (${PRESET_RULES[game!.s.preset].label})</button>` : ''}
          <button class="btn ${hasSave ? '' : 'primary'}" data-action="new-game">${hasSave ? 'Start over' : 'Open the case'}</button>
        </div>
        <details class="how"><summary>How to play</summary>
          <ul>
            <li>Each lead is a grid. Rows are times, columns are people.</li>
            <li>Fill every row and column with each number once.</li>
            <li>Ledger grids: the numbers are cash, and each outlined zone must add up to its total.</li>
            <li>Camera grids: the numbers are rooms along the pier. A few sightings are filled in for you.</li>
            <li>Witnesses make statements. You're told how many are lies. Only one answer fits, and it tells you who lied.</li>
            <li>Mark every statement True or Lie, fill the grid, then close the lead.</li>
          </ul>
        </details>
      </div></main>`;
  }

  function renderIntro(g: Game): string {
    const people = cf.cast.filter((c) => c.role !== 'ally');
    const allies = cf.cast.filter((c) => c.role === 'ally');
    return `<main class="page">
      <p class="eyebrow">${PRESET_RULES[g.s.preset].label} · Case file 01</p>
      <h1>${T(cf.title)}</h1>
      <p class="setup">${T(cf.setup)}</p>
      <h2>People of interest</h2>
      <div class="cast-grid">${people.map((c) => castCard(c)).join('')}</div>
      <h2>Your allies</h2>
      <p class="muted">Allies help inside a puzzle. Each call costs favors. You start with ${g.s.favors}, and earn one each time you expose a liar.</p>
      <div class="cast-grid">${allies.map((c) => castCard(c)).join('')}</div>
      <div class="page-actions"><button class="btn primary" data-action="go-board">Go to the evidence board</button></div>
    </main>`;
  }

  function avatar(c: CastMember, small = false) {
    const initials = c.name.replace(/[^A-Za-z .]/g, '').split(' ').filter((w) => w && !w.endsWith('.')).map((w) => w[0]).join('').slice(0, 2);
    return `<span class="avatar ${small ? 'sm' : ''}" style="--c:${c.color}" aria-hidden="true">${esc(initials)}</span>`;
  }

  const TRUST_LABEL: Record<Trust, string> = { unknown: 'Unknown', suspicious: 'Suspicious', caught: 'Caught lying', mistaken: 'Honest mistake', verified: 'Verified' };

  function castCard(c: CastMember, trust?: Trust) {
    // the boss is shown as an ordinary suspect so the board doesn't give the ending away
    const shownRole = c.role === 'boss' ? 'suspect' : c.role;
    const role = c.role === 'ally' ? abilityLabel(c) : shownRole[0].toUpperCase() + shownRole.slice(1);
    return `<div class="cast-card">${avatar(c)}<div><div class="cast-name">${esc(c.name)}</div>
      <div class="cast-role">${esc(role)}${trust ? ` · <span class="trust trust-${trust}">${TRUST_LABEL[trust]}</span>` : ''}</div>
      <div class="cast-blurb">${T(c.blurb)}</div></div></div>`;
  }

  function abilityLabel(c: CastMember) {
    return { forensics: 'Forensics: reveals one cell (1 favor)', accountant: 'Accountant: lists what a zone can hold (1 favor)', undercover: 'Undercover: checks one statement (2 favors)', partner: 'Old partner: explains the next step (1 favor)' }[c.ability!];
  }

  function statusBar(g: Game) {
    const clock = clockOn(g)
      ? `<span class="pill" title="Investigation clock">${dayLabel(g)} · <strong>${hoursLeft(g)}</strong> of ${totalHours(g)} hours left</span>`
      : `<span class="pill">No clock in Junior mode</span>`;
    return `<header class="status">
      <button class="btn ghost" data-action="go-title" aria-label="Back to title">☰</button>
      <span class="case-name">${T(cf.title)}</span>
      ${clock}<span class="pill" title="Favors pay for allies and informants">Favors <strong>${g.s.favors}</strong></span>
    </header>`;
  }

  function renderBoard(g: Game): string {
    const r = rules(g);
    const rumors = cf.events.filter((e) => !g.s.firedEvents.includes(e.id) && !(r.events === 'some-hidden' && e.ifFlag));
    const facts = cf.leads.filter((l) => g.s.leads[l.id].solved);
    const fired = cf.events.filter((e) => g.s.firedEvents.includes(e.id) && (!e.ifFlag || g.s.flags.includes(e.ifFlag)) && e.effect.type !== 'endCase' && (!e.unlessSolved || !g.s.leads[e.unlessSolved].solved || e.effect.type === 'removeSpeaker'));
    return `${statusBar(g)}<main class="page board">
      <section aria-labelledby="leads-h"><h2 id="leads-h">Leads</h2>
        <div class="lead-grid">${cf.leads.map((l) => leadCard(g, l)).join('')}</div></section>
      <div class="board-cols">
        <section aria-labelledby="notes-h"><h2 id="notes-h">Case notes</h2>
          ${facts.length ? `<ul class="facts">${facts.map((l) => `<li><strong>${T(l.title)}:</strong> ${T(l.fact)}</li>`).join('')}</ul>` : '<p class="muted">Nothing proven yet. Solve a lead to add facts here.</p>'}
          ${fired.length ? `<h3>What happened</h3><ul class="facts">${fired.map((e) => `<li>${T(e.message)}</li>`).join('')}</ul>` : ''}
          ${r.clock !== 'off' && rumors.length ? `<h3>${r.events === 'hints' ? 'Hints' : 'Rumors'}</h3><ul class="rumors">${rumors.map((e) => `<li>${T(e.rumor)}</li>`).join('')}</ul>` : ''}
        </section>
        <section aria-labelledby="cast-h"><h2 id="cast-h">People</h2>
          <div class="cast-list">${cf.cast.filter((c) => c.role !== 'ally').map((c) => castCard(c, trustOf(g, c.id))).join('')}</div>
        </section>
      </div>
      <div class="page-actions"><button class="btn danger" data-action="go-accuse">Make an accusation</button></div>
    </main>`;
  }

  function leadCard(g: Game, l: Lead) {
    const lp = g.s.leads[l.id];
    const open = leadOpen(g, l.id);
    const p = puzzleOf(g, l.id);
    const state = lp.solved ? 'solved' : !open ? 'locked' : lp.started ? 'started' : 'open';
    const needs = l.opensAfter.map((id) => t(cf.leads.find((x) => x.id === id)!.title, tone())).join(' and ');
    const kind = l.type === 'ledger' ? 'Cash ledger' : 'Camera log';
    let action = '';
    if (state === 'open') action = `<button class="btn primary" data-action="work" data-lead="${l.id}">Work this lead${clockOn(g) ? ` (${leadCost(g, l.id)} h)` : ''}</button>`;
    if (state === 'started') action = `<button class="btn primary" data-action="work" data-lead="${l.id}">Keep working</button>`;
    if (state === 'solved') action = `<button class="btn" data-action="work" data-lead="${l.id}">Review</button>`;
    return `<article class="lead lead-${state}">
      <div class="lead-top"><span class="lead-id">${l.id}</span><span class="lead-kind">${kind} · ${p.size}×${p.size}</span>
        <span class="lead-state">${{ solved: '✓ Solved', locked: 'Locked', started: 'In progress', open: 'Open' }[state]}</span></div>
      <h3>${T(l.title)}</h3>
      <p>${state === 'locked' ? `Opens after: ${esc(needs)}.` : T(l.intro)}</p>
      ${action}
    </article>`;
  }

  // ---------- puzzle ----------

  function zoneMap(p: GeneratedPuzzle) {
    const zm: number[][] = p.solution.map((row) => row.map(() => -1));
    p.zones.forEach((z, i) => z.cells.forEach(([r, c]) => (zm[r][c] = i)));
    // 4-colour the zones so neighbours differ (colour + pattern, for colour-blind players)
    const colour: number[] = p.zones.map(() => -1);
    p.zones.forEach((z, i) => {
      const used = new Set<number>();
      for (const [r, c] of z.cells)
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = zm[r + dr]?.[c + dc];
          if (o !== undefined && o !== i && o >= 0 && colour[o] >= 0) used.add(colour[o]);
        }
      let k = 0;
      while (used.has(k)) k++;
      colour[i] = k % 4;
    });
    return { zm, colour };
  }

  function renderPuzzle(g: Game, id: string): string {
    const lead = cf.leads.find((l) => l.id === id)!;
    const p = puzzleOf(g, id);
    const lp = g.s.leads[id];
    const L = gridLabels(cf, lead, p.size, tone());
    const n = p.size;
    const { zm, colour } = zoneMap(p);
    const r = rules(g);
    const given = (rr: number, cc: number) => p.givens.some((x) => x.cell[0] === rr && x.cell[1] === cc) || lp.revealed.some((x) => x[0] === rr && x[1] === cc);
    const showWrong = r.mistakes === 'instant' || pui.flashWrong;
    const highlightCells = new Set<string>();
    if (pui.hint) highlightCells.add(pui.hint.cell.join(','));

    let grid = `<div class="grid-wrap"><table class="grid g${n} ${lp.solved ? 'done' : ''}" aria-label="${esc(t(lead.title, tone()))} grid"><thead><tr><th></th>`;
    L.people.forEach((name, c) => {
      const who = person(lead.columns[c]);
      grid += `<th scope="col" title="${esc(name)}"><span class="col-dot" style="--c:${who.color}"></span><span class="col-name">${esc(name.split(' ')[0])}</span></th>`;
    });
    grid += '</tr></thead><tbody>';
    for (let rr = 0; rr < n; rr++) {
      grid += `<tr><th scope="row">${esc(L.times[rr])}</th>`;
      for (let cc = 0; cc < n; cc++) {
        const v = lp.grid[rr][cc];
        const z = zm[rr][cc];
        const cls = ['cell'];
        if (z >= 0) {
          cls.push(`z${colour[z]}`);
          if (zm[rr - 1]?.[cc] !== z) cls.push('bt');
          if (zm[rr + 1]?.[cc] !== z) cls.push('bb');
          if (zm[rr]?.[cc - 1] !== z) cls.push('bl');
          if (zm[rr]?.[cc + 1] !== z) cls.push('br');
        }
        if (given(rr, cc)) cls.push('given');
        if (pui.sel && pui.sel[0] === rr && pui.sel[1] === cc) cls.push('sel');
        else if (pui.sel && (pui.sel[0] === rr || pui.sel[1] === cc)) cls.push('peer');
        if (v && pui.sel && lp.grid[pui.sel[0]][pui.sel[1]] === v) cls.push('same');
        if (v && dupe(lp.grid, rr, cc)) cls.push('dupe');
        if (v && showWrong && v !== p.solution[rr][cc]) cls.push('wrong');
        if (highlightCells.has(`${rr},${cc}`)) cls.push('hinted');
        const zoneLabel = z >= 0 && p.zones[z].cells[0][0] === rr && p.zones[z].cells[0][1] === cc ? `<span class="zsum">${esc(L.value(p.zones[z].sum).replace(' coins', ''))}</span>` : '';
        const notes = !v && lp.notes[rr][cc] ? `<span class="notes n${n}">${Array.from({ length: n }, (_, k) => `<i>${lp.notes[rr][cc] & (1 << (k + 1)) ? k + 1 : ''}</i>`).join('')}</span>` : '';
        const label = `${L.people[cc]}, ${L.times[rr]}: ${v ? L.value(v) : 'empty'}`;
        grid += `<td class="${cls.join(' ')}" data-action="cell" data-r="${rr}" data-c="${cc}" role="button" tabindex="-1" aria-label="${esc(label)}">${zoneLabel}${v ? `<span class="val">${v}</span>` : notes}</td>`;
      }
      grid += '</tr>';
    }
    grid += '</tbody></table></div>';

    const pad = `<div class="pad" role="group" aria-label="Number pad">
      ${Array.from({ length: n }, (_, k) => `<button class="btn key" data-action="num" data-v="${k + 1}"><strong>${k + 1}</strong>${lead.type === 'surveillance' ? `<small>${esc(lead.rooms![k])}</small>` : `<small>${esc(L.value(k + 1))}</small>`}</button>`).join('')}
      <button class="btn key" data-action="erase" aria-label="Erase">⌫<small>Erase</small></button>
      <button class="btn key ${pui.pencil ? 'on' : ''}" data-action="pencil" aria-pressed="${pui.pencil}">✎<small>Notes ${pui.pencil ? 'on' : 'off'}</small></button>
      <button class="btn key" data-action="undo" ${pui.undo.length ? '' : 'disabled'}>↶<small>Undo</small></button>
      <button class="btn key" data-action="redo" ${pui.redo.length ? '' : 'disabled'}>↷<small>Redo</small></button>
    </div>`;

    const lies = p.liarCounts;
    const liarLine = lies.length > 1
      ? `${lies[0]} or ${lies[1]} of these statements are lies.`
      : lies[0] === 0 ? (tone() === 'friendly' ? 'Everyone is telling the truth here.' : 'Every statement here is true.')
      : `Exactly ${lies[0]} of these statement${p.statements.length > 1 ? 's' : ''} ${lies[0] === 1 ? 'is a lie' : 'are lies'}.`;

    const statements = p.statements.map((s, i) => {
      const who = person(s.speaker);
      if (lp.missingSpeakers.includes(s.speaker)) {
        const ev = cf.events.find((e) => e.effect.type === 'removeSpeaker' && e.effect.speaker === s.speaker);
        const rec = ev && ev.effect.type === 'removeSpeaker' ? ev.effect.recover : { hours: 1, favors: 1 };
        return `<li class="stmt missing">${avatar(who, true)}<div class="stmt-body"><div class="stmt-who">${esc(who.name)}</div>
          <p>${esc(who.name)} has left town. This statement is lost unless you track them down.</p>
          <button class="btn sm" data-action="recover" data-speaker="${s.speaker}">Track down (${rec.hours} h + ${rec.favors} favor)</button></div></li>`;
      }
      const unverified = r.flagLiars === 'exact' ? !p.truth[i] : r.flagLiars === 'possible' ? who.reliability !== 'honest' : false;
      const m = lp.marks[i];
      const pick = pui.pickStatementFor ? `data-action="pick-statement" data-i="${i}"` : '';
      return `<li class="stmt mark-${m} ${pui.pickStatementFor ? 'pickable' : ''}" ${pick}>${avatar(who, true)}<div class="stmt-body">
        <div class="stmt-who">${esc(who.name)} ${unverified ? '<span class="tag">Unverified</span>' : ''}</div>
        <p>“${esc(describeClaim(s.claim, L, p.type))}”</p>
        ${lp.solved ? `<div class="verdict-tag ${p.truth[i] ? 'ok' : 'bad'}">${p.truth[i] ? 'True' : 'Lie'}</div>` : `<div class="mark-btns" role="group" aria-label="Your verdict">
          <button class="btn sm ${m === 'true' ? 'on-true' : ''}" data-action="mark" data-i="${i}" data-m="true" aria-pressed="${m === 'true'}">True</button>
          <button class="btn sm ${m === 'lie' ? 'on-lie' : ''}" data-action="mark" data-i="${i}" data-m="lie" aria-pressed="${m === 'lie'}">Lie</button></div>`}
      </div></li>`;
    }).join('');
    const tips = lp.paidTips.map((tip) => {
      const who = person(tip.speaker);
      return `<li class="stmt paid">${avatar(who, true)}<div class="stmt-body"><div class="stmt-who">${esc(who.name)} <span class="tag paid-tag">Paid tip</span></div>
        <p>“${esc(describeClaim(tip.claim, L, p.type))}”</p></div></li>`;
    }).join('');

    const informant = cf.cast.find((c) => c.role === 'informant');
    const allies = cf.cast.filter((c) => c.role === 'ally' && !(c.ability === 'accountant' && p.type !== 'ledger'));
    const allyCost = (c: CastMember) => (c.ability === 'undercover' ? 2 : 1);
    const allyPanel = lp.solved ? '' : `<section class="allies" aria-labelledby="allies-h"><h3 id="allies-h">Call an ally</h3>
      <div class="ally-btns">${allies.map((c) => `<button class="btn ally" data-action="ally" data-ability="${c.ability}" ${g.s.favors < allyCost(c) ? 'disabled' : ''}>
        ${avatar(c, true)}<span><strong>${esc(c.name)}</strong><small>${esc(abilityLabel(c))}</small></span></button>`).join('')}
      ${informant && !g.s.flags.includes(`${informant.id}-exposed`) ? `<button class="btn ally" data-action="buy-tip" ${g.s.favors < 1 ? 'disabled' : ''}>${avatar(informant, true)}<span><strong>Pay ${esc(informant.name)}</strong><small>One extra statement (1 favor${clockOn(g) ? ' + 1 h' : ''})</small></span></button>` : ''}
      </div></section>`;

    const roomKey = lead.type === 'surveillance' ? `<p class="room-key"><strong>Rooms along the pier:</strong> ${lead.rooms!.slice(0, n).map((rm, k) => `${k + 1} ${esc(rm)}`).join(' · ')}</p>` : '';

    return `${statusBar(g)}<main class="page puzzle">
      <div class="puzzle-head"><button class="btn ghost" data-action="go-board">← Board</button>
        <div><p class="eyebrow">${lead.id} · ${lead.type === 'ledger' ? 'Cash ledger' : 'Camera log'}</p><h1>${T(lead.title)}</h1></div></div>
      <p class="intro">${T(lead.intro)}</p>
      ${roomKey}
      <div class="puzzle-layout">
        <div class="left">${grid}
          ${lp.solved ? `<p class="solved-banner">✓ Solved. ${T(lead.fact)}</p>` : pad}
          ${pui.hint ? `<div class="hint-box" role="status"><strong>${esc(person('dex').name)}:</strong> “${esc(pui.hint.text)}”</div>` : ''}
          ${pui.zoneInfo ? `<div class="hint-box" role="status">${pui.zoneInfo}</div>` : ''}
          ${pui.message ? `<div class="msg" role="status">${pui.message}</div>` : ''}
          ${lp.solved ? '' : `<div class="close-row">
            ${r.mistakes === 'on-request' ? '<button class="btn" data-action="check-grid">Check my grid</button>' : ''}
            <button class="btn primary" data-action="close-lead">Close this lead</button></div>`}
        </div>
        <aside class="sidebar" aria-labelledby="stmts-h">
          <h2 id="stmts-h">Witness statements</h2>
          <p class="liar-line">${liarLine}</p>
          ${pui.pickStatementFor ? '<p class="pick-hint">Tap a statement for Officer Cole to check. <button class="btn sm" data-action="cancel-pick">Cancel</button></p>' : ''}
          <ul class="stmts">${statements}${tips}</ul>
          ${allyPanel}
        </aside>
      </div></main>`;
  }

  function dupe(grid: number[][], r: number, c: number) {
    const v = grid[r][c];
    for (let k = 0; k < grid.length; k++) {
      if (k !== c && grid[r][k] === v) return true;
      if (k !== r && grid[k][c] === v) return true;
    }
    return false;
  }

  // ---------- accusation & verdict ----------

  function renderAccuse(g: Game): string {
    const forced = clockOn(g) && hoursLeft(g) <= 0;
    const suspects = cf.cast.filter((c) => c.role !== 'ally');
    return `${statusBar(g)}<main class="page">
      <h1>Who is behind it?</h1>
      <p>${forced ? 'Time is up. ' : ''}Name the person you believe is running the operation. This ends the case.</p>
      <div class="accuse-grid">${suspects.map((c) => `<button class="accuse-card" data-action="accuse" data-person="${c.id}">${avatar(c)}<span class="cast-name">${esc(c.name)}</span><span class="trust trust-${trustOf(g, c.id)}">${TRUST_LABEL[trustOf(g, c.id)]}</span></button>`).join('')}</div>
      ${forced ? '' : '<div class="page-actions"><button class="btn" data-action="go-board">Not yet, back to the board</button></div>'}
    </main>`;
  }

  function renderVerdict(g: Game): string {
    const ending = cf.endings.find((e) => e.id === g.s.endingId)!;
    const st = stars(g);
    const boss = cf.cast.find((c) => c.role === 'boss')!;
    const rows: string[] = [];
    for (const lead of cf.leads) {
      const p = puzzleOf(g, lead.id);
      const lp = g.s.leads[lead.id];
      const L = gridLabels(cf, lead, p.size, tone());
      p.statements.forEach((s, i) => {
        if (p.truth[i]) return;
        const who = person(s.speaker);
        const motive = who.reliability === 'mistaken'
          ? `${esc(who.name)} wasn't lying on purpose. It was an honest mix-up.`
          : who.protects ? `${esc(who.name)} was covering for ${esc(person(who.protects).name)}.` : '';
        rows.push(`<li class="${lp.solved ? 'caught' : 'missed'}"><span class="tag ${lp.solved ? 'ok' : 'bad'}">${lp.solved ? 'Caught' : 'Missed'}</span>
          <strong>${esc(who.name)}</strong> said “${esc(describeClaim(s.claim, L, p.type))}” ${motive}</li>`);
      });
    }
    return `<main class="page verdict">
      <p class="eyebrow">Verdict · ${PRESET_RULES[g.s.preset].label}</p>
      <h1>${T(ending.title)}</h1>
      <p class="stars" aria-label="${st} of 3 stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</p>
      <p class="setup">${T(ending.text)}</p>
      <p>${boss.id === g.s.accused ? `You named <strong>${esc(boss.name)}</strong>, and you were right.` : `You accused <strong>${esc(person(g.s.accused!).name)}</strong>. The real boss was <strong>${esc(boss.name)}</strong>.`}</p>
      <h2>Every lie in this case</h2>
      <ul class="lie-list">${rows.join('')}</ul>
      <h2>Your investigation</h2>
      <ul class="facts">
        <li>Leads solved: ${cf.leads.filter((l) => g.s.leads[l.id].solved).length} of ${cf.leads.length}</li>
        ${clockOn(g) ? `<li>Hours used: ${g.s.hoursUsed} of ${totalHours(g)}</li>` : ''}
        <li>Hints from allies: ${g.s.hintsUsed}</li>
      </ul>
      <div class="page-actions"><button class="btn primary" data-action="go-title">Play again</button></div>
    </main>`;
  }

  // ---------- actions ----------

  function snapshot(id: string) {
    const lp = game!.s.leads[id];
    return JSON.stringify({ grid: lp.grid, notes: lp.notes });
  }
  function pushUndo() {
    pui.undo.push(snapshot(leadId!));
    if (pui.undo.length > 200) pui.undo.shift();
    pui.redo = [];
  }
  function restore(snap: string) {
    const o = JSON.parse(snap);
    game!.s.leads[leadId!].grid = o.grid;
    game!.s.leads[leadId!].notes = o.notes;
  }

  function isLocked(r: number, c: number) {
    const p = puzzleOf(game!, leadId!);
    const lp = game!.s.leads[leadId!];
    return lp.solved || p.givens.some((x) => x.cell[0] === r && x.cell[1] === c) || lp.revealed.some((x) => x[0] === r && x[1] === c);
  }

  function enter(v: number) {
    if (!game || !leadId || !pui.sel) return;
    const [r, c] = pui.sel;
    if (isLocked(r, c)) return;
    const lp = game.s.leads[leadId];
    pushUndo();
    if (pui.pencil && v) {
      if (!lp.grid[r][c]) lp.notes[r][c] ^= 1 << v;
    } else {
      lp.grid[r][c] = lp.grid[r][c] === v ? 0 : v;
      if (v) {
        // clear this number from notes in the same row and column
        const n = lp.grid.length;
        for (let k = 0; k < n; k++) { lp.notes[r][k] &= ~(1 << v); lp.notes[k][c] &= ~(1 << v); }
      }
    }
    if (!v) { lp.grid[r][c] = 0; lp.notes[r][c] = 0; }
    pui.hint = null;
    pui.message = null;
  }

  function useAlly(ability: string) {
    const g = game!;
    const id = leadId!;
    const p = puzzleOf(g, id);
    const lp = g.s.leads[id];
    const lead = cf.leads.find((l) => l.id === id)!;
    const L = gridLabels(cf, lead, p.size, tone());
    pui.zoneInfo = null;
    pui.hint = null;
    if (ability === 'forensics') {
      if (!pui.sel || isLocked(pui.sel[0], pui.sel[1])) { pui.message = 'Select an empty cell first, then call Dr. Abara.'; return; }
      if (!spendFavors(g, 1)) return;
      const [r, c] = pui.sel;
      pushUndo();
      lp.grid[r][c] = p.solution[r][c];
      lp.revealed.push([r, c]);
      g.s.hintsUsed++;
      pui.message = `Dr. Abara confirms: ${esc(L.people[c])} at ${esc(L.times[r])} is ${esc(L.value(p.solution[r][c]))}.`;
    } else if (ability === 'accountant') {
      if (!pui.sel) { pui.message = 'Select a cell inside a zone first, then call Mara.'; return; }
      const z = p.zones.findIndex((zz) => zz.cells.some(([r, c]) => r === pui.sel![0] && c === pui.sel![1]));
      if (z < 0) return;
      if (!spendFavors(g, 1)) return;
      g.s.hintsUsed++;
      const zone = p.zones[z];
      const combos = zoneCombos(p, lp.grid, zone.cells, zone.sum);
      pui.zoneInfo = `<strong>Mara Quill:</strong> This zone totals ${esc(L.value(zone.sum))} over ${zone.cells.length} cells. With what's already in its rows and columns, it can only be made from: ${combos.map((cb) => `<span class="combo">${cb.join(' + ')}</span>`).join(' ') || 'nothing. Something on your grid is wrong.'}`;
    } else if (ability === 'undercover') {
      if (g.s.favors < 2) return;
      pui.pickStatementFor = 'undercover';
    } else if (ability === 'partner') {
      const wrong = findWrong(p, lp.grid);
      if (!spendFavors(g, 1)) return;
      g.s.hintsUsed++;
      if (wrong) {
        pui.hint = { cell: wrong, text: `Hold on. Look again at ${L.people[wrong[1]]} at ${L.times[wrong[0]]}. That number doesn't fit the case.` };
        return;
      }
      const placed = lp.grid.map((row) => row.slice());
      const step = nextStep(p, p.truth, placed);
      if (!step) { pui.message = `<strong>${esc(person('dex').name)}:</strong> “The grid looks complete. Now check each statement against it.”`; return; }
      pui.sel = step.cell;
      pui.hint = { cell: step.cell, text: `Look at ${L.people[step.cell[1]]} at ${L.times[step.cell[0]]}. ${step.reason}` };
    }
  }

  function zoneCombos(p: GeneratedPuzzle, grid: number[][], cells: Cell[], sum: number): number[][] {
    const seen = new Set<string>();
    const out: number[][] = [];
    const vals: number[] = [];
    const n = p.size;
    const rec = (i: number, s: number) => {
      if (i === cells.length) {
        if (s === sum) { const k = [...vals].sort((a, b) => a - b).join(','); if (!seen.has(k)) { seen.add(k); out.push(k.split(',').map(Number)); } }
        return;
      }
      const [r, c] = cells[i];
      for (let v = 1; v <= n; v++) {
        if (s + v > sum) break;
        if (grid[r][c] && grid[r][c] !== v) continue;
        let bad = false;
        for (let k = 0; k < n && !bad; k++) {
          if (k !== c && grid[r][k] === v && !cells.some(([rr, cc]) => rr === r && cc === k)) bad = true;
          if (k !== r && grid[k][c] === v && !cells.some(([rr, cc]) => rr === k && cc === c)) bad = true;
        }
        for (let j = 0; j < i && !bad; j++) if (vals[j] === v && (cells[j][0] === r || cells[j][1] === c)) bad = true;
        if (bad) continue;
        vals[i] = v;
        rec(i + 1, s + v);
      }
    };
    rec(0, 0);
    return out;
  }

  function findWrong(p: GeneratedPuzzle, grid: number[][]): Cell | null {
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (grid[r][c] && grid[r][c] !== p.solution[r][c]) return [r, c];
    return null;
  }

  function closeLead() {
    const g = game!;
    const id = leadId!;
    const res = checkLead(g, id);
    const lead = cf.leads.find((l) => l.id === id)!;
    const msgs: Record<string, string> = {
      'grid-incomplete': 'The grid still has empty cells.',
      'grid-wrong': "Something doesn't add up. At least one number on the grid is wrong.",
      'marks-incomplete': 'Mark every statement as True or Lie before closing the lead.',
      'marks-wrong': "The grid is right, but your read on the witnesses isn't. Check each statement against the grid.",
    };
    if (res !== 'solved') { pui.message = msgs[res]; return; }
    solveLead(g, id);
    const lies = puzzleOf(g, id).truth.filter((x) => !x).length;
    modals.push({
      title: `Lead closed: ${T(lead.title)}`,
      body: `<p class="fact">${T(lead.fact)}</p>${lies ? `<p class="muted">Exposing ${lies === 1 ? 'a liar' : 'the liars'} earned you a favor.</p>` : ''}`,
      actions: [{ label: 'Continue', action: 'close-modal', primary: true }],
    });
    screen = 'board';
    leadId = null;
    const offer = cf.offers.find((o) => o.after === id && !g.s.offersSeen.includes(o.id));
    if (offer) {
      const from = person(offer.from);
      modals.push({
        title: `${esc(from.name)} wants a word`,
        body: `<div class="offer">${avatar(from)}<p>${T(offer.text)}</p></div><p class="muted">Costs ${offer.cost.favors} favor. You have ${g.s.favors}.</p>`,
        actions: [
          { label: 'Decline', action: `offer-no:${offer.id}` },
          ...(g.s.favors >= offer.cost.favors ? [{ label: 'Accept', action: `offer-yes:${offer.id}`, primary: true }] : []),
        ],
      });
    }
  }

  function handle(action: string, el: HTMLElement) {
    const g = game;
    switch (action) {
      case 'pick-preset': titlePreset = el.dataset.preset as Preset; break;
      case 'continue': screen = 'board'; break;
      case 'new-game': game = newGame(cf, book, titlePreset); screen = 'intro'; break;
      case 'go-title': screen = 'title'; modals = []; break;
      case 'go-board': modals = []; screen = g?.s.endingId ? 'verdict' : 'board'; leadId = null; break;
      case 'go-accuse': modals = []; screen = 'accuse'; break;
      case 'close-modal': modals.shift(); break;
      case 'work': {
        const id = el.dataset.lead!;
        const res = startLead(g!, id);
        if (res === 'no-time') { modals.push({ title: 'Not enough time', body: '<p>There aren\'t enough hours left to work this lead. Make your accusation with what you have.</p>', actions: [{ label: 'Make an accusation', action: 'go-accuse', primary: true }, { label: 'Back', action: 'close-modal' }] }); break; }
        leadId = id; screen = 'puzzle'; pui = freshPui();
        eventModals(res);
        break;
      }
      case 'cell': pui.sel = [Number(el.dataset.r), Number(el.dataset.c)]; pui.message = null; break;
      case 'num': enter(Number(el.dataset.v)); break;
      case 'erase': enter(0); break;
      case 'pencil': pui.pencil = !pui.pencil; break;
      case 'undo': if (pui.undo.length) { pui.redo.push(snapshot(leadId!)); restore(pui.undo.pop()!); } break;
      case 'redo': if (pui.redo.length) { pui.undo.push(snapshot(leadId!)); restore(pui.redo.pop()!); } break;
      case 'mark': {
        const lp = g!.s.leads[leadId!];
        const i = Number(el.dataset.i);
        const m = el.dataset.m as 'true' | 'lie';
        lp.marks[i] = lp.marks[i] === m ? 'unknown' : m;
        break;
      }
      case 'check-grid': {
        const wrong = findWrong(puzzleOf(g!, leadId!), g!.s.leads[leadId!].grid);
        pui.flashWrong = true;
        pui.message = wrong ? 'Wrong numbers are shown in red.' : 'Everything on the grid so far is correct.';
        setTimeout(() => { pui.flashWrong = false; render(); }, 2500);
        break;
      }
      case 'close-lead': closeLead(); break;
      case 'ally': useAlly(el.dataset.ability!); break;
      case 'cancel-pick': pui.pickStatementFor = null; break;
      case 'pick-statement': {
        if (pui.pickStatementFor !== 'undercover') break;
        const i = Number(el.dataset.i);
        const p = puzzleOf(g!, leadId!);
        if (!spendFavors(g!, 2)) break;
        g!.s.hintsUsed++;
        pui.pickStatementFor = null;
        g!.s.leads[leadId!].marks[i] = p.truth[i] ? 'true' : 'lie';
        pui.message = `Officer Cole checked it: that statement is <strong>${p.truth[i] ? 'true' : 'a lie'}</strong>.`;
        break;
      }
      case 'buy-tip': {
        const informant = cf.cast.find((c) => c.role === 'informant')!;
        const res = buyTip(g!, leadId!, informant.id);
        pui.message = res === 'cant' ? `${esc(informant.name)} has nothing more to sell right now.` : `${esc(informant.name)} pockets the favor and leans in close.`;
        break;
      }
      case 'recover': {
        const res = recoverSpeaker(g!, leadId!, el.dataset.speaker!);
        if (res === 'cant') pui.message = "You don't have the time or favors to track them down.";
        else eventModals(res);
        break;
      }
      case 'accuse': {
        const who = person(el.dataset.person!);
        modals.push({ title: `Accuse ${esc(who.name)}?`, body: '<p>This ends the case. There is no going back.</p>', actions: [{ label: 'Cancel', action: 'close-modal' }, { label: 'Accuse', action: `accuse-yes:${who.id}`, primary: true }] });
        break;
      }
      default: {
        const [kind, arg] = action.split(':');
        if (kind === 'accuse-yes') { accuse(g!, arg); modals = []; screen = 'verdict'; }
        if (kind === 'offer-yes' || kind === 'offer-no') {
          const offer = cf.offers.find((o) => o.id === arg)!;
          g!.s.offersSeen.push(offer.id);
          modals.shift();
          if (kind === 'offer-yes') { spendFavors(g!, offer.cost.favors); addFlag(g!, offer.id); }
          modals.push({ title: esc(person(offer.from).name), body: `<p>${T(kind === 'offer-yes' ? offer.accept : offer.decline)}</p>`, actions: [{ label: 'Continue', action: 'close-modal', primary: true }] });
        }
      }
    }
    render();
  }

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    // inside a pickable statement, the mark buttons still work as marks
    if (el.dataset.action === 'pick-statement' && (e.target as HTMLElement).closest('[data-action="mark"]')) return;
    handle(el.dataset.action!, el);
  });

  document.addEventListener('keydown', (e) => {
    if (modals.length && e.key === 'Escape' && modals[0].actions.some((a) => a.action === 'close-modal')) { modals.shift(); render(); return; }
    if (screen !== 'puzzle' || !game || !leadId || modals.length) return;
    const n = puzzleOf(game, leadId).size;
    const k = e.key;
    if (/^[1-9]$/.test(k) && Number(k) <= n) { enter(Number(k)); render(); e.preventDefault(); return; }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { enter(0); render(); e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'n') { pui.pencil = !pui.pencil; render(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { handle(e.shiftKey ? 'redo' : 'undo', document.body); e.preventDefault(); return; }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[k]) {
      const [dr, dc] = moves[k];
      const [r, c] = pui.sel ?? [0, 0];
      pui.sel = [(r + dr + n) % n, (c + dc + n) % n];
      render();
      e.preventDefault();
    }
  });

  render();
}

function loadGame(cf: CaseFile, book: PuzzleBook): Game | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1 || s.caseId !== cf.id) return null;
    return { cf, book, s };
  } catch {
    return null;
  }
}
