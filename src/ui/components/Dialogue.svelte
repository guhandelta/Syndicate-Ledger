<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { CastMember, Voice } from '../../game/caseTypes';
  import { VOICE_STYLE, type Expression } from '../voices';
  import Bubble from './Bubble.svelte';
  import Portrait from './Portrait.svelte';

  /**
   * One line of dialogue, comic style: the speaker's face with a bubble beside it.
   * With no person it is the player's own voice (for example a detective's-instinct thought), shown with a badge.
   */
  let {
    person = null,
    voice = 'speech',
    expression,
    friendly = false,
    size = 64,
    side = 'left',
    label = 'You',
    children,
  }: {
    person?: CastMember | null;
    voice?: Voice;
    /** Overrides the expression the voice asks for. */
    expression?: Expression;
    friendly?: boolean;
    /** Portrait size in pixels. */
    size?: number;
    /** Which side the face is on. */
    side?: 'left' | 'right';
    /** Badge text when there is no person. */
    label?: string;
    children: Snippet;
  } = $props();

  const face = $derived(expression ?? VOICE_STYLE[voice].expression ?? 'neutral');
</script>

<div class="dialogue" class:face-right={side === 'right'} style:--face={`${size}px`}>
  {#if person}
    <Portrait {person} expression={face} {friendly} {size} />
  {:else}
    <span class="self-badge" aria-hidden="true">{label}</span>
  {/if}
  <Bubble {voice} tail={side} tailY={Math.round(size * 0.42)} who={person?.name ?? label} small={size < 56}>
    {@render children()}
  </Bubble>
</div>
