"""
Crops the head-and-shoulders portraits in assets/ to small square face shots for the dialogue bubbles.
Writes src/ui/portraits/<tone>/<cast-id>-<expression>.webp, which the game bundles.
Usage: python3 scripts/make-portraits.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/ui/portraits'
SIZE = 160
EXPRESSIONS = ['neutral', 'suspicious', 'caught-lying']

# file name in assets -> cast id in the case file
CAST = {
    'dr-lin-abara': 'lin', 'juno-park': 'juno', 'kane-hollis': 'kane', 'mara-quill': 'mara',
    'officer-cole': 'cole', 'rosa-diaz': 'rosa', 'sgt-dex-okafor': 'dex', 'silas-crane': 'crane',
    'tip-callahan': 'tip', 'vex-lorne': 'vex',
}

# Where to look, first match wins. Set 2 has the complete Rosa set; set 1 has Cole's neutral and caught-lying.
SOURCES = {
    'crime': ['assets/portraits/set-2', 'assets/portraits/set-1', 'assets/portraits/set-3'],
    'friendly': ['assets/junior/portraits'],
}
PREFER = {('crime', 'officer-cole'): ['assets/portraits/set-1', 'assets/portraits/set-2']}


def face(src: Path) -> Image.Image:
    im = Image.open(src).convert('RGB')
    w, h = im.size
    side = int(min(w, h) * 0.66)
    x = (w - side) // 2
    return im.crop((x, 0, x + side, side)).resize((SIZE, SIZE), Image.LANCZOS)


for tone, dirs in SOURCES.items():
    (OUT / tone).mkdir(parents=True, exist_ok=True)
    for name, cast in CAST.items():
        for expr in EXPRESSIONS:
            for d in PREFER.get((tone, name), dirs):
                src = ROOT / d / f'{name}-{expr}.png'
                if src.exists():
                    face(src).save(OUT / tone / f'{cast}-{expr}.webp', 'WEBP', quality=80, method=6)
                    break
