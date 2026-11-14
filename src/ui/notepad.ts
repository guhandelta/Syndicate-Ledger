/**
 * The case notebook: a floating "Notebook" button that opens a side panel where the player writes down
 * what they've found. Notes save in this browser as they type.
 *
 * Plain DOM with its own styles and no imports, so the same file also drops into the original v1
 * build (scripts/build-site.sh copies it there). Keep it that way.
 */

export interface NotepadOptions {
  /** localStorage key the notes are kept under. */
  storageKey: string;
  /** Distance of the Notes button from the right edge, to sit beside other corner buttons. */
  right?: number;
}

const TIPS: { title: string; items: string[] }[] = [
  {
    title: 'How the grid works',
    items: [
      'Every row and every column holds each number exactly once. A 5×5 grid uses 1 to 5, a 6×6 uses 1 to 6.',
      'Rows are the hours of the night. Columns are the people. A ledger cell is the money that person moved that hour; a camera-log cell is the room they were in.',
      'A zone is a group of cells with a total in its top-left corner. The numbers in it must add up to that total, and none repeats inside it.',
      'A row or column always adds up to the same total: 15 for 5×5, 21 for 6×6. If a zone covers most of a row, the leftover cells are easy to find.',
    ],
  },
  {
    title: 'Where to start',
    items: [
      'Small zones first. Two cells that add to 3 can only be 1 and 2. Three cells that add to 6 can only be 1, 2 and 3.',
      'Then use the row and column totals: if four cells of a row are in one zone, the fifth cell is the row total minus the zone total.',
      'Use each witness statement as a clue. “Kane at 8pm and 11pm add up to $3k” means those two cells are 1 and 2.',
      'Switch Notes on (key P) and pencil the possible numbers in a cell. When only one is left, write it in.',
    ],
  },
  {
    title: 'Marking the statements',
    items: [
      'Fill the grid first, then test each statement against it. If it matches, mark True; if it can’t be true, mark Lie.',
      'The lead tells you how many statements are lies. Once you have found that many, everyone else is telling the truth.',
      'Catching a liar earns a favor and builds your case, so a wrong mark is worth rechecking.',
    ],
  },
  {
    title: 'Favors and the clock',
    items: [
      'Spend a favor on an ally inside a lead: one lists what a zone can hold, one explains the next step, one reveals a cell, one checks a statement.',
      'Favors are limited, so keep them for the cell or statement that is truly blocking you.',
      'On a ranked clock every lead costs hours. Watch the rumors on the board: some people leave and some events hit leads you haven’t started.',
    ],
  },
  {
    title: 'Before you accuse',
    items: [
      'An accusation needs proof: you name one person, then tick the solved leads that show it. The right name with weak proof is refused and costs a try.',
      'You can only accuse a few people, and each only a couple of times. An innocent person you accuse stops being so helpful.',
      'Write each proven fact here with the lead it came from, so you know which leads point at your suspect.',
    ],
  },
];

const QUICK: [string, string][] = [
  ['Suspect', 'Suspect: '],
  ['Clue', 'Clue (lead and fact): '],
  ['Lie', 'Caught lying (who, which lead): '],
  ['Alibi', 'Alibi (who, where, when): '],
  ['To check', 'To check: '],
];

const SHEET = [
  'CASE SHEET',
  '',
  'SUSPECTS (who, what I suspect):',
  '- ',
  '',
  'WHAT I HAVE PROVED (fact, which lead):',
  '- ',
  '',
  'LIES CAUGHT (who, which lead):',
  '- ',
  '',
  'STILL TO CHECK:',
  '- ',
  '',
  'MY ACCUSATION (who, and which solved leads prove it):',
  '- ',
  '',
].join('\n');

const CSS = `
.np-btn { position: fixed; bottom: 16px; z-index: 15; height: 48px; padding: 0 16px; border-radius: 24px;
  border: 2px solid var(--accent, #d4a24c); background: var(--panel, #1b2130); color: var(--accent, #d4a24c);
  font: 600 0.95rem system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.np-btn:hover { background: var(--panel-2, #232a3b); }
.np-btn:focus-visible, .np-panel button:focus-visible, .np-text:focus-visible { outline: 3px solid var(--accent, #d4a24c); outline-offset: 2px; }
.np-panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 25; width: min(380px, 100vw); display: flex; flex-direction: column;
  background: var(--panel, #1b2130); color: var(--ink, #e8e4d8); border-left: 1px solid var(--accent, #d4a24c);
  box-shadow: -8px 0 24px rgba(0,0,0,.45); font-family: system-ui, sans-serif; }
.np-panel[hidden] { display: none; }
.np-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 4px 16px; }
.np-head h2 { margin: 0; font: 700 1.1rem 'Courier New', ui-monospace, monospace; }
.np-x { background: transparent; border: 0; color: var(--ink, #e8e4d8); font-size: 1.2rem; width: 40px; height: 40px; cursor: pointer; border-radius: 8px; }
.np-sub { margin: 0 16px 8px; color: var(--muted, #a3a9b8); font-size: .85rem; }
.np-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 8px; }
.np-quick button, .np-foot button { border: 1px solid var(--line, #333c52); background: var(--panel-2, #232a3b); color: var(--ink, #e8e4d8);
  border-radius: 8px; padding: 6px 10px; font: inherit; font-size: .85rem; cursor: pointer; min-height: 34px; }
.np-quick button:hover, .np-foot button:hover { border-color: var(--accent, #d4a24c); }
.np-text { flex: 1; margin: 0 16px; min-height: 160px; resize: none; padding: 12px; border-radius: 8px;
  border: 1px solid var(--line, #333c52); background: var(--paper, #f4ecd8); color: var(--paper-ink, #2a2418);
  font: 1rem/1.5 'Courier New', ui-monospace, monospace; }
.np-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 16px; }
.np-saved { color: var(--muted, #a3a9b8); font-size: .8rem; }
.np-tips { margin: 0 16px 14px; border-top: 1px solid var(--line, #333c52); padding-top: 8px; font-size: .9rem; }
.np-tips summary { cursor: pointer; color: var(--accent, #d4a24c); font-weight: 600; padding: 4px 0; }
.np-tipbody { max-height: 36vh; overflow-y: auto; }
.np-tips h3 { margin: 10px 0 2px; font-size: .9rem; color: var(--accent, #d4a24c); }
.np-tips ul { margin: 2px 0 0; padding-left: 18px; }
.np-tips li { margin: 4px 0; }
`;

