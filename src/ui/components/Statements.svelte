<script lang="ts">
  import { rules } from '../../game/state';
  import { describeClaim } from '../../game/text';
  import type { Session } from '../session.svelte';
  import Avatar from './Avatar.svelte';

  let { session }: { session: Session } = $props();
  const p = $derived(session.puzzle);
  const lp = $derived(session.lp);
  const L = $derived(session.labels);
  const r = $derived(rules(session.g));
  const picking = $derived(!!session.pui.pickStatementFor);

  function recoverCost(speaker: string) {
    const ev = session.cf.events.find((e) => e.effect.type === 'removeSpeaker' && e.effect.speaker === speaker);
    return ev && ev.effect.type === 'removeSpeaker' ? ev.effect.recover : { hours: 1, favors: 1 };
  }

  function unverified(i: number) {
    const who = session.person(p.statements[i].speaker);
    return r.flagLiars === 'exact' ? !p.truth[i] : r.flagLiars === 'possible' ? who.reliability !== 'honest' : false;
  }

  function pick(e: Event, i: number) {
    // inside a pickable statement, the mark buttons still work as marks
    if ((e.target as HTMLElement).closest('.mark-btns')) return;
    session.pickStatement(i);
  }
</script>

<ul class="stmts">
  {#each p.statements as s, i}
    {@const who = session.person(s.speaker)}
    {#if lp.missingSpeakers.includes(s.speaker)}
      {@const rec = recoverCost(s.speaker)}
      <li class="stmt missing">
        <Avatar person={who} small />
        <div class="stmt-body">
          <div class="stmt-who">{who.name}</div>
          <p>{who.name} has left town. This statement is lost unless you track them down.</p>
          <button class="btn sm" onclick={() => session.recover(s.speaker)}>Track down ({rec.hours} h + {rec.favors} favor)</button>
        </div>
      </li>
    {:else}
      {@const m = lp.marks[i]}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li class="stmt mark-{m}" class:pickable={picking} onclick={picking ? (e) => pick(e, i) : undefined}>
        <Avatar person={who} small />
        <div class="stmt-body">
          <div class="stmt-who">{who.name} {#if unverified(i)}<span class="tag">Unverified</span>{/if}</div>
          <p>“{describeClaim(s.claim, L, p.type)}”</p>
          {#if lp.solved}
            <div class="verdict-tag {p.truth[i] ? 'ok' : 'bad'}">{p.truth[i] ? 'True' : 'Lie'}</div>
          {:else}
            <div class="mark-btns" role="group" aria-label="Your verdict">
              <button class="btn sm" class:on-true={m === 'true'} aria-pressed={m === 'true'} onclick={() => session.mark(i, 'true')}>True</button>
              <button class="btn sm" class:on-lie={m === 'lie'} aria-pressed={m === 'lie'} onclick={() => session.mark(i, 'lie')}>Lie</button>
            </div>
          {/if}
        </div>
      </li>
    {/if}
  {/each}
  {#each lp.paidTips as tip}
    {@const who = session.person(tip.speaker)}
    <li class="stmt paid">
      <Avatar person={who} small />
      <div class="stmt-body">
        <div class="stmt-who">{who.name} <span class="tag paid-tag">Paid tip</span></div>
        <p>“{describeClaim(tip.claim, L, p.type)}”</p>
      </div>
    </li>
  {/each}
</ul>
