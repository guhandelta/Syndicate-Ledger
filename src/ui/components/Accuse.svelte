<script lang="ts">
  import { clockOn, hoursLeft, trustOf } from '../../game/state';
  import type { Session } from '../session.svelte';
  import { expressionFor } from '../voices';
  import Portrait from './Portrait.svelte';
  import StatusBar from './StatusBar.svelte';
  import { TRUST_LABEL } from './labels';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const forced = $derived(clockOn(g) && hoursLeft(g) <= 0);
  const suspects = $derived(session.cf.cast.filter((c) => c.role !== 'ally'));
</script>

<StatusBar {session} />
<main class="page">
  <h1>Who is behind it?</h1>
  <p>{forced ? 'Time is up. ' : ''}Name the person you believe is running the operation. This ends the case.</p>
  <div class="accuse-grid">
    {#each suspects as c (c.id)}
      {@const trust = trustOf(g, c.id)}
      <button class="accuse-card" onclick={() => session.askAccuse(c)}>
        <Portrait person={c} expression={expressionFor(trust)} friendly={session.tone === 'friendly'} size={72} /><span class="cast-name">{c.name}</span><span class="trust trust-{trust}">{TRUST_LABEL[trust]}</span>
      </button>
    {/each}
  </div>
  {#if !forced}
    <div class="page-actions"><button class="btn" onclick={session.goBoard}>{session.hub === 'town' ? 'Not yet, back to the town' : 'Not yet, back to the board'}</button></div>
  {/if}
</main>
