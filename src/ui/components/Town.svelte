<script lang="ts">
  import type { CastMember } from '../../game/caseTypes';
  import { clockOn, leadCost, leadOpen, puzzleOf, trustOf } from '../../game/state';
  import { FIGURES } from '../../town/figures';
  import { dueShots, type Nearby } from '../../town/townLogic';
  import { TownScene, type DoorState } from '../../town/TownScene';
  import type { CameraKind, Door, Shot } from '../../town/townTypes';
  import { abilityLabel } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';
  import { expressionFor, voiceFor } from '../voices';
  import Dialogue from './Dialogue.svelte';
  import StatusBar from './StatusBar.svelte';
  import { TRUST_LABEL } from './labels';

  let { session }: { session: Session } = $props();
  const g = $derived(session.g);
  const cf = $derived(session.cf);
  const town = $derived(session.town!);

  let canvas: HTMLCanvasElement;
  let scene: TownScene | null = null;
  let failed = $state(false);
  let nearby = $state<Nearby | null>(null);
  let talking = $state<CastMember | null>(null);
  let explore = $state<CameraKind>('angled');
  let live = $state(false);
  /** The story shot on screen, if any. */
  let shot = $state<Shot | null>(null);
  let shotTimer: ReturnType<typeof setTimeout> | undefined;

  function doorState(d: Door): DoorState {
    if (!d.lead) return 'plain';
    const lp = g.s.leads[d.lead];
    return lp.solved ? 'solved' : !leadOpen(g, d.lead) ? 'locked' : lp.started ? 'started' : 'open';
  }

  const leadTitle = (id: string) => session.T(cf.leads.find((l) => l.id === id)!.title);

  /** What pressing E does at a door, in words. */
  function doorPrompt(d: Door): { text: string; can: boolean } {
    if (d.goto === 'board') return { text: `${d.label}: open the case board`, can: true };
    if (d.goto === 'accuse') return { text: `${d.label}: make your accusation`, can: true };
    const id = d.lead!;
    const state = doorState(d);
    if (state === 'locked') {
      const needs = cf.leads.find((l) => l.id === id)!.opensAfter.map(leadTitle).join(' and ');
      return { text: `${d.label} is locked. Opens after: ${needs}.`, can: false };
    }
    if (state === 'solved') return { text: `${d.label}: review "${leadTitle(id)}"`, can: true };
    if (state === 'started') return { text: `${d.label}: keep working on "${leadTitle(id)}"`, can: true };
    return { text: `${d.label}: work "${leadTitle(id)}"${clockOn(g) ? ` (${leadCost(g, id)} h)` : ''}`, can: true };
  }

  const prompt = $derived.by(() => {
    if (!nearby || talking || shot) return null;
    if (nearby.kind === 'npc') return { text: `Talk to ${session.person(nearby.npc.cast).name}`, can: true };
    return doorPrompt(nearby.door);
  });

  /** Leads this person has statements in, so the player knows where their word matters. */
  function speaksIn(c: CastMember): string[] {
    return cf.leads.filter((l) => puzzleOf(g, l.id).statements.some((s) => s.speaker === c.id)).map((l) => `${l.id} ${leadTitle(l.id)}`);
  }

  function roleLine(c: CastMember): string {
    if (c.role === 'ally') return abilityLabel(c);
    // the boss is shown as an ordinary suspect so the town doesn't give the ending away
    const role = c.role === 'boss' ? 'suspect' : c.role;
    return `${role[0].toUpperCase()}${role.slice(1)} · ${TRUST_LABEL[trustOf(g, c.id)]}`;
  }

  function interact() {
    if (shot) return endShot();
    if (talking) return endTalk();
    if (!nearby || !scene) return;
    if (nearby.kind === 'npc') {
      talking = session.person(nearby.npc.cast);
      scene.paused = true;
      scene.clearKeys();
      scene.talkTo(talking.id);
      return;
    }
    const d = nearby.door;
    if (!doorPrompt(d).can) return;
    session.townPose = { ...scene.pose };
    if (d.goto === 'board') session.show('board');
    else if (d.goto === 'accuse') session.goAccuse();
    else session.work(d.lead!);
  }

  function endTalk() {
    talking = null;
    if (!scene) return;
    scene.paused = false;
    scene.talkTo();
  }

  function startShot(next: Shot) {
    if (!scene) return;
    shot = next;
    scene.clearKeys();
    scene.playShot(next);
    shotTimer = setTimeout(endShot, next.seconds * 1000);
  }

  /** Ends the shot (its time is up, or the player skipped it) and hands the camera back. */
  function endShot() {
    clearTimeout(shotTimer);
    if (!shot) return;
    session.seeShot(shot.id);
    shot = null;
    scene?.playShot();
  }

  function switchCamera() {
    if (scene) explore = scene.toggleExplore();
  }

  function openBoard() {
    if (scene) session.townPose = { ...scene.pose };
    session.show('board');
  }

  const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

  function onKeyDown(e: KeyboardEvent) {
    if (session.modals.length || !scene) return;
    if (MOVE.has(e.code)) {
      if (!talking && !shot) scene.setKey(e.code, true);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    } else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') {
      if (e.repeat) return;
      // Enter and Space on a focused button already click it
      if (e.code !== 'KeyE' && (e.target as HTMLElement).closest('button')) return;
      interact();
      e.preventDefault();
    } else if (e.code === 'Escape' && shot) {
      endShot();
    } else if (shot) {
      return;
    } else if (e.code === 'KeyC') {
      switchCamera();
    } else if (e.code === 'KeyB') {
      openBoard();
    } else if (e.code === 'Escape' && talking) {
      endTalk();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    scene?.setKey(e.code, false);
  }

  $effect(() => {
    try {
      scene = new TownScene(canvas, {
        town,
        figures: FIGURES,
        colors: Object.fromEntries(cf.cast.map((c) => [c.id, c.color])),
        friendly: session.tone === 'friendly',
        pose: session.townPose ?? undefined,
        onNearby: (n) => (nearby = n),
      });
    } catch {
      failed = true;
      return;
    }
    explore = scene.exploreKind;
    live = true;
    const made = scene;
    const onResize = () => made.resize();
    const onBlur = () => made.clearKeys();
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlur);
    return () => {
      session.townPose = { ...made.pose };
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      clearTimeout(shotTimer);
      shot = null;
      live = false;
      made.dispose();
      scene = null;
    };
  });

  // Door colours and who is in town follow the game state.
  $effect(() => {
    const view = { doorStates: Object.fromEntries(town.doors.map((d) => [d.id, doorState(d)])), firedEvents: [...g.s.firedEvents] };
    scene?.setView(view);
  });

  // A dialog (news, an offer, a closed lead) stops the walk until it is answered.
  $effect(() => {
    if (!scene) return;
    const blocked = session.modals.length > 0;
    if (blocked) scene.clearKeys();
    scene.paused = blocked || !!talking || !!shot;
  });

  // Story shots: when a moment in the case has come, the camera shows it once, then returns to the player.
  $effect(() => {
    if (!live || shot || talking || session.modals.length) return;
    const facts = {
      solved: cf.leads.filter((l) => g.s.leads[l.id].solved).map((l) => l.id),
      open: cf.leads.filter((l) => leadOpen(g, l.id)).map((l) => l.id),
      firedEvents: [...g.s.firedEvents],
    };
    const next = dueShots(town, facts, g.s.shotsSeen ?? [])[0];
    if (!next) return;
    // let the opening wide shot or a closing dialog finish first
    const wait = setTimeout(() => startShot(next), scene?.inIntro ? 2000 : 350);
    return () => clearTimeout(wait);
  });
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div class="town">
  <StatusBar {session} />
  <div class="town-stage">
    <canvas bind:this={canvas} class="town-canvas" aria-label="{town.name}: a 3D view you walk around with the keyboard"></canvas>

    {#if failed}
      <div class="town-fallback">
        <p>The 3D town can't start in this browser. The case board has everything you need.</p>
        <button class="btn primary" onclick={openBoard}>Open the case board</button>
      </div>
    {:else if shot}
      <div class="shot-bar top" aria-hidden="true"></div>
      <div class="shot-bar bottom" role="status">
        <p class="shot-caption">{session.T(shot.caption)}</p>
        <button class="btn sm" onclick={endShot}>Skip <kbd>E</kbd></button>
      </div>
    {:else}
      <div class="town-top">
        <span class="town-place">{town.name}</span>
        <button class="btn sm" onclick={switchCamera} title="Switch camera (C)">Camera: {explore === 'behind' ? 'Behind' : 'Angled'} <kbd>C</kbd></button>
        <button class="btn sm" onclick={openBoard} title="Open the case board (B)">Case board <kbd>B</kbd></button>
      </div>

      {#if talking}
        {@const trust = talking.role === 'ally' ? undefined : trustOf(g, talking.id)}
        {@const leads = talking.role === 'ally' ? [] : speaksIn(talking)}
        <div class="town-talk" role="dialog" aria-labelledby="talk-name">
          <div class="talk-head">
            <h2 id="talk-name">{talking.name}</h2>
            <p class="talk-role">{roleLine(talking)}</p>
            <p class="talk-blurb muted">{session.T(talking.blurb)}</p>
          </div>
          {#if talking.greeting}
            {@const voice = voiceFor(talking.greeting.voice, trust)}
            <Dialogue person={talking} {voice} expression={expressionFor(trust)} friendly={session.tone === 'friendly'} size={104}>
              <p>{session.T(talking.greeting.text)}</p>
            </Dialogue>
          {/if}
          <Dialogue voice="thought" side="right" size={44}>
            <p>
              {#if talking.role === 'ally'}
                I can call on them from inside a lead.
              {:else if leads.length}
                Has statements in: {leads.join(', ')}.
              {:else}
                Has made no statements in this case.
              {/if}
            </p>
          </Dialogue>
          <button class="btn primary sm talk-bye" onclick={endTalk}>Goodbye <kbd>E</kbd></button>
        </div>
      {:else if prompt}
        <div class="town-prompt" class:locked={!prompt.can} role="status">
          {#if prompt.can}<kbd>E</kbd>{/if}
          <span>{prompt.text}</span>
        </div>
      {/if}

      <p class="town-help">
        {explore === 'behind' ? 'W/S walk · A/D turn' : 'WASD or arrows to walk'} · Shift to run · <kbd>E</kbd> talk or enter · <kbd>C</kbd> camera
      </p>
    {/if}
  </div>
</div>
