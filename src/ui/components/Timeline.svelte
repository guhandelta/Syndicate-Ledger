<script lang="ts">
  import type { Session } from '../session.svelte';

  /**
   * A timeline lead: put each moment at the time it happened. Every time takes exactly one moment.
   * Pick a moment, then press a time (or a number key); each moment also has its own time picker.
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.timeline);
  const lp = $derived(session.lp);
  const L = $derived(session.timeLabels);
  const order = $derived(lp.order ?? []);
  const picked = $derived(session.pui.moment);
  const wrong = (m: number) => session.pui.flashWrong && order[m] !== 0 && order[m] !== p.solution[m];
  const atSlot = (slot: number) => order.findIndex((s) => s === slot);
</script>

<div class="timeline-wrap">
  <ol class="timeline" aria-label="Timeline">
    {#each L.times as time, i}
      {@const m = atSlot(i + 1)}
      <li class="slot" class:filled={m >= 0}>
        <button
          class="slot-btn"
          class:wrong={m >= 0 && wrong(m)}
          disabled={lp.solved || picked === null}
          aria-label="{time}: {m >= 0 ? L.moments[m] : 'empty'}{picked !== null && !lp.solved ? `. Put “${L.moments[picked]}” here` : ''}"
          onclick={() => picked !== null && session.placeMoment(picked, i + 1)}
        >
          <span class="slot-time">{time}</span>
          <span class="slot-moment">{#if m >= 0}{L.moments[m]}{#if session.momentLocked(m)}{' '}<span class="pin" aria-hidden="true">📌</span>{/if}{:else}<span class="empty">empty</span>{/if}</span>
        </button>
      </li>
    {/each}
  </ol>

  <h2 class="moments-h" id="moments-h">What happened</h2>
  <ul class="moments" aria-labelledby="moments-h">
    {#each L.moments as moment, m}
      {@const locked = session.momentLocked(m)}
      <li class="moment" class:picked={picked === m} class:placed={order[m] !== 0} class:wrong={wrong(m)}>
        <button class="moment-btn" aria-pressed={picked === m} disabled={lp.solved} onclick={() => session.pickMoment(m)}>{moment}</button>
        {#if locked}
          <span class="moment-when">{L.times[order[m] - 1]} <span class="tag">Fixed</span></span>
        {:else}
          <select
            aria-label="When: {moment}"
            value={order[m]}
            disabled={lp.solved}
            onchange={(e) => session.placeMoment(m, Number((e.target as HTMLSelectElement).value))}
          >
            <option value={0}>Not placed</option>
            {#each L.times as time, i}<option value={i + 1}>{time}</option>{/each}
          </select>
        {/if}
      </li>
    {/each}
  </ul>
</div>
