import { describe, expect, it } from 'vitest';
import type { CaseFile } from '../src/game/caseTypes';
import { cameraPose, dueShots, forward, nearest, npcPosition, shotFocus, shotPose, step, townForRank, validateTown } from '../src/town/townLogic';
import type { CameraSettings, Shot, Town } from '../src/town/townTypes';

const cameras: CameraSettings = {
  wide: { position: [1, 2, 3], target: [4, 5, 6] },
  angled: { height: 10, back: 6 },
  behind: { height: 3, back: 5, lookAhead: 4 },
  talk: { distance: 2, height: 1.6, side: 1 },
};

const baseTown = (): Town => ({
  name: 't',
  bounds: [-10, -10, 10, 10],
  waterline: -8,
  start: { at: [0, 5], heading: 0 },
  buildings: [{ id: 'hall', name: 'Hall', at: [0, 0], size: [4, 4], height: 3, color: '#ffffff', roof: '#000000', doorSide: 'south' }],
  doors: [
    { id: 'd1', at: [5, 5], label: 'One', lead: 'L1' },
    { id: 'd2', at: [-5, 5], label: 'Two', lead: 'L2' },
    { id: 'acc', at: [0, 8], label: 'Accuse', goto: 'accuse' },
  ],
  npcs: [
    { cast: 'a', at: [3, 5] },
    { cast: 'b', at: [-3, 5], untilEvent: 'gone' },
  ],
  props: [],
  cameras,
  moments: { enter: 'wide', explore: 'angled', talk: 'talk' },
  shots: [],
});

const cf = (): CaseFile =>
  ({
    cast: [
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bob' },
    ],
    leads: [
      { id: 'L1', opensAfter: [] },
      { id: 'L2', opensAfter: ['L1'] },
    ],
    events: [{ id: 'gone' }, { id: 'later' }],
  }) as unknown as CaseFile;

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: 's',
  when: { leadOpens: 'L2' },
  focus: { door: 'd1' },
  distance: 5,
  height: 3,
  seconds: 4,
  caption: 'cap',
  ...over,
});

describe('movement edge cases', () => {
  it('pushes out of a box from every side when the centre is inside it', () => {
    const t = baseTown();
    const ends = [
      step(t, [-1.9, 0], 0, 0), // nearest the left wall
      step(t, [1.9, 0], 0, 0), // right
      step(t, [0, -1.9], 0, 0), // top
      step(t, [0, 1.9], 0, 0), // bottom
    ];
    expect(ends[0][0]).toBeLessThan(-2);
    expect(ends[1][0]).toBeGreaterThan(2);
    expect(ends[2][1]).toBeLessThan(-2);
    expect(ends[3][1]).toBeGreaterThan(2);
  });

  it('leaves a person standing exactly on top of you by pushing you away', () => {
    const t = baseTown();
    const [x, z] = step(t, [5, 5], 0, 0, [[5, 5]]);
    expect(Math.hypot(x - 5, z - 5)).toBeGreaterThan(0.9);
  });

  it('points forward by heading', () => {
    const [x, z] = forward(0);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });
});

