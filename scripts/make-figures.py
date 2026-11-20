"""
Turns each character's four body views (assets/characters/<name>-front|back|side-left|side-right.png) into a
low-poly 3D figure for the town.

For every character it writes, under src/town/cast3d/:
  <cast>.webp   the four views packed side by side, painted onto the model from four directions
  <cast>.json   the shape: rings (elliptical slices) for the head, body, arms and legs, plus the joints they turn on
  faces/<tone>/<cast>-<expression>.webp   the face from each expression portrait, cut to fit the model's head

The shape comes from the outlines: the front view gives each slice its width, the side view its depth.
Adding a character: put the four views in assets/characters/, add a line to CAST below, and run
    python3 scripts/make-figures.py            (needs Pillow and numpy)
    python3 scripts/make-figures.py --sheet out.png   also saves a check sheet of outlines and face boxes
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets/characters'
OUT = ROOT / 'src/town/cast3d'

# cast id -> (art file name, portrait file name, options)
# height: metres. tol: how far a pixel may differ from the grey backdrop and still count as backdrop.
CAST = {
    'meena': ('meena-selvi', 'meena-selvi', {'height': 1.68}),
    'nevethitha': ('nevethitha-rajan', 'nevethitha-rajan', {'height': 1.72}),
    'kavya': ('kavya-narayanan', 'kavya-narayanan', {'height': 1.66, 'tol': 28}),
    'lin': ('dr-yazhini-raman', 'dr-lin-abara', {'height': 1.66, 'tol': 9}),
    'karunakaran': ('captain-karunakaran-velu', 'captain-karunakaran-velu', {'height': 1.76}),
    'thenmozhi': ('thenmozhi-selvam', 'thenmozhi-selvam', {'height': 1.62}),
    'kane': ('sethu-raman', 'kane-hollis', {'height': 1.74}),
    'vex': ('arun-kumar', 'vex-lorne', {'height': 1.74}),
    'tip': ('sakthivel-siva', 'tip-callahan', {'height': 1.7}),
    'crane': ('sivaram-chetllamuthu', 'silas-crane', {'height': 1.8}),
    'dex': ('sgt-devan-rajan', 'sgt-dex-okafor', {'height': 1.78}),
    'cole': ('officer-arul-prakash', 'officer-cole', {'height': 1.76}),
}

VIEWS = ['front', 'back', 'side-left', 'side-right']
EXPRESSIONS = ['neutral', 'suspicious', 'caught-lying', 'nervous', 'angry', 'smug', 'scared']
PORTRAITS = {
    'crime': ['assets/portraits/set-2', 'assets/portraits/set-1', 'assets/portraits/set-3', 'assets/portraits/set-5'],
    'friendly': ['assets/junior/portraits'],
}
# Junior art that is a different outfit or framing, so its face would not sit on this body.
SKIP_FACES = {('friendly', 'kavya')}

WORK = 768  # outlines are found at this image height
ATLAS_H = 1024  # each view's height in the packed texture
RING_STEP = 0.028  # metres between slices
FACE_W, FACE_H = 128, 160


# ---------- outlines ----------

def load(path: Path) -> Image.Image:
    return Image.open(path).convert('RGB')


def outline(im: Image.Image, tol: int) -> np.ndarray:
    """True where the character is: everything not joined to the edge through backdrop-coloured pixels."""
    small = im.resize((im.width * WORK // im.height, WORK), Image.LANCZOS)
    a = np.asarray(small).astype(int)
    # the backdrop can shade from top to bottom, so compare each row with its own edges
    row_bg = (np.median(a[:, :8], 1) + np.median(a[:, -8:], 1)) / 2
    near = np.abs(a - row_bg[:, None, :]).max(2) < tol
    fill = Image.fromarray((near * 255).astype(np.uint8)).copy()
    h, w = near.shape
    seeds = [(x, y) for x in range(0, w, 8) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 8) for x in (0, w - 1)]
    for p in seeds:
        if fill.getpixel(p) == 255:
            ImageDraw.floodfill(fill, p, 128)
    body = np.asarray(fill) != 128
    # backdrop seen through a gap (between the legs, under an arm) is closed in, so the flood can't reach it:
    # any sizeable patch of backdrop colour inside the figure is a gap too
    lab = components(near & body)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    body &= ~(sizes[lab] > 120)
    # drop specks: keep only the main figure
    return keep_largest(body)


def keep_largest(m: np.ndarray) -> np.ndarray:
    lab = np.zeros(m.shape, np.int32)
    best, best_n, n = 0, 0, 0
    h, w = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        count = 0
        while stack:
            y, x = stack.pop()
            count += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    stack.append((yy, xx))
        if count > best_n:
            best, best_n = n, count
    return lab == best


def runs(row: np.ndarray) -> list[tuple[int, int]]:
    """Filled stretches of one row, as (first, last+1)."""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]))


class View:
    """One outline, with conversions between its pixels and model metres."""

    def __init__(self, im: Image.Image, mask: np.ndarray, height: float, sign: int):
        self.im = im
        self.mask = mask
        ys, xs = np.nonzero(mask)
        self.top, self.bottom = ys.min(), ys.max() + 1
        self.left, self.right = xs.min(), xs.max() + 1
        self.scale = height / (self.bottom - self.top)  # metres per pixel
        self.height = height
        # centre: middle of the body between 35% and 65% of the height, which bags and hands don't pull much
        band = mask[self.top + int(0.35 * (self.bottom - self.top)): self.top + int(0.65 * (self.bottom - self.top))]
        self.centre = float(np.nonzero(band)[1].mean())
        self.sign = sign  # +1: image right is model +; -1: image right is model -

    def row(self, y: float) -> int:
        """Pixel row for a height in metres above the ground."""
        return int(round(self.bottom - 1 - y / self.scale))

    def m(self, px: float) -> float:
        return (px - self.centre) * self.scale * self.sign

    def spans(self, y: float) -> list[tuple[float, float]]:
        r = self.row(y)
        if r < self.top or r >= self.bottom:
            return []
        out = []
        for a, b in runs(self.mask[r]):
            lo, hi = sorted((self.m(a), self.m(b)))
            out.append((lo, hi))
        return sorted(out)

    def edges(self) -> tuple[float, float]:
        """Model coordinate at the left and right edge of the outline's box."""
        return self.m(self.left), self.m(self.right)


