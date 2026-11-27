# Junior portraits

Head-and-shoulders portraits for the Junior version's dialog and trust meter, in batches. Each file is named `<character>-<expression>.png`, where the expression is `neutral`, `suspicious` or `caught-lying`. Names match the main portraits in `assets/portraits/`.

## Batch 1

- Dr. Lin Abara: caught lying, neutral, suspicious.
- Nevethitha Rajan: caught lying, neutral, suspicious (new art, 2026-11-20; bunting backdrop).
- Kane Hollis: caught lying, neutral, suspicious.
- Kavya Narayanan: caught lying, neutral, suspicious (new art, 2026-11-20; full-body student look with backpack and books, so the game crops her face from the top).
- Officer Cole: caught lying, neutral.

Officer Cole's suspicious portrait is not in this batch. Later batches will add it.

## Case 1 additions

This folder now also contains `neutral`, `suspicious`, and `caught-lying` portraits for Silas Crane, Tip Callahan, Vex Lorne, Meena Selvi, Sgt. Deva Okafor, Thenmozhi Selvam, Capt. Karunakaran Velu, and the player detective (24 individual PNGs). The first five characters' files came from the earlier friendly portrait set; the detective's neutral portrait is the existing `set-4` Junior art. The other eight files are newly generated.

These are full-size source images. The game currently uses cropped WebP portraits under `src/ui/portraits/friendly/`; adding new source PNGs does not change the displayed dialogue art until those WebP files are prepared and wired in.
