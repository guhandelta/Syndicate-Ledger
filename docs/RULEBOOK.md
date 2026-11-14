# Syndicate Ledger: Rule Book and Case 1 Brief

This is the rule book for Syndicate Ledger and the brief for its first case, "The Harbor Ledger". Every new case, puzzle, feature or code change gets checked against it before it ships. The living version is a shared doc. This file is the copy that travels with the code, so update both together.

- **Sections 1 to 5 are the standard.** They define what the game is and the rules every case must follow. Change them only on purpose, and record the change in the change log in section 10.
- **Section 6 is Case 1.** It is the first case built to the standard and serves as the reference example.
- **Sections 7 to 9 are the build spec.** They cover the case file format, the quality checklist and the code standards.

Words in **MUST** are hard rules. Words in **SHOULD** are strong defaults that can be broken with a written reason.

## 1. Design pillars

Six pillars decide every design argument. If a feature doesn't serve at least one of them, it gets cut.

1. **The math is the evidence.** Every story fact the player learns MUST come from solving a puzzle or from checking a statement against a grid. Nothing is revealed just by reading.
2. **Trust is earned and tested.** People lie for reasons. A lie MUST always be catchable through logic, never through guessing or trial and error.
3. **Every puzzle is fair.** Every puzzle MUST have exactly one solution that can be reached by deduction alone.
4. **Time is a choice, not a stopwatch.** Pressure comes from the in-game clock and the actions you spend. Real-time timers are optional extras only.
5. **One story, every age.** A case is written once and played at any difficulty. Difficulty changes the puzzles, never the plot.
6. **Built to be authored.** Cases are data, not code. A new case MUST be writable without touching game logic.

## 2. Core puzzle rules

Every puzzle is an N×N grid filled with 1 to N, with no repeats in any row or column, plus zones and statements that pin down one solution.

**The grid**

- Rows are time slots and columns are people.
- Sizes are 4×4, 5×5 or 6×6. A zone MUST be 1 to 5 cells, joined edge to edge, with its total shown in its top-left cell.

**Two kinds of grid**

- **Ledger grids** (cash): a cell is the $k a person moved that hour. Clues are sum zones. The story explains the no-repeats rule: the syndicate never sends two couriers with the same amount in one hour, and never sends a courier with the same amount twice.
- **Surveillance grids** (rooms): a cell is the room a person was in that hour, numbered 1 to N along the pier. One person per room each hour, and nobody visits the same room twice. Clues are camera sightings (a few cells given) and position statements such as "Vex and Kane were in rooms right next to each other at 10pm". No sum zones.

**Statements**

- A statement is something a character says that can be checked against the grid, such as "At 10pm, Vex moved more than Kane" or "Rosa's 9pm and 10pm runs add up to $7k".
- Each statement belongs to a speaker, and the speaker's reliability decides whether it is true (section 4).
- Every statement MUST be a rule the code can check. Opinions and vague hints are flavor text only.

**The liar rule**

- The player is told how many statements in a puzzle are false, for example "exactly one of these statements is a lie". At the Chief preset the player gets a range instead (for example "1 or 2"), and the solution is still unique.
- The zones or sightings alone MUST allow at least 2 valid grids. That makes the statements necessary.
- Those clues plus statements, with an allowed number of lies, MUST allow exactly one grid and exactly one set of liars.
- A puzzle is solved when the grid is complete **and** the player has marked every statement as True or Lie. Accusing a liar is part of the solve, not a bonus.

**Player tools**

- Pencil marks, undo and redo.
- Mistakes are highlighted only when the difficulty preset allows it (section 5). Repeated numbers in a row or column are always shown.
- Allies give hints (section 4). There is no free "reveal" button.

## 3. Investigation layer

A case is an evidence board of linked leads, played against an in-game clock. Each solved lead produces facts that open new leads, until the player makes a final accusation.

**The loop**

1. Pick an open lead on the board.
2. Pay its time cost on the clock.
3. Solve its grid and mark which statements are true or false.
4. Collect the facts it produces. New leads open, trust levels change, and scheduled events may fire.
5. Repeat until the player chooses to make the final accusation, or time runs out.

**The clock**

