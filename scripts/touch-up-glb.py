#!/usr/bin/env python3
"""
Small fixes to the colour picture of a model made by scripts/make-glb.py, so the face looks more like the person.

    python3 scripts/touch-up-glb.py <cast id> [--sheet before-after.png]

Run it after make-glb.py: it edits src/town/cast3d/<cast id>.glb in place. It only repaints the picture
(skin tone, eyebrows, a bindi) and the light flecks in dark hair or trousers; the shape of the model stays as it is.
Each fix is placed by where it sits on the model in metres (x to the person's left, y up, z towards the front),
so it lands in the right spot however the image-to-3D tool laid out its picture.
"""
import argparse
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CAST3D = Path(__file__).resolve().parent.parent / 'src' / 'town' / 'cast3d'

# what to fix on each model; places in metres in the model's own space (the .glb as make-glb.py wrote it)
TOUCH = {
    'lin': {
        # the reference photo's skin is a deeper, less orange brown than the tool's peach
        'skin': (0.91, 0.85, 0.81),
        # thinner, softer brows: (x0, x1, y0, y1) box around both brows, metres taken off top and bottom, colour mix
        'brows': {'box': (-0.097, 0.089, 0.765, 0.802), 'thin': (0.0028, 0.0018), 'tint': ((58, 36, 30), 0.3)},
        # a small dark bindi between the brows, as in the photo
        'bindi': {'at': (0.0, 0.7795), 'radius': 0.0034, 'colour': (52, 18, 22)},
        # light flecks in the dark hair and trousers, in these (y0, y1) bands: thin triangles on the tool's picture
        # that straddle the edge between a dark patch and a white one (the coat's) pick up a sliver of white
        'flecks': [(0.5, 1.0), (-0.8, -0.3)],
        # the front of the face, left alone by the fleck fix (eyes have light and dark next to each other)
        'face': (-0.11, 0.11, 0.6, 0.86),
    },
}


def read_glb(path: Path):
    data = path.read_bytes()
    if data[:4] != b'glTF':
        sys.exit('not a .glb file')
    jl = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', data[off:off + 4])[0]
    return doc, data[off + 8:off + 8 + bl]


def write_glb(doc, blob: bytes) -> bytes:
    j = json.dumps(doc, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    blob += b'\0' * (-len(blob) % 4)
    total = 12 + 8 + len(j) + 8 + len(blob)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(blob), 0x004E4942) + blob


def accessor(doc, blob, i):
    a = doc['accessors'][i]
    bv = doc['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    kind = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    arr = np.frombuffer(blob, kind, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0))
    return arr.reshape(-1, n) if n > 1 else arr


def raster(corners, values, size, depth=None):
    """Fills each triangle (corners in pixels) with its blended values. Returns (filled, values) per pixel."""
    w, h = size
    out = np.zeros((h, w, values.shape[-1]), np.float32)
    seen = np.zeros((h, w), bool)
    zbuf = np.full((h, w), -np.inf, np.float32)
    for t in range(len(corners)):
        sx, sy = corners[t, :, 0], corners[t, :, 1]
        x0, x1 = int(max(0, np.floor(sx.min()))), int(min(w - 1, np.ceil(sx.max())))
        y0, y1 = int(max(0, np.floor(sy.min()))), int(min(h - 1, np.ceil(sy.max())))
        if x1 < x0 or y1 < y0:
            continue
        den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2])
        if abs(den) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l0 = ((sy[1] - sy[2]) * (gx - sx[2]) + (sx[2] - sx[1]) * (gy - sy[2])) / den
        l1 = ((sy[2] - sy[0]) * (gx - sx[2]) + (sx[0] - sx[2]) * (gy - sy[2])) / den
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not inside.any():
            continue
        yy, xx = gy.astype(int)[inside], gx.astype(int)[inside]
        v = l0[inside, None] * values[t, 0] + l1[inside, None] * values[t, 1] + l2[inside, None] * values[t, 2]
        if depth is not None:
            z = l0[inside] * depth[t, 0] + l1[inside] * depth[t, 1] + l2[inside] * depth[t, 2]
            near = z > zbuf[yy, xx]
            yy, xx, v, z = yy[near], xx[near], v[near], z[near]
            zbuf[yy, xx] = z
        out[yy, xx] = v
        seen[yy, xx] = True
    return seen, out


