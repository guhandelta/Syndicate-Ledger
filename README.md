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

**Controls:** click or tap a cell, then a number. Keyboard: arrows to move, 1–6 to enter, Backspace to erase, P to toggle notes, Ctrl+Z / Ctrl+Shift+Z to undo and redo.

## Develop

```bash
npm test                     # engine and game tests
npm run generate             # regenerate every lead × rank puzzle for Case 1
npm run validate             # check the case against the rule book
```

| Folder | What's in it |
| --- | --- |
| `docs/RULEBOOK.md` | The rule book: design pillars, puzzle rules, presets, Case 1 brief. Read this first. |
| `cases/` | Case files (JSON) and their generated, checked-in puzzles |
| `src/engine/` | Solver, puzzle generator, uniqueness check, difficulty grader, hints |
| `src/game/` | Case types, difficulty presets, clock, trust, events, endings, statement wording |
| `src/ui/` | The browser interface |
| `scripts/` | Puzzle generation and case validation |

### Writing a new case

1. Copy `cases/case-01-harbor-ledger.json` and change the story, cast, leads, events and endings.
2. Run `npm run generate -- cases/<your-case>.json` to build and verify every puzzle.
3. Run `npm run validate -- cases/<your-case>.json` and fix anything it reports.
4. Check the playtest items in section 8 of the rule book.
