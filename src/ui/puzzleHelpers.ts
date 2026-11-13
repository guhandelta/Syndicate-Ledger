import type { Cell, GeneratedPuzzle } from '../engine/types';
import type { CastMember } from '../game/caseTypes';

/** Zone index for every cell (-1 = no zone), plus a 4-colouring so neighbouring zones differ. */
export function zoneMap(p: GeneratedPuzzle) {
  const zm: number[][] = p.solution.map((row) => row.map(() => -1));
  p.zones.forEach((z, i) => z.cells.forEach(([r, c]) => (zm[r][c] = i)));
  // colour + pattern, for colour-blind players
  const colour: number[] = p.zones.map(() => -1);
  p.zones.forEach((z, i) => {
    const used = new Set<number>();
    for (const [r, c] of z.cells)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = zm[r + dr]?.[c + dc];
        if (o !== undefined && o !== i && o >= 0 && colour[o] >= 0) used.add(colour[o]);
      }
    let k = 0;
    while (used.has(k)) k++;
    colour[i] = k % 4;
  });
  return { zm, colour };
}

/** True when the number at (r, c) also appears elsewhere in its row or column. */
export function dupe(grid: number[][], r: number, c: number): boolean {
  const v = grid[r][c];
  for (let k = 0; k < grid.length; k++) {
    if (k !== c && grid[r][k] === v) return true;
    if (k !== r && grid[k][c] === v) return true;
  }
  return false;
}

/** Sets of numbers a zone can still hold, given what is already in its rows and columns. */
export function zoneCombos(size: number, grid: number[][], cells: Cell[], sum: number): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  const vals: number[] = [];
  const inZone = (r: number, c: number) => cells.some(([rr, cc]) => rr === r && cc === c);
  const rec = (i: number, s: number) => {
    if (i === cells.length) {
      if (s !== sum) return;
      const k = [...vals].sort((a, b) => a - b).join(',');
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k.split(',').map(Number));
      }
      return;
    }
    const [r, c] = cells[i];
    for (let v = 1; v <= size; v++) {
      if (s + v > sum) break;
      if (grid[r][c] && grid[r][c] !== v) continue;
      let bad = false;
      for (let k = 0; k < size && !bad; k++) {
        if (k !== c && grid[r][k] === v && !inZone(r, k)) bad = true;
        if (k !== r && grid[k][c] === v && !inZone(k, c)) bad = true;
      }
      for (let j = 0; j < i && !bad; j++) if (vals[j] === v && (cells[j][0] === r || cells[j][1] === c)) bad = true;
      if (bad) continue;
      vals[i] = v;
      rec(i + 1, s + v);
    }
  };
  rec(0, 0);
  return out;
}

/** First filled cell that disagrees with the solution, or null. */
export function findWrong(p: GeneratedPuzzle, grid: number[][]): Cell | null {
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (grid[r][c] && grid[r][c] !== p.solution[r][c]) return [r, c];
  return null;
}

export function initials(name: string): string {
  return name
    .replace(/[^A-Za-z .]/g, '')
    .split(' ')
    .filter((w) => w && !w.endsWith('.'))
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** The "how many lies" line above the statements (rule book section 2). */
export function liarLine(liarCounts: number[], statements: number, friendly: boolean): string {
  if (liarCounts.length > 1) return `${liarCounts[0]} or ${liarCounts[1]} of these statements are lies.`;
  const n = liarCounts[0];
  if (n === 0) return friendly ? 'Everyone is telling the truth here.' : 'Every statement here is true.';
  return `Exactly ${n} of these statement${statements > 1 ? 's' : ''} ${n === 1 ? 'is a lie' : 'are lies'}.`;
}

export const allyCost = (c: CastMember) => (c.ability === 'undercover' ? 2 : 1);

export function abilityLabel(c: CastMember): string {
  return {
    forensics: 'Forensics: reveals one cell (1 favor)',
    accountant: 'Accountant: lists what a zone can hold (1 favor)',
    undercover: 'Undercover: checks one statement (2 favors)',
    partner: 'Old partner: explains the next step (1 favor)',
  }[c.ability!];
}
