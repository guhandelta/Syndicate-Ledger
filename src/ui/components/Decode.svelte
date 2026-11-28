<script lang="ts">
  import type { Session } from '../session.svelte';

  /**
   * A decode lead: read the exhibits, apply the rule, type the one answer. There are no witnesses to question here.
   */
  let { session }: { session: Session } = $props();
  const p = $derived(session.decode);
  const lp = $derived(session.lp);
  /** A nonogram is answered by shading its grid; the typed answer is the grid as rows of 1s and 0s. */
  const grid = $derived(p.data.variant === 'nonogram' ? p.data : null);
  const cells = $derived.by(() => {
    if (!grid) return [] as number[][];
    const n = grid.cols.length;
    const typed = (lp.typed ?? '').split(' ');
    return grid.rows.map((_, r) => Array.from({ length: n }, (_, c) => (typed[r]?.[c] === '1' ? 1 : 0)));
  });
  function toggle(r: number, c: number) {
    if (lp.solved) return;
    const next = cells.map((row) => [...row]);
    next[r][c] = next[r][c] ? 0 : 1;
    session.setTyped(next.map((row) => row.join('')).join(' '));
  }
  const wrong = $derived(session.pui.flashWrong && !!lp.typed && session.pui.message === "That isn't the answer yet.");
</script>

<div class="decode-wrap">
  {#each session.decodeExhibits as ex}
    <section class="exhibit" aria-label={ex.title}>
      <h3 class="exhibit-h">{ex.title}</h3>
      <ul class="exhibit-lines">
        {#each ex.lines as line}<li>{line}</li>{/each}
      </ul>
    </section>
  {/each}
  <p class="corridors-note">{p.question}</p>
  {#if grid}
    <table class="nono" aria-label="Stud grid">
      <thead>
        <tr>
          <td></td>
          {#each grid.cols as clue, c}<th scope="col" class="nono-clue" aria-label={`Column ${c + 1}: ${clue.join(' ')}`}>{#each clue as n}<span>{n}</span>{/each}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each grid.rows as clue, r}
          <tr>
            <th scope="row" class="nono-clue nono-row" aria-label={`Row ${r + 1}: ${clue.join(' ')}`}>{clue.join(' ')}</th>
            {#each cells[r] as on, c}
              <td>
                <button type="button" class="nono-cell" class:on class:wrong aria-pressed={on === 1} aria-label={`Row ${r + 1}, column ${c + 1}`} disabled={lp.solved} onclick={() => toggle(r, c)}></button>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
  <label class="decode-answer">
    <span>Your answer</span>
    <input
      class:wrong
      type="text"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      value={lp.typed ?? ''}
      disabled={lp.solved}
      oninput={(e) => session.setTyped((e.target as HTMLInputElement).value)}
    />
  </label>
  {/if}
</div>
