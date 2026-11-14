<script lang="ts">
  import type { IdleHint } from '../idleHint';
  import type { Session } from '../session.svelte';

  let { session, hint }: { session: Session; hint: IdleHint } = $props();
</script>

<aside class="idle-tip" role="status" aria-live="polite" aria-label="Tip">
  <div class="idle-tip-top">
    <span class="eyebrow">Need a nudge? · {hint.where}</span>
    <button class="btn ghost sm" aria-label="Dismiss tip" onclick={() => session.dismissIdle()}>✕</button>
  </div>
  <p>{hint.todo}</p>
  <button class="btn sm" onclick={() => session.openHelp()}>Open help</button>
</aside>
