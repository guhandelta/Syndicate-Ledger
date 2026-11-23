# Linked puzzles: one connected investigation per rank

Status: **proposal, waiting for Guha to pick an option.** No game code changes until then.

## 1. The problem

Today every lead in a rank is its own island. The Detective's "Fish market cash book" (L1) is a fair puzzle,
but once it is solved its 25 numbers go nowhere: only the one sentence of `fact` text carries on, and the next
lead (the dock cameras) starts from scratch. So:

- Most numbers in a grid mean nothing to the story. They are filler that makes the sums work, so solving them
  feels like guessing even though the generator proves there is exactly one answer.
- Every clue is direct ("Kane's 9pm is more than Meena's 9pm"). There are no clues you have to *work out* before
  you can use them.
- Nothing you learn in lead 2 helps or hurts you in lead 3. The rank is four puzzles in a row, not one case.

What Guha asked for: indirect clues that aren't easily relatable, numbers in one puzzle that are needed in the
next ones of the same rank, and every puzzle in a rank tied to the case. Any amount of intricacy is fine, as long as
it is always solvable and there is a challenge at every step.

## 2. Rules every option keeps

These don't change, whichever option is picked:

1. **The story stays fixed.** Rank stories, handovers, openings and endings are checked in, as now.
2. **Every puzzle is generated fresh**, in the browser, before it starts (decided 2026-11-17). The story-fact text
   is written from the generated answer, never the other way round.
3. **Exactly one answer, reachable by logic.** The existing checks (`verifyUnique`, `verifyNetwork`,
   `verifyCipher`, the technique grade cap per rank) still run on every puzzle.
4. **No easy path** (approved): minimum grade, 3 of 4 leads needed, red herrings, costly wrong choices, help costs.
5. **The case board never shows a later rank's question** before it is earned.
6. **Strict chain:** each lead unlocks only the next one, so by the time a puzzle quotes an earlier answer, the
   player has always solved that earlier puzzle.

### The key trick that keeps it solvable

