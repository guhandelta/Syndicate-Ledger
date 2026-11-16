<script lang="ts">
  import { PRESETS, type Preset } from '../../game/caseTypes';
  import { PRESET_RULES } from '../../game/presets';
  import { caseBoard, caseClosed, partsTotal, partsUncovered } from '../../game/rankStory';
  import { clockOn, hoursLeft } from '../../game/state';
  import { t } from '../../game/text';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();

  const DESC: Record<Preset, string> = {
    junior: '4×4 grids, friendly story, the fibber is marked, no clock.',
    detective: '5×5 grids, one liar per lead, suspects are flagged.',
    inspector: '6×6 grids, liars unmarked, the clock is on.',
    chief: '7×7 grids, you only know a range of liars.',
  };
  const hasSave = $derived(!!session.s && !session.s.endingId);
  /** A returning player sees the welcome-back page until they choose to start a new case. */
  let picking = $state(false);
  const showPicker = $derived(!hasSave || picking);
  const solved = $derived(hasSave ? Object.values(session.s!.leads).filter((l) => l.solved).length : 0);
  const total = $derived(hasSave ? Object.keys(session.s!.leads).length : 0);

  const cf = $derived(session.base);
  const parts = $derived(partsTotal(cf));
  const found = $derived(partsUncovered(cf, session.progress));
  const closed = $derived(caseClosed(cf, session.progress));
  const board = $derived(caseBoard(cf, session.progress));
  const below = (p: Preset) => PRESET_RULES[PRESETS[PRESETS.indexOf(p) - 1]]?.label;
  const pickOpen = $derived(session.unlocked(session.titlePreset));
  const characters = $derived(cf.characters ?? []);
  /** Text on the start page is not tied to a running game, so it reads in the tone of the rank picked. */
  const T = (x: Parameters<typeof t>[0]) => t(x, PRESET_RULES[session.titlePreset].tone as 'crime' | 'friendly');
</script>

<main class="title-screen">
  <div class="title-card">
    <p class="eyebrow">Case file 01</p>
    <h1>Syndicate Ledger</h1>
    <p class="lede">Crack the syndicate's books. Catch the liars. Close the case before the ship sails.</p>
    {#if showPicker}
      <h2 class="small-h">Choose your rank</h2>
      <div class="preset-grid" role="radiogroup" aria-label="Difficulty">
        {#each PRESETS as p}
          {@const r = PRESET_RULES[p]}
          {@const open = session.unlocked(p)}
          <button class="preset" class:on={session.titlePreset === p} class:locked={!open} role="radio" aria-checked={session.titlePreset === p} onclick={() => (session.titlePreset = p)}>
            <span class="preset-name">{r.label}{#if !open} <span class="lock" aria-label="locked">🔒</span>{:else if session.progress.parts[p]} <span class="done-mark" aria-label="solved">✓</span>{/if}</span><span class="preset-age">{r.age}</span><span class="preset-desc">{DESC[p]}</span>
          </button>
        {/each}
      </div>
      {#if !pickOpen}<p class="lede locked-note">{PRESET_RULES[session.titlePreset].label} opens once you solve the {below(session.titlePreset)} part of the case.</p>{/if}
      {#if characters.length}
        <h2 class="small-h">Choose who you are</h2>
        <div class="preset-grid" role="radiogroup" aria-label="Character">
          {#each characters as c}
            <button
              class="preset"
              class:on={session.titleCharacter === c.id}
              role="radio"
              aria-checked={session.titleCharacter === c.id}
              disabled={!c.ready}
              onclick={() => (session.titleCharacter = c.id)}
            >
              <span class="preset-name">{c.name}</span><span class="preset-desc">{c.ready ? T(c.blurb) : 'Coming soon'}</span>
            </button>
          {/each}
        </div>
      {/if}
      {#if hasSave}<p class="lede">Starting a new case replaces your saved {PRESET_RULES[session.s!.preset].label} case.</p>{/if}
      <div class="title-actions">
        <button class="btn primary" disabled={!pickOpen} onclick={() => session.newCase()}>Open the case</button>
        {#if hasSave}<button class="btn" onclick={() => (picking = false)}>Back to my case</button>{/if}
      </div>
    {:else}
      <h2 class="small-h">Welcome back, {PRESET_RULES[session.s!.preset].label}</h2>
      <ul class="welcome-stats">
        <li>{solved} of {total} leads solved</li>
        <li>{clockOn(session.g) ? `${hoursLeft(session.g)} hours left on the clock` : 'No clock on this rank'}</li>
        <li>{session.s!.favors} {session.s!.favors === 1 ? 'favor' : 'favors'} in hand</li>
      </ul>
      <div class="title-actions">
        <button class="btn primary" onclick={() => session.continueCase()}>Continue case ({PRESET_RULES[session.s!.preset].label})</button>
        <button class="btn" onclick={() => (picking = true)}>Start a new case</button>
      </div>
    {/if}
    {#if parts.length}
      <section class="case-board" aria-label="The case so far">
        <h2 class="small-h">The case so far: {found.length} {found.length === 1 ? 'part' : 'parts'} uncovered</h2>
        {#if closed && cf.closing}
          <p class="closing"><strong>{T(cf.closing.title)}</strong> {T(cf.closing.text)}</p>
        {/if}
        <ol class="parts">
          {#each board.filter((r) => r.state !== 'hidden') as row (row.preset)}
            <li class:got={row.state === 'found'}>
              <span class="part-rank">{PRESET_RULES[row.preset].label}</span>
              {#if row.state === 'found'}
                <strong>{T(row.part!.title)}</strong> <span class="muted">{T(row.part!.reveal)}</span>
              {:else}
                <strong>{T(row.part!.question)}</strong> <span class="muted">Not uncovered yet.</span>
              {/if}
            </li>
          {/each}
          {#if board.some((r) => r.state === 'hidden')}
            <li class="locked">
              <span class="part-rank">More</span>
              <strong>???</strong> <span class="muted">There is more to this case. Uncover the part above to see it.</span>
            </li>
          {/if}
        </ol>
      </section>
    {/if}
    <details class="how">
      <summary>How to play</summary>
      <ul>
        <li>Each lead is a grid. Rows are times, columns are people.</li>
        <li>Fill every row and column with each number once.</li>
        <li>Ledger grids: the numbers are cash, and each outlined zone must add up to its total.</li>
        <li>Camera grids: the numbers are rooms along the pier. A few sightings are filled in for you.</li>
        <li>Witnesses make statements. You're told how many are lies. Only one answer fits, and it tells you who lied.</li>
        <li>Mark every statement True or Lie, fill the grid, then close the lead.</li>
      </ul>
      <button class="btn sm" onclick={() => session.openHelp('play')}>Full help (?)</button>
    </details>
  </div>
</main>
