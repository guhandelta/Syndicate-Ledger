<script lang="ts">
  import type { Session } from './session.svelte';
  import Title from './components/Title.svelte';
  import Intro from './components/Intro.svelte';
  import Board from './components/Board.svelte';
  import TownScreen from './components/Town.svelte';
  import Puzzle from './components/Puzzle.svelte';
  import Accuse from './components/Accuse.svelte';
  import Verdict from './components/Verdict.svelte';
  import ModalView from './components/Modal.svelte';
  import Help from './components/Help.svelte';
  import IdleTip from './components/IdleTip.svelte';

  let { session }: { session: Session } = $props();

  // Save after every change to the game state.
  $effect(() => {
    JSON.stringify(session.s);
    session.save();
  });

  // Keep the address bar in step with the screen, so back and reload work.
  let first = true;
  $effect(() => {
    const route = session.route();
    if (location.hash !== route) history[first ? 'replaceState' : 'pushState'](null, '', route);
    first = false;
  });

  $effect(() => {
    const onPop = () => session.applyRoute(location.hash);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  const MOVES: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  // Corner tips: check every few seconds whether the player has been still for 5 minutes.
  $effect(() => {
    const timer = setInterval(() => session.checkIdle(), 5000);
    return () => clearInterval(timer);
  });

  function onKey(e: KeyboardEvent) {
    session.poke();
    if (session.helpOpen) return;
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '?' || e.key === 'h' || e.key === 'H')) {
      session.openHelp();
      e.preventDefault();
      return;
    }
    const top = session.modals[0];
    if (top) {
      if (e.key === 'Escape' && top.dismissible) session.closeModal();
      return;
    }
    if (session.screen !== 'puzzle' || !session.game || !session.leadId) return;
    const n = session.puzzle.size;
    const k = e.key;
    if (/^[1-9]$/.test(k) && Number(k) <= n) {
      session.enter(Number(k));
      e.preventDefault();
    } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
      session.enter(0);
      e.preventDefault();
    } else if (k === 'p' || k === 'P' || k === 'n') {
      session.togglePencil();
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
      if (e.shiftKey) session.redo();
      else session.undo();
      e.preventDefault();
    } else if (MOVES[k]) {
      session.move(...MOVES[k]);
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={() => session.poke()} onwheel={() => session.poke()} />

{#if session.screen === 'title' || !session.game}
  <Title {session} />
{:else if session.screen === 'intro'}
  <Intro {session} />
{:else if session.screen === 'board'}
  <Board {session} />
{:else if session.screen === 'town' && session.town}
  <TownScreen {session} />
{:else if session.screen === 'puzzle' && session.leadId}
  {#key session.leadId}
    <Puzzle {session} />
  {/key}
{:else if session.screen === 'accuse'}
  <Accuse {session} />
{:else if session.screen === 'verdict'}
  <Verdict {session} />
{/if}

{#if session.modals.length}
  {#key session.modals[0]}
    <ModalView modal={session.modals[0]} />
  {/key}
{/if}

<button class="help-fab" aria-label="Help" title="Help (?)" onclick={() => session.openHelp()}>?</button>

{#if session.idleTip && !session.helpOpen}
  <IdleTip {session} hint={session.idleTip} />
{/if}

{#if session.helpOpen}
  <Help {session} />
{/if}
