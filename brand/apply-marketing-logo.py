#!/usr/bin/env python3
"""Put the real brand mark in the marketing header and keep JSON-LD valid.

The old header used a typed \u25c6 glyph as the logo. It is replaced with the
derived mark (favicon.svg, same artwork as the icons) plus a small CSS rule so
the lockup stays optically aligned with the wordmark.
"""
from __future__ import annotations

import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "marketing", "public")

MARK_IMG = '<img class="logo-mark" src="/favicon.svg" alt="" width="26" height="26"/> '

LOGO_RE = re.compile(r'<a class="logo" href="/">\s*<span[^>]*>\u25c6</span>\s*Lazynext</a>')

OLD_CSS = ".logo{font-size:22px;font-weight:700}\n.logo span{color:var(--accentSoft)}"
NEW_CSS = (
    ".logo{font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:9px}\n"
    ".logo-mark{width:26px;height:26px;border-radius:7px;display:block}"
)


def main() -> None:
    files = sorted(
        glob.glob(os.path.join(PUBLIC, "*.html"))
        + glob.glob(os.path.join(PUBLIC, "blog", "*", "index.html"))
    )
    for path in files:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        out = LOGO_RE.sub(f'<a class="logo" href="/">{MARK_IMG}Lazynext</a>', src)
        if out != src:
            out = out.replace(OLD_CSS, NEW_CSS)
        if out != src:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(out)
            print(f"logo updated {os.path.relpath(path, ROOT)}")
        else:
            print(f"logo unchanged {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
