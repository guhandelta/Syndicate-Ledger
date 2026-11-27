#!/usr/bin/env python3
"""
Cuts Guha's shop front pictures (assets/shops/<shop>.webp) into the pieces the 3D town lays on its shop buildings.

For each shop it writes src/town/shops/<trade>.json (the size of the front, its colours and where each piece sits, in
metres on the front wall) and one small .webp per piece (sign, door, windows, the stall's shelves and so on).
The walls, roof, awning, posts and the things standing in front of the shop are built in 3D by the game; only the
flat details of the front come from the picture. The grey studio background is cut away from hanging signs.

    python3 scripts/make-shop-art.py              # every shop
    python3 scripts/make-shop-art.py tea nets     # some of them
    python3 scripts/make-shop-art.py --sheet check.png   # also draw the cut boxes over the pictures, to check them

A new picture for a shop: drop it in assets/shops with the same name and re-run. If the layout moved, fix the boxes
below (pixels of the 1536 x 1024 picture: left, top, right, bottom).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'shops'
OUT = ROOT / 'src' / 'town' / 'shops'

# wall: the left and right edge of the front wall in pixels; ground: the pixel row the wall stands on; eave: the row
# under the roof. width: how wide the building is in the town (metres); the picture is scaled to fit it.
# sample: plain spots to read colours from. pieces: (id, box, mode) where mode is
#   hard  - a framed thing (door, window, board), cut square
#   soft  - something hung on the wall (nets, fish, dried flowers), its edge fades into the wall
#   cut   - a hanging sign: the grey background around it is cut away
# glow: windows that light up at dusk.
SHOPS = {
    'tea': {
        'file': 'tea-stall', 'wall': (255, 1395), 'ground': 945, 'eave': 232, 'width': 5.0,
        'sample': {'wall': (1320, 440), 'roof': (700, 130), 'trim': (1360, 700), 'awning': (520, 330), 'stone': (250, 900)},
        'roof': 'gable', 'rise': 0.75,
        'awnings': [((268, 280, 1000, 410), 'awning')],
        'pieces': [
            ('sign', (60, 280, 250, 495), 'cut'),
            ('stall', (368, 400, 905, 648), 'hard'),
            ('window', (1062, 302, 1305, 572), 'hard'),
            ('waves', (285, 655, 1345, 735), 'soft'),
        ],
        'glow': ['stall', 'window'],
    },
    'cycle': {
        'file': 'cycle-repair', 'wall': (75, 1450), 'ground': 905, 'eave': 268, 'width': 7.5,
        'sample': {'wall': (560, 600), 'roof': (900, 180), 'trim': (690, 600), 'awning': (1050, 380), 'stone': (110, 850)},
        'roof': 'gable', 'rise': 0.8,
        'chimney': (205, 30, 270, 150),
        'awnings': [((676, 338, 1436, 450), 'awning')],
        'pieces': [
            ('sign', (480, 355, 640, 570), 'cut'),
            ('bay', (700, 452, 1390, 900), 'hard'),
            ('window', (188, 278, 420, 470), 'hard'),
            ('door', (160, 490, 415, 892), 'hard'),
        ],
        'glow': ['window', 'bay'],
    },
    'fish': {
        'file': 'fish-hall', 'wall': (75, 1460), 'ground': 950, 'eave': 190, 'width': 7.5,
        'sample': {'wall': (470, 620), 'roof': (400, 200), 'trim': (100, 700), 'awning': (700, 420), 'stone': (470, 850)},
        'roof': 'flat', 'rise': 0.3,
        'chimney': (160, 55, 290, 190),
        'awnings': [((65, 335, 1470, 500), 'awning')],
        'pieces': [
            ('sign', (575, 145, 980, 340), 'cut'),
            ('window', (208, 515, 446, 735), 'hard'),
            ('window2', (1102, 515, 1350, 735), 'hard'),
            ('door', (503, 500, 787, 900), 'hard'),
            ('fish', (812, 515, 1085, 712), 'soft'),
        ],
        'glow': ['window', 'window2'],
    },
    'flower': {
        'file': 'flower-shop', 'wall': (95, 1395), 'ground': 945, 'eave': 285, 'width': 6.5,
        'sample': {'wall': (1240, 360), 'roof': (700, 170), 'trim': (980, 600), 'awning': (500, 330), 'stone': (130, 900)},
        'roof': 'gable', 'rise': 0.8,
        'chimney': (170, 22, 290, 160),
        'awnings': [((120, 285, 990, 445), 'awning')],
        'pieces': [
            ('sign', (1335, 335, 1512, 530), 'cut'),
            ('window', (195, 440, 580, 750), 'hard'),
            ('bunches', (590, 462, 905, 640), 'soft'),
            ('door', (1012, 432, 1242, 882), 'hard'),
        ],
        'glow': ['window'],
    },
    'harbor': {
        'file': 'harbor-office', 'wall': (60, 1470), 'ground': 945, 'eave': 378, 'width': 7.5,
        'sample': {'wall': (470, 700), 'roof': (700, 260), 'trim': (90, 600), 'awning': (700, 440), 'stone': (1000, 900)},
        'roof': 'gable', 'rise': 1.0,
        'chimney': (160, 85, 290, 225),
        'awnings': [((515, 388, 885, 505), 'awning')],
        'pieces': [
            ('sign', (360, 445, 506, 592), 'cut'),
            ('board', (893, 505, 1200, 770), 'hard'),
            ('window', (143, 488, 342, 752), 'hard'),
            ('window2', (1214, 488, 1402, 752), 'hard'),
            ('door', (558, 505, 842, 880), 'hard'),
        ],
        'glow': ['window', 'window2'],
    },
    'nets': {
        'file': 'net-loft', 'wall': (60, 1345), 'ground': 925, 'eave': 382, 'width': 7.5,
        'sample': {'wall': (1250, 790), 'roof': (700, 250), 'trim': (75, 600), 'awning': (600, 420), 'stone': (200, 860)},
        'roof': 'gable', 'rise': 1.0,
        'chimney': (150, 60, 275, 235),
        'awnings': [((225, 382, 968, 480), 'awning')],
        'pieces': [
            ('sign', (1355, 355, 1512, 552), 'cut'),
            ('nets', (290, 505, 880, 702), 'soft'),
            ('window', (118, 505, 277, 707), 'hard'),
            ('window2', (1180, 505, 1338, 707), 'hard'),
            ('door', (948, 472, 1172, 872), 'hard'),
        ],
        'glow': ['window', 'window2'],
    },
    'tailor': {
        'file': 'tailor', 'wall': (65, 1330), 'ground': 945, 'eave': 300, 'width': 6.5,
        'sample': {'wall': (1100, 770), 'roof': (700, 200), 'trim': (370, 600), 'awning': (900, 400), 'stone': (200, 900)},
        'roof': 'gable', 'rise': 0.9,
        'chimney': (115, 40, 240, 185),
        'awnings': [((680, 355, 1290, 498), 'awning')],
        'pieces': [
            ('sign', (1340, 300, 1512, 555), 'cut'),
            ('display', (690, 460, 1255, 735), 'hard'),
            ('window', (158, 442, 342, 705), 'hard'),
            ('door', (422, 412, 672, 895), 'hard'),
        ],
        'glow': ['display', 'window'],
    },
}

# longest side of a cut piece, in pixels: enough for a sign read up close, small enough to keep the game file light
MAX_SIDE = 256


def colour(img: np.ndarray, at) -> str:
    x, y = at
    patch = img[y - 6:y + 7, x - 6:x + 7].reshape(-1, 3)
    r, g, b = np.median(patch, axis=0).astype(int)
    return f'#{r:02x}{g:02x}{b:02x}'


def cut_background(piece: Image.Image, bg) -> Image.Image:
    """Clears the flat grey studio background that touches the edge of a hanging sign's box."""
    a = np.asarray(piece.convert('RGB')).astype(int)
    far = np.abs(a - np.array(bg)).sum(axis=2) > 24
    # flood from the border through background-coloured pixels only
    h, w = far.shape
    seen = np.zeros_like(far)
    stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or far[y, x]:
            continue
        seen[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = piece.convert('RGBA')
    out.putalpha(alpha)
    return out


def soften(piece: Image.Image) -> Image.Image:
    """Fades the edge of a piece hung on the wall, so it melts into the wall colour behind it."""
    w, h = piece.size
    edge = max(4, min(w, h) // 7)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rectangle((edge, edge, w - edge - 1, h - edge - 1), fill=255)
    out = piece.convert('RGBA')
    out.putalpha(mask.filter(ImageFilter.GaussianBlur(edge / 2)))
    return out


def make(trade: str, spec: dict, sheet: list):
    img_pil = Image.open(SRC / f"{spec['file']}.webp").convert('RGB')
    img = np.asarray(img_pil)
    left, right = spec['wall']
    ppm = (right - left) / spec['width']
    mid = (left + right) / 2
    ground = spec['ground']
    # a box in pixels as metres on the front wall: the middle of its bottom edge, then its size
    to_m = lambda box: {
        'x': round((((box[0] + box[2]) / 2) - mid) / ppm, 3),
        'y': round((ground - box[3]) / ppm, 3),
        'w': round((box[2] - box[0]) / ppm, 3),
        'h': round((box[3] - box[1]) / ppm, 3),
    }
    bg = tuple(int(v) for v in np.median(img[2:12, 2:12].reshape(-1, 3), axis=0))
    pieces = []
    for pid, box, mode in spec['pieces']:
        piece = img_pil.crop(box)
        scale = min(1, MAX_SIDE / max(piece.size))
        if mode == 'cut':
            piece = cut_background(piece, bg)
        elif mode == 'soft':
            piece = soften(piece)
        piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
        piece.save(OUT / f'{trade}-{pid}.webp', quality=82, method=6)
        pieces.append({'id': pid, **to_m(box), 'mode': mode, 'glow': pid in spec.get('glow', [])})
    colours = {k: colour(img, at) for k, at in spec['sample'].items()}
    facts = {
        'trade': trade,
        'picture': f"assets/shops/{spec['file']}.webp",
        'width': spec['width'],
        'height': round((ground - spec['eave']) / ppm, 2),
        'roof': spec['roof'],
        'rise': spec['rise'],
        'colours': colours,
        'awnings': [to_m(box) | {'colour': colours[c]} for box, c in spec['awnings']],
        'pieces': pieces,
    }
    if 'chimney' in spec:
        facts['chimney'] = to_m(spec['chimney'])
    (OUT / f'{trade}.json').write_text(json.dumps(facts, indent=2) + '\n')
    if sheet is not None:
        shown = img_pil.copy()
        d = ImageDraw.Draw(shown)
        for _, box, mode in spec['pieces']:
            d.rectangle(box, outline={'hard': (255, 0, 0), 'soft': (0, 160, 255), 'cut': (0, 200, 0)}[mode], width=5)
        for box, _ in spec['awnings']:
            d.rectangle(box, outline=(255, 0, 255), width=4)
        d.line((left, ground, right, ground), fill=(255, 255, 0), width=4)
        d.line((left, spec['eave'], right, spec['eave']), fill=(255, 255, 0), width=4)
        for at in spec['sample'].values():
            d.ellipse((at[0] - 9, at[1] - 9, at[0] + 9, at[1] + 9), outline=(0, 0, 0), width=4)
        sheet.append(shown.resize((768, 512)))
    print(f'{trade}: {len(pieces)} pieces, {facts["height"]} m tall, colours {colours}')


def main(argv):
    sheet_path = None
    if '--sheet' in argv:
        i = argv.index('--sheet')
        sheet_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    wanted = argv or list(SHOPS)
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = [] if sheet_path else None
    for trade in wanted:
        make(trade, SHOPS[trade], sheet)
    if sheet:
        cols = 2
        rows = (len(sheet) + 1) // cols
        out = Image.new('RGB', (768 * cols, 512 * rows), (40, 40, 40))
        for i, im in enumerate(sheet):
            out.paste(im, ((i % cols) * 768, (i // cols) * 512))
        out.save(sheet_path)


if __name__ == '__main__':
    main(sys.argv[1:])
