<script lang="ts">
  import { cloud } from '../../sync/cloud.svelte';
</script>

{#if cloud.status !== 'off'}
  <p class="account" aria-live="polite">
    {#if cloud.status === 'signed-in'}
      <span>Saved to your account{cloud.name ? ` (${cloud.name})` : ''}.</span>
      <button class="btn sm" onclick={() => cloud.logout()}>Sign out</button>
    {:else if cloud.status === 'signed-out'}
      <span>Playing as a guest, saved on this device only.</span>
      <button class="btn sm" onclick={() => cloud.login()}>Sign in to save your progress</button>
    {:else if cloud.status === 'error'}
      <span>Cloud save is unavailable right now. Your game still saves on this device.</span>
    {:else}
      <span>Checking sign-in…</span>
    {/if}
  </p>
{/if}

<style>
  .account { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; justify-content: center; margin: 0.4rem 0; font-size: 0.85rem; opacity: 0.85; }
</style>
