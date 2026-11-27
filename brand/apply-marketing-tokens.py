#!/usr/bin/env python3
"""Rewrite the marketing site's purple brand tokens to the Lazynext blue palette.

Scope is deliberately narrow: only brand-purple values are touched. Semantic
greens/ambers/reds (status page) are left exactly as they are.

Purple -> brand mapping (contrast-verified, see brand/README.md):
  #8B5CF6  --accent      -> #0468F8  (dark: fills/borders; 4.09:1 vs #0A0A0B)
  #A78BFA  --accentSoft  -> #04B4FC  (dark: TEXT; 8.42:1 vs #0A0A0B)
  #7C3AED  --accent      -> #0468F8
  #6D28D9  buttons/skip  -> #0468F8 with #2F6FD0 hover (white text 4.84:1)
  #5B21B6  button hover  -> #2F6FD0 (white text 4.88:1)
  #1E1B2E  --accentBg    -> #0C1A33 (deep blue tint; cyan text 7.38:1)
  #3B2A5E  --accentDim   -> #2F6FD0 (mid blue border; 4.06:1 vs #0A0A0B)
  #A78BFA fills          -> #0468F8
"""
from __future__ import annotations

import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "marketing", "public")

OLD_FAVICON = (
    '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' '
    'viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' rx=\'20\' fill=\'%238B5CF6\'/>'
    '<text x=\'50\' y=\'68\' font-size=\'52\' text-anchor=\'middle\' fill=\'white\' '
    "font-family='sans-serif'>\u25c6</text></svg>\"/>"
)

# Order matters: longest/most specific hexes first so no partial rewrites.
HEX_MAP = [
    ("#8B5CF6", "#0468F8"),   # --accent (dark) -> brand blue
    ("#A78BFA", "#04B4FC"),   # --accentSoft (dark, text) -> brand cyan
    ("#7C3AED", "#0468F8"),   # light --accent
    ("#6D28D9", "#0468F8"),   # button / skip-link fill
    ("#5B21B6", "#2F6FD0"),   # button hover
    ("#1E1B2E", "#0C1A33"),   # --accentBg deep blue tint
    ("#3B2A5E", "#2F6FD0"),   # --accentDim mid blue
    ("%238B5CF6", "%230468F8"),  # URL-encoded favicon fill
    ("%236D28D9", "%230468F8"),
    ("%23A78BFA", "%2304B4FC"),
]


def main() -> None:
    files = sorted(
        glob.glob(os.path.join(PUBLIC, "*.html"))
        + glob.glob(os.path.join(PUBLIC, "blog", "*", "index.html"))
    )
    for path in files:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        out = src

        if OLD_FAVICON in out:
            out = out.replace(
                OLD_FAVICON,
                '<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>'
                '<link rel="icon" type="image/png" sizes="128x128" href="/favicon.png"/>'
                '<link rel="apple-touch-icon" href="/favicon.png"/>',
            )
        else:
            # Fallback: the same data URI with its fill already rewritten.
            if 'rel="icon" href="data:image/svg+xml' in out:
                print(f"!! unfixed data-URI favicon remains in {path}")

        for old, new in HEX_MAP:
            out = out.replace(old, new)

        if out != src:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(out)
            print(f"updated {os.path.relpath(path, ROOT)}")
        else:
            print(f"unchanged {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
