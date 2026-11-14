<script lang="ts">
  import { PRESET_RULES } from '../../game/presets';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const lost = $derived(session.cf.lost!);
</script>

<main class="page verdict">
  <p class="eyebrow">Case lost · {PRESET_RULES[g.s.preset].label}</p>
  <h1>{session.T(lost.title)}</h1>
  <p class="setup">{session.T(g.s.lost === 'time' ? lost.time : lost.limits)}</p>
  <p class="muted">Nothing about who was really behind it is revealed. Your case and your notes are gone.</p>
  <div class="page-actions"><button class="btn primary" onclick={() => session.afterLost()}>Start again</button></div>
</main>