def containing(spans, v):
    for s in spans:
        if s[0] <= v <= s[1]:
            return s
    return None


def nearest(spans, v):
    return min(spans, key=lambda s: 0 if s[0] <= v <= s[1] else min(abs(s[0] - v), abs(s[1] - v))) if spans else None


# ---------- faces ----------

def smooth(vals, k=1):
    v = np.array(vals, float)
    if len(v) < 3:
        return v
    out = v.copy()
    for i in range(len(v)):
        out[i] = np.median(v[max(0, i - k): i + k + 1])
    return out


def skin(a: np.ndarray) -> np.ndarray:
    r, g, b = (a[..., i].astype(float) for i in range(3))
    rr = np.maximum(r, 1)
    return (r > 90) & (r > g) & (g > b * 0.9) & (g / rr > 0.52) & (g / rr < 0.88) & (b / rr < 0.8) & (r - b > 30)


def components(m: np.ndarray) -> np.ndarray:
    """Labels 4-connected regions of a mask (0 = empty)."""
    lab = np.zeros(m.shape, np.int32)
    h, w = m.shape
    n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    stack.append((yy, xx))
    return lab


def face_box(a: np.ndarray, region: tuple[int, int, int, int]):
    """Finds the face inside region (x0, y0, x1, y1) of an image: (centre x, width, top, neck) in its pixels, or None."""
    x0, y0, x1, y1 = region
    k = 300 / (y1 - y0)
    crop = Image.fromarray(a[y0:y1, x0:x1]).resize((max(1, int((x1 - x0) * k)), 300), Image.LANCZOS)
    sk = skin(np.asarray(crop))
    # open: drop thin specks (patterned cloth, earrings)
    er = sk & np.roll(sk, 1, 0) & np.roll(sk, -1, 0) & np.roll(sk, 1, 1) & np.roll(sk, -1, 1)
    sk = er | (np.roll(er, 1, 0) | np.roll(er, -1, 0) | np.roll(er, 1, 1) | np.roll(er, -1, 1)) & sk
    lab = components(sk)
    if lab.max() == 0:
        return None
    upper = lab[: int(0.55 * lab.shape[0])]
    counts = np.bincount(upper.ravel(), minlength=lab.max() + 1)
    counts[0] = 0
    face = lab == int(np.argmax(counts))
    w = smooth(face.sum(1), 2)
    start = next((i for i, v in enumerate(w) if v >= 0.3 * w[: int(0.55 * len(w))].max()), None)
    top_run, cut = 0.0, None
    for i in range(start, len(w)):
        top_run = max(top_run, w[i])
        # under the face the skin narrows to the neck; a face is never much taller than 1.7 times its width
        if (w[i] < 0.72 * top_run and i - start > 0.8 * top_run) or i - start > 1.6 * top_run:
            cut = i
            break
    if cut is None:
        cut = len(w) - 1
    look = w[cut: cut + max(2, int(0.45 * top_run))]
    neck = cut + int(np.argmin(np.where(look > 0, look, 1e9))) if (look > 0).any() else cut
    rows = face[start:neck]
    widths = rows.sum(1)
    width = float(np.percentile(widths[widths > 0], 80))
    xs = np.nonzero(rows)[1]
    centre = float(np.median(xs))
    return x0 + centre / k, width / k, y0 + start / k, y0 + neck / k


