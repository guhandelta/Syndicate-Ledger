<script lang="ts">
  import { pairs } from '../../engine/network';
  import type { Session } from '../session.svelte';

  /**
   * A network lead: who was in contact with whom. Each person's number of contacts is known (a phone bill's count);
   * the player decides every pair of people as "in contact" or "never in contact".
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.network);
  const lp = $derived(session.lp);
  const names = $derived(session.netPeople);
  const ps = $derived(pairs(p.size));
  const links = $derived(lp.links ?? []);
  const picked = $derived(session.pui.pair);
  const wrong = (k: number) => session.pui.flashWrong && links[k] !== 0 && (links[k] === 1) !== (p.links[k] === 1);
  /** Contacts the player has marked so far for a person. */
  const found = (who: number) => ps.reduce((n, [a, b], k) => n + ((a === who || b === who) && links[k] === 1 ? 1 : 0), 0);
</script>

<div class="network-wrap">
  <h2 class="moments-h" id="counts-h">Contacts each person had</h2>
  <ul class="counts" aria-labelledby="counts-h">
    {#each names as name, who}
      <li class:full={found(who) === p.degrees[who]} class:over={found(who) > p.degrees[who]}>
        <span class="count-name">{name}</span>
        <span class="count-n">{found(who)} of {p.degrees[who]} found</span>
      </li>
    {/each}
  </ul>

  <h2 class="moments-h" id="pairs-h">Who was in contact with whom</h2>
  <ul class="pairs" aria-labelledby="pairs-h">
    {#each ps as [a, b], k}
      {@const locked = session.pairLocked(k)}
      <li class="pair" class:picked={picked === k} class:wrong={wrong(k)}>
        <button class="pair-name" aria-pressed={picked === k} disabled={lp.solved} onclick={() => session.pickPair(k)}>{names[a]} and {names[b]}</button>
        <span class="pair-btns" role="group" aria-label="{names[a]} and {names[b]}">
          <button class="btn sm" class:on={links[k] === 1} aria-pressed={links[k] === 1} disabled={locked} onclick={() => session.setLink(k, 1)}>In contact</button>
          <button class="btn sm" class:on={links[k] === 2} aria-pressed={links[k] === 2} disabled={locked} onclick={() => session.setLink(k, 2)}>Never</button>
          {#if lp.shownPairs?.includes(k)}<span class="tag">Fixed</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
</div>
