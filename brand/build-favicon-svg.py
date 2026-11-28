#!/usr/bin/env python3
"""Emit brand/favicon.svg -- a self-contained wrapper around the derived mark.

The source mark is a custom multi-wedge glyph on a blue->cyan gradient tile.
Tracing it as hand-authored <path> data would be redrawing the logo, so the
SVG wraps the *exact* raster derivative instead: one squared gradient tile
plus a base64-embedded PNG of the glyph. Every surface that consumes
favicon.svg gets byte-identical artwork and no vector drift.

Run: python3 brand/build-favicon-svg.py
"""
from __future__ import annotations

import base64
import io
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "source", "Lazynext_Brand_Logo.jpg")
OUT = os.path.join(ROOT, "brand", "favicon.svg")

# 96px is plenty: favicons render at 16-64px. Full-bleed crop (the mark's own
# gradient tile IS the icon ground, which is why the square lawn reads clean).
mark = Image.open(SRC).convert("RGB")
crop = int(mark.size[0] * 0.86)
left = (mark.size[0] - crop) // 2
mark = mark.crop((left, left, left + crop, left + crop)).resize((96, 96), Image.LANCZOS)

buf = io.BytesIO()
mark.save(buf, "PNG", optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode("ascii")

svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="Lazynext">'
    "<title>Lazynext</title>"
    # Blue -> cyan sweep sampled from the source mark; also the fallback fill
    # for renderers that ignore the embedded raster.
    '<defs><linearGradient id="lz" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#0468F8"/><stop offset="1" stop-color="#04B4FC"/>'
    "</linearGradient></defs>"
    '<rect width="96" height="96" rx="21" fill="url(#lz)"/>'
    f'<image width="96" height="96" href="data:image/png;base64,{b64}"/>'
    "</svg>\n"
)

with open(OUT, "w", encoding="ascii") as fh:
    fh.write(svg)
print(f"favicon.svg: {os.path.getsize(OUT):,} bytes ({len(b64):,} base64 chars)")
