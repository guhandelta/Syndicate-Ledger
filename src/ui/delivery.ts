/** One word of a spoken line: stressed words were written *like this*, and "..." makes the speaker pause after it. */
export interface Word {
  text: string;
  stress: boolean;
  pause: boolean;
}

/** Splits a line into the words it is spoken in. */
export function deliver(line: string): Word[] {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const stress = /^\*.+\*[^\w]*$/.test(w);
      const text = stress ? w.replace(/^\*(.+)\*([^\w]*)$/, '$1$2') : w;
      return { text, stress, pause: /(\.\.\.|…)$/.test(text) };
    });
}

/** The line as plain text, for screen readers and for players who turn the effect off. */
export const plainLine = (line: string) => line.replace(/\*([^*]+)\*/g, '$1');

/** Milliseconds before the next word: longer after a pause or the end of a sentence. */
export const wordDelay = (w: Word) => (w.pause ? 650 : /[.!?]$/.test(w.text) ? 320 : 90);
