# Lazynext WEB UI Audit — 2026-11-15

**Scope:** Public marketing site (`lazynext.com` + redirects), product checker UI (`checker.lazynext.com`), shareable report views, PWA shell assets, dashboard auth gate (HTTP-level only).  
**Mode:** Audit only — no product code changes. Report file is the only intentional write. Optional evidence lives under `audit-screens/`.  
**Method:** Reuse prior browser screenshots + prior live scan results; today = host/header/asset spot-checks only (no full page re-audit). Free `/scan` re-run of `lazynext.com` hit the 3/day quota → prior scan figures retained.

**Protected files (LOCKED — fix proposals = new files / non-locked paths only):**  
`worker.js`, `index.html`, `src/scanner.js`, `package.json`, `test/scanner.test.mjs`, `.github/`  
Do **not** edit those for remediation. Prefer CSS/content in marketing worker public assets, non-locked product modules (e.g. `src/report_views.js`, `src/agent_surfaces.js`), or new overlay/CSS files.

---

## 0. Page inventory

| # | Surface | URL | Prior evidence | Spot-check 2026-11-15 | Verdict |
|---|---------|-----|----------------|----------------------|---------|
| 1 | Marketing home | `https://lazynext.com/` | `audit-screens/02-marketing-home-desktop.png` | HEAD **200**; HSTS + CSP present | **Verified** |
| 2 | Marketing pricing | `https://lazynext.com/pricing` | `03-marketing-pricing-desktop.png` | HEAD **200** | **Verified** |
| 3 | Marketing docs | `https://lazynext.com/docs` | `04-marketing-docs-desktop.png` | HEAD **200** | **Verified** |
| 4 | Marketing legal | `https://lazynext.com/legal` | `05-marketing-legal-desktop.png` | HEAD **200** | **Verified** |
| 5 | Marketing accessibility | `https://lazynext.com/accessibility` | `06-marketing-accessibility-desktop.png` | HEAD **200** | **Verified** |
| 6 | Marketing status | `https://lazynext.com/status` | (host matrix / page list) | HEAD **200** | **Verified** (no dedicated screenshot) |
| 7 | Marketing changelog | `https://lazynext.com/changelog` | (host matrix / page list) | HEAD **200** | **Verified** (no dedicated screenshot) |
| 8 | Mobile content / blog-style view | (captured as overview) | `01-overview.png` (375×812) | dims re-confirmed | **Verified** (responsive sample) |
| 9 | Checker app shell | `https://checker.lazynext.com/` | prior browser session | GET **200** | **Verified** (HTTP; UI not re-walked) |
| 10 | Checker report | `https://checker.lazynext.com/report/{id}` | `07-checker-report-desktop.png` | report short-id **200**; badge SVG **200** | **Verified** |
| 11 | Checker rules (HTML catalog) | `https://checker.lazynext.com/rules` | — | `Accept: text/html` **200** | **Verified** (HTTP) |
| 12 | Checkout start | `https://checker.lazynext.com/checkout` | incomplete E2E (prior) | **302** → `test.checkout.dodopayments.com/...` | **Partial** (redirect OK; payment E2E UNKNOWN) |
| 13 | Dashboard gate | `https://dashboard.lazynext.com/` | prior 307→login | **307** → `/login`; `/login` **200** | **Verified** (gate only; authenticated UI not audited) |
| 14 | www alias | `https://www.lazynext.com/` | prior 301→apex | **301** → `https://lazynext.com/` | **Verified** |
| 15 | marketing alias | `https://marketing.lazynext.com/` | prior 301→apex | **301** → `https://lazynext.com/` | **Verified** |

**Inventory count:** 15 surfaces listed · **12 fully verified** this audit cycle · **2 HTTP-verified without screenshot** (status, changelog) · **1 partial** (checkout) · authenticated dashboard interior **not in scope / unverified**.

**Screenshot corpus (`audit-screens/`):** 7 files — `01-overview` (mobile), `02`–`06` marketing desktop, `07` checker report desktop.

---

## 1. Host / redirect matrix (reconfirmed)

