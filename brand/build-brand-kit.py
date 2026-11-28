#!/usr/bin/env python3
"""Build the Lazynext brand asset kit from brand/source/Lazynext_Brand_Logo.jpg.

Mechanical derivation only -- the mark is never redrawn. The source JPEG is
opaque (hasAlpha: no), so icons composite it inside a rounded light tile
(--tile #FCFCFC) and the OG card sits that tile on the dark brand ground.

sips handles the plain downsample (recorded in brand/README.md); this script
does the two things sips cannot: rounded-corner compositing and text layout.

Run from the repo root:
    python3 brand/build-brand-kit.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "source", "Lazynext_Brand_Logo.jpg")
OUT = os.path.join(ROOT, "brand")

TILE = (252, 252, 252)   # near-white tile ground
GROUND = (10, 10, 11)    # dark brand ground


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Avenir Next where available (geometric, close to the wordmark), else Helvetica."""
    candidates = [
        ("/System/Library/Fonts/Avenir Next.ttc", 2 if bold else 0),
        ("/System/Library/Fonts/Helvetica.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
    ]
    for path, index in candidates:
        if not os.path.exists(path):
            continue
        for kwargs in ({"index": index}, {}):
            try:
                return ImageFont.truetype(path, size, **kwargs)
            except Exception:
                continue
    return ImageFont.load_default()


def rounded_tile(size: int, radius: float, inset: float) -> Image.Image:
    """Square RGBA canvas with a rounded light tile centred inside it.

    `inset` is the transparent margin as a fraction of the canvas, which keeps
    a maskable icon inside the 40% safe-zone crop.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(round(size * inset))
    ImageDraw.Draw(canvas).rounded_rectangle(
        (pad, pad, size - pad - 1, size - pad - 1),
        radius=int(round(size * radius)),
        fill=TILE + (255,),
    )
    return canvas


def paste_mark(tile: Image.Image, mark_frac: float, inset: float) -> Image.Image:
    """Scale a centre crop of the source into the middle of `tile`."""
    size = tile.size[0]
    inner = size * (1 - 2 * inset)
    target = max(1, int(round(inner * mark_frac)))

    mark = Image.open(SRC).convert("RGB")
    crop = int(mark.size[0] * 0.86)          # drop the outer bleed of the tile
    left = (mark.size[0] - crop) // 2
    mark = mark.crop((left, left, left + crop, left + crop))
    mark = mark.resize((target, target), Image.LANCZOS).convert("RGBA")

    mask = Image.new("L", (target, target), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, target - 1, target - 1), radius=int(target * 0.22), fill=255
    )
    offset = (size - target) // 2
    tile.paste(mark, (offset, offset), mask)
    return tile


def build_icon(size: int, inset: float, radius: float, mark_frac: float) -> Image.Image:
    return paste_mark(rounded_tile(size, radius, inset), mark_frac, inset)


def build_maskable(size: int = 512) -> Image.Image:
    """Opaque full-bleed tile with the mark inside the 80% maskable safe zone.

    Android crops maskable icons to an arbitrary shape, so the art must not
    rely on the icon's own corners: the ground fills the whole canvas and the
    logo sits within the central 66% (inside the 80% safe circle).
    """
    canvas = Image.new("RGBA", (size, size), TILE + (255,))
    return paste_mark(canvas, 0.66, 0.0)


def build_og() -> Image.Image:
    w, h = 1200, 630
    card = Image.new("RGB", (w, h), GROUND)
    draw = ImageDraw.Draw(card)

    # Brand rule along the top edge: the blue -> cyan sweep of the mark.
    for x in range(w):
        t = x / (w - 1)
        draw.line(
            [(x, 0), (x, 5)],
            fill=(4, int(round(104 + (180 - 104) * t)), int(round(248 + (252 - 248) * t))),
        )

    tile = build_icon(260, 0.0, 0.22, 0.84)
    card.paste(tile, (80, 80), tile)

    draw.text((80, 378), "AI SLOP CHECKER", font=font(26, True), fill=(4, 180, 252))
    draw.text((80, 416), "Lazynext", font=font(72, True), fill=(250, 250, 250))
    draw.text(
        (80, 536),
        "Deterministic detection of AI writing tells and AI-default design.",
        font=font(27, False),
        fill=(156, 156, 170),
    )
    return card


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    jobs = [
        ("icon-192.png", lambda: build_icon(192, 0.055, 0.20, 0.80)),
        ("icon-512.png", lambda: build_icon(512, 0.055, 0.20, 0.80)),
        ("maskable-512.png", lambda: build_maskable(512)),
        ("apple-touch-icon.png", lambda: build_icon(180, 0.0, 0.0, 0.80)),
        ("favicon.png", lambda: build_icon(128, 0.0, 0.22, 0.82)),
    ]
    for name, fn in jobs:
        img = fn()
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print(f"{name}: {img.size[0]}x{img.size[1]} {os.path.getsize(path):,} bytes")

    og = build_og()
    og_path = os.path.join(OUT, "og-1200x630.png")
    og.save(og_path, "PNG", optimize=True)
    print(f"og-1200x630.png: {og.size[0]}x{og.size[1]} {os.path.getsize(og_path):,} bytes")


if __name__ == "__main__":
    main()
