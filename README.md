# Syndicate Ledger

A detective logic puzzle. Crack the syndicate's ledgers, catch the liars, and close the case before the ship sails.

Each lead is a Sudoku-style grid: rows are times, columns are people, and every number appears once per row and column. Ledger grids track cash with sum zones. Camera grids track who was in which room. Witnesses make statements, and you're told how many are lies. Only one answer fits, and it tells you who lied.

The game ships with one case, **The Harbor Ledger**, playable at four ranks from Junior (age 7+, 4×4, friendly story) to Chief (adult, 6×6, tight clock).

## Play

Play online at **https://guhandelta.github.io/Syndicate-Ledger/**. Every merge to `main` redeploys it.

```bash
npm install
npm run dev      # play locally at http://localhost:5173
npm run build    # writes dist/syndicate-ledger.html, a single file that runs offline
```

Open `dist/syndicate-ledger.html` in any browser. Progress saves in the browser.

**Hosting:** `npm run build:site` writes the whole website to `site/`: the latest game at `/` and the original v1 at `/v1/`. GitHub Pages, Netlify (`netlify.toml`) and Vercel (`vercel.json`) all run this same command, so any of them serves the same game. The game is one self-contained file with `#` routes, so it works at a sub-path (Pages) or at the root of a domain (Netlify, Vercel).

**Town (PC):** from the evidence board, choose *Walk the town*. WASD or arrows to walk, Shift to run, E to talk or enter a door, C to switch between the angled and behind-the-detective cameras, B for the case board. Each case's town is data in `cases/<case-id>/town.json`. The same file lists the story shots: short camera shots with a caption that play once when a lead opens, a lead is solved or a timed event fires (E or Esc skips them).

**Help:** press the **?** button (or the ? or H key) on any screen for how to play, your rank's rules, the case's lead order and the controls. If you sit still for 5 minutes, a tip in the corner says what to do next. The **What now?** button shows the same tip on demand, plus everything you can do on that screen.

**Notebook:** the **Notebook** button opens a side panel for your own investigation notes. It saves in the browser as you type and has a short *Stuck? Try this* list. v1 at `/v1/` has the same notebook (`scripts/build-site.sh` adds `src/ui/notepad.ts` to the original v1 source); nothing else in v1 changes.

**Controls:** click or tap a cell, then a number. Keyboard: arrows to move, 1–6 to enter, Backspace to erase, P to toggle notes, Ctrl+Z / Ctrl+Shift+Z to undo and redo.

## Develop

```bash
npm test                     # engine, game and UI helper tests
npm run check                # type-check the TypeScript and Svelte code
npm run build && npm run e2e # play Case 1 end to end at every rank in Chromium
npm run generate             # regenerate every lead × rank puzzle for Case 1
npm run validate             # check the case against the rule book
```

| Folder | What's in it |
| --- | --- |
| `docs/RULEBOOK.md` | The rule book: design pillars, puzzle rules, presets, Case 1 brief. Read this first. |
| `cases/` | Case files (JSON) and their generated, checked-in puzzles |
| `src/engine/` | Solver, puzzle generator, uniqueness check, difficulty grader, hints |
| `src/game/` | Case types, difficulty presets, clock, trust, events, endings, statement wording |
| `src/ui/` | The browser interface, in Svelte 5: `session.svelte.ts` holds screen and puzzle state, `components/` holds one file per screen and widget |
| `src/town/` | The walkable 3D town (three.js): `townLogic.ts` holds movement, collisions and cameras as plain functions, `TownScene.ts` draws it, `art/` holds the character figures |
| `e2e/` | Playwright tests that play the built game |
| `scripts/` | Puzzle generation and case validation |

### Writing a new case

1. Copy `cases/case-01-harbor-ledger.json` and change the story, cast, leads, events and endings.
2. Run `npm run generate -- cases/<your-case>.json` to build and verify every puzzle.
3. Run `npm run validate -- cases/<your-case>.json` and fix anything it reports.
4. Check the playtest items in section 8 of the rule book.