describe('people on paths', () => {
  it('stands still without a path or with a zero-length path', () => {
    expect(npcPosition({ cast: 'a', at: [1, 1] }, 5)).toEqual({ at: [1, 1], moving: false });
    expect(npcPosition({ cast: 'a', at: [1, 1], path: [[1, 1]] }, 5)).toEqual({ at: [1, 1], moving: false });
  });

  it('pauses at each end and walks between', () => {
    const npc = { cast: 'a', at: [0, 0] as [number, number], path: [[10, 0], [10, 10]] as [number, number][] };
    expect(npcPosition(npc, 1).moving).toBe(false); // paused at the start
    expect(npcPosition(npc, 5).moving).toBe(true); // heading out
    expect(npcPosition(npc, 3 + 11 / 1.1).at[1]).toBeCloseTo(1); // on the second leg
    const leg = 20 / 1.1;
    expect(npcPosition(npc, 3 + leg + 1)).toEqual({ at: [10, 10], moving: false }); // paused at the far end
    expect(npcPosition(npc, 3 + leg + 3 + 2).moving).toBe(true); // walking back
    expect(npcPosition(npc, -1).moving).toBe(true);
    // end of the walk back, before the next cycle
    const cycle = 2 * (leg + 3);
    const back = npcPosition(npc, cycle - 0.0001);
    expect(back.at[0]).toBeCloseTo(0, 0);
  });

  it('copes with a path that doubles back on a repeated point', () => {
    const npc = { cast: 'a', at: [0, 0] as [number, number], path: [[0, 0], [4, 0]] as [number, number][] };
    expect(npcPosition(npc, 5).moving).toBe(true);
    expect(npcPosition(npc, 3)).toEqual({ at: [0, 0], moving: true }); // sets off exactly at the end of the pause
  });
});

describe('nearest', () => {
  it('prefers the closest of doors and people, and ignores far ones', () => {
    const t = baseTown();
    const a = t.npcs[0];
    const b = t.npcs[1];
    expect(nearest(t, [50, 50], [])).toBeNull();
    expect(nearest(t, [5, 5], [])).toMatchObject({ kind: 'door' });
    expect(nearest(t, [5, 4], [{ npc: a, at: [5, 4.5] }])).toMatchObject({ kind: 'npc' });
    expect(nearest(t, [5, 4], [{ npc: a, at: [5, 5.5] }])).toMatchObject({ kind: 'door' });
    expect(nearest(t, [5, 4], [{ npc: a, at: [5, 4.5] }, { npc: b, at: [5, 4.2] }])).toMatchObject({ kind: 'npc', npc: b });
    expect(nearest(t, [5, 4], [{ npc: a, at: [5, 4.2] }, { npc: b, at: [5, 4.5] }])).toMatchObject({ kind: 'npc', npc: a });
    expect(nearest(t, [0, 6.5], [])).toMatchObject({ kind: 'door' });
    expect(nearest({ ...t, doors: [{ id: 'x', at: [0, 5.5], label: 'x', goto: 'board' }, { id: 'y', at: [0, 5.1], label: 'y', goto: 'board' }] }, [0, 5], [])).toMatchObject({ door: { id: 'y' } });
  });
});

describe('cameras', () => {
  const player = { x: 0, z: 0, heading: 0 };
  it('has a pose for every kind of view', () => {
    expect(cameraPose('wide', cameras, player)).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(cameraPose('angled', cameras, player).position).toEqual([0, 10, 6]);
    expect(cameraPose('behind', cameras, player).position[2]).toBeCloseTo(5);
    expect(cameraPose('talk', cameras, player, [0, -3]).target).toEqual([0.55, 1.35, -3]);
    // talking while standing exactly on the other person must not divide by zero
    expect(cameraPose('talk', cameras, player, [0, 0]).target).toEqual([0, 1.35, 0]);
    // asking for a talk view with nobody to look at falls back to the angled view
    expect(cameraPose('talk', cameras, player)).toEqual(cameraPose('angled', cameras, player));
  });
});

