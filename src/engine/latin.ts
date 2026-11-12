import type { Grid } from './types';
import type { Rng } from './rng';

/** A uniformly-shuffled random Latin square of size n (values 1..n). */
export function randomLatin(n: number, rng: Rng): Grid {
  const g: Grid = Array.from({ length: n }, () => Array(n).fill(0));
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n);
    const c = i % n;
    const vals = rng.shuffle(Array.from({ length: n }, (_, k) => k + 1));
    for (const v of vals) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) if (g[r][k] === v || g[k][c] === v) ok = false;
      if (!ok) continue;
      g[r][c] = v;
      if (fill(i + 1)) return true;
      g[r][c] = 0;
    }
    return false;
  };
  fill(0);
  return g;
}
