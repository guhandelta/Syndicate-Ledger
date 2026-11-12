<script lang="ts">
  import type { CastMember } from '../../game/caseTypes';
  import { initials } from '../puzzleHelpers';

  let { person, small = false }: { person: CastMember; small?: boolean } = $props();
</script>

<span class="avatar" class:sm={small} style:--c={person.color} aria-hidden="true">{initials(person.name)}</span>
