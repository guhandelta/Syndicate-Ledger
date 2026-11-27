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
- Sizes are 4×4, 5×5, 6×6 or 7×7. A zone MUST be 1 to 5 cells, joined edge to edge, with its total shown in its top-left cell.

**Two kinds of grid**

- **Ledger grids** (cash): a cell is the $k a person moved that hour. Clues are sum zones. The story explains the no-repeats rule: the syndicate never sends two couriers with the same amount in one hour, and never sends a courier with the same amount twice.
- **Surveillance grids** (rooms): a cell is the room a person was in that hour, numbered 1 to N along the pier. One person per room each hour, and nobody visits the same room twice. Clues are camera sightings (a few cells given) and position statements such as "Vex and Kane were in rooms right next to each other at 10pm". No sum zones.

**Statements**

- A statement is something a character says that can be checked against the grid, such as "At 10pm, Vex moved more than Kane" or "Meena's 9pm and 10pm runs add up to $7k".
- Each statement belongs to a speaker, and the speaker's reliability decides whether it is true (section 4).
- Every statement MUST be a rule the code can check. Opinions and vague hints are flavor text only.

**The liar rule**

- The player is told how many statements in a puzzle are false, for example "exactly one of these statements is a lie". At the Chief preset the player gets a range instead (for example "1 or 2"), and the solution is still unique.
- The zones or sightings alone MUST allow at least 2 valid grids. That makes the statements necessary.
- Those clues plus statements, with an allowed number of lies, MUST allow exactly one grid and exactly one set of liars.
- A puzzle is solved when the grid is complete **and** the player has marked every statement as True or Lie. Accusing a liar is part of the solve, not a bonus.

**Other kinds of lead (timeline)**

A lead is not always a grid. A **timeline** lead gives N moments of the night and N times, and the player puts each moment at its own time (4, 5, 6 or 7 moments by rank, as the grid sizes).

