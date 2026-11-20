# Character art

Low-poly character renders for the 3D town. Each file shows one character, named `<character>-<view>.png`.
Views: `front`, `side-left` (character faces left), `side-right` (character faces right), `back`.
All views are 1024×1536 and sit on a flat grey background (no transparency yet).

| Character | Likely Case 1 role | front | side-left | side-right | back |
| --- | --- | --- | --- | --- | --- |
| Arun Kumar | Vex Lorne (courier) | ✓ | ✓ | ✓ | ✓ |
| Sethu Raman | Kane Hollis (dock foreman) | ✓ | ✓ | ✓ | ✓ |
| Meena Selvi | Fish market owner | ✓ | ✓ | ✓ | ✓ |
| Nevethitha Rajan | Night guard | ✓ | ✓ | ✓ | ✓ |
| Sakthivel Siva | "Tip" Callahan (informant) | ✓ | ✓ | ✓ | ✓ |
| Sivaram Chetllamuthu | Silas Crane (boss) | ✓ | ✓ | ✓ | ✓ |
| Kavya Narayanan | Accountant | ✓ | ✓ | ✓ | ✓ |
| Sgt. Devan Rajan | Sgt. Dex Okafor (old partner) | ✓ | ✓ | ✓ | ✓ |
| Dr. Yazhini Raman | Dr. Lin Abara (forensic analyst) | ✓ | ✓ | ✓ | ✓ |
| Officer Arul Prakash | Officer Cole (undercover) | ✓ | ✓ | ✓ | ✓ |

Identities follow the original character sheet, not the labels on later generated lineup sheets (those labels are wrong): Arun = orange jacket and messenger bag; Sethu = green reflective work jacket, grey beard, wool cap, clipboard; Sivaram = silver-haired businessman in a charcoal three-piece suit and long dark purple overcoat; Sakthivel = plum patched coat, purple cap and scarf, newspapers; Sgt. Devan = grey-bearded detective in a tan trench coat.

The role column is a guess from each character's look; the case file uses the names Guha chose (Nevethitha Rajan, Meena Selvi and Kavya Narayanan replace the old Juno Park, Rosa Diaz and Mara Quill).

## New cast (stored only)

| Character | Planned role | front | side-left | side-right | back |
| --- | --- | --- | --- | --- | --- |
| Thenmozhi Selvam | Dock clerk (Inspector and Chief stories) | ✓ | ✓ | ✓ | ✓ |
| Captain Karunakaran Velu | Harbor pilot (Chief story only) | ✓ | ✓ | ✓ | ✓ |

The player detective has no character sheet yet; see `assets/portraits/set-4/`.

## 3D figures

The town builds each person in 3D from these four views. After adding or changing a character's views, run
`python3 scripts/make-figures.py` (needs Pillow and numpy; add a new character to `CAST` in that script first).
It writes `src/town/cast3d/<cast id>.webp` and `.json` and the expression faces in `src/town/cast3d/faces/`.
`--sheet check.png` saves a sheet of the outlines and face boxes it found, to check a new character.
To look at the figures on their own: `npx vite scripts/figure-viewer --config scripts/figure-viewer/vite.config.ts`.

Views work best as now: the whole body on a plain backdrop, arms held a little away from the body, facing straight on.
