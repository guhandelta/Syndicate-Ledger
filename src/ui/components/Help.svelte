<script lang="ts">
  import type { Preset } from '../../game/caseTypes';
  import { PRESET_RULES } from '../../game/presets';
  import { clockOn, leadCost, leadOpen, puzzleOf } from '../../game/state';
  import { t } from '../../game/text';
  import { abilityLabel } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();

  type Tab = 'play' | 'rank' | 'case' | 'controls';
  const TABS: [Tab, string][] = [['play', 'How to play'], ['rank', 'Your rank'], ['case', 'The case'], ['controls', 'Controls']];

  const g = $derived(session.game);
  const preset = $derived<Preset>(g ? g.s.preset : session.titlePreset);
  const r = $derived(PRESET_RULES[preset]);
  const tone = $derived(r.tone);
  const T = (x: Parameters<typeof t>[0]) => t(x, tone);
  const cf = $derived(session.cf);
  const hours = $derived(cf.clock.days * cf.clock.hoursPerDay + r.extraHours);
  const informant = $derived(cf.cast.find((c) => c.role === 'informant'));
  const allies = $derived(cf.cast.filter((c) => c.role === 'ally'));
  const people = $derived(cf.cast.filter((c) => c.role !== 'ally'));

  const FLAGS = {
    exact: 'Statements that are lies carry an Unverified tag, so you know exactly who is fibbing. Your job is to prove it with the grid.',
    possible: 'Anyone who might lie carries an Unverified tag. Some of them are telling the truth: the grid decides.',
    none: 'Nobody is tagged. Only the grid tells you who lied.',
  };
  const MISTAKES = {
    instant: 'A number that breaks a row, column or zone turns red straight away.',
    'on-request': 'Press Check my grid to see if a number is wrong. Nothing turns red on its own.',
    off: 'Nothing tells you a number is wrong until you try to close the lead. Think before you write.',
  };
  const EVENTS = {
    hints: 'There is no clock, so nothing happens behind your back.',
    rumors: 'Before anything happens on the clock, a rumor in your case notes warns you.',
    'some-hidden': 'Some things happen with no rumor first. Watch the clock and act early.',
  };

  function leadLine(id: string) {
    const lead = cf.leads.find((l) => l.id === id)!;
    const after = lead.opensAfter.map((a) => T(cf.leads.find((l) => l.id === a)!.title));
    return after.length ? `opens once you solve ${after.join(' and ')}` : 'open from the start';
  }
  function leadStatus(id: string) {
    if (!g) return '';
    const lp = g.s.leads[id];
    return lp.solved ? 'Solved' : lp.started ? 'In progress' : leadOpen(g, id) ? 'Open now' : 'Locked';
  }
  const size = (id: string) => (g ? puzzleOf(g, id).size : r.size);
  const cost = (id: string) => (g ? leadCost(g, id) : cf.leads.find((l) => l.id === id)!.cost);
  const timed = $derived(r.clock !== 'off');

  let panel: HTMLElement;
  $effect(() => {
    panel?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus();
  });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      session.helpOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="help-back" role="presentation" onclick={(e) => e.target === e.currentTarget && (session.helpOpen = false)}>
  <div class="help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1" bind:this={panel} onkeydown={onKey}>
    <div class="help-head">
      <h2 id="help-title">Help · {r.label} rank</h2>
      <button class="btn ghost" aria-label="Close help" onclick={() => (session.helpOpen = false)}>✕</button>
    </div>
    <div class="help-tabs" role="tablist" aria-label="Help topics">
      {#each TABS as [id, label]}
        <button role="tab" class="help-tab" aria-selected={session.helpTab === id} onclick={() => (session.helpTab = id)}>{label}</button>
      {/each}
    </div>

    <div class="help-body" role="tabpanel" tabindex="0" aria-label={TABS.find(([id]) => id === session.helpTab)![1]}>
      {#if session.helpTab === 'play'}
        <p>You are a detective. Each <strong>lead</strong> is a number puzzle, and solving it proves one fact about the crime. When you have enough facts, you name who did it.</p>
        <ol>
          <li><strong>Pick a lead</strong> on the evidence board (or walk to its door in the town). Opening a lead {timed ? 'costs hours on the clock' : 'is free in Junior'}.</li>
          <li><strong>Fill the grid.</strong> Rows are times, columns are people. Every number appears once in each row and once in each column.
            <ul>
              <li><strong>Cash ledgers:</strong> the numbers are {tone === 'friendly' ? 'coins' : 'cash in $k'}. Each outlined zone must add up to the total in its corner.</li>
              <li><strong>Camera logs:</strong> the numbers are rooms along the pier. A few sightings are already filled in.</li>
            </ul>
          </li>
          <li><strong>Test the statements.</strong> Witnesses say things about the grid. You're told how many of them are lies. Check each one against your grid and mark it <em>True</em> or <em>Lie</em>.</li>
          <li><strong>Close the lead.</strong> If the grid and your marks are right, you get a fact for your case notes. Catching a liar also earns you a favor.</li>
          <li><strong>Make your accusation</strong> when the facts point to someone. Who you name, and how much you've proven, decides your ending.</li>
        </ol>
        <h3>Favors and allies</h3>
        <p>Favors pay for help. You start with {r.startFavors}. Inside a lead, call an ally:</p>
        <ul>
          {#each allies as a (a.id)}<li><strong>{a.name}</strong>: {abilityLabel(a)}</li>{/each}
          {#if informant}<li><strong>{informant.name.replace(/"/g, '')}</strong> sells one extra statement for 1 favor{timed ? ' and 1 hour' : ''}. Be careful who you trust.</li>{/if}
        </ul>
        <p class="muted">Help from allies lowers your star rating at the end. The corner tips that appear when you've been still for 5 minutes are free.</p>
        <h3>When you hit a wall</h3>
        <p>Press <strong>What now?</strong> in the bottom-right corner at any time. It lists what you can do on the current screen and points to what to try next, without giving away an answer.</p>
        <h3>Your notebook</h3>
        <p>Press <strong>Notebook</strong> in the bottom-right corner to write down suspects, clues and who lied. It saves in this browser as you type, and its <em>Stuck? Try this</em> list has tips for when you hit a wall.</p>
        <h3>The people</h3>
        <p>Each person's card shows a trust meter. It changes as you mark and prove their statements: unknown, suspicious, caught lying, honestly mistaken, or verified.</p>
      {:else if session.helpTab === 'rank'}
        <p><strong>{r.label}</strong> (age {r.age}). {tone === 'friendly' ? 'A friendly version of the story with smaller puzzles.' : 'The full crime story.'}</p>
        <table class="help-table">
          <tbody>
            <tr><th scope="row">Grid size</th><td>{r.size}×{r.size}</td></tr>
            <tr><th scope="row">Clock</th><td>{timed ? `${hours} hours over ${cf.clock.days} days (${cf.clock.hoursPerDay} a day)` : 'No clock. Take as long as you like.'}</td></tr>
            <tr><th scope="row">Favors at the start</th><td>{r.startFavors}</td></tr>
            <tr><th scope="row">Who might be lying</th><td>{FLAGS[r.flagLiars]}{r.liarRange ? ' You are told a range for how many lies there are, not the exact number.' : ''}</td></tr>
            <tr><th scope="row">Wrong numbers</th><td>{MISTAKES[r.mistakes]}</td></tr>
            <tr><th scope="row">Things that happen</th><td>{EVENTS[r.events]}</td></tr>
          </tbody>
        </table>
        <h3>How to think at this rank</h3>
        {#if preset === 'junior'}
          <p>Start with the row or column that has the most numbers in it. If a statement has an Unverified tag, that person is fibbing: find the number in the grid that shows they got it wrong.</p>
        {:else if preset === 'detective'}
          <p>Fill what you're sure of first, then test the tagged statements. Only some tagged people lie: if a statement fits your grid, it's true. You have spare hours, so it's fine to use a favor when stuck.</p>
        {:else if preset === 'inspector'}
          <p>Nobody is tagged, so treat every statement as a maybe. Work out which statements must be true for the zones to add up, then the lie stands out. Watch the clock: each lead costs hours, and some leads lose witnesses if you wait.</p>
        {:else}
          <p>You get few favors, a short clock and no warning before some events. Plan the order of your leads before opening any, and don't spend favors early. You only know a range of how many lie, so prove each statement from the grid.</p>
        {/if}
        {#if !g}<p class="muted">Pick a different rank on the start screen to read about it here.</p>{/if}
      {:else if session.helpTab === 'case'}
        <p>{T(cf.setup)}</p>
        <h3>The leads, in the order they open</h3>
        <ol>
          {#each cf.leads as l (l.id)}
            <li>
              <strong>{T(l.title)}</strong>: {l.type === 'ledger' ? 'cash ledger' : 'camera log'}, {size(l.id)}×{size(l.id)}, {leadLine(l.id)}{timed ? `, costs ${cost(l.id)} hours` : ''}.
              {#if g}<span class="help-status">{leadStatus(l.id)}</span>{/if}
            </li>
          {/each}
        </ol>
        {#if timed}
          <h3>What can happen on the clock</h3>
          <ul>
            {#each cf.events as e (e.id)}
              {#if !(r.events === 'some-hidden' && e.ifFlag)}<li>{T(e.rumor)}</li>{/if}
            {/each}
          </ul>
          {#if r.events === 'some-hidden'}<p class="muted">At Chief rank, at least one more thing can happen without warning.</p>{/if}
          <p>Once you open a lead, its witnesses and evidence are safe, even if something happens later.</p>
        {/if}
        <h3>Who's who</h3>
        <ul>
          {#each people as c (c.id)}<li><strong>{c.name.replace(/"/g, '')}</strong>: {T(c.blurb)}</li>{/each}
        </ul>
        <h3>How it can end</h3>
        <ul>
          <li>Name the person behind it with every lead solved, and they're caught for good.</li>
          <li>Name them without the full trail, or name one of their helpers, and the boss gets away.</li>
          <li>Name an innocent person, and the gang wins.</li>
        </ul>
      {:else}
        <h3>In a lead</h3>
        <ul>
          <li>Click or tap a cell, then a number. Or use the arrow keys to move and 1–{r.size} to type.</li>
          <li>Backspace or 0 erases. P switches to small pencil notes.</li>
          <li>Ctrl+Z undoes, Ctrl+Shift+Z redoes.</li>
          <li>Mark each statement with its True or Lie button.</li>
        </ul>
        <h3>In the town (PC)</h3>
        <ul>
          <li>WASD or arrow keys to walk, Shift to run.</li>
          <li>E to talk to someone or go through a door. Glowing doors are leads you can open.</li>
          <li>C switches the camera, B opens the case board.</li>
        </ul>
        <h3>Anywhere</h3>
        <ul>
          <li>? or H opens this help. Esc closes it.</li>
          <li><strong>What now?</strong> (bottom right) tells you what you can do on the screen you're on and what to try next. Press it again to hide it.</li>
          <li>Notebook (bottom right) opens your case notebook. It saves as you type.</li>
          <li>☰ goes back to the start screen. Your case is saved in this browser.</li>
        </ul>
      {/if}
    </div>
  </div>
</div>
