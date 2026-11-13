<script lang="ts">
  import { PRESET_RULES } from '../../game/presets';
  import type { Session } from '../session.svelte';
  import CastCard from './CastCard.svelte';

  let { session }: { session: Session } = $props();
  const people = $derived(session.cf.cast.filter((c) => c.role !== 'ally'));
  const allies = $derived(session.cf.cast.filter((c) => c.role === 'ally'));
</script>

<main class="page">
  <p class="eyebrow">{PRESET_RULES[session.g.s.preset].label} · Case file 01</p>
  <h1>{session.T(session.cf.title)}</h1>
  <p class="setup">{session.T(session.cf.setup)}</p>
  <h2>People of interest</h2>
  <div class="cast-grid">
    {#each people as c (c.id)}<CastCard {session} person={c} />{/each}
  </div>
  <h2>Your allies</h2>
  <p class="muted">Allies help inside a puzzle. Each call costs favors. You start with {session.g.s.favors}, and earn one each time you expose a liar.</p>
  <div class="cast-grid">
    {#each allies as c (c.id)}<CastCard {session} person={c} />{/each}
  </div>
  <div class="page-actions"><button class="btn primary" onclick={session.goBoard}>Go to the evidence board</button></div>
</main>