A clue that points back to an earlier puzzle ("Tip's Wednesday payment was the same as Vex's room number at
midnight") is, to the engine, an **ordinary claim** ("Wed / Tip is 3"), because the earlier answer is already known
when the later puzzle is generated. So the solver, grader and checks don't need to learn anything new. Only the
*wording* is different: the player has to go back to their notebook, find Vex at midnight, and turn the
sentence into a number. That's where the indirect challenge comes from.

Two new checks make the links real instead of decoration:

- **Needed:** with the linked clues removed, the puzzle must have more than one answer. The player can't skip the
  link.
- **Not enough on its own:** with *only* the linked clues and the grid rules, the puzzle must still have more than
  one answer. The player can't skip the new puzzle either.

## 3. The options

### Option 1: Linked chain with a rank lock (recommended)

Each lead names a few **keystones**: numbers from its answer that matter to the story (the hour of the biggest
bag, the room Vex was in at midnight, how many people Tip whispered to). Later leads in the same rank quote those
keystones in their clues, and the **last lead of each rank is a lock** whose clues are built mostly from keystones
collected across the rank.

How it plays:

- Lead 1 is solved as now, but three or four of its cells are marked with a small pin in the notebook once solved
  ("worth remembering").
- Lead 2 has its usual witnesses, plus one or two **case-file clues** that only make sense with Lead 1's answer.
- The lock at the end (the Junior's Ice house cipher; for other ranks, the final ledger) can only be opened by
  someone who carried the numbers through the whole rank.

How the clues get indirect, by rank (fits the age scaling in rule book section 5):

| Rank | Links per lead | How a link is worded |
| --- | --- | --- |
| Junior (7+) | 1 | Names the earlier puzzle and the cell: "the same as Tip's coins at 8 PM in the festival notebook" |
| Detective (10+) | 2 | Names the earlier puzzle, describes the cell: "the hour Vex carried his biggest bag" |
| Inspector (14+) | 2 to 3 | Describes both: "the room the camera caught the bag carrier in, an hour after his heaviest load" |
| Chief (adult) | 3, plus one red herring | Describes by story only, and may point at the carried object from the rank below |

A red herring link is a true clue that is *not* needed. It costs time, not correctness, which matches "costly
wrong choices" without ever making a puzzle unsolvable.

**Cross-puzzle lies.** A witness in a later lead can lie in a way only an earlier answer exposes: Tip says
"I never went near the Ice house", and only the dock camera answer shows he was there at 11pm. To the engine it
is a normal false claim; to the player it's the moment the case clicks.

Generation: when a rank starts, a background worker builds the rank's puzzles **in order** (lead 1, then lead 2
with lead 1's keystones planted as anchors, and so on), while the player reads the briefing. The answers exist as
soon as each puzzle is generated, so the whole chain can be prebuilt before the player has solved anything. If one
step fails to generate, that step is retried with a new seed; the earlier puzzles don't change.

Cost: medium. Builds on anchors (PR #55) and the worker/spinner plan.

### Option 2: One shared night per rank

Before the rank starts, the game generates **one hidden "night"**: where each person was each hour, how much
they carried, who handed what to whom, and the lock code. Every lead is then a different *view* of that same
night:

- the cash book shows how much each person moved each hour,
- the dock cameras show which room each person was in each hour,
- the whisper network is "who was in neighbouring rooms in the same hour",
- the timeline is the order of the key moments in that night,
- the lock code is built from the night's totals.

Every number in every puzzle is a real fact about one night, so nothing is filler, and clues can cross freely
("the person who carried $5k at 10pm was in the room next to the Ice house an hour later").

The catch: one hidden night has to satisfy every puzzle's rules at once (each grid is a Latin square, rooms
can't hold two people, the network has to come out with the right contact counts). Generation gets much slower,
and the 7x7 Chief grid already takes 5 to 28 seconds. Checking it is also harder, because a single bad night breaks
four puzzles at once instead of one.

Cost: high. Best kept as a later upgrade of Option 1, starting with the Chief rank only.

### Option 3: Indirect clue layer only

The puzzles stay independent, but each one gets **story clues** next to the witness statements: clues worded
through the story, a clipping, a character's look or a place ("the man with the clipboard never handled less than
$3k after dark", "the hour the fog horn sounded"). The rank still ends with a lock that takes one number from
each puzzle.

Cost: low. It gives indirect clues and a light thread, but puzzle 2 still doesn't need puzzle 1, so it only
partly answers the ask.

## 4. Worked examples (Option 1)

Numbers in these examples are illustrations. In the game they come from the freshly generated answers.

### Junior: "The friendly face" (4x4, J1 to J5)

| Lead | Keystones it hands on | How the next lead uses them |
| --- | --- | --- |
| J1 Festival notebook (ledger) | **A** = the hour Tip's coin bag was heaviest (8 PM); **B** = Tip's coins that hour (4) | J2: "The chest was carried off the same hour Tip's bag was heaviest in the festival notebook." |
| J2 The night the chest went empty (timeline) | **C** = the time slot the cart passed the fish hall (9 PM, slot 4) | J3: "Whoever reached the fish hall just before Tip's cart whispered to Tip." (a `linked` claim) |
| J3 Who was whispering? (network) | **D** = how many people Tip whispered to (3) | J4: "The chest stopped at as many places as Tip had whisper friends." |
| J4 Where did the chest go? (map) | **E** = the hour the chest reached the Ice house (11 PM, step 4) | J5 lock |
| J5 The Ice house lock (cipher) | | Digits: "first digit is Tip's heaviest bag" (B), "the second is one less than the cart's time slot" (C), "the third is how many friends Tip whispered to" (D), "the last is the chest's stop number at the Ice house" (E), plus Tip's lying statements |

For Junior the lock clue shows a little notebook icon and the name of the puzzle it comes from, and the J5 check
makes sure at least two of the four digits still need Tip's statements to be worked out, so the lock is never just
copying.

J2's fact is written from the answer, as now: "Tip's cart passed the fish hall at **nine**, an hour after the chest
was carried off." The words in bold come from the generated answer.

### Detective: "The cash trail" (5x5, L1 to L4)

| Lead | Keystones it hands on | How the next lead uses them |
| --- | --- | --- |
| L1 Fish market cash book (ledger) | **A** = Vex's 10pm amount ($3k); **B** = Kane's 10pm amount ($2k) | L2: "At midnight Vex was in the room whose number matches what he carried at 10pm" (room 3, Warehouse 9: the existing anchor, now earned instead of given). Meena, L2: "Kane went to room *B* at 10pm", which the player can only check with L1 |
| L2 Dock camera log (surveillance) | **C** = Tip's room at 11pm (Ice house, room 2); **D** = Kane's room at 1am (4) | L3: Tip says "I never went near the Ice house": a lie only C exposes. A clue: "Tip's Wednesday payment was the room number he was in at 11pm" |
| L3 Tip's payment records (ledger) | **E** = Tip's total for the week | L4: "Crane's books show one month whose takings equal Tip's whole week" (sum claim over a month row), and "Crane paid Kane the most in month number D" |
| L4 Crane's private ledger (ledger, hard) | The month total that matches the $90k story | Written into the reveal: "The $**90**k never left his company." |

What changes for the player: the dock camera log is no longer "another grid". It's the place where the cash book
pays off, and Tip's payments are where the cameras expose him.

### Across ranks

Handovers stay fixed text, but a handover can **carry one keystone** into the next rank (for example the CS-9 plate
number, or "page forty"), and the first puzzle of the next rank can quote it. Its value is fixed by the story, so it
never needs the earlier rank's generated answer. It is planted as an anchor in the first lead of the next rank.

## 5. What would be built (Option 1)

1. **Case file:** each lead gets `keystones` (named numbers to pull from its answer, such as "the hour of Tip's
   heaviest bag") and `links` (which earlier keystones it quotes, how, and the wording for each rank). Rank
   stories keep their fixed text; fact text gets placeholders like `{J2.cartHour}` filled from the answer.
2. **Engine:** anchors for timeline, network and cipher puzzles (grids already have them); plant anchors while
   building the answer instead of retrying random answers until one matches, so linked puzzles don't get slower;
   the "needed" and "not enough on its own" checks.
3. **Worker:** build the whole rank chain in order when the rank opens, behind the briefing, with the spinner as a
   fallback. Keep a checked-in chain per rank as a last resort if the browser can't build one.
4. **Notebook:** an *Evidence* page with every solved puzzle's grid, keystone cells pinned, so looking back is part
   of play. Linked clues get a small "from your notebook" mark at Junior and Detective, and none above.
5. **Hints and mistakes:** the Forensic Partner can point to *which* earlier puzzle a clue needs, for a favor,
   without saying the number.
6. **Validator and tests:** every lead's links checked as needed and not enough on their own, for all four ranks and
   many seeds.
7. **Rule book:** new section on linked clues, and a change log entry.

Suggested order: Junior chain first (it already has five leads of five types), then Detective, then Inspector and
Chief. Each as its own PR, merged before the next starts.

## 6. Recommendation

**Option 1, the linked chain with a rank lock.** It answers all three asks: indirect clues, numbers that carry into
later puzzles, and every puzzle in a rank tied to the case. It keeps the "one answer, found by logic" guarantee
with the checks we already have, and it fits fresh in-browser generation because each answer exists before the
next puzzle is built. Option 2 can follow later for the Chief rank, once Option 1 is played and liked.
