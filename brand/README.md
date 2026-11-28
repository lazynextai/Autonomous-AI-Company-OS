# Lazynext brand asset kit

The single source of truth for the Lazynext mark across every surface:
the apex site, the dashboard, the AI Slop Checker, npm, and social cards.

## Source of truth

`brand/source/Lazynext_Brand_Logo.jpg`

| Property | Value |
|---|---|
| Dimensions | 3840 x 3840 |
| Format | JPEG (no alpha channel) |
| MD5 | `a4d04cf537355c0599f120918c6d2cc6` |
| Ground | Near-white `#FCFCFC` |

Nothing in this kit redraws, restyles, recolors, or re-typesets the mark. Every
derivative is a mechanical resample or composite of this one file.

## Palette

| Token | Value | Role |
|---|---|---|
| Blue | `#0468F8` | Fills, borders, brand anchor |
| Cyan | `#04B4FC` | Text accents on dark ground |
| Ground | `#FCFCFC` | The mark's own background |

### Contrast rules (WCAG 2.x)

The mark's blue is a **fill color, not a text color** on our dark ground. These
ratios were computed from the shipped values and are the reason the role split
below is not optional:

| Pair | Ratio | Allowed use |
|---|---|---|
| `#0468F8` on `#0A0A0B` | 4.09:1 | fills, borders, large text only |
| `#04B4FC` on `#0A0A0B` | 8.42:1 | body and UI text accents |
| `#04B4FC` on `#0B2038` | 7.00:1 | text on the accent tint |
| `#2563EB` on `#0A0A0B` | 3.83:1 | border only (3:1 non-text floor) |
| `#0356D0` on `#FAFAFA` | 6.20:1 | accent text, light theme |
| `#0468F8` on `#FAFAFA` | 4.64:1 | accent text, light theme |

Token names in `dashboard/app/globals.css` and `marketing/public/index.html`
are unchanged (`--accent`, `--accentSoft`, `--accentDim`, `--accentBg`); only
their values move to the brand scale. That keeps every existing consumer
working while the palette changes underneath it.

## Derivatives

| File | Size | Dimensions | Use |
|---|---|---|---|
| `icon-192.png` | 17.9 KB | 192x192 | PWA icon, dashboard |
| `icon-512.png` | 101 KB | 512x512 | PWA icon, dashboard |
| `maskable-512.png` | 88.3 KB | 512x512 | PWA maskable (safe-zone padded) |
| `apple-touch-icon.png` | 19.0 KB | 180x180 | iOS home screen |
| `favicon.png` | 11.6 KB | 128x128 | Browser tab |
| `favicon.svg` | 12.8 KB | vector | Browser tab, crisp at any size |
| `og-1200x630.png` | 58.1 KB | 1200x630 | Social/link preview card |

Every surface image is under 200 KB and the card is under 400 KB. The previous
state served the raw **3,260,531-byte** JPEG to browsers.

## Regenerating

The kit is reproducible. `brand/build-brand-kit.py` emits the raster
derivatives, `brand/build-favicon-svg.py` emits the vector favicon, and
`brand/apply-marketing-logo.py` / `brand/apply-marketing-tokens.py` roll the
result onto the marketing pages.

```sh
cd brand
python3 build-brand-kit.py       # icons + og card from source/
python3 build-favicon-svg.py     # favicon.svg
python3 apply-marketing-logo.py  # header logo + <head> icon links
python3 apply-marketing-tokens.py # --accent* token values
```

Equivalent one-liners with the macOS toolchain, for any single derivative:

```sh
# 512 PWA icon, no alpha in the source so we composite onto a rounded tile
sips -Z 512 -s format png "source/Lazynext_Brand_Logo.jpg" --out icon-512.png

# iOS home screen icon
sips -Z 180 -s format png "source/Lazynext_Brand_Logo.jpg" --out apple-touch-icon.png

# social card, letterboxed into 1200x630
sips -Z 630 -s format png "source/Lazynext_Brand_Logo.jpg" --out /tmp/tmp-card.png
sips -p 630 1200 --padColor FCFCFC /tmp/tmp-card.png --out og-1200x630.png
```

## The no-alpha constraint

The source JPEG has no transparency. Color-keying white out of a JPEG leaves
halo artifacts around every antialiased edge, so this kit does **not** attempt
it. Instead each icon is composited onto a rounded light tile of its own
`#FCFCFC` ground, which is how the mark is drawn and reads correctly on both
light and dark surfaces. A dark-surface variant is therefore unnecessary —
the tile is the boundary.

## Where the kit is consumed

| Surface | Files |
|---|---|
| Apex / marketing | `marketing/public/favicon.{svg,png}`, `marketing/public/og.png`, header `<img>` |
| Dashboard | `dashboard/app/favicon.ico`, `dashboard/public/{apple-touch-icon,icon-192,icon-512}.png` |
| AI Slop Checker | `ai-slop-checker/assets/`, `ai-slop-checker/web/icons/`, `web/manifest.webmanifest` |
| Share cards | `brand/og-1200x630.png` |
