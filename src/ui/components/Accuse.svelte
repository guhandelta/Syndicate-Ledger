<script lang="ts">
  import { accuseStatus, accusedPeople, clockOn, evidenceLeads, hoursLeft, rules, triesLeft, trustOf } from '../../game/state';
  import type { Session } from '../session.svelte';
  import { expressionFor } from '../voices';
  import Portrait from './Portrait.svelte';
  import StatusBar from './StatusBar.svelte';
  import { TRUST_LABEL } from './labels';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const forced = $derived(clockOn(g) && hoursLeft(g) <= 0);
  const suspects = $derived(session.cf.cast.filter((c) => c.role !== 'ally'));
  const limits = $derived(rules(g).accuse);
  const target = $derived(session.accuseTarget);
  const facts = $derived(evidenceLeads(g));
</script>

<StatusBar {session} />
<main class="page">
  {#if target}
    <p class="eyebrow">Your accusation</p>
    <h1>Prove it: {target.name}</h1>
    <p>
      Pick the facts from your case notes that prove {target.name} did it. An accusation only holds if the proof is valid: every fact you pick
      must point at them, and the proof must be complete. If it doesn't hold, you lose a try.
    </p>
    {#each session.accuseNudges(target) as nudge}<p class="hint-box" role="status">{nudge}</p>{/each}
    {#if facts.length}
      <fieldset class="evidence">
        <legend>Facts you have proven</legend>
        {#each facts as lead (lead.id)}
          <label class="evidence-item">
            <input type="checkbox" checked={session.evidence.includes(lead.id)} onchange={() => session.toggleEvidence(lead.id)} />
            <span><strong>{session.T(lead.title)}</strong><br />{session.T(lead.fact)}</span>
          </label>
        {/each}
      </fieldset>
    {:else}
      <p class="muted">You haven't proven anything yet. Solve a lead first, then come back with what it shows.</p>
    {/if}
    <p class="muted">
      {triesLeft(g, target.id)} {triesLeft(g, target.id) === 1 ? 'try' : 'tries'} left on {target.name}.
    </p>
    <div class="page-actions">
      <button class="btn" onclick={() => session.backToPeople()}>Back</button>
      <button class="btn danger" disabled={!session.evidence.length} onclick={() => session.submitAccuse()}>Make the accusation</button>
    </div>
  {:else}
    <h1>Who is behind it?</h1>
    <p>
      {forced ? 'Time is up. This is your last chance: if your proof doesn’t hold, the case is lost. ' : ''}Name the person you believe is running the operation,
      then prove it with the facts you've found.
    </p>
    <p class="muted">
      You can accuse up to {limits.people} different people, and each of them up to {limits.perPerson} times. Accused so far: {accusedPeople(g).length}
      of {limits.people}. If you run out of people who can be accused, or the clock runs out, the case is lost and your notes are wiped.
    </p>
    <div class="accuse-grid">
      {#each suspects as c (c.id)}
        {@const trust = trustOf(g, c.id)}
        {@const status = accuseStatus(g, c.id)}
        <button class="accuse-card" disabled={status !== 'ok'} onclick={() => session.pickAccused(c)}>
          <Portrait person={c} expression={expressionFor(trust)} friendly={session.tone === 'friendly'} size={72} /><span class="cast-name">{c.name}</span><span class="trust trust-{trust}">{TRUST_LABEL[trust]}</span>
          <span class="muted accuse-tries">
            {status === 'locked' ? 'Can’t be accused again' : status === 'no-room' ? 'No accusations left for new people' : `${triesLeft(g, c.id)} ${triesLeft(g, c.id) === 1 ? 'try' : 'tries'} left`}
          </span>
        </button>
      {/each}
    </div>
    {#if !forced}
      <div class="page-actions"><button class="btn" onclick={session.goBoard}>{session.hub === 'town' ? 'Not yet, back to the town' : 'Not yet, back to the board'}</button></div>
    {/if}
  {/if}
</main>
