# Lazynext Platform Backend Audit — 2026-11-15

**Scope:** platform worker (`worker/`), product worker non-UI (`products/accessibility-checker/src`, `worker.js`, `test/`), `sdk/`, `extension/`, `core/` (fleet tools), `scripts/`. UI files (product `index.html`, dashboard pages) are separately audited.
**Mode:** Audit only — no product/code fixes. This file is the only intentional write.
**Method:** Incorporate prior full-audit findings (same-day draft ~19:08 IST) + re-verify live smoke, test suites, connectors, OpenAPI, cron breadcrumbs (22:40–22:50 IST). No `git checkout`/`pull`/`reset`/`commit` on the main tree.
**Live surfaces exercised:** `ai-company.lazynext.com` / `CLOUDFLARE_API_URL`, `checker.lazynext.com`, `api.lazynext.com`. Secrets never printed; connectors used `LAZYNEXT_API_KEY` (lzk_ read); KV/query used internal `CLOUDFLARE_API_TOKEN`. All scripted calls carried a real `User-Agent`.

**Protected files (LOCKED — not modified):** `products/accessibility-checker/{worker.js,index.html,src/scanner.js,package.json,test/scanner.test.mjs}`, `.github/`.

---

## 0. Test suite status (re-run 2026-11-15 ~22:45 IST)

| Suite | Command | Result |
|---|---|---|
| Platform worker | `cd worker && node --test` | **424 pass / 0 fail** (6.2s) |
| Product worker | `cd products/accessibility-checker && node --test` | **434 pass / 0 fail** (5.2s; +1 vs earlier same-day 433) |
| Repo Python (prior session) | `.venv/bin/python -m pytest tests/ -q` | **516 pass / 5 skip** (skips = authed tests without key — expected) |
| Product Python SDK (prior) | `.venv/bin/python -m pytest sdk/python/test_lazynext_a11y.py` | **6 pass / 0 fail** |
| Go SDKs (prior) | `cd sdk/go && go test ./...` / `go vet` / `go build` | ok / clean |

Zero failing tests in the re-run suites. Green suites also pin:

- Product `test/openapi.test.mjs` — lifts route literals from `worker.js`; 21 paths; 7 gated ops; anonymous `/scan /rules /health /mcp /a2a /lead` carry **no** `security`.
- Product `test/rules-manifest.test.mjs` — 75-rule parity (`rule: "wcag-*"|"bp-*"` literals ↔ `RULES`).
- Worker suite covers governance, breakers, campaign-gate (10 tests; 6 fail if gate removed), SSRF (`sign-ssrf-guard`), billing reconcile, copygate, etc.
- Expected noise: `connector_cap_write_failed` stub logs during rate-cap tests (no failures).

---

## 1. Findings by severity

### RESOLVED since prior draft (same day)

**~~M-1~~ Deployed `src/report_views.js` ≠ repo — CLOSED**
- Prior finding: live CSS tweaks (+~175 B) not on GitHub main.
- Re-check: product repo `src/report_views.js` is **7539 bytes**, committed as `3190392 fix(report): contain long URLs in report views on narrow screens (#123)`. Local mirror matches the previously-live size class. No longer an open medium.
- Residual ops note: always deploy via `scripts/deploy.mjs` (both `accessibility-checker` + `accessibility-checker-api`) after merge so api/checker stay in lockstep.

### MEDIUM (open)

**M-2. Browser extension badge never counts open tasks — status vocabulary mismatch**
- File: `extension/background.js:25`
  ```js
  const open = (tasks || []).filter((t) => t.status === "queued" || t.status === "running").length;
  ```
- Evidence: `GET /api/v1/tasks` returns raw `task_log` rows. D1 / worker vocabulary is `pending | in_progress | completed | failed | escalated`. `queued`/`running` never occur → badge count stays 0.
- Impact: extension core badge feature is functionally dead.
- Fix direction: filter `pending` / `in_progress`. Optional: lighter list projection (see L-5). `extension/` is not protected.

