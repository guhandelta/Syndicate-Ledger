<script lang="ts">
  import { maxDigit } from '../../engine/cipher';
  import type { Session } from '../session.svelte';

  /**
   * A cipher lead: crack a code. Each place of the code takes one digit, and no digit is used twice.
   * Pick a place, then press a number key; each place also has its own digit picker.
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.cipher);
  const lp = $derived(session.lp);
  const digits = $derived(lp.digits ?? []);
  const picked = $derived(session.pui.pos);
  const wrong = (k: number) => session.pui.flashWrong && digits[k] !== 0 && digits[k] !== p.code[k];
  const dups = (k: number) => digits[k] !== 0 && digits.filter((d) => d === digits[k]).length > 1;
  const names = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  const options = $derived(Array.from({ length: maxDigit(p.size) }, (_, i) => i + 1));
</script>

<div class="cipher-wrap">
  <h2 class="moments-h" id="code-h">The code</h2>
  <p class="corridors-note">Every place takes a different digit from 1 to {maxDigit(p.size)}, so one digit is left out.</p>
  <ol class="code" aria-labelledby="code-h">
    {#each digits as d, k}
      {@const locked = session.digitLocked(k)}
      <li class="code-slot" class:picked={picked === k} class:wrong={wrong(k)} class:dup={dups(k)}>
        <button class="code-pick" aria-pressed={picked === k} disabled={lp.solved} aria-label="Pick the {names[k]} digit" onclick={() => session.pickPos(k)}>{names[k]}</button>
        {#if locked}
          <span class="code-digit">{d} <span class="tag">Fixed</span></span>
        {:else}
          <select aria-label="{names[k]} digit" value={d} disabled={lp.solved} onchange={(e) => session.placeDigit(k, Number((e.target as HTMLSelectElement).value))}>
            <option value={0}>Empty</option>
            {#each options as o}<option value={o}>{o}</option>{/each}
          </select>
        {/if}
      </li>
    {/each}
  </ol>
  {#if digits.some((_, k) => dups(k))}<p class="corridors-note" role="status">A digit is used twice. Every digit in this code is different.</p>{/if}
</div>
