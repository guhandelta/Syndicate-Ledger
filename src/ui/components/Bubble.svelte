<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Voice } from '../../game/caseTypes';
  import { bubblePaths, type TailSide } from '../bubbleShape';
  import { VOICE_STYLE } from '../voices';

  /**
   * A comic speech bubble. Its outline, colours and lettering come from the voice (src/ui/voices.ts);
   * the tail points toward whoever is speaking.
   */
  let {
    voice = 'speech',
    tail = 'left',
    tailY = 22,
    who,
    small = false,
    children,
  }: {
    voice?: Voice;
    tail?: TailSide;
    tailY?: number;
    /** Name read out by screen readers before the line, with the voice's verb ("Tip whispers"). */
    who?: string;
    small?: boolean;
    children: Snippet;
  } = $props();

  const style = $derived(VOICE_STYLE[voice]);
  let w = $state(0);
  let h = $state(0);
  const paths = $derived(bubblePaths(style.shape, w, h, tail, tailY));
</script>

<div
  class="bubble voice-{voice}"
  class:small
  class:tail-left={tail === 'left'}
  class:tail-right={tail === 'right'}
  style:--b-fill={style.fill}
  style:--b-ink={style.ink}
  bind:clientWidth={w}
  bind:clientHeight={h}
>
  {#if w && h}
    <svg class="bubble-art" width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
      <!-- outlines first at double width, then fills on top, so the tail joins the body with no seam -->
      <g fill="none" stroke={style.outline} stroke-width={style.stroke * 2} stroke-linejoin="round" stroke-dasharray={style.dashed ? '7 5' : undefined}>
        <path d={paths.tail} />
        <path d={paths.body} />
      </g>
      <g fill={style.fill}>
        <path d={paths.tail} />
        <path d={paths.body} />
      </g>
    </svg>
  {/if}
  <div class="bubble-text">
    {#if who}<span class="sr-only">{who} {style.verb}:</span>{/if}
    {@render children()}
  </div>
</div>