- Each case has a fixed budget of days and hours. Clock time only moves when the player takes an action.
- Scheduled events fire at the start or end of a day, or when a condition is met. Events MUST be shown on the board as rumors ahead of time, so missing one is the player's choice and not a surprise. An event that targets a lead does nothing once that lead has been started.
- When the clock runs out, the player MUST make an accusation with whatever evidence they have.

**Action costs**

| Action | Cost | What it gives |
| --- | --- | --- |
| Work a lead | 2 hours | The lead's facts |
| Pay the informant | 1 hour + 1 favor | One extra true statement for a puzzle |
| Call in an ally | 1 or 2 favors | That ally's ability, once |
| Final accusation | None | Ends the case |

**Favors** are the second resource. Each preset sets the starting number. The player earns one each time they expose a liar.

**Trust**

- Each character has a hidden reliability: Honest, Mistaken, Liar or Double agent.
- The board shows a trust meter for each person: Unknown, Suspicious, Caught lying, Honest mistake or Verified. It updates as the player marks statements and solves leads.
- Once the double agent is caught lying, they stop selling tips.
- Trusting the double agent costs the player something concrete, such as an event that fires or a lead that costs more. It MUST never make the case unwinnable.

## 4. Cast roles

| Role | What they do | Typical reliability |
| --- | --- | --- |
| Suspect | A column in the grids; part of the syndicate or wrongly accused | Liar or Honest |
| Witness | Gives statements about what they saw | Honest or Mistaken |
| Informant | Sells extra statements for time and favors | Double agent |
| Ally | Has one ability the player can call in | Always Honest |
| Boss | The final target; shown to the player as an ordinary suspect | Never speaks directly |

**Reliability rules**

- **Honest:** every statement is true.
- **Liar:** at least one statement in each puzzle they lie in is false, and they lie to protect a named person.
- **Mistaken:** one statement is false through an honest error. It counts toward a puzzle's liar total, but catching it shows as "Honest mistake", not "Caught lying".
- **Double agent:** honest at first so they earn trust, then false at a key moment written in the case file.

**Allies**

| Ally | Ability | Cost |
| --- | --- | --- |
| Forensic analyst | Reveals one cell of your choice | 1 favor |
| Accountant | Lists what a zone can hold, given the grid so far | 1 favor |
| Undercover cop | Confirms whether one statement is true | 2 favors |
| Old partner | Points to the next deduction and explains it, without filling anything in | 1 favor |

**Character rules**

- A character's lies MUST have a motive the player can find by the end.
- Each case SHOULD have 5 to 8 characters. Allies don't count toward this limit.
- Each character gets a name, a one-line description, an icon and a color that never matches a zone color.

## 5. Difficulty presets and age scaling

Every case MUST play at all four presets. The plot, cast, leads and endings stay the same.

| Setting | Junior (7+) | Detective (10+) | Inspector (14+) | Chief (adult) |
| --- | --- | --- | --- | --- |
| Grid size | 4×4 | 5×5 | 6×6 | 6×6 |
| Liars told as | Exact count | Exact count | Exact count | A range, such as "1 or 2" |
| Lies flagged "Unverified" | Yes, the liar is marked | Possible liars marked | No | No |
| Clock | Off | On, +2 hours | On | On, −1 hour |
| Scheduled events | Off | Shown as rumors | Shown as rumors | Some hidden |
| Mistake highlighting | Instant | On request | Off | Off |
| Starting favors | 6 | 4 | 3 | 2 |
| Tone | Friendly mystery | Crime | Crime | Crime |

**Tone rules**

- Every player-facing text can have a "friendly" version for Junior and a "crime" version for everything else. Junior swaps cash for coins, and the syndicate becomes a sneaky gang.
- No violence is shown at any preset. Crimes are theft, smuggling and fraud.

**Puzzle difficulty** comes from the solving techniques a grid needs. The generator MUST grade each grid and reject any above the preset's level:

1. Singles: only one number fits a cell, or a number fits only one cell in a row or column
2. Small zones and statements (3 cells or fewer) narrowing their cells
3. Any zone or statement narrowing its cells against what is left in the rows and columns
4. Testing a number and following it to a contradiction

Junior allows up to 2, Detective up to 3, Inspector and Chief up to 4. The first lead of a case (the tutorial) is capped at 3. Finding the liars is on top of the grid techniques.

## 6. Case 1 brief: The Harbor Ledger

