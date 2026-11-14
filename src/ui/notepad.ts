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

const TIPS = [
  'Start with the row or column that already has the most numbers in it.',
  'In a cash ledger, a small zone often has only one or two ways to add up. Try those first.',
  'Read each statement against your grid. If it can’t be true, that person is lying.',
  'You’re told how many statements are lies. If you’ve found that many, everyone else is telling the truth.',
  'Still stuck? Spend a favor on an ally inside the lead: your old partner explains the next step.',
  'Write down each fact as you prove it here, so you can see who it points to before you accuse anyone.',
];

const QUICK: [string, string][] = [
  ['Suspect', 'Suspect: '],
  ['Clue', 'Clue: '],
  ['Lie', 'Caught lying: '],
  ['To check', 'To check: '],
];

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
.np-tips ul { margin: 6px 0 0; padding-left: 18px; max-height: 30vh; overflow-y: auto; }
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
    <textarea class="np-text" aria-label="Your notes" spellcheck="true" placeholder="What have you found so far?"></textarea>
    <div class="np-foot"><span class="np-saved" aria-live="polite"></span><button type="button" class="np-clear">Clear notes</button></div>
    <details class="np-tips"><summary>Stuck? Try this</summary><ul></ul></details>`;

  const text = panel.querySelector<HTMLTextAreaElement>('.np-text')!;
  const saved = panel.querySelector<HTMLElement>('.np-saved')!;
  const clear = panel.querySelector<HTMLButtonElement>('.np-clear')!;
  const quick = panel.querySelector<HTMLElement>('.np-quick')!;
  panel.querySelector('.np-tips ul')!.innerHTML = TIPS.map((t) => `<li>${t}</li>`).join('');
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