| Host | Result | Notes |
|------|--------|-------|
| `lazynext.com` | **200** | Apex serves marketing; security headers present (HSTS, CSP, nosniff, XFO DENY) |
| `www.lazynext.com` | **301** → `https://lazynext.com/` | Path-preserving pattern expected for other paths |
| `marketing.lazynext.com` | **301** → `https://lazynext.com/` | Duplicate-content fix (worker-first redirect) still live |
| `checker.lazynext.com` | **200** | Product UI + API surface |
| `dashboard.lazynext.com` | **307** → `/login` | Auth gate healthy |

---

## 2. Findings by severity

### HIGH

**H-1. Marketing site fails WCAG target-size + focus-occlusion checks (live free scan of `lazynext.com`)**  
- **Prior live scan (retained):** score **95**/100. Issues:  
  - `wcag-2.5.5` — control(s) at **35×15 px** (below enhanced target-size expectation).  
  - `wcag-2.4.12` — **partial focus occlusion** on **Dashboard / Docs / API** links (cookie/fixed chrome covering focused targets).  
- **Section 508:** fails on the same criteria (FPC mapping from those WCAG failures).  
- **Screenshot corroboration:** `audit-screens/02-marketing-home-desktop.png` shows a bottom cookie consent bar with a compact purple **OK** control and nav/CTA chrome in the first viewport — consistent with small targets + fixed-bottom occlusion class. House history already notes cookie-banner focus occlusion on this site (`scroll-padding` / body padding pattern).  
- **Impact:** Public marketing face of the company fails the same class of checks the product sells; dogfood score is “good but not clean.”  
- **Fix direction (marketing assets only — not product protected files):**  
  1. Enlarge interactive hit areas (cookie **OK**, header text links, footer/sitemap links) to ≥24×24 CSS px minimum (prefer 44×44 for primary actions).  
  2. Keep focusable content clear of the fixed cookie bar: `scroll-padding-bottom` on `html` **and** enough `body` bottom padding so end-of-page / header CTAs can scroll clear when focused (prior product dogfood fix pattern).  
  3. Re-scan `https://lazynext.com` after change; expect score → 100 and Section 508 conforms when both rules clear.  
- **Evidence:** prior scan notes (this audit brief); `audit-screens/02-marketing-home-desktop.png`; live `scroll-padding` + cookie strings still present in homepage HTML (spot-check).

### MEDIUM

**M-1. Checker UI control fails non-text contrast (`select#viewport`)**  
- **Evidence:** `audit-screens/07-checker-report-desktop.png` — self-scan of `https://checker.lazynext.com`, score **96**/100, Section 508: 1 criterion failed (FPC 302.2).  
- **Finding:** `wcag-1.4.11` — `select#viewport` boundary contrast **1.47:1** (need ≥3:1 vs adjacent fill).  
- **Impact:** Product chrome fails AA non-text contrast on a primary control; visible in shareable reports when scanning the checker itself.  
- **Fix direction:** Strengthen border/fill on `select#viewport` (and any sibling selects) in **non-locked** styles — prefer a new CSS file or editable stylesheet, **not** `index.html` / `worker.js` / `src/scanner.js`. Re-scan checker URL to confirm.  
- **Note:** Today’s free-tier re-scan of apex returned `free limit reached (3/day)` — could not refresh lazynext.com or checker scores live; report screenshot remains authoritative for the checker UI finding.

**M-2. Checkout payment E2E incomplete (flow risk = UNKNOWN, redirect OK)**  
- Spot-check: `GET /checkout` → **302** to `https://test.checkout.dodopayments.com/session/...` (Dodo **test** mode — correct per standing policy).  
- Prior audit cut-off: full browser checkout → success/cancel return path **not** completed.  
- **Impact:** Cannot assert trial/start UX end-to-end; no evidence of broken redirect today.  
- **Fix direction:** None until a deliberate test-mode browser pass (do not flip live). Document as operator QA gap.

**M-3. PWA install / offline shell — assets healthy, install E2E UNKNOWN**  
- Spot-check:  
  - `/sw.js` **200** (`a11y-shell-v3`, scope-relative `ROOT` shell paths — matches known-good pattern).  
  - `/manifest.json` **200** (`application/manifest+json`).  
  - `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` **200** (PNG — installability requirement).  
  - `/manifest.webmanifest` **404** (JSON error body) — clients that probe the `.webmanifest` suffix only will miss the manifest.  