- Witnesses say when moments happened: at a time, not at a time, before another moment, right before it, or a stated number of steps apart. Some statements are lies, exactly as in the grids, and the player is told how many.
- The same fairness rule applies: the statements with an allowed number of lies MUST leave exactly one order, `npm run validate` proves it, and the player marks every statement True or Lie before the lead closes.
- No easy path: every timeline needs at least "before" statements (Junior), and Inspector and Chief timelines need "right before" or "steps apart". The Chief timeline starts with one moment fixed in place.
- Allies work here too: forensics fixes a picked moment, the partner points at a wrong moment or the next one to think about, the informant sells one extra true statement, and a witness who leaves is covered by showing the moments that keep one answer.
- **Cipher** (crack a code, engine only so far): a safe or lockbox code of 4, 5, 6 or 7 different digits (by rank), taken from 1 to one more than the size. Witnesses say what a digit is, is not, whether it is even or odd (reading one digit), that one digit is bigger than another (comparing), or that two digits add up to something or are some number apart (arithmetic). Some witnesses lie and the player is told how many. Same one-answer and no-easy-path rules: Junior needs at least one comparison, higher ranks at least one sum or gap. A lead is a cipher by `"type": "cipher"` (no `columns` or `rows`). The player picks a place of the code and enters a digit, or uses the picker beside it; digits already used twice are marked. Partner and forensics help, informant tips and a witness leaving work as on the other puzzle types. Difficulty by rank is `CIPHER_RULES`.
- **Stakeout** (place a watcher in every district): the lead is a map of N x N squares cut into N coloured districts (a patrol, a camera or a stakeout team stood in each). The player puts exactly one watcher in every district, never two in the same row or column and never on touching squares (corners count). Because few layouts obey those rules, the map itself is what scales by rank: Junior 5x5, Detective 6x6, Inspector 7x7, Chief 8x8 (`STAKEOUT_RULES`). The map alone allows a few layouts (`minBase` to `maxBase`), so witnesses are needed: they say which row or column a district's watcher stood in, whether it stood on a square, that one district's watcher stood further up or further left than another's, or how many rows or columns apart two stood (grades 1, 2 and 3). Some witnesses lie and the player is told how many; there is exactly one layout that fits the allowed number of lies, and at most one witness gives a square away outright. Districts are always one connected piece, each at least two squares, and every one holds its watcher. A lead is a stakeout by `"type": "stakeout"` with `districts` (8 names, most important first; smaller ranks take the first N), an optional `watchers: { one, many }` for what stands in each district ("patrol", "watchman"), and no `columns` or `rows`. The player taps a square to place the watcher of its row (tap again to take it off) or uses the arrow keys; watchers that break a rule against each other are outlined in red. Partner and forensics help (forensics confirms the picked row), informant tips and a witness leaving work as on the other puzzle types. The generator draws the answer, grows the districts out of it, and checks uniqueness over every allowed layout (`verifyStakeout`).
- A lead names its type in the case file (`"type": "timeline"`), lists its `moments` (most important first) and its `rows` as the times, and has no `columns`.
- **Network** (who was in contact with whom): the people of the lead are its `columns` (4, 5, 6 or 7 by rank), and the player decides every pair of people as "in contact" or "never in contact". The player is told how many contacts each person had (a phone bill's count), and the screen counts the contacts found so far. The counts alone always leave several networks, more at higher ranks (`NET_RULES`), so the witnesses are needed. Witnesses say who was or was not in contact, who had a contact in common, or that one person was in contact with exactly one of two others; some lie, and the player is told how many. Hints work like the timeline: the partner points at a wrong pair or an undecided one, forensics settles a picked pair, and a witness who leaves has the pairs shown that keep the lead solvable. A lead is a network by `"type": "network"`; it has no `rows`.
- **Map** (a timeline over a floorplan): the moments are rooms joined by corridors, and the night is a walk through them, one room per time, so rooms at neighbouring times must be joined. More corridors mean more wrong walks to rule out; a map is only built when at least a set number of walks are possible, so it is never trivial. A lead becomes a map by adding `"map": true` to a timeline lead; the corridors are drawn up when the puzzle is generated (more of them at higher ranks, see `MAP_RULES`) and listed on the screen.

**Player tools**

- Pencil marks, undo and redo.
- Mistakes are highlighted only when the difficulty preset allows it (section 5). Repeated numbers in a row or column are always shown.
- Allies give hints (section 4). There is no free "reveal" button.

### 2c. Linked clues

Puzzles within a rank are one investigation, not separate puzzles. A lead may have `links`: statements that quote an earlier lead's answer, so a number or a person in one puzzle must be read off another.

- A link only quotes a lead that opens before it, so the player has already solved it. The clue is worded as a pointer back ("the same as what Vex moved in the hour Kane moved $3k, in the cash book"), and the Evidence button shows every solved answer.
- Wording by rank: Junior names the cell itself. Detective and above describe it through another person's figure in the same hour, so the player looks twice.
- To the solver a link is an ordinary claim with the earlier number filled in, so the one-answer rule, lie counts and technique grades apply unchanged.
- Two checks make each link real: the puzzle is **not** solved without its link clues (needed), and the link clues with the base clues **do not** settle it (not enough alone). A `herring` link is a true clue that is left out of the first check; it costs time, never correctness.
- A cipher lead may have a `message`: a word hidden under the code (capital letters, one per place; a rank whose code has another length plays the plain digit code). Each letter of the scrap is moved on by the digit of its place, so the right code reads it back and a wrong one reads gibberish. The fact must say the word, and `npm run validate` checks it.
- Case file: `links: [{ from, take: "number" | "person", use: "is" | "sum" | "apart" | "linked", ranks?, speaker?, herring?, valueFrom?, story? }]` on a lead. `npm run generate` builds each rank's leads in order and plants the clues; `npm run validate` checks that every link quotes its source exactly and passes both proofs.
- A stakeout takes a link as "is" (a district's watcher stood in the row or column that number names) or "apart" (two districts' watchers stood that many rows or columns apart), and its answer can be quoted by later leads (the row or column a district's watcher stood in). In a link `story`, `{when}` is "row"/"column" ("rows"/"columns" for a gap).
- **Every puzzle after the first in a rank takes 2 or 3 link clues**, at least two of them from the puzzle just before it (a network takes one person link, as the puzzle before it may have no people). A strategic player weighs them: some links are `herring` decoys (Detective L3, Chief L2 and L4) that are true but not needed, some are "add up" clues (`use: "sum"`) that only matter combined with another figure, and a person link may carry `valueFrom`, a two-step clue that needs two earlier answers (find the number in one, then the person who has it in another).
- A link may carry a `story`: the clue worded through the story (a torn slip, a whisper, a margin note) instead of the plain pointer, with `{q}` where the earlier answer is quoted and `{a}`, `{b}`, `{when}` for the people, moments, digits or hour. The story only changes the wording, never what the clue says, so every check above is unchanged.
- **Fresh puzzles each game.** A new Junior, Detective or Inspector case builds its own puzzles in a background worker (src/game/buildRank.ts), so no two games repeat, and every link, proof and grade rule applies as for the shipped ones. The seed that built them is saved with the game, together with the puzzles themselves, so a reload or an update of the game never changes puzzles the player has notes on. Chief plays the shipped puzzles: its 7x7 links take many minutes to build. If a worker is missing, errors, or takes more than 45 seconds, the shipped puzzles (seed 0) are used, so starting a case never fails. `?seed=0` in the address plays the shipped puzzles, `?seed=N` replays one build.

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
| 2026-11-26 | Word cipher: a cipher lead may carry a `message` (capital letters, one per place of the code). Each letter is moved on by the digit of its place, the screen shows the scrambled scrap and what the player's digits read so far, and the lead's fact names the decoded word. Case 1 Junior's ice house lock hides TIPS. |
| 2026-11-26 | The first puzzle of each rank is no longer a tutorial: it is a `hard` lead with a liar (Junior J1, Detective and above L1), keeps more grids open after the sums (`minBase`), and carries a story number (an `anchor`) that its fact text names (Junior: Tip's 4-coin bag at 9 PM; later ranks: Vex's $3k bag at 10pm). |
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

**Accusations**

- An accusation needs proof. The player names a person, then ticks the solved leads that prove it. The case file lists, per provable person, the leads they need (`proof`) and which people each lead points to (`pointsTo`). A right name with missing or unrelated evidence is refused.
- Every refusal says only "Not proven", never whether the person is guilty.
- Limits grow with the grid, because bigger grids mean more people and more tangled stories: Junior allows 4 different people with 3 tries each; Detective 3 people, Inspector 4 and Chief 5, with 2 tries each. A locked person can't be accused again, even if they are the real culprit.
- An innocent person who is refused stops cooperating: any lead of theirs not yet started costs +1 hour (only while the clock is on). Their trust meter reads "Won't talk".
- The case is lost when time runs out with no accusation left to make, or when nobody who can be convicted is still open to accusation. The case-lost screen reveals nothing, the save is deleted and all notes are cleared. When the clock ends the player still gets a last chance to accuse.
- A case MUST be winnable: every provable person's `proof.needs` are leads that point to them, and the validator checks this.

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
- Each case SHOULD have 5 to 11 characters. Allies don't count toward this limit.
- A case has exactly one `boss` and may have one `mastermind`: the person above the boss. A mastermind is a suspect like the boss, and like the boss may lie without a `protects` motive.
- In the case file a person can carry `ranks` too: they then appear on the board, the accusation list and the intro only at those ranks. A person marked `unseen` (a voice on the phone, a name on a letter) has no town figure and needs no portrait faces; the board shows initials.
- In the town file a person can carry `ranks`, the ranks whose town they stand in (a person nobody has met yet at lower ranks). Left out, they are there at every rank.
- Each character gets a name, a one-line description, an icon and a color that never matches a zone color.

## 5. Difficulty presets and age scaling

Every case MUST play at all four presets. The plot, cast, leads and endings stay the same.

| Setting | Junior (7+) | Detective (10+) | Inspector (14+) | Chief (adult) |
| --- | --- | --- | --- | --- |
| Grid size | 4×4 | 5×5 | 6×6 | 7×7 |
| Liars told as | Exact count | Exact count | Exact count | A range, such as "1 or 2" |
| Lies flagged "Unverified" | Yes, the liar is marked | Possible liars marked | No | No |
| Clock | Off | On, +2 hours | On | On |
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
| Meena Selvi | Witness | Mistaken | Fish market owner; sometimes rushed |
| Nevethitha Rajan | Witness | Honest | Night guard; leaves town at the start of Day 2 |
| Capt. Karunakaran Velu | Witness | Honest | Captain of the ship that leaves at dusk on Day 3. The 7th person in every grid, so seen only at Chief (7×7) |
| "Tip" Callahan | Informant | Double agent | Helpful at first, then works for the boss |
| Silas Crane | Boss | Never speaks | Shipping owner who staged the theft |
| Kavya Narayanan | Ally | Honest | Accountant |
| Sgt. Deva Okafor | Ally | Honest | Old partner |
| Dr. Lin Abara | Ally | Honest | Forensic analyst |
| Officer Cole | Ally | Honest | Undercover cop |

**Leads**

| # | Lead | Opens when | Grid type | Liars (Inspector) | Fact it gives |
| --- | --- | --- | --- | --- | --- |
| L1 | Fish market cash book | Start (tutorial) | Ledger | 0 | Cash moves through the fish market; Vex carries the biggest bags |
| L2 | Dock camera log | After L1 | Surveillance | 1 (Vex) | Vex was in Warehouse 9 at midnight, not at home |
| L3 | Tip's payment records | After L1 | Ledger | 1 (Tip) | Payments go to an account owned by Crane Shipping |
| L4 | The harbormaster's private ledger | After L2 and L3 | Ledger, hard | 2 (Vex, Meena mistaken) | Crane staged the theft |

**Clock and events**

The budget is 3 days of 4 working hours, 12 hours in total. Working all four leads costs 8, so the player has 4 hours for informants and side choices.

- **Start of Day 2: Nevethitha leaves town.** If L2 hasn't been started by then, Nevethitha's statements are lost unless the player tracks her down (1 hour + 1 favor).
- **Tip's trap.** After L1, Tip offers to "look after" Warehouse 9 for 1 favor. If the player accepts, the warehouse burns at the end of Day 2, and if L4 hasn't been started by then it costs 1 extra hour.
- **End of Day 3: the ship sails.** The clock ends and the player must accuse.

**Endings**

| Ending | How you get it |
| --- | --- |
| Full bust | Accuse Crane with L4 solved and Tip exposed |
| The boss walks | Accuse Vex or Tip, or accuse Crane without the full trail |
| Wrong arrest | Accuse Kane, Meena, Nevethitha or Capt. Karunakaran |

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

**Rank stories**

A case has one main crime, and each rank plays its own story around it (`rankStories`, keyed by rank).

- Each rank story uncovers one part of the crime: a `part` with a title, the question it answers and what the player learns. The case is closed only when every rank's part is uncovered, with any character, in any order. `closing` is the text shown then.
- A rank story may replace the story fields `title`, `setup`, `leads`, `events`, `offers`, `endings`, `proof`, `lost` and `missedClues`. Anything it leaves out comes from the case file, so the cast and the town are shared.
- Ranks are played in order: Junior is always open, and each rank opens once the part below it is uncovered. A solved rank can be played again, for example as another character.
- **Lines.** Any line (greeting, opinion) can carry a `face` (neutral, suspicious, caught-lying, nervous, angry, smug, scared), a `tell` (a short stage direction, a hint and never proof) and a `when` condition (leads solved or not, flags, people accused or caught lying, the character played). `...` is a pause and `*word*` is stressed when the line is spoken.
- **Greetings and opinions.** `greetings` are extra greetings with a `when`; the first that holds wins over `greeting`. `opinions` say what a person thinks of someone else; the player asks about one person at a time, the first opinion about that person that holds is used, and what was heard is kept on that person's card. Opinions can be biased or wrong. A person who refuses to talk gives none.
- **The case board shows only what the player has earned.** Parts already uncovered (title and what was learned), the question of the rank that is open now, and one hidden slot ("???") for everything after it. The number of parts is never shown. A later rank's question MUST stay unseen until the part below it is uncovered, because that question is built from what the earlier rank found.
- `characters` lists who the player can be (the detective or an ally). Only ones marked `ready` can be picked; the first ready one is picked by default.
- Only the full bust (the first ending) uncovers a rank's part. Parts are saved apart from the game save, so losing one rank never wipes the others.
- `npm run validate` checks each rank story on its own, at its own rank's grid size, and requires every rank to have a part and the case to have a `closing` once `rankStories` is used.

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

**Scene briefs**

A new grid lead does not have to be written field by field. The author gives a scene brief (`SceneBrief` in `src/game/scene.ts`): the thing on the table ("harbor key log"), the story around it, the people (most important first), the times, the rooms (surveillance), the one fact the lead must reveal (a person, a time and a value) and who speaks. `npm run draft-lead -- scene.json` words the title, intro and fact from that brief, using the cast's names and the case's unit, and prints a lead to paste into the case file. The key fact becomes an anchor, so the generated grid always agrees with the fact text. Links, liars, `hard` and `pointsTo` pass through unchanged. The puzzle is still built by the generator, fresh each game. Only ledger and surveillance scenes are supported so far.

**Riddles**

A cipher lead may be told as a riddle (`riddle: { people, noun }`): each place of the code is a person, and the digit is their number, so the clues read "Kane Hollis’s berth number is 3" or "Meena Selvi’s berth number and Tip Callahan’s berth number add up to 11". The player gives each person a different number from 1 to N+1, so one number is left out. The statements, the lies, the grades and the single answer are the cipher's own, and links to and from a riddle name the person too. A riddle needs as many people as the biggest rank has places, the people must be in the cast, and the noun is one lowercase word (`npm run validate` checks all three). A riddle carries no `message`.

## 10. Decisions and change log

**Decisions (2026-11-12)**

- Numbers mean cash in ledger grids and room numbers in surveillance grids.
- Case 1 has 4 leads.
- Chief tells the player a range of liars instead of hiding the count.
- Version 1 is one complete story. More cases and a daily puzzle come after it is proven fun and the UX is solid.

**Change log**

| Date | Change |
| --- | --- |
| 2026-11-27 | Dex is renamed Deva (Sgt. Deva Okafor) in every line the player reads. The cast id stays `dex` so saved games and art files keep working |
| 2026-11-27 | Cast members can carry `ranks` (shown only at those ranks) and `unseen` (no town figure, no faces) |
| 2026-11-27 | Deva's Detective opening line about the festival chest gains a tell ("Ask who gains. I can't say more than that."); it stays true and only hints |
| 2026-11-27 | Wording only: Capt. Karunakaran is the captain of the ship that sails at dusk on Day 3 (was harbor pilot); the baker is named Umer and the dock hand Bharath in link clues |
| 2026-11-27 | Cast rules: a case may have a `mastermind` above the `boss`, the cast limit is 5 to 11 non-allies, and a town person can be limited to certain ranks with `ranks` |
| 2026-11-26 | Added riddles: a cipher lead can be told about named people and a noun ("berth number") instead of digit places (section 7) |
| 2026-11-26 | Added scene briefs: `draftLead` and `npm run draft-lead` turn a place, a thing, people and one key fact into a lead (ledger and surveillance) (section 7). Thenmozhi Selvam added to the cast and made the 6th seat of the shared leads |
| 2026-11-26 | Every puzzle after the first in a rank carries 2 or 3 link clues, mostly from the puzzle just before it (section 2c): more links in Case 1's Junior, Detective, Inspector and Chief leads, decoys at Detective and Chief, "add up" clues, and a two-step person clue (`valueFrom`) in Junior's whisper puzzle. Fresh builds try more link picks and, when needed, a new answer. |
| 2026-11-24 | New puzzle type, the stakeout (section 2): place one watcher in every district of a map, none in a shared row or column, none touching. Case 1 Junior has it as J4 "Who stood watch?" (at the Boathouse), quoting J1 and J3; the map, the lead and the later Junior leads were renumbered (map is J5, lock is J6). Detective, Inspector and Chief are unchanged. |
| 2026-11-23 | Linked clues (section 2c): puzzles within a rank quote each other's answers. Case 1 Junior (J2 to J5), Detective, Inspector and Chief (L2 to L4) have link clues, with an Evidence panel to look back at solved answers. Proposal and options: docs/LINKED-PUZZLES.md |
| 2026-11-23 | Fresh puzzles each game: Junior, Detective and Inspector build their own puzzles in a worker with the seed saved in the game; Chief and any failure use the shipped puzzles. Seed 0 is the shipped case |
| 2026-11-23 | Story-worded link clues (the "clues" layer): a link's `story` words it through the case, in both tones. Case 1's links have one |
| 2026-11-22 | Meena is now a finished 3D model from an image-to-3D tool (scripts/make-glb.py, src/town/glbFigure.ts), with a skeleton added at load. She walks, idles, turns her head and shows each feeling on her own face (brows, lids, mouth) in a conversation. Others keep the picture-built figures until their models arrive. |
| 2026-11-20 | The town's people are 3D now: each is built from Guha's four body views (scripts/make-figures.py), walks with swinging arms and legs, sways and breathes while standing, turns their head toward the detective, and in a conversation turns to face you, wears the expression portrait of their latest line on their face and shows it in their body (leaning in when angry, looking down and away when caught lying, and so on). The conversation panel moved to the right so their face stays in view. |
| 2026-11-20 | Renamed Juno Park, Rosa Diaz and Mara Quill to Nevethitha Rajan, Meena Selvi and Kavya Narayanan everywhere (ids `nevethitha`, `meena`, `kavya`) and swapped in their new art: all seven faces, the Junior faces, and the 3D town figures. |
| 2026-11-16 | Rank handovers: a rank story may have a `handover` (a short scene shown after its part is uncovered, plus one carried object that appears in the next rank's case notes) and an `opening` scene on the next rank's briefing. Lines can be conditioned on `rank`. Case 1: the CS-9 lock plate carries Junior into Detective. The carried object is shown, not yet usable as proof |
| 2026-11-16 | Case 1 Junior plays its own story ("The friendly face"): five leads (cash book, timeline, network, map, then a code lock as a two-step finale: closing the map lead offers to go straight on to the code lead via `then`). Town doors may name a lead per rank (`leadFor`). Junior culprit is Tip. |
| 2026-11-16 | Dialogue depth: all 7 faces for every Case 1 person (Guha's art), a face and tell per line, greetings that change with what the player did, opinions asked about one person at a time and kept on cast cards, words spoken one by one with pauses and stress (section 7) |
| 2026-11-16 | Added the timeline lead type: put the moments of the night in order from witness statements, with the same one-answer, lies and no-easy-path rules as the grids (section 2). Case 1 has no timeline lead yet; one is played in a test case by the end-to-end tests |
| 2026-11-16 | Map puzzles (engine only): a timeline whose answer must be a walk along the corridors of a floorplan |
| 2026-11-16 | Cipher puzzle engine (code-cracking from witness statements), with the same one-answer and no-easy-path rules; no screen yet |
| 2026-11-16 | Cipher leads are wired into the game: a code screen, partner and forensics help, tips, a witness leaving, rank-by-rank difficulty and validator checks |
| 2026-11-16 | Map and network leads are wired into the game: a lead can be `"map": true` on a timeline, or `"type": "network"`, with screens, partner and forensics help, tips, rank-by-rank difficulty and validator checks |
| 2026-11-16 | The case board no longer shows how many parts there are: "N parts uncovered" and a single hidden slot for the rest (section 7) |
| 2026-11-16 | The case board no longer lists every rank's question up front: it shows the parts uncovered so far, the question of the open rank, and hidden slots for the rest, so the story takes shape rank by rank (section 7) |
| 2026-11-16 | Ranks open in order, Junior first. The start page shows the case so far (parts uncovered, the question of each part still hidden, locked ranks) and a character pick; only the detective is ready. A full bust shows the part it uncovered and which rank it opens (section 7) |
| 2026-11-15 | Rank stories: each rank plays its own story around the case's main crime and uncovers one part of it; the case closes when all four parts are uncovered, with any character. Case 1's current story is its Detective story and the other ranks play it too until their own stories are written (section 7) |
| 2026-11-15 | Accusation limits grow with the grid: Inspector allows 4 different people and Chief 5 (2 tries each); Junior (4 people, 3 tries) and Detective (3 people, 2 tries) are unchanged (section 3) |
| 2026-11-15 | The start page is now only for new games. Returning players with a saved case see a Welcome back page (rank, leads solved, hours and favors left) with Continue case and Start a new case; starting over asks them to pick a rank again. |
| 2026-11-15 | Chief now plays 7×7 grids on the Inspector clock (no more −1 hour). Every lead gains a 7th person (Capt. Karunakaran Velu, the harbor pilot, a new honest witness), a 7th row, and camera grids a 7th room (Crane Shipping). The 7×7 opening ledger starts with 7 cells filled in so it stays at the opening grade (sections 2, 5, 6) |
| 2026-11-14 | Added a What now? button to the latest game: on demand, it shows what the player can do on the current screen and what to try next (the same hint logic as the 5-minute idle tip, plus the list of options). Never gives a number away (section 9) |
| 2026-11-14 | Added a case notebook to both the latest game and v1: a Notebook button opens a side panel to jot down suspects, clues and lies, saved in the browser as you type, with a "Stuck? Try this" list of tips. v1 is still built from its original commit with only this added (section 9) |
| 2026-11-15 | Fixed a hole in the witness-leaves event: when Nevethitha left, L2 could end up with more than one answer at Junior and Inspector. The camera footage now shows just enough cells to keep exactly one answer (section 3). Added 100% unit coverage of the engine, game rules, town rules and UI helpers, enforced in CI (section 9) |
| 2026-11-14 | Made the case notebook richer: a ready-made case sheet, an Alibi line, and grouped how-to tips (the grid, where to start, statements, favors, accusing) (section 9) |
| 2026-11-14 | Added hard accusation rules: proof from solved leads, 3 people and 2 tries each (Junior 4 and 3), refused innocents stop cooperating (+1 h), a case-lost ending that wipes notes and reveals nothing (sections 3, 7) |
| 2026-11-14 | Added in-game help (the ? button or the ? / H key on every screen): how to play, the chosen rank's rules and how to think at that rank, the case's lead order, clock rumors and cast without spoilers, and controls. After 5 minutes with no key, click or tap, a corner tip says where the player is and what to do next; it points the way without giving numbers away and doesn't cost stars (section 9) |
| 2026-11-14 | Added comic dialogue bubbles with per-voice outlines and colours, face portraits that follow the trust meter, and a greeting line per cast member (section 9) |
| 2026-11-13 | Added story shots to the town: scripted, skippable camera shots with a caption that play once when a lead opens, a lead is solved or a timed event fires (section 9) |
| 2026-11-12 | Added an optional walkable 3D town for PC (prototype for Case 1): leads open from doors, people stand and walk in the harbor, cameras switch by moment. The evidence board stays the full, touch-friendly way to play (section 9) |
| 2026-11-12 | Moved the UI to Svelte 5 with no change to rules or saves; added end-to-end and accessibility tests (section 9) |
| 2026-11-12 | Built v1. Event times are start or end of a day; events can't hit a lead that's already started; Nevethitha can be tracked down for 1 hour + 1 favor; added Dr. Lin Abara and Officer Cole as allies; the boss is shown as an ordinary suspect |
| 2026-11-12 | Added surveillance (rooms) grids; Case 1 cut to 4 leads and a 12-hour clock; Chief gets a liar range; v1 scope set to one story |
| 2026-11-12 | First draft of the rule book and Case 1 brief |