**M-3. Platform public/internal read-only routes do not answer HEAD — 404**
- Files: `worker/src/public_api.ts` GET-only dispatch; internal GET block in `worker/src/index.ts`.
- Live re-check (22:45 IST):
  - `HEAD /api/v1/health` → **200**
  - `HEAD /api/v1/status` → **404** (while `GET /api/v1/status` → **200**)
  - `HEAD /decision/packages` → **404**
- Product worker HEAD parity remains complete (prior evidence + suite). Platform gap only.
- Impact: HEAD-based uptime probes false-alarm on platform read routes.
- Fix direction: treat `HEAD` as `GET` for read-only branches; keep state-changing routes exact-match; add regression test.

### LOW (open)

**L-1. `sdk/js/package.json` missing `"type": "module"` while `index.js` is ESM**
- Re-check: `package.json` has `main: index.js`, **no** `"type"`. ESM `export` → typeless-package warning / CJS `require` fails.
- Fix: add `"type": "module"` (+ ideally `"exports"`).

**L-2. AGENTS.md operational counts drift (docs only)**
- Platform OpenAPI: doc still says “93 paths”; live + source = **115** (verified).
- Connectors: standing “39/6” phrasing vs live **41 present / 4 absent** (linkedin, snapchat, tiktok, viber) — beehiiv + teams already connected.
- Dead corpus: prior approx ~1395 vs older doc “1476”; both ≪ 10 000 cap.
- Fix: docs-only AGENTS.md updates.

**L-3. Funnel still shows many 30-day `unstamped` scans (provenance stamping is new)**
- Live `GET /api/v1/billing/funnel` (22:45 IST): `scans_30d:106`, `scans_by_src: {unstamped:60, web:2, ci:15, monitor:13, mcp:5, a2a:1, fixture:10, …}`, `scans_external_30d:5`.
- Stamp shipped ~2026-11-04; window still includes pre-stamp reports. Watch `unstamped` decline; no code fix required unless it plateaus after TTL expiry.

**L-4. Campaign sends remain gate-bound — only `campaign:12` has a package**
- `config:decision_enforce = approval` (KV re-verified).
- `decision_packages`: 32 approved / 3 executed / 2 failed / 2 voided; **one** campaign-targeted row: id **39**, `target=campaign:12`, `outcome=executed` (university campaign 12 already `status=sent`).
- Drafts **10** and **11** still have **no** `campaign:<id>` package → send would 503 until founder-approved package exists.
- Not a regression — documented governance. Operator path unchanged: create + approve `campaign:<id>` before send.

**L-5. `GET /api/v1/tasks` returns full `result`/`error_log` bodies**
- `SELECT * FROM task_log` — heavy for extension poll `limit=50` every 5 min. Authenticated company data; no secret leak. Optional projection/`cols=` later.

### INFO (deliberate / safe)

- **Fleet copy gate stricter than worker** on connector dispatch — safe direction.
- **MEDIUM policy asymmetry (documented, not a bug):** fleet decision gate fails **SOFT** on KV/D1 control-plane unreadability; worker fails **CLOSED** for non-auto. Documented in `core/tools/decision_gate.py` docstring (lines 22–29): *“a control-plane outage must never stop the company posting.”* Evidence-based blocking (readable scope, no package) is identical. Gate chain on fleet `call_connector`: daily cap → **breaker** → **decision gate** → **copy gate** → `_invoke` (verified in `core/tools/connectors.py` ~1645–1679).
- **`social-posts-dlq` has no consumer** — by design; D1 row is source of truth; cron sweep re-enqueues.

---

## 2. OpenAPI parity (re-verified live)

