<script lang="ts">
  import type { Lead } from '../../game/caseTypes';
  import { clockOn, leadCost, leadOpen, puzzleOf, rules, trustOf } from '../../game/state';
  import type { Session } from '../session.svelte';
  import CastCard from './CastCard.svelte';
  import StatusBar from './StatusBar.svelte';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const cf = $derived(session.cf);
  const r = $derived(rules(g));
  const rumors = $derived(cf.events.filter((e) => !g.s.firedEvents.includes(e.id) && !(r.events === 'some-hidden' && e.ifFlag)));
  const facts = $derived(cf.leads.filter((l) => g.s.leads[l.id].solved));
  const fired = $derived(
    cf.events.filter(
      (e) =>
        g.s.firedEvents.includes(e.id) &&
        (!e.ifFlag || g.s.flags.includes(e.ifFlag)) &&
        e.effect.type !== 'endCase' &&
        (!e.unlessSolved || !g.s.leads[e.unlessSolved].solved || e.effect.type === 'removeSpeaker'),
    ),
  );

  const STATE_LABEL = { solved: '✓ Solved', locked: 'Locked', started: 'In progress', open: 'Open' };

  function leadState(l: Lead) {
    const lp = g.s.leads[l.id];
    return lp.solved ? 'solved' : !leadOpen(g, l.id) ? 'locked' : lp.started ? 'started' : 'open';
  }
  const needs = (l: Lead) => l.opensAfter.map((id) => session.T(cf.leads.find((x) => x.id === id)!.title)).join(' and ');
</script>

<StatusBar {session} />
<main class="page board">
  <section aria-labelledby="leads-h">
    <h2 id="leads-h">Leads</h2>
    <div class="lead-grid">
      {#each cf.leads as l (l.id)}
        {@const state = leadState(l)}
        {@const p = puzzleOf(g, l.id)}
        <article class="lead lead-{state}">
          <div class="lead-top">
            <span class="lead-id">{l.id}</span>
            <span class="lead-kind">{l.type === 'ledger' ? 'Cash ledger' : 'Camera log'} · {p.size}×{p.size}</span>
            <span class="lead-state">{STATE_LABEL[state]}</span>
          </div>
          <h3>{session.T(l.title)}</h3>
          <p>{state === 'locked' ? `Opens after: ${needs(l)}.` : session.T(l.intro)}</p>
          {#if state === 'open'}
            <button class="btn primary" onclick={() => session.work(l.id)}>Work this lead{clockOn(g) ? ` (${leadCost(g, l.id)} h)` : ''}</button>
          {:else if state === 'started'}
            <button class="btn primary" onclick={() => session.work(l.id)}>Keep working</button>
          {:else if state === 'solved'}
            <button class="btn" onclick={() => session.work(l.id)}>Review</button>
          {/if}
        </article>
      {/each}
    </div>
  </section>
  <div class="board-cols">
    <section aria-labelledby="notes-h">
      <h2 id="notes-h">Case notes</h2>
      {#if facts.length}
        <ul class="facts">
          {#each facts as l (l.id)}<li><strong>{session.T(l.title)}:</strong> {session.T(l.fact)}</li>{/each}
        </ul>
      {:else}
        <p class="muted">Nothing proven yet. Solve a lead to add facts here.</p>
      {/if}
      {#if fired.length}
        <h3>What happened</h3>
        <ul class="facts">{#each fired as e (e.id)}<li>{session.T(e.message)}</li>{/each}</ul>
      {/if}
      {#if r.clock !== 'off' && rumors.length}
        <h3>{r.events === 'hints' ? 'Hints' : 'Rumors'}</h3>
        <ul class="rumors">{#each rumors as e (e.id)}<li>{session.T(e.rumor)}</li>{/each}</ul>
      {/if}
    </section>
    <section aria-labelledby="cast-h">
      <h2 id="cast-h">People</h2>
      <div class="cast-list">
        {#each cf.cast.filter((c) => c.role !== 'ally') as c (c.id)}<CastCard {session} person={c} trust={trustOf(g, c.id)} />{/each}
      </div>
    </section>
  </div>
  <div class="page-actions">
    {#if session.town}
      <button class="btn town-link" onclick={() => session.show('town')}>Walk the town (PC)</button>
    {/if}
    <button class="btn danger" onclick={session.goAccuse}>Make an accusation</button>
  </div>
</main>