def box_sum(a, r):
    """Sum over a (2r+1) square around each pixel."""
    p = np.pad(a, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (a.ndim - 2))
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def grow(mask, r):
    """Widens a mask by r pixels each way."""
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def paint_flecks_dark(doc, blob, prim, pos, uv, tri, luma, touch):
    """
    Gives each flecked triangle in the dark bands its own three corners, all pointing at a dark spot of the picture
    near it. Returns the rewritten buffer views (corners and triangles) by index.
    """
    h, w = luma.shape
    look = lambda u: luma[np.clip((u[:, 1] * h).astype(int), 0, h - 1), np.clip((u[:, 0] * w).astype(int), 0, w - 1)]
    U = uv[tri]
    samples = [U[:, 0], U[:, 1], U[:, 2], (U[:, 0] + U[:, 1]) / 2, (U[:, 1] + U[:, 2]) / 2, (U[:, 0] + U[:, 2]) / 2, U.mean(1)]
    lit = np.stack([look(u) for u in samples], 1)
    mid = pos[tri].mean(1)
    band = np.zeros(len(tri), bool)
    for y0, y1 in touch['flecks']:
        band |= (mid[:, 1] > y0) & (mid[:, 1] < y1)
    fx0, fx1, fy0, fy1 = touch['face']
    band &= ~((mid[:, 0] > fx0) & (mid[:, 0] < fx1) & (mid[:, 1] > fy0) & (mid[:, 1] < fy1) & (mid[:, 2] > 0.05))
    dark = lit.max(1) < 45
    # how dark the model is around each triangle (2 cm cells)
    cell = np.floor(mid / 0.02).astype(np.int64)
    key = (cell[:, 0] * 1000003 + cell[:, 1]) * 1000003 + cell[:, 2]
    order = np.argsort(key)
    starts = np.r_[0, np.nonzero(np.diff(key[order]))[0] + 1, len(key)]
    share = np.zeros(len(tri))
    nearest_dark = np.full(len(tri), -1)
    for a, b in zip(starts[:-1], starts[1:]):
        group = order[a:b]
        share[group] = dark[group].mean()
        ok = group[dark[group]]
        if len(ok):
            for t in group:
                nearest_dark[t] = ok[np.argmin(((mid[ok] - mid[t]) ** 2).sum(1))]
    fleck = band & (lit.max(1) > 75) & (share > 0.6) & (nearest_dark >= 0)
    picks = np.nonzero(fleck)[0]
    print(f'{len(picks)} flecked triangles painted dark')
    if not len(picks):
        return {}

    attrs = prim['attributes']
    corners = tri[picks].reshape(-1)
    n0 = len(pos)
    parts = {}
    for name, ai in attrs.items():
        a = doc['accessors'][ai]
        old = accessor(doc, blob, ai)
        extra = old[corners].copy()
        if name == 'TEXCOORD_0':
            extra[:] = np.repeat(U[nearest_dark[picks]].mean(1), 3, 0)
        both = np.concatenate([old, extra]).astype(old.dtype)
        a['count'] = len(both)
        a['byteOffset'] = 0
        parts[a['bufferView']] = both.tobytes()
    new_tri = tri.astype(np.uint32).copy()
    new_tri[picks] = n0 + np.arange(len(picks) * 3).reshape(-1, 3)
    ia = doc['accessors'][prim['indices']]
    wide = n0 + len(corners) > 65535
    ia['componentType'] = 5125 if wide else 5123
    ia['byteOffset'] = 0
    parts[ia['bufferView']] = new_tri.astype(np.uint32 if wide else np.uint16).tobytes()
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cast')
    ap.add_argument('--sheet', help='also write a picture of the face before and after')
    args = ap.parse_args()
    touch = TOUCH.get(args.cast)
    if not touch:
        sys.exit(f'no fixes listed for {args.cast}')
    path = CAST3D / f'{args.cast}.glb'
    doc, blob = read_glb(path)
    prim = doc['meshes'][0]['primitives'][0]
    pos = accessor(doc, blob, prim['attributes']['POSITION'])
    uv = accessor(doc, blob, prim['attributes']['TEXCOORD_0'])
    tri = accessor(doc, blob, prim['indices']).reshape(-1, 3)
    tex_i = doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
    view_i = doc['images'][doc['textures'][tex_i]['source']]['bufferView']
    bv = doc['bufferViews'][view_i]
    img = Image.open(io.BytesIO(blob[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']])).convert('RGB')
    pic = np.asarray(img).astype(np.float32)
    h, w = pic.shape[:2]

    # where on the model each pixel of the picture sits
    seen, where = raster(uv[tri] * [w, h], pos[tri].astype(np.float32), (w, h))
    X, Y, Z = where[..., 0], where[..., 1], where[..., 2]
    head = pos[pos[:, 1] > 0.6]
    front = Z > head[:, 2].max() - 0.07  # the front of the face, not the back of the head

    # a straight-on view of the face, to find the brows by colour and to show before/after
    fx0, fx1, fy0, fy1 = touch['face']
    per_m = 3000
    fw, fh = int((fx1 - fx0) * per_m), int((fy1 - fy0) * per_m)

    def face_view(p):
        corners = np.stack([(pos[tri][..., 0] - fx0) * per_m, (fy1 - pos[tri][..., 1]) * per_m], -1)
        near = ((pos[tri][..., 1] > fy0 - 0.05) & (pos[tri][..., 2] > 0)).any(1)
        hit, at = raster(corners[near], uv[tri][near].astype(np.float32), (fw, fh), pos[tri][near][..., 2])
        view = p[np.clip((at[..., 1] * h).astype(int), 0, h - 1), np.clip((at[..., 0] * w).astype(int), 0, w - 1)]
        return view * hit[..., None]

    before = face_view(pic)
    luma = pic @ [0.3, 0.59, 0.11]
    out = pic.copy()

    if 'skin' in touch:
        r, g, b = pic[..., 0], pic[..., 1], pic[..., 2]
        # soft edges, so shading painted into the picture doesn't turn into patches
        skin = np.clip((r - b - 35) / 30, 0, 1) * np.clip((luma - 90) / 30, 0, 1) * (r > g) * (g > b)
        out = out * (1 - skin[..., None]) + out * np.array(touch['skin']) * skin[..., None]

    if 'brows' in touch:
        bx0, bx1, by0, by1 = touch['brows']['box']
        view_l = before @ [0.3, 0.59, 0.11]
        col_x = lambda x: ((x - fx0) * per_m).astype(int)
        row_y = lambda y: ((fy1 - y) * per_m).astype(int)
        r0, r1, c0, c1 = int((fy1 - by1) * per_m), int((fy1 - by0) * per_m), int((bx0 - fx0) * per_m), int((bx1 - fx0) * per_m)
        brow = np.zeros(view_l.shape, bool)
        brow[r0:r1, c0:c1] = view_l[r0:r1, c0:c1] < 150
        # hair that runs in past the box's edge is not brow: follow it in from the edges
        hair = brow & ~grow(np.pad(np.ones((r1 - r0 - 2, c1 - c0 - 2), bool), ((r0 + 1, fh - r1 + 1), (c0 + 1, fw - c1 + 1))), 0)
        for _ in range(80):
            hair = grow(hair, 1) & brow
        brow &= ~hair
        brow = ~grow(~grow(brow, 2), 2)  # close small light gaps inside the brow
        top, bottom = (int(round(t * per_m)) for t in touch['brows']['thin'])
        kept = brow.copy()
        for d in range(1, top + 1):
            kept &= np.roll(brow, d, 0)  # pixel d rows above is brow too: drop the top rows
        for d in range(1, bottom + 1):
            kept &= np.roll(brow, -d, 0)
        # the soft edge the old, thicker brow left behind goes too
        cut = brow & ~kept
        near = grow(cut, 3)
        near[:r0] = near[r1:] = False
        brow |= near & (view_l < 178)
        forehead = before[max(0, r0 - 30):r0 - 8, c0:c1].reshape(-1, 3)
        skin_col = np.median(forehead[(forehead @ [0.3, 0.59, 0.11]) > 120], 0) * touch.get('skin', (1, 1, 1))
        inbox = seen & front & (X > bx0) & (X < bx1) & (Y > by0 - 0.004) & (Y < by1 + 0.004)
        rr, cc = np.clip(row_y(Y[inbox]), 0, fh - 1), np.clip(col_x(X[inbox]), 0, fw - 1)
        # a soft edge: how much of the kept brow covers each spot, over a few pixels
        soft = box_sum(kept.astype(np.float32), 1) / 9
        was, how = brow[rr, cc], soft[rr, cc]
        idx = np.argwhere(inbox)[was]
        how = how[was][:, None]
        colour, mix = touch['brows']['tint']
        darker = out[idx[:, 0], idx[:, 1]] * (1 - mix) + np.array(colour) * mix
        out[idx[:, 0], idx[:, 1]] = skin_col * (1 - how) + darker * how

    if 'bindi' in touch:
        cx, cy = touch['bindi']['at']
        rad = touch['bindi']['radius']
        d = np.hypot(X - cx, Y - cy)
        a = np.clip((rad - d) / (rad * 0.25) + 0.5, 0, 1) * (seen & front)
        out = out * (1 - a[..., None]) + np.array(touch['bindi']['colour']) * a[..., None]

    new_parts = {}
    if 'flecks' in touch:
        new_parts = paint_flecks_dark(doc, blob, prim, pos, uv, tri, luma, touch)

    out = np.clip(out, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(out).save(buf, 'JPEG', quality=90)
    data = buf.getvalue()

    # put the new picture back in place of the old one
    views, chunks, at = [], [], 0
    for i, v in enumerate(doc['bufferViews']):
        part = data if i == view_i else new_parts.get(i, blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        pad = -at % 4
        chunks.append(b'\0' * pad)
        at += pad
        views.append({**v, 'byteOffset': at, 'byteLength': len(part)})
        chunks.append(part)
        at += len(part)
    doc['bufferViews'] = views
    doc['buffers'][0]['byteLength'] = at
    path.write_bytes(write_glb(doc, b''.join(chunks)))
    print(f'{path}: {path.stat().st_size // 1024} KB')

    if args.sheet:
        after = face_view(out.astype(np.float32))
        sheet = np.concatenate([before, np.full((fh, 12, 3), 255), after], 1).clip(0, 255).astype(np.uint8)
        Image.fromarray(sheet).save(args.sheet)


if __name__ == '__main__':
    main()
