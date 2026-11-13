<script lang="ts">
  import { rules } from '../../game/state';
  import { dupe, zoneMap } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';

  let { session }: { session: Session } = $props();
  const p = $derived(session.puzzle);
  const lp = $derived(session.lp);
  const lead = $derived(session.lead);
  const L = $derived(session.labels);
  const n = $derived(p.size);
  const zones = $derived(zoneMap(p));
  const pui = $derived(session.pui);
  const showWrong = $derived(rules(session.g).mistakes === 'instant' || pui.flashWrong);
  const range = (k: number) => Array.from({ length: k }, (_, i) => i);

  function given(r: number, c: number) {
    return p.givens.some((x) => x.cell[0] === r && x.cell[1] === c) || lp.revealed.some((x) => x[0] === r && x[1] === c);
  }

  function classes(r: number, c: number): string {
    const { zm, colour } = zones;
    const v = lp.grid[r][c];
    const z = zm[r][c];
    const cls = ['cell'];
    if (z >= 0) {
      cls.push(`z${colour[z]}`);
      if (zm[r - 1]?.[c] !== z) cls.push('bt');
      if (zm[r + 1]?.[c] !== z) cls.push('bb');
      if (zm[r]?.[c - 1] !== z) cls.push('bl');
      if (zm[r]?.[c + 1] !== z) cls.push('br');
    }
    if (given(r, c)) cls.push('given');
    const sel = pui.sel;
    if (sel && sel[0] === r && sel[1] === c) cls.push('sel');
    else if (sel && (sel[0] === r || sel[1] === c)) cls.push('peer');
    if (v && sel && lp.grid[sel[0]][sel[1]] === v) cls.push('same');
    if (v && dupe(lp.grid, r, c)) cls.push('dupe');
    if (v && showWrong && v !== p.solution[r][c]) cls.push('wrong');
    if (pui.hint && pui.hint.cell[0] === r && pui.hint.cell[1] === c) cls.push('hinted');
    return cls.join(' ');
  }

  function zoneLabel(r: number, c: number): string | null {
    const z = zones.zm[r][c];
    if (z < 0) return null;
    const first = p.zones[z].cells[0];
    return first[0] === r && first[1] === c ? L.value(p.zones[z].sum).replace(' coins', '') : null;
  }
</script>

<div class="grid-wrap">
  <table class="grid g{n}" class:done={lp.solved} aria-label="{session.T(lead.title)} grid">
    <thead>
      <tr>
        <th></th>
        {#each L.people as name, c}
          <th scope="col" title={name}>
            <span class="col-dot" style:--c={session.person(lead.columns[c]).color}></span><span class="col-name">{name.split(' ')[0]}</span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each range(n) as r}
        <tr>
          <th scope="row">{L.times[r]}</th>
          {#each range(n) as c}
            {@const v = lp.grid[r][c]}
            {@const zl = zoneLabel(r, c)}
            <td
              class={classes(r, c)}
              role="button"
              tabindex="-1"
              aria-label="{zl ? `${zl} zone total, ` : ''}{L.people[c]}, {L.times[r]}: {v ? `${v} (${L.value(v)})` : 'empty'}"
              onclick={() => session.select([r, c])}
            >
              {#if zl}<span class="zsum">{zl}</span>{/if}
              {#if v}
                <span class="val">{v}</span>
              {:else if lp.notes[r][c]}
                <span class="notes n{n}">{#each range(n) as k}<i>{lp.notes[r][c] & (1 << (k + 1)) ? k + 1 : ''}</i>{/each}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
