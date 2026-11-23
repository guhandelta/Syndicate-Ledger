<script lang="ts">
  import { clashes } from '../../engine/stakeout';
  import type { Session } from '../session.svelte';

  /**
   * A stakeout lead: the map is cut into coloured districts and every district had one watcher. No two watchers
   * shared a row or a column, and none stood on a touching square (corners count). Tap a square to place the watcher
   * of its row there; tap it again to take it off. Arrow keys move between squares.
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.stakeout);
  const lp = $derived(session.lp);
  const L = $derived(session.stakeLabels);
  const spots = $derived(lp.spots ?? []);
  const bad = $derived(clashes(p, spots));
  const wrong = (r: number) => session.pui.flashWrong && spots[r] !== 0 && spots[r] - 1 !== p.cols[r];
  const letter = (z: number) => String.fromCharCode(65 + z);
  // eight tints that stay apart for most colour vision; the letter in each square never relies on colour alone
  const TINTS = ['#f6e3b4', '#cfe3c8', '#f2c9c2', '#c9d6ee', '#e1cdea', '#f3d9b7', '#c6e5e2', '#e5e1a8'];
  const named = (r: number, c: number) => `Row ${r + 1}, column ${c + 1}, ${L.districts[p.regions[r][c]]}`;

  function onKey(e: KeyboardEvent, r: number, c: number) {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = d[e.key];
    if (!m) return;
    const rr = Math.min(p.size - 1, Math.max(0, r + m[0]));
    const cc = Math.min(p.size - 1, Math.max(0, c + m[1]));
    (document.querySelector(`[data-stake="${rr}-${cc}"]`) as HTMLElement | null)?.focus();
    e.preventDefault();
  }
</script>

<div class="stake-wrap">
  <p class="corridors-note">One {L.one} in every district. No two in the same row or column, and none on touching squares, corners included.</p>
  <ul class="stake-legend" aria-label="Districts">
    {#each L.districts as name, z}
      <li><span class="stake-swatch" style:background={TINTS[z]} aria-hidden="true">{letter(z)}</span> {name}</li>
    {/each}
  </ul>
  <div class="stake-board" style:--n={p.size} role="group" aria-label="Map of the districts">
    {#each p.regions as row, r}
      <div class="stake-row">
        {#each row as z, c}
          {@const here = spots[r] === c + 1}
          {@const locked = session.spotLocked(r)}
          <button
            class="stake-cell"
            class:placed={here}
            class:clash={here && bad.has(r)}
            class:wrong={here && wrong(r)}
            class:edge-r={c < p.size - 1 && row[c + 1] !== z}
            class:edge-b={r < p.size - 1 && p.regions[r + 1][c] !== z}
            style:background={TINTS[z]}
            data-stake="{r}-{c}"
            disabled={lp.solved || (locked && !here)}
            aria-label="{named(r, c)}{here ? `, ${L.one} placed${locked ? ', fixed' : ''}` : ''}"
            aria-pressed={here}
            onclick={() => session.placeSpot(r, c + 1)}
            onkeydown={(e) => onKey(e, r, c)}
          >
            <span class="stake-letter" aria-hidden="true">{letter(z)}</span>
            {#if here}<span class="stake-mark" aria-hidden="true">{locked ? '◉' : '●'}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
  {#if bad.size}<p class="corridors-note" role="status">Two of your {L.many} break a rule: a shared row, column or district, or touching squares. They are outlined in red.</p>{/if}
</div>
