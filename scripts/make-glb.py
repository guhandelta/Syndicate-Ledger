#!/usr/bin/env python3
"""
Prepares a 3D model made in an image-to-3D tool (a .glb with its colour picture) for the town.

    python3 scripts/make-glb.py <model.glb> <cast id> [--ratio 0.012] [--tex 1024]

It cuts the model down to a few thousand triangles with gltfpack (fetched by npx, nothing is installed),
shrinks the pictures and drops the ones the game does not use, and writes src/town/cast3d/<cast id>.glb.
The skeleton is added when the game loads the model (src/town/glbFigure.ts), so a model with no skeleton is fine.
"""
import argparse
import io
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'src' / 'town' / 'cast3d'


def read_glb(data: bytes):
    magic, _, _ = struct.unpack('<4sII', data[:12])
    if magic != b'glTF':
        sys.exit('not a .glb file')
    jl, _ = struct.unpack('<II', data[12:20])
    doc = json.loads(data[20:20 + jl])
    off = 20 + jl
    bl, _ = struct.unpack('<II', data[off:off + 8])
    return doc, data[off + 8:off + 8 + bl]


def write_glb(doc, blob: bytes) -> bytes:
    j = json.dumps(doc, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    blob += b'\0' * (-len(blob) % 4)
    total = 12 + 8 + len(j) + 8 + len(blob)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(blob), 0x004E4942) + blob


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('cast')
    ap.add_argument('--ratio', type=float, default=0.012, help='share of triangles to keep')
    ap.add_argument('--tex', type=int, default=1024, help='picture size in pixels')
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        small = Path(tmp) / 'small.glb'
        subprocess.run(['npx', '--yes', 'gltfpack@1.3.0', '-i', args.model, '-o', str(small), '-si', str(args.ratio), '-se', '0.05', '-slb', '-noq'], check=True)
        doc, blob = read_glb(small.read_bytes())

    # keep the colour and normal pictures; the shine picture is not used
    material = doc['materials'][0]
    keep = {}
    nt = material.get('normalTexture')
    bt = material['pbrMetallicRoughness'].get('baseColorTexture')
    material['pbrMetallicRoughness'].pop('metallicRoughnessTexture', None)
    material['pbrMetallicRoughness']['metallicFactor'] = 0
    material['pbrMetallicRoughness']['roughnessFactor'] = 1
    for tex in (bt, nt):
        if tex:
            keep[tex['index']] = True

    pieces = []  # (bytes) for each buffer view in order
    views = doc['bufferViews']
    image_views = {im['bufferView']: i for i, im in enumerate(doc['images']) if 'bufferView' in im}
    new_views = []
    chunks = []
    pos = 0
    for i, bv in enumerate(views):
        data = blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        if i in image_views:
            img = Image.open(io.BytesIO(data)).convert('RGB')
            img.thumbnail((args.tex, args.tex))
            out = io.BytesIO()
            img.save(out, 'JPEG', quality=86)
            data = out.getvalue()
        pad = -pos % 4
        chunks.append(b'\0' * pad)
        pos += pad
        nv = dict(bv)
        nv['byteOffset'] = pos
        nv['byteLength'] = len(data)
        new_views.append(nv)
        chunks.append(data)
        pos += len(data)
    doc['bufferViews'] = new_views
    doc['buffers'][0]['byteLength'] = pos
    out_blob = b''.join(chunks)

    # drop the unused picture by pointing every texture at the ones kept (the loader only reads those that materials use)
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f'{args.cast}.glb'
    dest.write_bytes(write_glb(doc, out_blob))
    tris = 0
    for m in doc['meshes']:
        for p in m['primitives']:
            tris += doc['accessors'][p['indices']]['count'] // 3
    print(f'{dest}: {tris} triangles, {dest.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
