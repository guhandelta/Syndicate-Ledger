<script lang="ts">
  import type { CastMember } from '../../game/caseTypes';
  import type { Trust } from '../../game/state';
  import { heardAbout } from '../../game/talk';
  import { plainLine } from '../delivery';
  import { abilityLabel } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';
  import { expressionFor } from '../voices';
  import Portrait from './Portrait.svelte';
  import { TRUST_LABEL } from './labels';

  let { session, person, trust }: { session: Session; person: CastMember; trust?: Trust } = $props();

  // the boss is shown as an ordinary suspect so the board doesn't give the ending away
  const shownRole = $derived(person.role === 'boss' ? 'suspect' : person.role);
  /** What others have told the player about this person, in the notebook sense: who said it and what. */
  const heard = $derived(session.game ? heardAbout(session.game, person.id) : []);
  const role = $derived(person.role === 'ally' ? abilityLabel(person) : shownRole[0].toUpperCase() + shownRole.slice(1));
</script>

<div class="cast-card">
  <Portrait {person} expression={expressionFor(trust)} friendly={session.tone === 'friendly'} size={52} />
  <div>
    <div class="cast-name">{person.name}</div>
    <div class="cast-role">
      {role}{#if trust}{' · '}<span class="trust trust-{trust}">{TRUST_LABEL[trust]}</span>{/if}
    </div>
    <div class="cast-blurb">{session.T(person.blurb)}</div>
    {#if heard.length}
      <ul class="heard" aria-label="What others say about {person.name}">
        {#each heard as h (h.speaker.id)}
          <li><strong>{h.speaker.name}:</strong> “{plainLine(session.T(h.opinion.text))}”</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
