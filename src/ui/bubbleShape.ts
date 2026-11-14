/**
 * Outlines for comic speech bubbles, as SVG path data sized to the bubble's box.
 * Pure geometry, so the shapes can be tested without a browser.
 */

export type BubbleShape = 'round' | 'oval' | 'cloud' | 'burst' | 'wobble' | 'sharp' | 'jagged';
/** Which side the tail points out of, toward the speaker. */
export type TailSide = 'left' | 'right' | 'none';

export interface BubblePaths {
  body: string;
  tail: string;
}

interface Pt {
  x: number;
  y: number;
  /** Outward normal. */
  nx: number;
  ny: number;
}

const f = (n: number) => Math.round(n * 10) / 10;
const close = (pts: { x: number; y: number }[]) => `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`;

/** Points spaced evenly around a rounded rectangle, clockwise from the top-left, with outward normals. */
export function aroundRect(x: number, y: number, w: number, h: number, r: number, step: number): Pt[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const sw = w - 2 * r;
  const sh = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  // top, top-right corner, right, bottom-right, bottom, bottom-left, left, top-left
  const segs = [sw, arc, sh, arc, sw, arc, sh, arc];
  const total = segs.reduce((a, b) => a + b, 0);
  const n = Math.max(8, Math.round(total / step));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    let k = 0;
    while (k < 7 && d > segs[k]) d -= segs[k++];
    const t = segs[k] ? d / segs[k] : 0;
    const corner = (cx: number, cy: number, a0: number) => {
      const a = a0 + t * (Math.PI / 2);
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) };
    };
    switch (k) {
      case 0: pts.push({ x: x + r + t * sw, y, nx: 0, ny: -1 }); break;
      case 1: pts.push(corner(x + w - r, y + r, -Math.PI / 2)); break;
      case 2: pts.push({ x: x + w, y: y + r + t * sh, nx: 1, ny: 0 }); break;
      case 3: pts.push(corner(x + w - r, y + h - r, 0)); break;
      case 4: pts.push({ x: x + w - r - t * sw, y: y + h, nx: 0, ny: 1 }); break;
      case 5: pts.push(corner(x + r, y + h - r, Math.PI / 2)); break;
      case 6: pts.push({ x, y: y + h - r - t * sh, nx: -1, ny: 0 }); break;
      default: pts.push(corner(x + r, y + r, Math.PI)); break;
    }
  }
  return pts;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}` +
    `A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`
  );
}

const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;

/** A small repeatable wobble, so a jagged outline looks the same on every redraw. */
const jitter = (i: number) => [0.9, -0.5, 1, -0.2, 0.6, -0.8, 0.3, 1, -0.6, 0.1, 0.8, -0.3][i % 12];

function body(shape: BubbleShape, w: number, h: number): string {
  switch (shape) {
    case 'round':
      return roundRect(0, 0, w, h, 14);
    case 'oval':
      return roundRect(0, 0, w, h, Math.min(h / 2, 28));
    case 'sharp': {
      const c = Math.min(12, w / 4, h / 4);
      return close([
        { x: c, y: 0 }, { x: w - c, y: 0 }, { x: w, y: c }, { x: w, y: h - c },
        { x: w - c, y: h }, { x: c, y: h }, { x: 0, y: h - c }, { x: 0, y: c },
      ]);
    }
    case 'cloud': {
      // puffs whose middles sit on a rectangle just inside the box, bulging out past it
      const inset = 7;
      const pts = aroundRect(inset, inset, w - 2 * inset, h - 2 * inset, 18, 34);
      let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
      pts.forEach((_, i) => {
        const p = pts[(i + 1) % pts.length];
        const prev = pts[i];
        const chord = Math.hypot(p.x - prev.x, p.y - prev.y);
        const r = f(Math.max(chord * 0.62, 4));
        d += `A${r} ${r} 0 0 1 ${f(p.x)} ${f(p.y)}`;
      });
      return `${d}Z`;
    }
    case 'burst': {
      // spikes all round, like a shout in a comic
      const spike = 9;
      const pts = aroundRect(spike / 2, spike / 2, w - spike, h - spike, 16, 13);
      return close(pts.map((p, i) => {
        const out = i % 2 === 0 ? spike * (0.8 + 0.4 * Math.abs(jitter(i))) : -1.5;
        return { x: p.x + p.nx * out, y: p.y + p.ny * out };
      }));
    }
    case 'wobble': {
      const pts = aroundRect(2, 2, w - 4, h - 4, 14, 5);
      return close(pts.map((p, i) => {
        const out = 2.2 * Math.sin(i * 0.95);
        return { x: p.x + p.nx * out, y: p.y + p.ny * out };
      }));
    }
    case 'jagged': {
      // crooked, broken outline: the line doesn't hold together
      const pts = aroundRect(3, 3, w - 6, h - 6, 6, 15);
      return close(pts.map((p, i) => {
        const out = 5 * jitter(i * 7 + 3);
        return { x: p.x + p.nx * out, y: p.y + p.ny * out };
      }));
    }
  }
}

/** The tail on the left side; mirrored for the right. */
function tailLeft(shape: BubbleShape, y: number): string {
  switch (shape) {
    case 'cloud':
      // thought bubbles trail off in little puffs instead of a pointer
      return `${circle(-7, y + 12, 6)}${circle(-19, y + 20, 3.5)}`;
    case 'burst':
      return close([{ x: 6, y: y - 7 }, { x: -22, y: y + 6 }, { x: 6, y: y + 9 }]);
    case 'jagged':
      return close([{ x: 6, y: y - 6 }, { x: -9, y: y + 1 }, { x: -6, y: y + 5 }, { x: -18, y: y + 13 }, { x: 6, y: y + 8 }]);
    default:
      return close([{ x: 8, y: y - 6 }, { x: -14, y: y + 8 }, { x: 8, y: y + 8 }]);
  }
}

function mirror(d: string, w: number): string {
  // reflect every absolute x (and relative dx) across the box's middle
  return d.replace(/([MLHA])([^MLHAVZa]*)|(a)([^MLHAVZa]*)/g, (m, cmd: string, args: string, rel: string, rargs: string) => {
    const nums = (cmd ? args : rargs).trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (rel) return `a${nums[0]} ${nums[1]} ${nums[2]} ${nums[3]} ${1 - nums[4]} ${f(-nums[5])} ${nums[6]}`;
    if (cmd === 'M' || cmd === 'L') return `${cmd}${f(w - nums[0])} ${nums[1]}`;
    if (cmd === 'H') return `H${f(w - nums[0])}`;
    return `A${nums[0]} ${nums[1]} ${nums[2]} ${nums[3]} ${1 - nums[4]} ${f(w - nums[5])} ${nums[6]}`;
  });
}

/**
 * Paths for a bubble of w x h pixels. The tail leaves the side facing the speaker, tailY pixels from the top.
 * Draw both paths' outlines first, then both fills, so the seam where the tail meets the body disappears.
 */
export function bubblePaths(shape: BubbleShape, w: number, h: number, side: TailSide = 'left', tailY = 22): BubblePaths {
  if (w <= 0 || h <= 0) return { body: '', tail: '' };
  const y = Math.min(tailY, Math.max(h - 18, 8));
  const tail = side === 'none' ? '' : side === 'left' ? tailLeft(shape, y) : mirror(tailLeft(shape, y), w);
  return { body: body(shape, w, h), tail };
}
