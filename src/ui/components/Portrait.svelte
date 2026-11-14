<script lang="ts">
  import type { CastMember } from '../../game/caseTypes';
  import { portraitOf } from '../portraits';
  import type { Expression } from '../voices';
  import Avatar from './Avatar.svelte';

  /** A person's face with the given expression, or their initials when there is no art for them yet. */
  let {
    person,
    expression = 'neutral',
    friendly = false,
    size = 64,
  }: { person: CastMember; expression?: Expression; friendly?: boolean; size?: number } = $props();

  const src = $derived(portraitOf(person.id, expression, friendly));
</script>

{#if src}
  <img class="portrait expr-{expression}" {src} alt="" width={size} height={size} style:--c={person.color} />
{:else}
  <Avatar {person} small={size < 40} />
{/if}
