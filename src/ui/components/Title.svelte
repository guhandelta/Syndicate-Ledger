<script lang="ts">
  import { PRESETS, type Preset } from '../../game/caseTypes';
  import { PRESET_RULES } from '../../game/presets';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();

  const DESC: Record<Preset, string> = {
    junior: '4×4 grids, friendly story, the fibber is marked, no clock.',
    detective: '5×5 grids, one liar per lead, suspects are flagged.',
    inspector: '6×6 grids, liars unmarked, the clock is on.',
    chief: '6×6 grids, you only know a range of liars, tight clock.',
  };
  const hasSave = $derived(!!session.s && !session.s.endingId);
</script>

<main class="title-screen">
  <div class="title-card">
    <p class="eyebrow">Case file 01</p>
    <h1>Syndicate Ledger</h1>
    <p class="lede">Crack the syndicate's books. Catch the liars. Close the case before the ship sails.</p>
    <h2 class="small-h">Choose your rank</h2>
    <div class="preset-grid" role="radiogroup" aria-label="Difficulty">
      {#each PRESETS as p}
        {@const r = PRESET_RULES[p]}
        <button class="preset" class:on={session.titlePreset === p} role="radio" aria-checked={session.titlePreset === p} onclick={() => (session.titlePreset = p)}>
          <span class="preset-name">{r.label}</span><span class="preset-age">{r.age}</span><span class="preset-desc">{DESC[p]}</span>
        </button>
      {/each}
    </div>
    <div class="title-actions">
      {#if hasSave}
        <button class="btn primary" onclick={() => session.continueCase()}>Continue case ({PRESET_RULES[session.s!.preset].label})</button>
      {/if}
      <button class="btn" class:primary={!hasSave} onclick={() => session.newCase()}>{hasSave ? 'Start over' : 'Open the case'}</button>
    </div>
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
    </details>
  </div>
</main>
