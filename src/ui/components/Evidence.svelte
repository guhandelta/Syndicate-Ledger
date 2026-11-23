<script lang="ts">
  import { linkedIn } from '../../engine/network';
  import type { CipherPuzzle } from '../../engine/cipher';
  import type { NetworkPuzzle } from '../../engine/network';
  import type { TimelinePuzzle } from '../../engine/timeline';
  import type { GeneratedPuzzle } from '../../engine/types';
  import { gridLabels, networkPeople, timelineLabels } from '../../game/text';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  let panel: HTMLElement;
  const g = $derived(session.g);
  const solved = $derived(session.cf.leads.filter((l) => g.s.leads[l.id]?.solved && session.answers[l.id]));

  $effect(() => panel.focus());
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      session.evidenceOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="help-back" role="presentation" onclick={(e) => e.target === e.currentTarget && (session.evidenceOpen = false)}>
  <div class="help" role="dialog" aria-modal="true" aria-labelledby="evidence-title" tabindex="-1" bind:this={panel} onkeydown={onKey}>
    <div class="help-head">
      <h2 id="evidence-title">Evidence</h2>
      <button class="btn ghost" aria-label="Close evidence" onclick={() => (session.evidenceOpen = false)}>✕</button>
    </div>
    <div class="help-body">
      <p class="muted">The answers to the leads you have solved. A clue that says “the same as…” points back here.</p>
      {#each solved as lead (lead.id)}
        {@const p = session.answers[lead.id]!}
        <section class="evidence-sheet">
          <h3>{session.T(lead.title)}</h3>
          {#if p.type === 'timeline'}
            {@const tp = p as TimelinePuzzle}
            {@const L = timelineLabels(lead, tp.size, session.tone)}
            <ol>
              {#each Array.from({ length: tp.size }, (_, k) => tp.solution.indexOf(k + 1)) as m, k}
                <li><strong>{L.times[k]}</strong>: {L.moments[m]}</li>
              {/each}
            </ol>
          {:else if p.type === 'network'}
            {@const np = p as NetworkPuzzle}
            {@const people = networkPeople(session.cf, lead, np.size)}
            <ul>
              {#each people as who, a}
                <li><strong>{who}</strong>: {people.filter((_, b) => b !== a && linkedIn(np.size, np.links, a, b)).join(', ') || 'nobody'}</li>
              {/each}
            </ul>
          {:else if p.type === 'cipher'}
            <div class="evidence-code" aria-label="The code">{#each (p as CipherPuzzle).code as d}<span>{d}</span>{/each}</div>
          {:else}
            {@const gp = p as GeneratedPuzzle}
            {@const L = gridLabels(session.cf, lead, gp.size, session.tone)}
            <table class="evidence-table">
              <thead><tr><th></th>{#each L.people as who}<th>{who}</th>{/each}</tr></thead>
              <tbody>
                {#each gp.solution as row, r}
                  <tr><th>{L.times[r]}</th>{#each row as v}<td title={L.value(v)}>{gp.type === 'ledger' ? L.value(v) : v}</td>{/each}</tr>
                {/each}
              </tbody>
            </table>
            {#if gp.type === 'surveillance'}<p class="muted">Rooms: {(lead.rooms ?? []).slice(0, gp.size).map((room, k) => `${k + 1} ${room}`).join(' · ')}</p>{/if}
          {/if}
        </section>
      {:else}
        <p>Nothing solved yet.</p>
      {/each}
    </div>
  </div>
</div>
