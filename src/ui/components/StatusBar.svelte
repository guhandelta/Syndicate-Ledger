<script lang="ts">
  import { clockOn, dayLabel, hoursLeft, totalHours } from '../../game/state';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
</script>

<header class="status">
  <button class="btn ghost" aria-label="Back to title" onclick={session.goTitle}>☰</button>
  <span class="case-name">{session.T(session.cf.title)}</span>
  {#if clockOn(g)}
    <span class="pill" title="Investigation clock">{dayLabel(g)} · <strong>{hoursLeft(g)}</strong> of {totalHours(g)} hours left</span>
  {:else}
    <span class="pill">No clock in Junior mode</span>
  {/if}
  <span class="pill" title="Favors pay for allies and informants">Favors <strong>{g.s.favors}</strong></span>
</header>
