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
# The first three are drawn for everyone; the rest fall back to the nearest face in the game (src/ui/portraits.ts).
EXPRESSIONS = ['neutral', 'suspicious', 'caught-lying', 'nervous', 'angry', 'smug', 'scared']

# file name in assets -> cast id in the case file. The player detective is not a cast member and is not shown in
# dialogue yet; their source art (set-4 sheet, set-5 faces) needs its own crop when it is.
CAST = {
    'dr-lin-abara': 'lin', 'nevethitha-rajan': 'nevethitha', 'kane-hollis': 'kane', 'kavya-narayanan': 'kavya',
    'officer-cole': 'cole', 'meena-selvi': 'meena', 'sgt-dex-okafor': 'dex', 'silas-crane': 'crane',
    'tip-callahan': 'tip', 'vex-lorne': 'vex', 'thenmozhi-selvam': 'thenmozhi',
    'captain-karunakaran-velu': 'karunakaran', 'ilango-thangaraj': 'ilango',
    'franklin-mano': 'mano',
}

# Where to look, first match wins. Set 2 has the complete Meena set; set 1 has Cole's neutral and caught-lying.
# Set 5 has the four newer faces for everyone and all seven for Thenmozhi and Karunakaran.
SOURCES = {
    'crime': ['assets/portraits/set-2', 'assets/portraits/set-1', 'assets/portraits/set-3', 'assets/portraits/set-5'],
    'friendly': ['assets/junior/portraits'],
}
PREFER = {('crime', 'officer-cole'): ['assets/portraits/set-1', 'assets/portraits/set-2', 'assets/portraits/set-5']}


# Kavya's Junior look is a full-body student shot (1024x1536), so her face is cropped from the top of it.
FULL_BODY = {('friendly', 'kavya-narayanan')}


def face(src: Path, full_body: bool = False) -> Image.Image:
    im = Image.open(src).convert('RGB')
    w, h = im.size
    if full_body:
        return im.crop((250, 0, 750, 500)).resize((SIZE, SIZE), Image.LANCZOS)
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
                    face(src, (tone, name) in FULL_BODY).save(OUT / tone / f'{cast}-{expr}.webp', 'WEBP', quality=80, method=6)
                    break