Case 1 is a 4-lead, 3-day case in which $90k vanishes from Crane Shipping. The trail leads to the company's own owner, who reported the theft himself. It teaches every core mechanic once: both grid types, a mistaken witness, a liar, a double agent, a scheduled event and a branching ending. Version 1 ships with this one case only.

**Setup**

Port Calder, a rainy harbor town. Silas Crane reports $90k stolen from his shipping company's safe. The player is a newly promoted detective with 3 days before the next cargo ship sails and the money leaves with it.

Junior version: the Gold Coin Festival prize chest is empty, and the Tidewater Gang is hiding the coins before their boat sails.

**Cast**

| Character | Role | Reliability | One line |
| --- | --- | --- | --- |
| Vex Lorne | Suspect | Liar | Courier who moves the cash; lies to protect the boss |
| Kane Hollis | Suspect | Honest | Dock foreman; looks guilty, isn't |
| Rosa Diaz | Witness | Mistaken | Fish market owner; sometimes rushed |
| Juno Park | Witness | Honest | Night guard; leaves town at the start of Day 2 |
| "Tip" Callahan | Informant | Double agent | Helpful at first, then works for the boss |
| Silas Crane | Boss | Never speaks | Shipping owner who staged the theft |
| Mara Quill | Ally | Honest | Accountant |
| Sgt. Dex Okafor | Ally | Honest | Old partner |
| Dr. Lin Abara | Ally | Honest | Forensic analyst |
| Officer Cole | Ally | Honest | Undercover cop |

**Leads**

| # | Lead | Opens when | Grid type | Liars (Inspector) | Fact it gives |
| --- | --- | --- | --- | --- | --- |
| L1 | Fish market cash book | Start (tutorial) | Ledger | 0 | Cash moves through the fish market; Vex carries the biggest bags |
| L2 | Dock camera log | After L1 | Surveillance | 1 (Vex) | Vex was in Warehouse 9 at midnight, not at home |
| L3 | Tip's payment records | After L1 | Ledger | 1 (Tip) | Payments go to an account owned by Crane Shipping |
| L4 | The harbormaster's private ledger | After L2 and L3 | Ledger, hard | 2 (Vex, Rosa mistaken) | Crane staged the theft |

**Clock and events**

The budget is 3 days of 4 working hours, 12 hours in total. Working all four leads costs 8, so the player has 4 hours for informants and side choices.

- **Start of Day 2: Juno leaves town.** If L2 hasn't been started by then, Juno's statements are lost unless the player tracks her down (1 hour + 1 favor).
- **Tip's trap.** After L1, Tip offers to "look after" Warehouse 9 for 1 favor. If the player accepts, the warehouse burns at the end of Day 2, and if L4 hasn't been started by then it costs 1 extra hour.
- **End of Day 3: the ship sails.** The clock ends and the player must accuse.

**Endings**

| Ending | How you get it |
| --- | --- |
| Full bust | Accuse Crane with L4 solved and Tip exposed |
| The boss walks | Accuse Vex or Tip, or accuse Crane without the full trail |
| Wrong arrest | Accuse Kane, Rosa or Juno |

The verdict screen MUST explain every lie the player caught or missed, and who each liar was protecting.

## 7. Case file format

Each case is one JSON file in `cases/`, holding the story, cast, leads, events, offers and endings. See `cases/case-01-harbor-ledger.json` for the full reference and `src/game/caseTypes.ts` for the types. Puzzle grids are not written by hand: `npm run generate` builds them from each lead's settings and saves the verified result to `cases/<case-id>/puzzles.json`.

**Format rules**

- Columns and rows are listed most important first. Smaller grids take the first N.
- Every player-facing text field can be a plain string or `{ "crime": "...", "friendly": "..." }`.
- `liars` lists, per preset, which speakers lie in that lead. A speaker listed twice lies twice.
- Event `at` is an hour index on the clock (0 = start of Day 1, `hoursPerDay` = start of Day 2).
- Generated puzzles are checked in, so every player gets the same case.
- `npm run validate` MUST reject a case that breaks any rule in sections 1 to 5.

## 8. Quality checklist

A case is not done until every item below passes. Items marked (auto) are checked by `npm run validate` and the tests. The rest need a playtest.

**Every puzzle**

- [ ] (auto) Zones or sightings alone allow 2 or more grids
- [ ] (auto) With the statements, exactly 1 grid and 1 set of liars fit
- [ ] (auto) Solvable by deduction at or below the preset's technique level
- [ ] Statement wording is clear enough for the target age to read aloud

