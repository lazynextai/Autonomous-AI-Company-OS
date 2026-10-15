# Escalated-Task Reconciliation — 2026-10-15

**Basis:** `escalated-task-records.csv` snapshot 2026-10-13 (35 rows, 34× attempts=5 deterministic vetoes + 1× attempts=1 transient). Cross-referenced against shipped code at commit `97dd60a` / `b787da6`, `src/rules/manifest.js` (75 rules), `AGENTS.md` Known states, and product + platform live surfaces. No task was requeued — every row gets a disposition (duplicate / infeasible / gated-decision / transient-verify) with evidence so it does not respawn as missing work.

**How to read:** `Disposition` uses the fleet's dead-corpus vocabulary. `Evidence` cites the exact file/surface that already satisfies or refutes the ask.

| Task | Description | Disposition | Evidence / note |
|---|---|---|---|
| 96246745 | analysis module for missing image descriptions | **duplicate — retired** | `src/rules` + `manifest.js` `wcag-1.1.1`; filename-as-alt statics in `scanAdditionalHtml`. 75-rule manifest covers it. |
| aa4bfc8b | color contrast and readability | **duplicate — retired** | `checkFocusDepth` non-text contrast `wcag-1.4.11` + text contrast `wcag-1.4.3` in scanner; census + `nontextContrast`/`spacingClip` in `/render` trace. |
| f308c5f3 | SEO meta / Open Graph tags | **duplicate — retired** | `src/static.js` + `src/page.js` via `scripts/sync-page.mjs`; `og.png` base64-embedded; `test/page-sync.test.mjs` enforces sync. Live at `checker.lazynext.com`. |
| 55d554a7 | accessibility score trends over time | **gated — product decision** | No trends UI shipped. Would need `scan_stats` aggregation + dashboard card. Founder decision whether to build; do not auto-build. |
| dccb7f01 | developer surface openapi.json + HTML rules catalog | **duplicate — retired** | Product `GET /openapi.json` (21 paths) + `GET /rules` content-negotiated catalog; platform 93 paths. `test/openapi.test.mjs` enforces parity. |
| 04110a31 | accessibility testing on tablets / non-mobile | **duplicate of PR #102 review — close** | Same ask as PR #102 (wrong entry point `src/worker.js`, deployed entry is root `worker.js`). No device-emulation surface planned. |
| fe1e09e7 | severity-weighted scoring for mobile device testing | **infeasible: mobile-stack** | No mobile product surface exists; weighted model `weighted-v1` already ships for web scans. Mobile-specific weighting has nothing to weight. |
| 300f4ab7 | census-gated 2.1.1 pointerOnly evidence | **duplicate — retired** | `/render` census + `pointerOnly` gate shipped 2026-09-29; fixture `pointer-only.html`. `checkFocus` census-gated warns. |
| 69384049 | severity-weighted scoring for audit results | **duplicate — retired** | `weighted-v1` in `src/scanner.js` (`A 1.0 / AA 0.6 / AAA 0.35 / BP 0.25`, warn×0.5, repeat half-marginal). |
| fe838b88 | AI-powered audit for audio/video content | **infeasible: media-content semantics** | Automated checks cannot assess audio/video descriptions — honest frontier in research-doc Status header; kept intentionally excluded. |
| 5ea00c58 | Fix GH Actions failure self-scan run 36579538759 | **transient — verify then close** | Single attempt=1. Re-check Actions logs for that run id; `self-scan.yml` canary now passes (daily + push). Close if green, else file narrow fix. |
| 6b67eda7 | customizable dashboard data helpers | **speculative — close or narrow PR** | No shipped counterpart named; if a concrete gap exists file a scoped `dashboard/app/api/*` utility, else close as speculative helper. |
| 372b8a66 | trial-extension offer mechanism | **duplicate — retired** | `config:trial_offer` + `?trial=extended` + report CTA shipped; verified live `offer=30` durable `ttl:0`. |
| 70c26f9f | payment retry for failed payments | **provider-owned — verify then close** | Dodo `past_due` → `pastdue:` KV + `reconcileBilling()` already covers drift; retry is provider-side. Verify `services.ts` + `billing:last_reconcile`. |
| c2d5b18c | API endpoint for automated SEO audit | **infeasible: out-of-scope SEO product** | Product scope is accessibility, not SEO. Intentionally excluded. |
| 93fed868 | test suite for scan_stats corpus | **duplicate — retired** | `scan_stats` percentile + benchmark `scan_stats` tested; corpus LIVE ≥18 hosts `benchmark:{pct,sites}`. |
| 9e543e98 | more efficient scan_stats corpus algorithm | **duplicate — retired** | `GROUP BY host + MAX(created_at)` dedup + exclusion list (`lazynext.*`, `example.*`, `*.github.io`, reserved TLDs, bare IPs). |
| b8163f67 | score curve for more accurate scoring | **duplicate — retired** | `100·e^(−n/15)` replaced `100−10n`; `score_model` in report JSON. |
| fffea248 | WCAG 2.2 checks 2.4.3 / 2.4.6 | **duplicate — retired** | `scanKeyboardStatics` + rendered focus checks (`checkFocusDepth`); cross-page `3.2.3`/`3.2.4` in `crosspage.js`. |
| 05202ac6 | more efficient caching for report pages | **duplicate or narrow** | KV 60s + `report:*` TTL exists. If intent is distinct from existing KV cache, scope narrowly; else duplicate. |
| 2c17dce0 | deep keyboard-trap detection | **duplicate — retired** | Five-layer `wcag-2.1.2` (`checkFocus`, `scanKeyboardStatics`, `checkFocusDepth` + backtrace Shift+Tab×8 + click 4 triggers). Fixtures `trap.html`/`trap2.html`/`focusable-trap.html`. |
| 28a2ba5c | Brevo email templates and sequences | **duplicate — retired** | `enrollLead` + `advanceLeadSequence` (3 mails) + `marketingFooter` + `List-Unsubscribe`; `email_events` + `brevo:events`. |
| 4f3ab627 | enhanced report customization | **duplicate — retired** | White-label reports for Agency `plan:'agency'` brandless (`report_views.js`). |
| 5d99cfa2 | free trial extension for site-scan completers | **duplicate — retired** | Same as 372b8a66 mechanism (offer ON, 30d). |
| 31bb1bb4 | API endpoint for detailed accessibility info | **duplicate — retired** | `GET /report/:id.json` + HTML report + CSV/JSON/PDF exports. |
| 00c01af5 | SEO optimization for accessibility keywords | **duplicate / low-value — close** | Overlaps f308c5f3; site SEO shipped via `src/static.js` + sitemap/robots/llms. |
| 0bf51115 | plan to expand product features | **non-executable placeholder — close** | Meta-planning doc, no deliverable. |
| e20c6aa2 | improve scanning API report display | **duplicate — retired** | Shareable report + exports linked from report HTML. |
| 57bba9d1 | automated testing for sales outreach / funnel | **partial — file narrow test or close** | Funnel `GET /api/v1/billing/funnel` + `reconcileBilling` exist; e2e for outreach not distinct. |
| e7de57bf | test suite for scanning API error handling | **duplicate — retired** | `worker/test/` + `test/scanner.test.mjs` (398 product tests) + `worker/test/billing-reconcile.test.mjs` etc. |
| b2bf1ae3 | AI-powered remediation guidance integration tests | **scope-check — close or narrow** | Guidance is rule-based (`recommendations.js`), not LLM remediation. |
| 7784248c | script to automate submitting sales outreach campaigns | **intentionally human-gated — close** | `sales_agent._draft_campaign` drafts ONE when none pending; Marketing page Send is human-gated for deliverability. Do not auto-submit. |
| 7f503e60 | automated testing for report exports | **duplicate — retired** | CSV/JSON/PDF exports shipped and exports linked; verify export tests. |
| bc0f9c01 | automated tests for critical journeys / funnels | **duplicate of 57bba9d1 — close** | Same funnel/journey class. |
| 87cf9a36 | industry benchmark data storage | **duplicate — retired** | `scan_stats` + `benchmark:{pct,sites}` + widget line. |

**Action:** every `duplicate — retired` row is already satisfied — tag the task `retired:` (or `infeasible:` where noted) so dedup suppresses paraphrases; do not requeue. `infeasible:` rows (fe1e09e7, fe838b88, c2d5b18c, 7784248c) are honest scope exclusions per `remaining-work-ledger` Order 2B. `gated`/`transient` rows require only a poll/verify or founder decision, not a build.

*Companion:* `remaining-work-ledger-2026-10-13.md` Order 2B; `incident-correlation-2026-10-15.md`.
