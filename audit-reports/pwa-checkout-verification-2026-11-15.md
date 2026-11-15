# PWA + Checkout verification — 2026-11-15

Closes Web UI audit gaps **M-2** (checkout E2E) and **M-3** (PWA installability)
from `audit-reports/webui-audit-2026-11-15.md`.

## PWA verdict: PASS (installable criteria met; OS install UI not clicked)

| Check | Result |
|-------|--------|
| HTTPS | yes |
| CSP `worker-src 'self'` | live on `checker.lazynext.com` |
| `link rel=manifest` → `/manifest.json` | 200 `application/manifest+json` |
| `/manifest.webmanifest` alias | 200, **byte-identical** to `manifest.json` (product #124 live) |
| PNG icons 192 / 512 / maskable-512 | all 200 `image/png`, correct dimensions |
| `sw.js` registration | active, scope `/`, cache `a11y-shell-v3`, scope-relative `ROOT` |
| Theme color / `display: standalone` / `start_url: ./` | present in manifest |
| Browser proof | Playwright: SW active + cache keys; screenshots `08-checker-pwa-shell.png` |

**Shipped earlier today:** [accessibility-checker#124](https://github.com/lazynextai/accessibility-checker/pull/124) (`422f09c`) — `ui-overrides.css` inject via `sync-page.mjs` + `manifest.webmanifest` STATIC_FILES alias. Live HTML includes `#lz-ui-overrides` (`select#viewport` border `#6b7280`).

**Still UNKNOWN (non-blocking):** Chrome/Safari “Install app” / Add-to-Home-Screen gesture, and airplane-mode offline shell recovery. Automation cannot reliably trigger the native install prompt; criteria checklist is green.

## Checkout verdict: PASS (Dodo **test** mode; payment not completed — by policy)

| Step | Result |
|------|--------|
| `GET /checkout` | **302** → `https://test.checkout.dodopayments.com/session/cks_…` |
| `GET /checkout?trial=extended` | **302** → Dodo test session |
| Checker CTA `#pro` | rewritten to same-origin `/checkout`; click lands on Dodo test checkout |
| Dodo page | **Test Mode** banner; product “Accessibility Checker Pro”; **14 days free trial**; **Total due today ₹0.00** |
| Return URL | platform sets `return_url=https://checker.lazynext.com/?upgraded=1`; landing shows “Pro activated.” banner |
| Payment / KYC / SignWell | **not** exercised (Dodo stays test; SignWell auto-send stays off) |

Screenshots: `09-checkout-dodo-test.png`, `10-checkout-cta-from-checker.png` (if present), `11-checkout-return-upgraded.png`.

## Marketing hosts (no deploy this pass)

| Host | Result |
|------|--------|
| `lazynext.com` | 200 |
| `www.lazynext.com` | 301 → apex |
| `marketing.lazynext.com` | 301 → apex |

Marketing `/pricing` CTAs correctly point at **dashboard signup** (platform plans), not product Dodo checkout — product trial CTA lives on `checker.lazynext.com`.

## PRs / deploys

- Product fix already merged + live: #124 (`422f09c`). No further product code change required for these two gaps.
- No marketing worker deploy this pass (redirect matrix already healthy; no marketing code change).
- This note documents verification only.

## Remaining unknowns

1. Native PWA install UI gesture (user/OS chrome).
2. Offline shell recovery with network disabled.
3. Full paid trial card entry on Dodo test (deliberately skipped — do not complete unless founder asks).
4. License grant after a completed test payment (webhook path) — not exercised.
