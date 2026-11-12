<script lang="ts">
  import type { Modal } from '../session.svelte';
  import Avatar from './Avatar.svelte';

  let { modal }: { modal: Modal } = $props();
  let box: HTMLElement;

  $effect(() => {
    box.querySelector<HTMLElement>('button')?.focus();
  });
</script>

<div class="modal-back">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" bind:this={box}>
    <h2 id="modal-title">{modal.title}</h2>
    {#if modal.speaker}
      <div class="offer">
        <Avatar person={modal.speaker} />
        <div>{#each modal.paragraphs as p}<p>{p}</p>{/each}</div>
      </div>
    {:else}
      {#each modal.paragraphs as p}<p>{p}</p>{/each}
    {/if}
    {#if modal.fact}<p class="fact">{modal.fact}</p>{/if}
    {#if modal.note}<p class="muted">{modal.note}</p>{/if}
    <div class="modal-actions">
      {#each modal.actions as a}
        <button class="btn" class:primary={a.primary} onclick={a.run}>{a.label}</button>
      {/each}
    </div>
  </div>
</div>
