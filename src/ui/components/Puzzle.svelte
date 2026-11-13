<script lang="ts">
  import { rules } from '../../game/state';
  import { liarLine } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';
  import AllyPanel from './AllyPanel.svelte';
  import Grid from './Grid.svelte';
  import NumberPad from './NumberPad.svelte';
  import Statements from './Statements.svelte';
  import StatusBar from './StatusBar.svelte';

  let { session }: { session: Session } = $props();
  const lead = $derived(session.lead);
  const p = $derived(session.puzzle);
  const lp = $derived(session.lp);
  const pui = $derived(session.pui);
  const n = $derived(p.size);
  const partner = $derived(session.cf.cast.find((c) => c.ability === 'partner'));
  const undercover = $derived(session.cf.cast.find((c) => c.ability === 'undercover'));
</script>

<StatusBar {session} />
<main class="page puzzle">
  <div class="puzzle-head">
    <button class="btn ghost" onclick={session.goBoard}>← Board</button>
    <div>
      <p class="eyebrow">{lead.id} · {lead.type === 'ledger' ? 'Cash ledger' : 'Camera log'}</p>
      <h1>{session.T(lead.title)}</h1>
    </div>
  </div>
  <p class="intro">{session.T(lead.intro)}</p>
  {#if lead.type === 'surveillance'}
    <p class="room-key"><strong>Rooms along the pier:</strong> {lead.rooms!.slice(0, n).map((rm, k) => `${k + 1} ${rm}`).join(' · ')}</p>
  {/if}
  <div class="puzzle-layout">
    <div class="left">
      <Grid {session} />
      {#if lp.solved}
        <p class="solved-banner">✓ Solved. {session.T(lead.fact)}</p>
      {:else}
        <NumberPad {session} />
      {/if}
      {#if pui.hint}
        <div class="hint-box" role="status"><strong>{partner?.name}:</strong> “{pui.hint.text}”</div>
      {/if}
      {#if pui.zoneInfo}
        <div class="hint-box" role="status">
          {pui.zoneInfo.text}
          {#each pui.zoneInfo.combos as cb}{' '}<span class="combo">{cb.join(' + ')}</span>{:else}{' '}nothing. Something on your grid is wrong.{/each}
        </div>
      {/if}
      {#if pui.message}<div class="msg" role="status">{pui.message}</div>{/if}
      {#if !lp.solved}
        <div class="close-row">
          {#if rules(session.g).mistakes === 'on-request'}<button class="btn" onclick={() => session.checkGrid()}>Check my grid</button>{/if}
          <button class="btn primary" onclick={() => session.closeLead()}>Close this lead</button>
        </div>
      {/if}
    </div>
    <aside class="sidebar" aria-labelledby="stmts-h">
      <h2 id="stmts-h">Witness statements</h2>
      <p class="liar-line">{liarLine(p.liarCounts, p.statements.length, session.tone === 'friendly')}</p>
      {#if pui.pickStatementFor}
        <p class="pick-hint">Tap a statement for {undercover?.name} to check. <button class="btn sm" onclick={() => session.cancelPick()}>Cancel</button></p>
      {/if}
      <Statements {session} />
      {#if !lp.solved}<AllyPanel {session} />{/if}
    </aside>
  </div>
</main>