- Prior cut-off: browser “Add to Home Screen” / offline shell recovery **not** finished.  
- **Impact:** Likely installable in Chrome given PNG + SW + manifest.json, but **unverified**. Minor naming drift for `.webmanifest`.  
- **Fix direction (non-locked):** Serve the same manifest at `/manifest.webmanifest` (alias or copy) **or** ensure every HTML referrer uses `/manifest.json` only. Do not touch locked `index.html` if the link is already correct — verify via new probe doc / deploy of a non-locked static alias if needed.

### LOW

**L-1. Report long-URL overflow — previously open; now RESOLVED in product repo**  
- **Prior brief:** GitHub `main` + local mirror at **7364** bytes **missing** `word-break:break-all` / `table-layout:fixed` → mobile overflow risk in report tables.  
- **Current state (2026-11-15):** `products/accessibility-checker/src/report_views.js` is **7539** bytes; contains `word-break:break-all`, `table-layout:fixed`, and badge embed `word-break:break-all`. Latest product commit: `3190392` — `fix(report): contain long URLs in report views on narrow screens (#123)`.  
- **Impact:** Finding closed in source. Residual risk only if a stale worker build were redeployed without this commit (backend audit previously flagged deploy/repo drift on this file — treat as deploy hygiene, not a new UI bug).  
- **Fix direction:** None for CSS. On next product deploy, confirm `scripts/deploy.mjs` ships both workers from a tree that includes #123.

**L-2. Free-tier scan UX surfaces upgrade path (expected)**  
- Spot-check: POST `/scan` when quota exhausted → `{ error: "free limit reached (3/day)", upgrade: "/checkout" }`.  
- Not a defect; confirm checker UI maps this to a clear CTA (not re-verified in browser today).

**L-3. Authenticated dashboard UI not audited**  
- Gate verified (307→login, login 200). Interior pages (`/governance`, `/approvals`, `/media`, etc.) require session — **out of verified set**.

---

## 3. User-flow results

| Flow | Result | Evidence |
|------|--------|----------|
| Marketing browse (home → pricing/docs/legal/a11y) | **PASS** (screenshots + 200s) | `02`–`06`; HEAD spot-checks |
| Apex vs www vs marketing hosts | **PASS** | 200 / 301 / 301 |
| Checker report render (score, downloads, badge embed) | **PASS** | `07-checker-report-desktop.png`; badge SVG 200 for report id `fec266d2-e24` (`accessibility: 96/100`) |
| Badge GET by report id | **PASS** | `/badge/{id}.svg` → `image/svg+xml` |
| Wrong badge query (`/badge?url=`) | **404** expected | OpenAPI documents `/badge/{id}.svg` only |
| Checkout start (test mode) | **PARTIAL PASS** | 302 → Dodo test session; payment/return **UNKNOWN** |
| PWA SW + icons + manifest.json | **PARTIAL PASS** | HTTP 200s; install/offline **UNKNOWN** |
| Dashboard unauthenticated access | **PASS** (gate) | 307 → login |
| Live re-scan of lazynext.com today | **BLOCKED** | Free limit 3/day |

---

## 4. Responsive

| Viewport | Evidence | Notes |
|----------|----------|-------|
| Desktop ~1200–1440 wide | `02`–`07` | Marketing + report layouts render without obvious desktop overflow |
| Mobile 375×812 | `01-overview.png` | Content column wraps; no horizontal scroll visible in capture |
| Report tables on narrow screens | Source + #123 | Overflow mitigations present in `report_views.js` (was the main mobile risk) |
| Marketing mobile chrome | Inferred from H-1 + home screenshot | Cookie bar + small targets remain the primary mobile a11y concern — dedicated marketing mobile screenshot of home was not in corpus (overview is content page) |

**Gap:** No fresh mobile screenshot of marketing home or checker shell in this corpus — responsive judgment for those relies on desktop shots + one mobile content page + CSS source review.

---