| Check | Result |
|---|---|
| `api.lazynext.com/openapi.json` vs `checker.lazynext.com/openapi.json` | **200 both, byte-identical** (22713 B) |
| Spec shape | `openapi: 3.1.0`, **21 paths** |
| Gated ops (`security` present) | **7**: `POST /cancel`, `GET/POST/DELETE /monitor`, `GET /confirm`, `GET/POST /unsubscribe` |
| Schemes | `LicenseEmail`, `ConfirmToken`, `UnsubscribeSig` |
| Anonymous surfaces | `/scan /rules /health /mcp /a2a /lead` — **no** `security` |
| Platform `GET /api/v1/openapi.json` | **200, 115 paths** |
| HEAD gap | Platform read routes — see **M-3** |

---

## 3. Deployed-vs-main drift (carried from prior + spot re-check)

**Platform `ai-company-os`:** prior session concluded deployed bundle ≡ local main build (byte-identical; Brave-first / `relevant()` live). Not re-downloaded this pass (large artifact); no contrary smoke evidence.

**Product `accessibility-checker` / `-api`:** prior M-1 CSS drift **closed** via PR #123 (`report_views.js` now 7539 B in product repo). Other modules were already byte-identical in the earlier audit.

**Working tree:** monorepo not reset/pulled this session; `audit-reports/` is the audit artifact directory (untracked until founder chooses otherwise).

---

## 4. Endpoint smoke (prior + selective re-check)

| Surface | Route | Result |
|---|---|---|
| Product | `GET /health` | 200 `{"ok":true,"service":"accessibility-checker"}` |
| Product | `GET /rules` | 200, **75 rules** |
| Product | OpenAPI both hosts | 200, identical |
| Product | Prior: scan/report/badge/checkout/mcp/a2a/agent.json/widget/sw/unsubscribe GET non-mutating | all held in prior session |
| Platform | `GET /api/v1/health` (lzk_) | 200 |
| Platform | `GET /api/v1/connectors` (lzk_) | 200 — §5 |
| Platform | `GET /api/v1/billing/funnel` (internal) | 200 — §1 L-3 |
| Platform | `GET /api/v1/status` | 200; HEAD → 404 (**M-3**) |
| Platform | KV breadcrumbs | 200 — §6 |
| Platform | `/query` read SELECTs | 200 — social_posts / decision_packages / task_log |

No connector dispatch performed. No `POST /unsubscribe`. No campaign send.

---

## 5. Connector status summary (live re-check)

`GET /api/v1/connectors` via `LAZYNEXT_API_KEY` (internal bearer correctly **401** on this route — expected):

- **TOTAL: 45 | PRESENT: 41 | ABSENT: 4**
- **Absent (parked by founder policy):** `linkedin`, `snapchat`, `tiktok`, `viber`
- **Present includes:** `beehiiv`, `teams`, `x`, `brevo`, `postiz`, `ayrshare`, `buffer`, … (full present set enumerated in verification run)
- Capabilities block: **45** descriptors
- `GET /capability/matrix` (internal): `total:45`, `probe-ok:3`, `probe-failed:1`, `configured-unprobed:37`, `documented-only:4`, `absent:0`, `stale:0`
- No credential values read from `conn:*`.

---

## 6. Cron / queue / D1 health verdict

**VERDICT: HEALTHY** (re-checked 22:45 IST).

| Breadcrumb | Value (ms / payload) | Age at re-check | Gate |
|---|---|---|---|
| `cron:last_tick` | `1794762615784` | **~0.1 h** (10-min cadence) | stale >25 min |
| `maint:last_run` | `1794751815815` | **~3.1 h** | ~20 h |
| `mon:last_sweep` | `{at:1794751821963, scanned:1, errors:[]}` | **~3.1 h** | ~20 h |
| `billing:last_reconcile` | `{at:1794751823619, active:0, repaired:[]}` | **~3.1 h** | stale >26 h |
| `seq:last_run` | `1794721215991` | **~11.6 h** | ~20 h |
| `config:decision_enforce` | `approval` | — | live as designed |

