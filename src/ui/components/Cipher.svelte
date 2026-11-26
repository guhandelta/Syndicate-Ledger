<script lang="ts">
  import { decodeMessage, maxDigit } from '../../engine/cipher';
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
  // a word-cipher lead: the scrambled letters, and what the digits placed so far read back
  const message = $derived(p.message);
  const reading = $derived(message ? [...decodeMessage(message.cipher, digits)] : []);
  const options = $derived(Array.from({ length: maxDigit(p.size) }, (_, i) => i + 1));
</script>

<div class="cipher-wrap">
  <h2 class="moments-h" id="code-h">The code</h2>
  <p class="corridors-note">Every place takes a different digit from 1 to {maxDigit(p.size)}, so one digit is left out.</p>
  {#if message}
    <p class="corridors-note">A scrap of paper is pinned beside the lock. Each letter on it was moved on by the digit of its place, so the right code reads it back. Check your digits against it.</p>
    <p class="scrap" aria-label="The scrap reads {message.cipher.split('').join(' ')}">
      {#each message.cipher as ch}<span class="scrap-letter">{ch}</span>{/each}
    </p>
  {/if}
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
        {#if message}<span class="decoded" aria-label="The {names[k]} letter reads {reading[k] === '·' ? 'nothing yet' : reading[k]}">{reading[k]}</span>{/if}
      </li>
    {/each}
  </ol>
  {#if message}<p class="reads" role="status" aria-label="What your digits read so far">Your digits read: <strong>{reading.join('')}</strong></p>{/if}
  {#if digits.some((_, k) => dups(k))}<p class="corridors-note" role="status">A digit is used twice. Every digit in this code is different.</p>{/if}
</div>