## 5. Accessibility (product + dogfood)

| Target | Score | Issues | Section 508 | Source |
|--------|-------|--------|-------------|--------|
| `https://lazynext.com` | **95** | `wcag-2.5.5` (35×15), `wcag-2.4.12` (partial occlusion on Dashboard/Docs/API) | Fails those criteria | Prior live free scan (retained; re-scan blocked by quota) |
| `https://checker.lazynext.com` | **96** | `wcag-1.4.11` on `select#viewport` (1.47:1) | 1 criterion failed (FPC 302.2) | Report UI screenshot `07` |
| Marketing `/accessibility` statement page | Live **200** | Content page present (W3C list follow-up) | — | Spot-check + `06` screenshot |
| Report view a11y (structure) | — | Server-rendered, no client JS (CSP); filter nav + downloads present | — | `07` + `report_views.js` |

**Dogfood takeaway:** Neither apex nor checker self-scan is clean. Highest user-visible priority is **H-1** (marketing), then **M-1** (checker control contrast).

---

## 6. Tools / surfaces exercised

| Tool / surface | Used? | Result |
|----------------|-------|--------|
| Prior screenshot corpus | Yes | 7 PNGs under `audit-screens/` |
| `curl` host/header/asset spot-checks | Yes | Host matrix, marketing pages, SW, icons, manifest, checkout, badge |
| Live free `/scan` (lazynext.com) | Attempted | Quota exhausted — prior score retained |
| Browser re-walk of every page | **No** (per brief) | Not required |
| Playwright / CDP mobile capture today | **No** | Optional; skipped to avoid blocking report |
| Authenticated dashboard session | **No** | Gate only |
| Checkout payment completion | **No** | UNKNOWN |
| PWA “install” UI gesture | **No** | UNKNOWN |
| Secrets / `.env` | **Not printed** | — |
| Git checkout/pull/reset/commit | **Not used** | — |
| Protected product files | **Not edited** | — |

---

## 7. Unverified / UNKNOWN / partial

1. **PWA installability + offline shell** — assets look correct; no Add-to-Home-Screen / airplane-mode proof.  
2. **Checkout E2E** — lands on Dodo test session; pay/cancel/return/license grant not exercised.  
3. **Authenticated dashboard UI** — all logged-in pages unverified.  
4. **Fresh live scan of lazynext.com** — blocked by free quota today; H-1 relies on prior scan + screenshot corroboration.  
5. **Marketing status & changelog** — HTTP 200 only; no screenshots.  
6. **Checker home interactive flows** (URL scan form, site-scan toggle, monitor UI) — not re-walked in browser this pass.  
7. **`/manifest.webmanifest`** — 404; unclear if any client depends on that exact path.  
8. **Deployed worker byte-identity vs #123** — source fixed; live report CSS not re-diffed against deployed bundle in this UI pass (see backend audit M-1 history).

---

## 8. Recommended fix order (audit → engineering)

1. **H-1** — Marketing target size + cookie/focus clearance (marketing public CSS/HTML — outside product protected set).  
2. **M-1** — `select#viewport` non-text contrast on checker (non-locked stylesheet / new CSS file).  
3. **M-3** — Optional `/manifest.webmanifest` alias; then one browser install proof.  
4. **M-2** — One deliberate Dodo **test** checkout walkthrough when quota/time allows.  
5. **L-1** — Closed in repo; confirm on next `deploy.mjs` only.

---

## 9. Evidence index

```
audit-screens/01-overview.png                         # mobile 375×812 content page
audit-screens/02-marketing-home-desktop.png           # home + cookie bar
audit-screens/03-marketing-pricing-desktop.png
audit-screens/04-marketing-docs-desktop.png
audit-screens/05-marketing-legal-desktop.png
audit-screens/06-marketing-accessibility-desktop.png
audit-screens/07-checker-report-desktop.png           # score 96, downloads, badge embed
audit-reports/webui-audit-2026-11-15.md               # this report
products/accessibility-checker/src/report_views.js    # 7539 B; overflow CSS present (#123)
```

---

*End of WEB UI audit — 2026-11-15. Audit-only; no remediation applied.*