describe('story shots', () => {
  const facts = { solved: ['L1'], open: ['L2'], firedEvents: ['gone'] };
  it('picks due shots by each kind of trigger and skips seen or trigger-less ones', () => {
    const t = baseTown();
    t.shots = [
      shot({ id: 'open', when: { leadOpens: 'L2' } }),
      shot({ id: 'solved', when: { leadSolved: 'L1' } }),
      shot({ id: 'event', when: { event: 'gone' } }),
      shot({ id: 'none', when: {} }),
      shot({ id: 'notyet', when: { leadSolved: 'L2' } }),
    ];
    expect(dueShots(t, facts, []).map((s) => s.id)).toEqual(['open', 'solved', 'event']);
    expect(dueShots(t, facts, ['open']).map((s) => s.id)).toEqual(['solved', 'event']);
    expect(dueShots({ ...t, shots: undefined }, facts, [])).toEqual([]);
  });

  it('finds what a shot looks at', () => {
    const t = baseTown();
    expect(shotFocus(shot({ focus: { door: 'd1' } }), t)).toEqual([5, 5]);
    expect(shotFocus(shot({ focus: { building: 'hall' } }), t)).toEqual([0, 0]);
    expect(shotFocus(shot({ focus: { npc: 'a' } }), t)).toEqual([3, 5]);
    expect(shotFocus(shot({ focus: { npc: 'a' } }), t, [9, 9])).toEqual([9, 9]);
  });

  it('places the camera, with defaults for angle and orbit and a higher look at buildings', () => {
    expect(shotPose(shot(), [0, 0]).position[2]).toBeCloseTo(5);
    expect(shotPose(shot({ angle: 90 }), [0, 0]).position[0]).toBeCloseTo(5);
    expect(shotPose(shot({ orbit: 90 }), [0, 0], 1).position[0]).toBeCloseTo(5);
    expect(shotPose(shot({ focus: { building: 'hall' } }), [0, 0]).target[1]).toBe(2);
    expect(shotPose(shot(), [0, 0]).target[1]).toBe(1.2);
  });
});

describe('a town for a rank story', () => {
  const leads = [{ id: 'J1' }, { id: 'L2' }] as CaseFile['leads'];
  it('points doors at the story\'s leads and drops doors it has no lead for', () => {
    const t = baseTown();
    t.doors[0].leadFor = { junior: 'J1' };
    t.doors.push({ id: 'extra', at: [1, 1], label: 'Extra', leadFor: { junior: 'J9' } });
    const junior = townForRank(t, leads, 'junior');
    expect(junior.doors.map((d) => d.lead ?? d.goto)).toEqual(['J1', 'L2', 'accuse']);
    expect(townForRank(t, leads, 'chief').doors.map((d) => d.lead ?? d.goto)).toEqual(['L2', 'accuse']);
  });
  it('keeps a person out of the towns of ranks they are not listed for', () => {
    const t = baseTown();
    t.npcs[0].ranks = ['chief'];
    expect(townForRank(t, leads, 'junior').npcs.map((n) => n.cast)).not.toContain(t.npcs[0].cast);
    expect(townForRank(t, leads, 'chief').npcs.map((n) => n.cast)).toContain(t.npcs[0].cast);
    expect(townForRank(t, leads, 'chief').npcs).toHaveLength(t.npcs.length);
  });
  it('checks a rank-limited person is listed for a rank and is not the focus of a shot', () => {
    const t = baseTown();
    t.npcs[0].ranks = [];
    expect(validateTown(t, cf())).toContain(`${t.npcs[0].cast} is listed for no rank`);
    t.npcs[0].ranks = ['chief'];
    t.shots = [{ id: 's', when: { event: cf().events[0].id }, focus: { npc: t.npcs[0].cast }, seconds: 3, distance: 3, height: 2, caption: 'c' }];
    expect(validateTown(t, cf()).join()).toContain("who is not in every rank's town");
  });
  it('keeps an unseen person out of the town and does not ask for a figure for them', () => {
    const c = cf();
    (c.cast[1] as { unseen?: boolean }).unseen = true;
    const t = baseTown();
    t.doors[1].lead = 'L2';
    expect(validateTown(t, c)).toContain('Bob is unseen but stands in the town');
    t.npcs = t.npcs.filter((n) => n.cast !== 'b');
    expect(validateTown(t, c)).toEqual([]);
  });
  it('checks that a rank story has a door for each of its leads', () => {
    const c = {
      ...cf(),
      rankStories: { junior: { part: {}, leads: [{ id: 'J1', opensAfter: [] }, { id: 'J2', opensAfter: [] }] } },
    } as unknown as CaseFile;
    const t = baseTown();
    t.doors[0].leadFor = { junior: 'J1' };
    t.doors[1].lead = 'L2';
    expect(validateTown(t, c)).toEqual(['junior story: lead J2 has no door in the town']);
    t.doors[1].leadFor = { junior: 'J2' };
    expect(validateTown(t, c)).toEqual([]);
  });
});