export function mountNotepad({ storageKey, right = 16 }: NotepadOptions) {
  const load = () => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  };

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'np-btn';
  btn.type = 'button';
  btn.textContent = 'Notebook';
  btn.title = 'Your case notebook';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'np-panel');
  btn.style.right = `${right}px`;

  const panel = document.createElement('aside');
  panel.className = 'np-panel';
  panel.id = 'np-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Case notebook');
  panel.innerHTML = `
    <div class="np-head"><h2>Case notebook</h2><button type="button" class="np-x" aria-label="Close notebook">✕</button></div>
    <p class="np-sub">Jot down suspects, clues and who lied. It saves in this browser as you type.</p>
    <div class="np-quick" role="group" aria-label="Start a line"></div>
    <textarea class="np-text" aria-label="Your notes" spellcheck="true" placeholder="What have you found so far? Press + Case sheet for a ready layout."></textarea>
    <div class="np-foot"><span class="np-saved" aria-live="polite"></span><button type="button" class="np-clear">Clear notes</button></div>
    <details class="np-tips"><summary>Stuck? Read this</summary><div class="np-tipbody"></div></details>`;

  const text = panel.querySelector<HTMLTextAreaElement>('.np-text')!;
  const saved = panel.querySelector<HTMLElement>('.np-saved')!;
  const clear = panel.querySelector<HTMLButtonElement>('.np-clear')!;
  const quick = panel.querySelector<HTMLElement>('.np-quick')!;
  panel.querySelector('.np-tipbody')!.innerHTML = TIPS.map(
    (g) => `<h3>${g.title}</h3><ul>${g.items.map((t) => `<li>${t}</li>`).join('')}</ul>`,
  ).join('');
  text.value = load();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, text.value);
        saved.textContent = 'Saved';
      } catch {
        saved.textContent = 'Can’t save in this browser';
      }
    }, 300);
  };
  text.addEventListener('input', () => {
    // lets the game know the player is busy here (the newer version's idle tips listen for it)
    window.dispatchEvent(new Event('notepad-activity'));
    saved.textContent = '';
    clear.textContent = 'Clear notes';
    save();
  });

  const sheetBtn = document.createElement('button');
  sheetBtn.type = 'button';
  sheetBtn.textContent = '+ Case sheet';
  sheetBtn.addEventListener('click', () => {
    const v = text.value;
    text.value = v + (v && !v.endsWith('\n') ? '\n\n' : '') + SHEET;
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
    save();
  });
  quick.appendChild(sheetBtn);

  for (const [label, line] of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `+ ${label}`;
    b.addEventListener('click', () => {
      const v = text.value;
      text.value = v + (v && !v.endsWith('\n') ? '\n' : '') + line;
      text.focus();
      text.setSelectionRange(text.value.length, text.value.length);
      save();
    });
    quick.appendChild(b);
  }

  // Two clicks to clear, so notes aren't lost to a slip.
  clear.addEventListener('click', () => {
    if (clear.textContent !== 'Click again to clear') {
      clear.textContent = 'Click again to clear';
      return;
    }
    text.value = '';
    clear.textContent = 'Clear notes';
    save();
    text.focus();
  });

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Close notebook' : 'Notebook';
    if (open) text.focus();
    else btn.focus();
  };
  btn.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('.np-x')!.addEventListener('click', () => setOpen(false));

  // Typing in the notebook must not move the detective or fill puzzle cells.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
    e.stopPropagation();
  });

  // The game asks for the notes to be wiped when a case is lost.
  window.addEventListener('notepad-clear', () => {
    clearTimeout(timer);
    text.value = '';
    saved.textContent = '';
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* nothing to clear */
    }
  });

  document.body.append(panel, btn);
}
