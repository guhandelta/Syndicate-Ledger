<script lang="ts">
  import type { SceneLine } from '../../game/caseTypes';
  import type { Session } from '../session.svelte';
  import Dialogue from './Dialogue.svelte';
  import Spoken from './Spoken.svelte';

  /**
   * A short scene: narration and people's lines one after another. It sits in the page, so it never blocks anything
   * and the player can read past it.
   */
  let { session, lines, label }: { session: Session; lines: SceneLine[]; label: string } = $props();
</script>

<section class="scene" aria-label={label}>
  {#each lines as line, i (i)}
    {#if line.who}
      {@const person = session.person(line.who)}
      <Dialogue {person} voice={line.voice ?? person.voice ?? 'speech'} expression={line.face} friendly={session.tone === 'friendly'} size={72}>
        <p><Spoken line={session.T(line.text)} /></p>
      </Dialogue>
      {#if line.tell}<p class="tell">{session.T(line.tell)}</p>{/if}
    {:else}
      <p class="narration">{session.T(line.text)}</p>
    {/if}
  {/each}
</section>
