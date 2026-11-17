<script lang="ts">
  import type { Clipping } from '../../game/caseTypes';
  import { tornParts } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';

  let { session, clip, tilt = 0 }: { session: Session; clip: Clipping; tilt?: number } = $props();
</script>

<figure class="clipping" class:alt={tilt % 2 === 1} style="--tilt: {tilt % 2 ? 0.8 : -0.6}deg">
  <figcaption class="paper-name">{clip.paper}</figcaption>
  <h3>{session.T(clip.headline)}</h3>
  <p>{#each tornParts(session.T(clip.body)) as part}{#if part.torn}<span class="gap" aria-label="torn away">{part.text.replace(/▒/g, ' ')}</span>{:else}{part.text}{/if}{/each}</p>
</figure>

<style>
  .clipping {
    margin: 0;
    padding: 0.9rem 1.1rem 1rem;
    max-width: 62ch;
    color: #2a2218;
    background: #e8dcc0 linear-gradient(160deg, #efe4cb, #dccdab);
    font-family: Georgia, 'Times New Roman', serif;
    transform: rotate(var(--tilt));
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    clip-path: polygon(0 3%, 6% 0, 14% 2%, 27% 0, 41% 3%, 55% 0, 70% 2%, 84% 0, 94% 2%, 100% 0, 99% 18%, 100% 36%, 98% 52%, 100% 70%, 99% 88%, 100% 100%, 88% 98%, 74% 100%, 60% 97%, 44% 100%, 30% 98%, 17% 100%, 6% 98%, 0 100%, 1% 80%, 0 62%, 2% 44%, 0 25%);
  }
  .clipping.alt {
    clip-path: polygon(0 0, 10% 3%, 22% 0, 38% 2%, 52% 0, 68% 3%, 82% 0, 100% 2%, 98% 22%, 100% 40%, 99% 60%, 100% 82%, 97% 100%, 84% 97%, 70% 100%, 55% 98%, 40% 100%, 26% 97%, 12% 100%, 0 98%, 2% 76%, 0 55%, 1% 30%);
  }
  .paper-name { font-variant: small-caps; letter-spacing: 0.08em; font-size: 0.8rem; border-bottom: 1px solid #5b4b32; margin-bottom: 0.4rem; padding-bottom: 0.2rem; }
  h3 { margin: 0.1rem 0 0.4rem; font-size: 1.25rem; line-height: 1.15; text-transform: uppercase; letter-spacing: 0.01em; }
  p { margin: 0; line-height: 1.5; font-size: 0.98rem; }
  .gap { display: inline-block; vertical-align: baseline; min-width: 3.2em; height: 0.9em; margin: 0 0.15em; background: repeating-linear-gradient(135deg, rgba(60, 40, 15, 0.28) 0 3px, transparent 3px 6px); border-radius: 2px; overflow: hidden; color: transparent; }
</style>
