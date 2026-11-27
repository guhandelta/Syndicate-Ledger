#!/usr/bin/env python3
"""
Cuts Guha's shop sheets (assets/shops/<trade>.webp) into the pictures the 3D town wraps round its shop buildings.

Each sheet shows one shop from four sides on a transparent background: the front (top left), the east side (top right,
the front on its left), the back (bottom left) and the west side (bottom right, the front on its right). For each shop
this writes src/town/shops/<trade>.json (its size in metres, roof, colours and where the door, awning, sign and
chimney are) and these pictures:

    <trade>-front / -east / -back / -west   each wall, from the ground up to its roof line, cut round its outline
    <trade>-roof-front / -roof-back         a pitched roof's two slopes, as the sheet draws them (gable roofs only)
    <trade>-awning                          the awning over the front, which the town builds sloping out
    <trade>-sign                            the hanging sign, which swings out from the wall on an arm

    python3 scripts/make-shop-art.py              # every shop
    python3 scripts/make-shop-art.py tea nets     # some of them
    python3 scripts/make-shop-art.py --sheet check.png   # also draw the cut lines over the sheets, to check them

A new sheet for a shop: drop it in assets/shops with the same name and re-run. If the drawing moved, fix the numbers
below (pixels of the sheet).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'shops'
OUT = ROOT / 'src' / 'town' / 'shops'

# Metres per pixel of the sheets: a door on the sheets is about 280 px tall, so 2.5 m.
SCALE = 0.009

# Each view: (left, right, ground, top), where left/right are the wall's outer columns at the stone foot, ground is the
# row the wall stands on and top is the roof line the wall is cut along: one row for a flat top, or a list of
# (x, y) points for a sloping or gabled one. Everything above the line (chimneys, flags, roof vents) is left off the
# wall and built in 3D instead.
# roof: flat | shed | gable. A gable roof also gives roof_front/roof_back: (left, top, right, eave) boxes of the slopes.
# door: the door's left and right columns on the front. awning, sign: boxes on the front (left, top, right, bottom).
# chimney: (left, right, top) on the front and (left, right) on the east side, which says how far back it stands.
# sample: plain spots to read the wall, roof and trim colours from.
SHOPS = {
    'bikes': {
        'name': 'Bike workshop', 'roof': 'flat',
        'front': (83, 820, 466, 37), 'east': (946, 1454, 468, 37), 'back': (82, 821, 966, 540), 'west': (947, 1454, 966, 540),
        'door': (345, 592),
        'sample': {'wall': (115, 300), 'roof': (400, 45), 'trim': (400, 80)},
    },
    'flower': {
        'name': 'Flower shop', 'roof': 'gable',
        'front': (166, 759, 483, 182), 'east': (953, 1280, 483, [(953, 192), (1117, 62), (1280, 192)]),
        'back': (163, 755, 993, 690), 'west': (935, 1266, 993, [(935, 690), (1102, 565), (1266, 690)]),
        'roof_front': (150, 68, 745, 182), 'roof_back': (150, 578, 745, 690),
        'door': (375, 555), 'awning': (198, 180, 728, 250), 'sign': (760, 236, 818, 302),
        'chimney': ((205, 270, 10), (1088, 1145)),
        'sample': {'wall': (190, 350), 'roof': (450, 120), 'trim': (195, 170)},
    },
    'tailor': {
        'name': 'Tailor', 'roof': 'gable',
        'front': (111, 768, 499, 168), 'east': (975, 1361, 499, [(975, 190), (1175, 47), (1361, 190)]),
        'back': (105, 746, 995, 678), 'west': (986, 1361, 996, [(986, 690), (1175, 552), (1361, 690)]),
        'roof_front': (100, 62, 750, 168), 'roof_back': (95, 560, 760, 678),
        'door': (360, 562), 'awning': (226, 196, 706, 260), 'sign': (765, 222, 856, 300),
        'chimney': ((135, 200, 5), (1128, 1190)),
        'sample': {'wall': (1175, 130), 'roof': (400, 110), 'trim': (715, 300)},
    },
    'cycle': {
        'name': 'Cycle repair', 'roof': 'shed',
        'front': (32, 730, 580, 119), 'east': (832, 1223, 580, [(832, 103), (1223, 163)]),
        'back': (34, 741, 1183, 726), 'west': (810, 1194, 1184, [(810, 787), (1194, 705)]),
        'door': (320, 545), 'awning': (163, 218, 702, 282),
        'chimney': ((630, 690, 60), (1148, 1205)),
        'sample': {'wall': (90, 450), 'roof': (300, 150), 'trim': (45, 350)},
    },
    'tea': {
        'name': 'Tea stall', 'roof': 'shed',
        'front': (136, 827, 479, [(136, 28), (190, 28), (190, 45), (775, 45), (775, 28), (827, 28)]),
        'east': (999, 1438, 479, [(999, 28), (1062, 28), (1062, 45), (1385, 95), (1385, 78), (1438, 78)]),
        'back': (130, 829, 991, [(130, 542), (185, 542), (185, 559), (775, 559), (775, 542), (829, 542)]),
        'west': (990, 1434, 991, [(990, 590), (1045, 590), (1045, 610), (1380, 578), (1380, 542), (1434, 542)]),
        'door': (375, 598), 'awning': (172, 130, 800, 165), 'sign': (50, 175, 150, 272),
        'sample': {'wall': (160, 250), 'roof': (300, 50), 'trim': (300, 100)},
    },
    'fish': {
        'name': 'Fish hall', 'roof': 'flat',
        'front': (86, 827, 497, 108), 'east': (973, 1456, 497, 108), 'back': (86, 825, 1007, 617), 'west': (917, 1393, 1007, 617),
        'door': (362, 570), 'awning': (133, 166, 780, 226),
        'chimney': ((135, 215, 18), (1005, 1075)),
        'sample': {'wall': (200, 140), 'roof': (300, 112), 'trim': (110, 300)},
    },
    'harbor': {
        'name': 'Harbor office', 'roof': 'flat',
        'front': (120, 812, 495, 111), 'east': (988, 1444, 495, 111), 'back': (102, 814, 993, 605), 'west': (989, 1442, 993, 604),
        'door': (368, 572), 'sign': (52, 235, 128, 308),
        'chimney': ((165, 250, 38), None), 'flag': (700, 1250, 15),
        'sample': {'wall': (165, 350), 'roof': (300, 130), 'trim': (140, 220)},
    },
    'outfitter': {
        'name': 'Suit maker', 'roof': 'shed',
        'front': (106, 780, 479, [(106, 97), (780, 32)]), 'east': (957, 1437, 479, [(957, 92), (1437, 28)]),
        'back': (108, 798, 989, [(108, 547), (798, 600)]), 'west': (938, 1439, 989, [(938, 540), (1439, 600)]),
        'door': (355, 555), 'awning': (150, 153, 748, 216), 'sign': (770, 183, 848, 268),
        'chimney': ((110, 195, 14), (990, 1070)),
        'sample': {'wall': (130, 300), 'roof': (400, 70), 'trim': (200, 140)},
    },
    'nets': {
        'name': 'Net loft', 'roof': 'flat',
        'front': (52, 784, 478, 48), 'east': (979, 1483, 478, 48), 'back': (53, 794, 984, 548), 'west': (919, 1483, 984, 548),
        'door': (322, 565), 'sign': (775, 148, 842, 238),
        'sample': {'wall': (70, 300), 'roof': (300, 65), 'trim': (100, 200)},
    },
    'atelier': {
        'name': "Tailor's atelier", 'roof': 'flat',
        'front': (65, 855, 482, 24), 'east': (951, 1471, 482, 24), 'back': (64, 855, 991, 532), 'west': (951, 1471, 991, 532),
        'door': (325, 598),
        'sample': {'wall': (100, 300), 'roof': (300, 35), 'trim': (130, 250)},
    },
    'marine': {
        'name': 'Marine supplies', 'roof': 'gable',
        'front': (123, 788, 494, 190), 'east': (1004, 1355, 495, [(1004, 195), (1177, 48), (1355, 195)]),
        'back': (118, 784, 1003, 700), 'west': (997, 1357, 1003, [(997, 700), (1177, 560), (1357, 700)]),
        'roof_front': (110, 55, 790, 190), 'roof_back': (100, 563, 800, 700),
        'door': (357, 553), 'awning': (186, 203, 738, 274), 'sign': (783, 240, 850, 332),
        'chimney': ((170, 235, 15), (1148, 1210)),
        'sample': {'wall': (1215, 170), 'roof': (400, 120), 'trim': (150, 300)},
    },
}

SIDES = ['front', 'east', 'back', 'west']


def colour(rgb: np.ndarray, at) -> str:
    x, y = at
    patch = rgb[y - 5:y + 6, x - 5:x + 6].reshape(-1, 3)
    r, g, b = np.median(patch, axis=0).astype(int)
    return f'#{r:02x}{g:02x}{b:02x}'


def outline(view):
    """The roof line of a view as points from its left edge to its right."""
    left, right, _, top = view
    return [(left, top), (right, top)] if isinstance(top, int) else top


def save(img: Image.Image, name: str):
    img.save(OUT / f'{name}.webp', quality=78, method=6)


def cut(sheet: Image.Image, solid: Image.Image, box, line=None) -> Image.Image:
    """The part of the sheet in box, kept only where the drawing is solid and (given a roof line) below that line."""
    left, top, right, bottom = box
    piece = sheet.crop(box)
    mask = solid.crop(box)
    if line is not None:
        keep = Image.new('L', piece.size, 0)
        pts = [(x - left, y - top) for x, y in line] + [(right - left, bottom - top), (0, bottom - top)]
        ImageDraw.Draw(keep).polygon(pts, fill=255)
        mask = Image.fromarray(np.minimum(np.asarray(mask), np.asarray(keep)))
    piece.putalpha(mask)
    return piece


def make(trade: str, spec: dict, checks: list):
    sheet = Image.open(SRC / f'{trade}.webp').convert('RGBA')
    rgb = np.asarray(sheet.convert('RGB'))
    # the drawing is solid where the sheet is opaque; one pixel is shaved off its edge to lose any coloured fringe
    solid = sheet.getchannel('A').point(lambda a: 255 if a > 128 else 0).filter(ImageFilter.MinFilter(3))
    s = SCALE
    m = lambda px: round(px * s, 3)
    colours = {k: colour(rgb, at) for k, at in spec['sample'].items()}
    walls = {}
    for side in SIDES:
        left, right, ground, _ = spec[side]
        line = outline(spec[side])
        top = min(y for _, y in line)
        wall = solid
        if side == 'front' and 'awning' in spec:
            # the awning is built in 3D, sloping out from the wall, so it is taken off the flat front
            wall = solid.copy()
            ImageDraw.Draw(wall).rectangle(spec['awning'], fill=0)
        save(cut(sheet, wall, (left, top, right + 1, ground + 1), line), f'{trade}-{side}')
        # how high the roof line stands at the wall's two ends and at its highest
        walls[side] = {'w': m(right - left), 'h': m(ground - top), 'left': m(ground - line[0][1]), 'right': m(ground - line[-1][1])}
    fl, fr, fground, _ = spec['front']
    mid = (fl + fr) / 2
    width = m(fr - fl)
    depth = round((walls['east']['w'] + walls['west']['w']) / 2, 3)
    on_front = lambda box: {'x': m((box[0] + box[2]) / 2 - mid), 'y': m(fground - box[3]), 'w': m(box[2] - box[0]), 'h': m(box[3] - box[1])}
    facts = {
        'trade': trade,
        'name': spec['name'],
        'picture': f'assets/shops/{trade}.webp',
        'width': width,
        'depth': depth,
        'walls': walls,
        'colours': colours,
        'door': {'x': m((spec['door'][0] + spec['door'][1]) / 2 - mid), 'w': m(spec['door'][1] - spec['door'][0])},
    }
    roof = {'kind': spec['roof']}
    if spec['roof'] == 'gable':
        # the eaves are where the front wall stops; the ridge is the top of the gable on the sides
        roof['eave'] = walls['front']['h']
        roof['ridge'] = round((walls['east']['h'] + walls['west']['h']) / 2, 3)
        for slope in ('front', 'back'):
            box = spec[f'roof_{slope}']
            save(cut(sheet, solid, box), f'{trade}-roof-{slope}')
            left, right = (spec[slope][0], spec[slope][1])
            roof[slope] = {'w': m(box[2] - box[0]), 'x': m((box[0] + box[2]) / 2 - (left + right) / 2)}
    elif spec['roof'] == 'shed':
        # front and back heights from the side views (the east side has the front on its left, the west on its right)
        roof['front'] = round((walls['east']['left'] + walls['west']['right']) / 2, 3)
        roof['back'] = round((walls['east']['right'] + walls['west']['left']) / 2, 3)
    else:
        roof['height'] = round(min(w['h'] for w in walls.values()), 3)
    facts['roof'] = roof
    if 'awning' in spec:
        box = spec['awning']
        save(cut(sheet, solid, box), f'{trade}-awning')
        facts['awning'] = on_front(box)
    if 'sign' in spec:
        box = spec['sign']
        save(cut(sheet, solid, box), f'{trade}-sign')
        facts['sign'] = on_front(box)
    if 'chimney' in spec:
        (cl, cr, ctop), east = spec['chimney']
        el, er, _, _ = spec['east']
        # on the east view the front is on the left, so distance from the left edge is distance back from the front
        z = round(depth / 2 - m((east[0] + east[1]) / 2 - el), 3) if east else round(-depth / 4, 3)
        facts['chimney'] = {'x': m((cl + cr) / 2 - mid), 'z': z, 'w': m(cr - cl), 'top': m(fground - ctop), 'colour': colour(rgb, ((cl + cr) // 2, ctop + 30))}
    if 'flag' in spec:
        fx, ex, ftop = spec['flag']
        el = spec['east'][0]
        facts['flag'] = {'x': m(fx - mid), 'z': round(depth / 2 - m(ex - el), 3), 'top': m(fground - ftop)}
    (OUT / f'{trade}.json').write_text(json.dumps(facts, indent=2) + '\n')
    if checks is not None:
        shown = sheet.convert('RGB')
        d = ImageDraw.Draw(shown)
        for side in SIDES:
            left, right, ground, _ = spec[side]
            d.line(outline(spec[side]), fill=(255, 255, 0), width=4)
            d.line((left, ground, right, ground), fill=(255, 255, 0), width=4)
            d.line((left, ground, left, ground - 80), fill=(0, 255, 255), width=4)
            d.line((right, ground, right, ground - 80), fill=(0, 255, 255), width=4)
        for key, c in (('awning', (255, 0, 255)), ('sign', (0, 220, 0)), ('roof_front', (255, 128, 0)), ('roof_back', (255, 128, 0))):
            if key in spec:
                d.rectangle(spec[key], outline=c, width=4)
        d.line((spec['door'][0], fground - 10, spec['door'][1], fground - 10), fill=(255, 0, 0), width=8)
        for at in spec['sample'].values():
            d.ellipse((at[0] - 9, at[1] - 9, at[0] + 9, at[1] + 9), outline=(0, 0, 0), width=4)
        checks.append(shown.resize((768, round(768 * shown.height / shown.width))))
    print(f'{trade}: {width} x {depth} m, roof {roof}, colours {colours}')


def main(argv):
    sheet_path = None
    if '--sheet' in argv:
        i = argv.index('--sheet')
        sheet_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    wanted = argv or list(SHOPS)
    OUT.mkdir(parents=True, exist_ok=True)
    checks = [] if sheet_path else None
    for trade in wanted:
        make(trade, SHOPS[trade], checks)
    if checks:
        cols = 3
        rows = (len(checks) + cols - 1) // cols
        out = Image.new('RGB', (768 * cols, 768 * rows), (40, 40, 40))
        for i, im in enumerate(checks):
            out.paste(im, ((i % cols) * 768, (i // cols) * 768))
        out.save(sheet_path)


if __name__ == '__main__':
    main(sys.argv[1:])
