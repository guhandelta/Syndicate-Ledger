<script lang="ts">
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  const lead = $derived(session.lead);
  const L = $derived(session.labels);
  const n = $derived(session.puzzle.size);
  const pui = $derived(session.pui);
</script>

<div class="pad" role="group" aria-label="Number pad">
  {#each Array.from({ length: n }, (_, k) => k + 1) as v}
    <button class="btn key" onclick={() => session.enter(v)}>
      <strong>{v}</strong><small>{lead.type === 'surveillance' ? lead.rooms![v - 1] : L.value(v)}</small>
    </button>
  {/each}
  <button class="btn key" aria-label="Erase" onclick={() => session.enter(0)}>⌫<small>Erase</small></button>
  <button class="btn key" class:on={pui.pencil} aria-pressed={pui.pencil} onclick={() => session.togglePencil()}>✎<small>Notes {pui.pencil ? 'on' : 'off'}</small></button>
  <button class="btn key" disabled={!pui.undo.length} onclick={() => session.undo()}>↶<small>Undo</small></button>
  <button class="btn key" disabled={!pui.redo.length} onclick={() => session.redo()}>↷<small>Redo</small></button>
</div>