describe('validating a town', () => {
  const ok = () => {
    const t = baseTown();
    t.doors[1].lead = 'L2';
    return t;
  };
  it('accepts a good town', () => {
    expect(validateTown(ok(), cf())).toEqual([]);
  });

  it('finds bad spots, doors, people and cast', () => {
    const t = ok();
    t.start.at = [0, 0]; // inside the hall
    t.doors[0] = { id: 'd1', at: [50, 50], label: 'x', lead: 'L9', goto: 'board' };
    t.doors[2] = { id: 'acc', at: [0, 8], label: 'x' };
    t.npcs = [{ cast: 'zzz', at: [0, -9.5], untilEvent: 'nope', path: [[0, 0]] }];
    const e = validateTown(t, cf());
    expect(e).toEqual(
      expect.arrayContaining([
        'The start point is inside Hall',
        'Door "d1" is off the walkable ground',
        'Door "d1" needs exactly one of lead or goto',
        'Door "d1" opens unknown lead L9',
        'Door "acc" needs exactly one of lead or goto',
        'Lead L1 has no door in the town',
        'No door leads to the accusation',
        'Unknown cast member zzz',
        'zzz leaves on unknown event nope',
        'Ann is not in the town',
        'Bob is not in the town',
      ]),
    );
  });

  it('checks every shot', () => {
    const t = ok();
    t.npcs[1].untilEvent = 'gone';
    t.shots = [
      shot({ id: 'twice' }),
      shot({ id: 'twice', when: {}, focus: {} }),
      shot({ id: 'badlead', when: { leadOpens: 'L9', leadSolved: 'L8' }, focus: { door: 'zz', building: 'zz' } }),
      shot({ id: 'startopen', when: { leadOpens: 'L1' }, focus: { building: 'zz' } }),
      shot({ id: 'badevent', when: { event: 'zz' }, focus: { npc: 'ghost' } }),
      shot({ id: 'gone', when: { event: 'later' }, focus: { npc: 'b' }, seconds: 1, distance: 1, height: 0, caption: '' }),
      shot({ id: 'fine', when: { leadSolved: 'L1' }, focus: { npc: 'a' } }),
      shot({ id: 'longshot', seconds: 9 }),
      shot({ id: 'nodoor', focus: { door: 'zz' } }),
    ];
    const e = validateTown(t, cf());
    expect(e).toEqual(
      expect.arrayContaining([
        'Shot "twice" is listed twice',
        'Shot "twice" needs exactly one trigger',
        'Shot "twice" needs exactly one thing to look at',
        'Shot "badlead" needs exactly one trigger',
        'Shot "badlead" waits on unknown lead L9',
        'Shot "badlead" waits on unknown lead L8',
        'Shot "startopen" waits for L1 to open, but it is open from the start',
        'Shot "startopen" looks at unknown building zz',
        'Shot "badevent" waits on unknown event zz',
        'Shot "badevent" looks at ghost, who is not in the town',
        'Shot "gone" looks at b, who may have left town by then',
        'Shot "gone" must last 2 to 8 seconds',
        'Shot "gone" has the camera too close or too low',
        'Shot "gone" has no caption',
        'Shot "longshot" must last 2 to 8 seconds',
        'Shot "nodoor" looks at unknown door zz',
      ]),
    );
    expect(e.some((m) => m.includes('"fine"'))).toBe(false);
  });

  it('accepts a town without shots', () => {
    const t = ok();
    delete t.shots;
    expect(validateTown(t, cf())).toEqual([]);
  });
});