Daily block (maint/mon/billing) advanced since the earlier ~19:08 draft (then ~19 h old) — confirms cron/maintenance path fired.

- **Social queue:** `posted:10`, `failed:7`, `cancelled:1`, **zero `queued`/`posting`** (nothing stuck). DLQ consumerless by design.
- **task_log (7d):** completed 50 / escalated 4 / failed 2 — quiet-but-healthy.
- **Fleet:** `com.lazynext.fleet` PID **815** running; `com.lazynext.healthcheck` loaded.
- **Trial offer / 2FA:** prior session confirmed `config:trial_offer=30` and `flag:two_factor=true` intact — not re-touched (founder-sensitive).

---

## 7. Code-review hot spots (prior hunt + gate re-confirm)

| Check | Result |
|---|---|
| Fleet gate order | breaker → decision → copy → `_invoke` — confirmed |
| Decision-gate soft/closed asymmetry | Documented INFO / MEDIUM policy note — not a defect |
| `/kv/put` TTL floor | Prior: `ttl===0` durable; else ≥60s — sound |
| D1 ident allowlist (Python) | Prior: `_quote_ident` — sound |
| Sign SSRF | Prior + suite green |
| Campaign gate | Live packages now include executed `campaign:12`; other campaigns still blocked until packaged |
| Unsubscribe PLATFORM_TOKEN sync | Prior: valid HMAC → 200 confirm GET (non-mutating) |
| Extension / sdk/js | **M-2**, **L-1** open |

---

## 8. What could NOT be verified (and why)

1. **Real connector dispatch** — admin-gated; posts to live networks; out of audit scope.
2. **Campaign send for drafts 10/11** — would require new approved packages (governance, not audit).
3. **Authenticated dashboard pages** beyond 307 — owner session is founder-browser; separate UI audit.
4. **Container-internal Postiz/Listmonk/Mattermost/WordPress beacons** — need global X-Auth R2 reads; HTTP keep-warm covered by healthcheck.
5. **Exact `DEAD_CORPUS_WHERE` count** — prior LIKE approx only; operationally under 10k either way.
6. **`.github/` workflows** — devops-locked; out of scope.
7. **Platform worker full module re-diff vs main** — not re-downloaded this pass; prior byte-identical + smoke healthy.
8. **OAuth token refresh success internals** — would require reading `conn:*:exp` (avoided); no breadcrumb failure signal.

---

## 9. Recommended fix queue (later phase — not done in this audit)

1. **M-2** — `extension/background.js` status filter → `pending`/`in_progress` (+ optional L-5 projection).
2. **M-3** — platform HEAD parity for read-only routes + regression test.
3. **L-1** — `sdk/js` `"type": "module"`.
4. **L-2** — AGENTS.md count updates (115 paths, 41/4 connectors).
5. **L-3** — recheck funnel `unstamped` in ~2 weeks.
6. **L-4** — operator-only: approve `campaign:<id>` before sending drafts 10/11.
7. ~~M-1~~ — done (PR #123).

---

## 10. Verification log (this pass)

| Step | When | Outcome |
|---|---|---|
| `mkdir -p audit-reports` | start | ok (dir existed) |
| `cd worker && node --test` | ~22:45 | 424/0 |
| `cd products/… && node --test` | ~22:45 | 434/0 |
| KV breadcrumbs ×6 | ~22:44 | all present; cron fresh; daily ~3 h |
| Connectors (lzk_) | ~22:45 | 41/4 |
| OpenAPI product+platform | ~22:45 | 21 / 115; product hosts identical |
| Funnel / social_posts / decision_packages / capability matrix | ~22:45 | healthy; campaign:12 executed |
| HEAD status / decision packages | ~22:45 | 404 → M-3 confirmed |
| decision_gate docstring + connectors gate order | ~22:45 | soft/closed asymmetry + chain confirmed |
