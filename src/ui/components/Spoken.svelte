<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { deliver, plainLine, wordDelay } from '../delivery';

  /**
   * A line spoken word by word, with pauses after "..." and *stressed* words in bold, so a hesitation shows.
   * Screen readers get the whole line at once; players who prefer less motion see it all straight away;
   * a click shows the rest.
   */
  let { line }: { line: string } = $props();

  const words = $derived(deliver(line));
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function step() {
    if (shown >= words.length) return;
    timer = setTimeout(() => {
      shown += 1;
      step();
    }, wordDelay(words[shown - 1] ?? words[0]));
  }

  // restart only when the line changes, not each time a word appears
  $effect(() => {
    const total = words.length;
    untrack(() => {
      clearTimeout(timer);
      shown = still ? total : 1;
      step();
    });
    return () => clearTimeout(timer);
  });
  onDestroy(() => clearTimeout(timer));

  const finish = () => {
    clearTimeout(timer);
    shown = words.length;
  };
</script>

<span class="sr-only">{plainLine(line)}</span>
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<span class="spoken" aria-hidden="true" onclick={finish} data-done={shown >= words.length}>
  {#each words as w, i}
    <span class="word" class:hidden={i >= shown}>{#if w.stress}<strong>{w.text}</strong>{:else}{w.text}{/if}</span>{' '}
  {/each}
</span>