# ---------- the figure ----------


def ring(y, xs, zs, depth_cap=None):
    cx, rx = (xs[0] + xs[1]) / 2, (xs[1] - xs[0]) / 2
    cz, rz = (zs[0] + zs[1]) / 2, (zs[1] - zs[0]) / 2
    if depth_cap is not None:
        rz = min(rz, depth_cap)
    return [round(y, 4), round(cx, 4), round(cz, 4), round(max(rx, 0.008), 4), round(max(rz, 0.008), 4)]


def tidy(rings):
    if len(rings) < 3:
        return rings
    cols = list(zip(*rings))
    out = [cols[0]] + [smooth(c) for c in cols[1:]]
    return [[round(float(v), 4) for v in r] for r in zip(*out)]


def build(cast: str, art: str, portrait: str, opts: dict, sheet: list):
    H = opts.get('height', 1.75)
    tol = opts.get('tol', 16)
    ims = {v: load(ART / f'{art}-{v}.png') for v in VIEWS}
    # front: image right is the character's left (+x). back: image right is -x.
    # side-left faces image-left and shows the character's left side: image left is the front (+z).
    signs = {'front': 1, 'back': -1, 'side-left': -1, 'side-right': 1}
    views = {v: View(ims[v], outline(ims[v], tol), H, signs[v]) for v in VIEWS}
    F, S = views['front'], views['side-left']

    # face and neck from the front view
    small = np.asarray(F.im.resize(F.mask.shape[::-1], Image.LANCZOS))
    head_cx = int(np.nonzero(F.mask[F.top: F.top + int(0.06 * (F.bottom - F.top))])[1].mean())
    half = int(0.09 * (F.bottom - F.top))
    fb = face_box(small, (max(0, head_cx - half), F.top, head_cx + half, F.top + int(0.3 * (F.bottom - F.top))))
    if fb is None:
        raise SystemExit(f'{cast}: no face found in the front view')
    fcx, fw, ftop, fneck = fb
    neck_y = (F.bottom - 1 - fneck) * F.scale
    face = {'x': round(F.m(fcx), 4), 'w': round(fw * F.scale, 4), 'top': round((F.bottom - 1 - ftop) * F.scale, 4), 'neck': round(neck_y, 4)}

    cx0 = F.m(head_cx)
    # crotch (or hem): the first height, coming down from the waist, where the middle column is empty
    crotch = 0.0
    y = 0.62 * H
    while y > 0.08 * H:
        if not containing(F.spans(y), cx0):
            crotch = y
            break
        y -= 0.005
    if crotch == 0.0:
        crotch = 0.08 * H  # a long coat or skirt to the ankles: no separate legs
    skirt = crotch < 0.4 * H
    hip_y = max(crotch + 0.04 * H, 0.5 * H)
    knee_y = 0.28 * H

    body_z = S.m(S.centre)

    def depth(y, around):
        sp = S.spans(y)
        s = containing(sp, around) or nearest(sp, around)
        return s

    # side-view centre of the legs, to pick the leg span on the side view
    leg_z = np.mean([((s[0] + s[1]) / 2) for yy in np.arange(0.05 * H, 0.2 * H, 0.02) if (s := depth(yy, body_z))]) if crotch > 0.1 * H else body_z

    parts = {'head': [], 'body': [], 'armL': [], 'armR': [], 'legL': [], 'legR': []}
    arm_alive = {'armL': True, 'armR': True}
    arm_prev = {'armL': None, 'armR': None}
    misses = {'armL': 0, 'armR': 0}
    ys = np.arange(H - 0.002, 0.004, -RING_STEP)
    for y in ys:
        fs = F.spans(y)
        if not fs:
            continue
        mid = containing(fs, cx0)
        zs = depth(y, body_z if y > crotch else leg_z)
        if zs is None:
            continue
        if y >= neck_y:
            mid = mid or nearest(fs, cx0)
            parts['head'].append(ring(y, mid, zs))
            continue
        if mid and y > crotch:
            parts['body'].append(ring(y, mid, zs))
            # arms: separate spans beside the body, followed downward from the armpit
            for key, side in (('armL', 1), ('armR', -1)):
                if not arm_alive[key] or y > neck_y - 0.1 * H:
                    continue
                beside = [s for s in fs if (s[0] >= mid[1] if side > 0 else s[1] <= mid[0]) and s[1] - s[0] >= 0.03]
                if arm_prev[key] is not None:
                    beside = [s for s in beside if s[0] <= arm_prev[key][1] + 0.01 and s[1] >= arm_prev[key][0] - 0.01]
                if not beside:
                    if len(parts[key]) >= 3:
                        # fingers and cuffs can break a row or two; three empty rows end the arm
                        misses[key] += 1
                        if misses[key] >= 3:
                            arm_alive[key] = False
                    else:
                        # a few rows of loose hair or a gap in a sleeve, not an arm: start again
                        parts[key], arm_prev[key] = [], None
                    continue
                s = min(beside, key=lambda s: abs((s[0] + s[1]) / 2 - cx0))
                arm_prev[key] = s
                misses[key] = 0
                parts[key].append(ring(y, s, zs, depth_cap=(s[1] - s[0]) * 0.55))
        elif y <= crotch:
            for key, side in (('legL', 1), ('legR', -1)):
                cand = [s for s in fs if ((s[0] + s[1]) / 2 > cx0 if side > 0 else (s[0] + s[1]) / 2 < cx0)]
                if cand:
                    s = min(cand, key=lambda s: abs((s[0] + s[1]) / 2 - cx0))
                    parts[key].append(ring(y, s, zs))
            # hands that hang below the crotch keep following their arm
            for key, side in (('armL', 1), ('armR', -1)):
                if arm_alive[key] and arm_prev[key] is not None:
                    beside = [s for s in fs if s[0] <= arm_prev[key][1] + 0.01 and s[1] >= arm_prev[key][0] - 0.01]
                    leg = parts['legL' if side > 0 else 'legR']
                    beside = [s for s in beside if not (leg and abs((s[0] + s[1]) / 2 - leg[-1][1]) < 0.01)]
                    if beside:
                        s = beside[0]
                        arm_prev[key] = s
                        parts[key].append(ring(y, s, zs, depth_cap=(s[1] - s[0]) * 0.55))
                    else:
                        arm_alive[key] = False

    for k in parts:
        parts[k] = tidy(parts[k])
    if '--debug' in sys.argv:
        print({k: [r[0] for r in v] for k, v in parts.items() if k.startswith('arm')})

    joints = {}
    neck_z = (parts['head'][-1][2]) if parts['head'] else body_z
    joints['neck'] = [round(face['x'], 4), round(neck_y, 4), round(neck_z, 4)]
    joints['hip'] = [round(cx0, 4), round(hip_y, 4), round(body_z, 4)]
    swing = {}
    shoulder_y = neck_y - 0.07 * H
    for key, side in (('armL', 1), ('armR', -1)):
        rs = parts[key]
        # an arm that is hardly free of the body (holding something against it) stays still
        swing[key] = len(rs) >= 3 and rs[0][0] - rs[-1][0] >= 0.04 * H
        if not swing[key]:
            parts[key] = []
            continue
        # where the arm hangs from: just inside the body's edge at shoulder height
        sh = containing(F.spans(shoulder_y), cx0) or nearest(F.spans(shoulder_y), cx0)
        first = rs[0]
        rx, rz = first[3] * 1.15, first[4] * 1.15
        sx = (sh[1] - rx) if side > 0 else (sh[0] + rx)
        joints[key] = [round(sx, 4), round(shoulder_y, 4), first[2]]
        # the upper arm, hidden in the body (or the hair) until it swings: straight from the shoulder to where it comes free
        n = max(2, int((shoulder_y - first[0]) / RING_STEP))
        upper = []
        for i in range(n):
            t = i / n
            upper.append([round(shoulder_y + (first[0] - shoulder_y) * t, 4), round(sx + (first[1] - sx) * t, 4), first[2], round(rx, 4), round(rz, 4)])
        parts[key] = upper + rs
    for key in ('legL', 'legR'):
        rs = parts[key]
        if rs:
            joints[key] = [rs[0][1], round(hip_y, 4), rs[0][2]]
            top = list(rs[0])
            top[0] = round(rs[0][0] + 0.07, 4)
            parts[key] = [top] + rs
            joints[key.replace('leg', 'knee')] = [rs[0][1], round(knee_y, 4), rs[0][2]]
    # the neck reaches down into the body
    if parts['head']:
        plug = list(parts['head'][-1])
        plug[0] = round(neck_y - 0.06, 4)
        plug[3] = round(plug[3] * 0.8, 4)
        plug[4] = round(plug[4] * 0.8, 4)
        parts['head'].append(plug)

    # ---------- texture: the four views side by side ----------
    tiles, rects, x = [], {}, 0
    for v in VIEWS:
        vw = views[v]
        k = vw.im.height / WORK
        box = (int(vw.left * k), int(vw.top * k), int(np.ceil(vw.right * k)), int(np.ceil(vw.bottom * k)))
        crop = vw.im.crop(box)
        mask = Image.fromarray((vw.mask * 255).astype(np.uint8)).resize(vw.im.size, Image.NEAREST).crop(box)
        w = max(1, round(crop.width * ATLAS_H / crop.height))
        crop = crop.resize((w, ATLAS_H), Image.LANCZOS)
        mask = mask.resize((w, ATLAS_H), Image.BILINEAR)
        tiles.append(bleed(crop, mask))
        lo, hi = vw.edges()
        rects[v] = {'x': x, 'w': w, 'from': round(lo, 4), 'to': round(hi, 4)}
        x += w + 8
    atlas_w = x - 8
    atlas = Image.new('RGB', (atlas_w, ATLAS_H))
    for t, v in zip(tiles, VIEWS):
        atlas.paste(t, (rects[v]['x'], 0))
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / f'{cast}.webp', 'WEBP', quality=82, method=6)
    views_out = {v: {'u0': round(r['x'] / atlas_w, 5), 'u1': round((r['x'] + r['w']) / atlas_w, 5), 'from': r['from'], 'to': r['to']} for v, r in rects.items()}

    # ---------- faces ----------
    # the decal covers the face box made a little larger, so its soft edge has picture under it
    pad_w, pad_top, pad_bottom = 1.35, 0.18, 0.06
    fh = face['top'] - face['neck']
    decal = {
        'x0': round(face['x'] - face['w'] * pad_w / 2, 4), 'x1': round(face['x'] + face['w'] * pad_w / 2, 4),
        'y0': round(face['neck'] - fh * pad_bottom, 4), 'y1': round(face['top'] + fh * pad_top, 4),
    }
    faces = {}
    for tone, dirs in PORTRAITS.items():
        if (tone, cast) in SKIP_FACES:
            continue
        found = []
        for expr in EXPRESSIONS:
            src = next((ROOT / d / f'{portrait}-{expr}.png' for d in dirs if (ROOT / d / f'{portrait}-{expr}.png').exists()), None)
            if not src:
                continue
            im = load(src)
            pb = face_box(np.asarray(im), (int(im.width * 0.2), 0, int(im.width * 0.8), int(im.height * 0.85)))
            found.append((expr, im, pb))
        # portraits drawn as one set share their framing, so the face sits in the same place in each:
        # the middle of their boxes is steadier than any one (a scowl or a beard can fool the skin finder)
        for expr, im, pb in found:
            same = [b for _, other, b in found if b is not None and other.size == im.size]
            if len(same) >= 3:
                pb = tuple(float(np.median([b[i] for b in same])) for i in range(4))
            if pb is None:
                print(f'  {cast} {tone} {expr}: no face found, skipped')
                continue
            pcx, pw, ptop, pneck = pb
            ph = pneck - ptop
            box = (pcx - pw * pad_w / 2, ptop - ph * pad_top, pcx + pw * pad_w / 2, pneck + ph * pad_bottom)
            crop = im.crop(tuple(int(round(v)) for v in box)).resize((FACE_W, FACE_H), Image.LANCZOS)
            (OUT / 'faces' / tone).mkdir(parents=True, exist_ok=True)
            crop.save(OUT / 'faces' / tone / f'{cast}-{expr}.webp', 'WEBP', quality=85, method=6)
            faces.setdefault(tone, []).append(expr)
            if sheet is not None and tone == 'crime' and expr in ('neutral', 'angry'):
                dbg = im.copy()
                ImageDraw.Draw(dbg).rectangle(box, outline=(0, 255, 0), width=6)
                sheet.append(dbg.resize((240, 240 * dbg.height // dbg.width)))

    rig = {
        'height': H, 'skirt': skirt, 'swing': swing, 'joints': joints, 'parts': {k: v for k, v in parts.items() if v},
        'views': views_out, 'face': decal, 'faces': faces,
    }
    (OUT / f'{cast}.json').write_text(json.dumps(rig, separators=(',', ':')) + '\n')

    if sheet is not None:
        for v in VIEWS:
            vw = views[v]
            small = vw.im.resize(vw.mask.shape[::-1]).convert('RGB')
            a = np.asarray(small).copy()
            a[~vw.mask] = (a[~vw.mask] * 0.3 + np.array([255, 0, 255]) * 0.7).astype(np.uint8)
            dbg = Image.fromarray(a)
            d = ImageDraw.Draw(dbg)
            if v == 'front':
                d.rectangle((fcx - fw / 2, ftop, fcx + fw / 2, fneck), outline=(0, 255, 0), width=2)
                for yy, col in ((crotch, (255, 255, 0)), (hip_y, (0, 255, 255)), (neck_y, (0, 255, 0))):
                    r = vw.row(yy)
                    d.line((0, r, dbg.width, r), fill=col)
            sheet.append(dbg.resize((240, 360)))
    print(f'{cast}: {sum(len(p) for p in parts.values())} rings, arms swing {swing}, skirt {skirt}, faces {faces}')


def bleed(im: Image.Image, mask: Image.Image) -> Image.Image:
    """Spreads edge colours outward over the backdrop, so the texture never shows a grey fringe."""
    a = np.asarray(im).astype(float)
    m = (np.asarray(mask) > 160).astype(float)
    # erode by a couple of pixels: the outline edge is a mix of figure and backdrop
    for _ in range(2):
        m = np.minimum.reduce([m, np.roll(m, 1, 0), np.roll(m, -1, 0), np.roll(m, 1, 1), np.roll(m, -1, 1)])
    col = a * m[..., None]
    w = m.copy()
    known = m > 0
    for _ in range(24):
        acc = sum(np.roll(col, s, ax) for s in (1, -1) for ax in (0, 1))
        wa = sum(np.roll(w, s, ax) for s in (1, -1) for ax in (0, 1))
        new = (~known) & (wa > 0)
        col[new] = acc[new] / wa[new][:, None]
        w[new] = 1
        known |= new
        col[~known] = 0
    out = np.where(known[..., None], col, a.mean((0, 1)))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


if __name__ == '__main__':
    sheet_path = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    only = [a for a in sys.argv[1:] if a in CAST]
    tiles = [] if sheet_path else None
    for cast, (art, portrait, opts) in CAST.items():
        if only and cast not in only:
            continue
        build(cast, art, portrait, opts, tiles)
    if sheet_path and tiles:
        cols = 6
        rows = (len(tiles) + cols - 1) // cols
        th = max(t.height for t in tiles)
        out = Image.new('RGB', (cols * 240, rows * th), 'white')
        for i, t in enumerate(tiles):
            out.paste(t, ((i % cols) * 240, (i // cols) * th))
        out.save(sheet_path)