**Every case**

- [ ] (auto) Plays at all 4 presets
- [ ] (auto) Full bust is reachable on the default clock without informants
- [ ] Every liar has a motive the player can learn by the end
- [ ] Every scheduled event is shown as a rumor before it fires
- [ ] The verdict screen explains every lie
- [ ] A playtester at each age group finished it, and the Inspector run took 30 to 60 minutes

## 9. Tech standards

- TypeScript, with the UI in Svelte 5, built with Vite into one `dist/syndicate-ledger.html` that runs offline.
- Game rules live in `src/engine/` and `src/game/` as plain TypeScript. UI components only call them and never hold rules of their own.
- Vitest for tests. The solver, generator and validator MUST have tests.
- Playwright end-to-end tests MUST play every case to its full-bust ending at all four presets, and check each screen for serious accessibility problems.
- Progress is saved in the browser's local storage. No accounts, no server.
- `src/engine/` MUST NOT depend on `src/ui/`.
- Zones MUST be shown with thick borders and a pattern as well as a color, for colorblind players.
- Everything MUST work by keyboard and by touch, down to phone width.
- A case MAY have a walkable 3D town, described as data in `cases/<case-id>/town.json` (places, doors, where people stand and walk, cameras). The town is for PC screens and is a second way in: every lead, the case board and the accusation MUST stay reachable from the evidence board, which keeps the keyboard, touch and phone rule above. Walking costs no clock time. `npm run validate` MUST check the town against its case.
- A town MAY list story shots in `town.json`: short scripted camera shots with a caption, each tied to one moment (a lead opens, a lead is solved, a timed event fires). A shot plays once, MUST be skippable, MUST last 2 to 8 seconds and MUST NOT carry information the evidence board does not also show.
- Spoken lines are shown as comic bubbles beside the speaker's face. A line has a voice (speech, calm, thought, shout, whisper, nervous, suspicious, lying) that sets the bubble's outline shape, colours and lettering; every voice MUST differ in shape or outline style as well as colour. A caught liar's lines always use the lying voice and portrait. Bubbles MUST NOT carry information the text does not, and screen readers get the speaker and a verb ("Tip whispers"). Voices are set in `src/ui/voices.ts` and in the case file.
- Every change goes through a pull request that runs the tests and validates every case.

## 10. Decisions and change log

**Decisions (2026-11-12)**

- Numbers mean cash in ledger grids and room numbers in surveillance grids.
- Case 1 has 4 leads.
- Chief tells the player a range of liars instead of hiding the count.
- Version 1 is one complete story. More cases and a daily puzzle come after it is proven fun and the UX is solid.

**Change log**

| Date | Change |
| --- | --- |
| 2026-11-14 | Added in-game help (the ? button or the ? / H key on every screen): how to play, the chosen rank's rules and how to think at that rank, the case's lead order, clock rumors and cast without spoilers, and controls. After 5 minutes with no key, click or tap, a corner tip says where the player is and what to do next; it points the way without giving numbers away and doesn't cost stars (section 9) |
| 2026-11-14 | Added comic dialogue bubbles with per-voice outlines and colours, face portraits that follow the trust meter, and a greeting line per cast member (section 9) |
| 2026-11-13 | Added story shots to the town: scripted, skippable camera shots with a caption that play once when a lead opens, a lead is solved or a timed event fires (section 9) |
| 2026-11-12 | Added an optional walkable 3D town for PC (prototype for Case 1): leads open from doors, people stand and walk in the harbor, cameras switch by moment. The evidence board stays the full, touch-friendly way to play (section 9) |
| 2026-11-12 | Moved the UI to Svelte 5 with no change to rules or saves; added end-to-end and accessibility tests (section 9) |
| 2026-11-12 | Built v1. Event times are start or end of a day; events can't hit a lead that's already started; Juno can be tracked down for 1 hour + 1 favor; added Dr. Lin Abara and Officer Cole as allies; the boss is shown as an ordinary suspect |
| 2026-11-12 | Added surveillance (rooms) grids; Case 1 cut to 4 leads and a 12-hour clock; Chief gets a liar range; v1 scope set to one story |
| 2026-11-12 | First draft of the rule book and Case 1 brief |
