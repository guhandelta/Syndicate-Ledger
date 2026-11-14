<script lang="ts">
  import type { IdleHint } from '../idleHint';
  import type { Session } from '../session.svelte';

  let { session, hint }: { session: Session; hint: IdleHint } = $props();
</script>

<aside class="idle-tip" role="status" aria-live="polite" aria-label="Tip">
  <div class="idle-tip-top">
    <span class="eyebrow">{session.tipAsked ? 'What now?' : 'Need a nudge?'} · {hint.where}</span>
    <button class="btn ghost sm" aria-label="Dismiss tip" onclick={() => session.dismissIdle()}>✕</button>
  </div>
  {#if session.tipAsked}
    <p class="idle-tip-h">You can:</p>
    <ul>{#each hint.can as c}<li>{c}</li>{/each}</ul>
    <p class="idle-tip-h">Try next:</p>
  {/if}
  <p>{hint.todo}</p>
  <button class="btn sm" onclick={() => session.openHelp()}>Open help</button>
</aside>
