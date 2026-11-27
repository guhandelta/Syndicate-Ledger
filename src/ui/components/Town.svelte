<script lang="ts">
  import { untrack } from 'svelte';
  import type { CastMember, Line, Opinion } from '../../game/caseTypes';
  import { greetingFor, hearOpinion, opinionsOf } from '../../game/talk';
  import { clockOn, leadCost, leadOpen, puzzleOf, trustOf } from '../../game/state';
  import { FIGURES } from '../../town/figures';
  import { storyHour } from '../../town/looks';
  import { dueShots, type Nearby } from '../../town/townLogic';
  import { TownScene, type DoorState } from '../../town/TownScene';
  import type { CameraKind, Door, Shot } from '../../town/townTypes';
  import { abilityLabel } from '../puzzleHelpers';
  import type { Session } from '../session.svelte';
  import { VOICE_STYLE, expressionFor, voiceFor } from '../voices';
  import Dialogue from './Dialogue.svelte';
  import Spoken from './Spoken.svelte';
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
  /** The opinion the player last asked the person they are talking to for. */
  let asked = $state<Opinion | null>(null);
  let explore = $state<CameraKind>('angled');
  let live = $state(false);
  /** The story shot on screen, if any. */
  let shot = $state<Shot | null>(null);
  let shotTimer: number | undefined;
  /** Longest stretch one frame may take off a shot's time: a stall while a 3D model loads doesn't eat the shot. */
  const SHOT_STEP = 0.1;

  function doorState(d: Door): DoorState {
    if (!d.lead) return 'plain';
    const lp = g.s.leads[d.lead];
    return lp.solved ? 'solved' : !leadOpen(g, d.lead) ? 'locked' : lp.started ? 'started' : 'open';
  }

  /** What the town needs to know of the story: which leads are open or solved and which events have fired. */
  const facts = $derived({
    solved: cf.leads.filter((l) => g.s.leads[l.id].solved).map((l) => l.id),
    open: cf.leads.filter((l) => leadOpen(g, l.id)).map((l) => l.id),
    firedEvents: [...g.s.firedEvents],
  });
  /** The hour of the day the story has reached. */
  const hour = $derived(storyHour(town.time, facts));

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
    const role = (c.role === 'boss' || c.role === 'mastermind') ? 'suspect' : c.role;
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

  /** Asks the person you're talking to what they think of someone. */
  function ask(o: Opinion) {
    asked = o;
    hearOpinion(g, talking!.id, o.about);
    session.save();
  }

  /** The face for a line: what the line says, else what the voice asks for, else what the player knows of them. */
  const faceFor = (l: Line, trust: ReturnType<typeof trustOf> | undefined) => l.face ?? (l.voice === 'lying' || l.voice === 'suspicious' ? undefined : expressionFor(trust));

  function endTalk() {
    asked = null;
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
    // the shot's time counts frames the player saw, so a busy moment can't cut it short
    let left = next.seconds;
    let last = performance.now();
    const tick = (now: number) => {
      left -= Math.min(SHOT_STEP, Math.max(0, now - last) / 1000);
      last = now;
      if (left <= 0) endShot();
      else shotTimer = requestAnimationFrame(tick);
    };
    shotTimer = requestAnimationFrame(tick);
  }

  /** Ends the shot (its time is up, or the player skipped it) and hands the camera back. */
  function endShot() {
    if (shotTimer !== undefined) cancelAnimationFrame(shotTimer);
    shotTimer = undefined;
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
    if (session.modals.length || session.helpOpen || !scene) return;
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
        // read once: the scene eases to later hours itself, and must not be rebuilt as the story moves
        hour: untrack(() => hour),
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
      if (shotTimer !== undefined) cancelAnimationFrame(shotTimer);
      shot = null;
      live = false;
      made.dispose();
      scene = null;
    };
  });

  // The person you are talking to shows the face of their latest line, in 3D as well as in the bubble.
  const talkFace = $derived.by(() => {
    if (!talking) return null;
    const trust = talking.role === 'ally' ? undefined : trustOf(g, talking.id);
    const line = asked ?? greetingFor(g, talking);
    if (!line) return expressionFor(trust);
    return faceFor(line, trust) ?? VOICE_STYLE[voiceFor(line.voice, trust)].expression ?? 'neutral';
  });

  $effect(() => {
    scene?.setMood(talkFace);
  });

  // Door colours and who is in town follow the game state.
  $effect(() => {
    const view = { doorStates: Object.fromEntries(town.doors.map((d) => [d.id, doorState(d)])), firedEvents: [...g.s.firedEvents], hour };
    scene?.setView(view);
  });

  // A dialog (news, an offer, a closed lead) stops the walk until it is answered.
  $effect(() => {
    if (!scene) return;
    const blocked = session.modals.length > 0 || session.helpOpen;
    if (blocked) scene.clearKeys();
    scene.paused = blocked || !!talking || !!shot;
  });

  // Story shots: when a moment in the case has come, the camera shows it once, then returns to the player.
  $effect(() => {
    if (!live || shot || talking || session.modals.length) return;
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
        {@const greeting = greetingFor(g, talking)}
        {@const opinions = trust === 'refuses' ? [] : opinionsOf(g, talking)}
        <div class="town-talk" role="dialog" aria-labelledby="talk-name">
          <div class="talk-head">
            <h2 id="talk-name">{talking.name}</h2>
            <p class="talk-role">{roleLine(talking)}</p>
            <p class="talk-blurb muted">{session.T(talking.blurb)}</p>
          </div>
          {#if greeting}
            {@const voice = voiceFor(greeting.voice, trust)}
            <Dialogue person={talking} {voice} expression={faceFor(greeting, trust)} friendly={session.tone === 'friendly'} size={104}>
              <p><Spoken line={session.T(greeting.text)} /></p>
            </Dialogue>
            {#if greeting.tell}<p class="tell">{session.T(greeting.tell)}</p>{/if}
          {/if}
          {#if opinions.length}
            <div class="ask-about" role="group" aria-label="Ask about someone">
              <span class="muted">Ask about:</span>
              {#each opinions as o (o.about)}
                <button class="btn sm" class:on={asked?.about === o.about} onclick={() => ask(o)}>{session.person(o.about).name}</button>
              {/each}
            </div>
          {/if}
          {#if asked}
            {@const voice = voiceFor(asked.voice, trust)}
            <Dialogue person={talking} {voice} expression={faceFor(asked, trust)} friendly={session.tone === 'friendly'} size={80}>
              <p><Spoken line={session.T(asked.text)} /></p>
            </Dialogue>
            {#if asked.tell}<p class="tell">{session.T(asked.tell)}</p>{/if}
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
