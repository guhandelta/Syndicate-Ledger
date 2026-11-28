<script lang="ts">
  import type { Session } from '../session.svelte';

  /**
   * A decode lead: read the exhibits, apply the rule, type the one answer. There are no witnesses to question here.
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.decode);
  const lp = $derived(session.lp);
  const wrong = $derived(session.pui.flashWrong && !!lp.typed && session.pui.message === "That isn't the answer yet.");
</script>

<div class="decode-wrap">
  {#each p.exhibits as ex}
    <section class="exhibit" aria-label={ex.title}>
      <h3 class="exhibit-h">{ex.title}</h3>
      <ul class="exhibit-lines">
        {#each ex.lines as line}<li>{line}</li>{/each}
      </ul>
    </section>
  {/each}
  <p class="corridors-note">{p.question}</p>
  <label class="decode-answer">
    <span>Your answer</span>
    <input
      class:wrong
      type="text"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      value={lp.typed ?? ''}
      disabled={lp.solved}
      oninput={(e) => session.setTyped((e.target as HTMLInputElement).value)}
    />
  </label>
</div>
