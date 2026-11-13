<script lang="ts">
  import { PRESET_RULES } from '../../game/presets';
  import { clockOn, puzzleOf, stars, totalHours } from '../../game/state';
  import { describeClaim, gridLabels } from '../../game/text';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const cf = $derived(session.cf);
  const ending = $derived(cf.endings.find((e) => e.id === g.s.endingId)!);
  const st = $derived(stars(g));
  const boss = $derived(cf.cast.find((c) => c.role === 'boss')!);

  /** Every lie in the case, caught or missed, with who the liar was protecting (rule book section 6). */
  const lies = $derived(
    cf.leads.flatMap((lead) => {
      const p = puzzleOf(g, lead.id);
      const caught = g.s.leads[lead.id].solved;
      const L = gridLabels(cf, lead, p.size, session.tone);
      return p.statements.flatMap((s, i) => {
        if (p.truth[i]) return [];
        const who = session.person(s.speaker);
        const motive =
          who.reliability === 'mistaken'
            ? `${who.name} wasn't lying on purpose. It was an honest mix-up.`
            : who.protects
              ? `${who.name} was covering for ${session.person(who.protects).name}.`
              : '';
        return [{ key: `${lead.id}-${i}`, caught, who, said: describeClaim(s.claim, L, p.type), motive }];
      });
    }),
  );
</script>

<main class="page verdict">
  <p class="eyebrow">Verdict · {PRESET_RULES[g.s.preset].label}</p>
  <h1>{session.T(ending.title)}</h1>
  <p class="stars" aria-label="{st} of 3 stars">{'★'.repeat(st)}{'☆'.repeat(3 - st)}</p>
  <p class="setup">{session.T(ending.text)}</p>
  <p>
    {#if boss.id === g.s.accused}
      You named <strong>{boss.name}</strong>, and you were right.
    {:else}
      You accused <strong>{session.person(g.s.accused!).name}</strong>. The real boss was <strong>{boss.name}</strong>.
    {/if}
  </p>
  <h2>Every lie in this case</h2>
  <ul class="lie-list">
    {#each lies as l (l.key)}
      <li class={l.caught ? 'caught' : 'missed'}>
        <span class="tag {l.caught ? 'ok' : 'bad'}">{l.caught ? 'Caught' : 'Missed'}</span>
        <strong>{l.who.name}</strong> said “{l.said}” {l.motive}
      </li>
    {/each}
  </ul>
  <h2>Your investigation</h2>
  <ul class="facts">
    <li>Leads solved: {cf.leads.filter((l) => g.s.leads[l.id].solved).length} of {cf.leads.length}</li>
    {#if clockOn(g)}<li>Hours used: {g.s.hoursUsed} of {totalHours(g)}</li>{/if}
    <li>Hints from allies: {g.s.hintsUsed}</li>
  </ul>
  <div class="page-actions"><button class="btn primary" onclick={session.goTitle}>Play again</button></div>
</main>
