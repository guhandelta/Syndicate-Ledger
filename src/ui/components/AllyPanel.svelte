<script lang="ts">
  import { clockOn } from '../../game/state';
  import { abilityLabel, allyCost } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';
  import Avatar from './Avatar.svelte';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const informant = $derived(session.cf.cast.find((c) => c.role === 'informant'));
  const allies = $derived(session.cf.cast.filter((c) => c.role === 'ally' && !(c.ability === 'accountant' && session.puzzle.type !== 'ledger')));
</script>

<section class="allies" aria-labelledby="allies-h">
  <h3 id="allies-h">Call an ally</h3>
  <div class="ally-btns">
    {#each allies as c (c.id)}
      <button class="btn ally" disabled={g.s.favors < allyCost(c)} onclick={() => session.useAlly(c)}>
        <Avatar person={c} small /><span><strong>{c.name}</strong><small>{abilityLabel(c)}</small></span>
      </button>
    {/each}
    {#if informant && !g.s.flags.includes(`${informant.id}-exposed`)}
      <button class="btn ally" disabled={g.s.favors < 1} onclick={() => session.buyTip()}>
        <Avatar person={informant} small /><span><strong>Pay {informant.name}</strong><small>One extra statement (1 favor{clockOn(g) ? ' + 1 h' : ''})</small></span>
      </button>
    {/if}
  </div>
</section>
