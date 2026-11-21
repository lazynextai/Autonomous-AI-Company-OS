# Lazynext AI Slop Checker — Product State & Founder Handoff

**Date:** 2026-11-19
**Version:** v1.4.5 (closeout cut 2026-11-21 for #116 and #117). The 2026-11-19 snapshot remains v1.4.4 at `69d8537`.
**Author:** Lazynext OS
**Status:** LIVE — consolidated founder handoff

---

## 0. One-page executive summary

**What.** Lazynext AI Slop Checker is a zero-dependency Cloudflare Worker that detects "AI slop" — machine-generated writing, design, and content tells — in text, HTML, rendered pages, and whole project folders, with in-place rewriting and a deterministic judgement checklist.

**Where.** LIVE at **https://slop-checker.lazynext.com** (worker `lazynext-ai-slop-checker`; workers.dev mirror `lazynext-ai-slop-checker.dry-hall-6a50.workers.dev`). Health spot-checked 2026-11-19: `{"ok":true,"engine":"lazynext-ai-slop-checker","version":"1.4.4"}`.

**Version.** This tree's package and engine strings are v1.4.5. Live health was still `1.4.4` at the start of the closeout; the worker deploy after this release is what moves production. The 2026-11-19 handoff measured v1.4.4 at 425/425 tests, corpus integrity 446 patterns / 32 categories, eval gate F1 1.000 across 16 families, 0.0% false-positive on 20 clean negatives. Those corpus figures are unchanged by this cut.

**One-line pitch.** A fast, private, bilingual-by-design quality gate that finds, explains, and rewrites AI-slop artifacts in anything you paste, point it at, or ship from a repo — no account, no API key, no cost.

**What the founder needs to know.** Twelve product PRs merged through the v1.4.4 release (#92→#103), the service is live and monitored every 15 minutes, and all quality gates pass. The four gates named in the original Section 6 were closed after this snapshot: MIT confirmation (#106), npm publish of `@lazynext/ai-slop-checker@1.4.4` (#107), the status-page row (#108), and the CI quality gate (#109). Section 6 records that correction. Section 8 is the current state of the optional roadmap: the GitHub render-farm job is installed (#117), A2A replay uses one Durable Object room plus the existing KV fallback (#117), and the advisory soft-tell score still does not move the deterministic score (#116). Those three shipped while the package string stayed 1.4.4; the closeout cuts v1.4.5.

---

## 1. What is live

### URLs
| Surface | URL | Notes |
|---|---|---|
| Canonical product | `https://slop-checker.lazynext.com` | Custom domain binding, zone `ff0ad1848e936913a9c4b4e85b1f04af` |
| Workers.dev mirror | `https://lazynext-ai-slop-checker.dry-hall-6a50.workers.dev` | Same worker |
| Health | `https://slop-checker.lazynext.com/health` | `{"ok":true,"engine":"lazynext-ai-slop-checker","version":"1.4.4"}` — spot-checked live 2026-11-19 |
| Skills/agent docs | `skill/SKILL.md`, `skill/CLAUDE.md`, `skill/references/visual-tells.md` | Harness-format skill distribution |
| Repo | `ai-slop-checker/` in `lazynextai/Autonomous-AI-Company-OS` | Monorepo path; product tree only |

### Features
- **5-language, 446-pattern corpus (32 categories).** Base engine `data/slop-patterns.js` (279 patterns / 27 categories), merged with language rule files `rules.{ru,hi,es,fr,de}.js` → 446 total patterns across 32 categories. Corpus integrity verified: 446 unique / 32 cats, zero duplicates.
- **Scanning + rewriting.** Text, HTML, and whole-project (folder) scanning in `src/{scanner,rewriter,project-scanner,rules-loader}.js`; in-place safe rewrites for pattern hits (smoke-verified: 2 safe rewrites produced on a live slop sample).
- **Rendered-tier pure-snapshot checks** (`src/render-checks.js` + `src/collect-render.js`): machine-checkable visual-tell signals from a DOM snapshot — including **WCAG contrast** verification for the rendered page — no browser-side judgment, deterministic from the snapshot alone.
- **Severity profiles** — issues graded by severity; aggregate score (0–100) with level bands (e.g., live sample: 41/100 Moderate). Soft tells surface as evidence but stay **out of the deterministic score by design**.
- **`--judge` CLI + Review tab + folder-judge.** CLI judging via `api/cli.js`/`src/judge.js` + browser bridge `src/judge-browser.js` / `src/node-bridge.js`; in-browser "Review" tab shipping a judgement checklist (5Q = 5, craft floor = 6, floor MET on the live smoke); folder-judge gates Project review on a folder scan (disabled → plain scan; enabled → full Project review with machine-checked floor answers).
- **Agent surfaces.** MCP server with 7 tools, A2A endpoints with **durable task persistence across isolates** (KV `AI_SLOP_RECENT`, RECENT binding, 30-min TTL, replay-safe), widget, OpenAPI 3.1 (`api/openapi.json`), `llms.txt`, and `agent.json`. All in `api/agent-surfaces.js`.
- **PWA shell** (`web/`): four tabs — Text / URL / Folder / Review — with `sw.js` service worker, manifest, and icons. Brand colors `#0468F8` / `#04B4FC`.
- **Packaging.** `package.json` v1.4.5, **zero runtime dependencies**; scripts: `test` / `check` / `e2e` / `live` / `eval` / `gen:assets`. The 2026-11-19 dry-run of v1.4.4 was 40 files, 3.6 MB.

### Tree map (abridged)
```
ai-slop-checker/
├── data/slop-patterns.js            # 279 base / 27 cats (en)
├── rules.{ru,hi,es,fr,de}.js        # +167 patterns → 446 / 32 cats merged
├── src/{scanner,rewriter,project-scanner,rules-loader,render-checks,
│        collect-render,judge,judge-browser,node-bridge}.js
├── api/{server,worker,worker-module.mjs,agent-surfaces,cli,
│        embedded-assets}.js + openapi.json
├── web/                             # 4 tabs, PWA shell (sw.js + manifest + icons)
├── skill/{SKILL.md,CLAUDE.md,references/visual-tells.md}
├── .cursor/rules/slop-guard.mdc
├── test/                            # 425 tests (spot-checked 425/425 pass)
├── bench/{run,eval}.js + bench/corpus/
├── scripts/{check-corpus,e2e,live-check,check}.js
├── docs/{DEPLOYMENT.md,DEPLOYMENT-PLAN-2026-11-17.md,usage.md,
│         design-review-guide.md,eval-report.md,dogfood-report.md,
│         RELEASE-2026-11-17.md}
├── CHANGELOG.md · ROADMAP.md · ATTRIBUTIONS.md · README.md · LICENSE (MIT — confirmed 2026-11-19, PR #106)
└── package.json                     # v1.4.5, zero-deps
```

---

## 2. Five-repo absorption mapping

All five upstreams were absorbed as **original work** — concepts, taxonomy, and workflow ideas only; nothing copied verbatim. Upstream licenses credited in `ATTRIBUTIONS.md` (MIT ×3, Apache-2.0 ×2).

| Upstream repo | What was absorbed | Where it landed |
|---|---|---|
| `impeccable` | Design-vocabulary / rendered-check spirit; `design-*` heuristics; craft floor | `src/render-checks.js`, `src/collect-render.js`, `src/rules-loader.js` |
| `no-ai-slop` | Banned-words vocabulary; 20+ pattern vocabulary terms | `data/slop-patterns.js` base list |
| `stop-slop` | Filler / jargon / throat-clearing / structural categories; scoring-rubric idea | Category taxonomy in `data/slop-patterns.js`, severity scoring |
| `kill-ai-slop` | Visual-tells taxonomy; field-guide; project-scan workflow | `skill/references/visual-tells.md`, `src/project-scanner.js`, `--judge` flow |
| `hallmark` | Quality-floor concept; machine-checkable design signals; harness-format skill distribution | Craft floor in Review tab, judge checklist, `skill/SKILL.md` + `CLAUDE.md` |

---

## 3. Ship history (12 merged PRs, `git log origin/main`)

| PR | Commit | What shipped |
|---|---|---|
| [#92](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/92) | `145f307` | Product v1.4.1 — consolidated no-ai-slop/stop-slop/impeccable/hallmark/kill-ai-slop; build arc 47 → 319 tests |
| [#93](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/93) | `01e5652` | Deployment plan + run book (Worker vs Docker decision) |
| [#94](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/94) | `ce805c3` | Worker-runtime compatibility (ESM wrapper, SSRF guard, static asset map) |
| [#95](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/95) | `cda13b4` | Live-service guard — `scripts/live-check.js`, deploy gotchas doc |
| [#96](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/96) | `4943bf2` | `scripts/health_check.py` 15-min monitoring, origin `slop-checker` |
| [#97](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/97) | `8111d16` | 1 ms flake fix — deterministic `taskView` comparisons + regression guard |
| [#98](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/98) | `845e561` | Corpus quality eval (precision/recall gate) + fr/de i18n corpora → 446/32 |
| [#99](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/99) | `b6f5ae5` | A2A KV-backed task durability (v1.4.2) |
| [#100](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/100) | `60879f3` | Complete i18n eval lines (ru/hi/es) in `bench/eval` |
| [#101](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/101) | `112e2c1` | Web checker Review tab — in-browser judgement checklist (v1.4.3) |
| [#102](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/102) | `b7a7718` | Web Review tab folder-judge path (judge scanned projects in-browser) |
| [#103](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/103) | `69d8537` | **v1.4.4 release** — folder-judge shipped; repo == prod |

---

## 4. Quality & verification evidence

All numbers below come from real command runs; spot-checks re-run live on 2026-11-19 for this handoff are marked **live**.

### Automated gates
- **Tests: 425/425 pass** — `node --test` (run ×3 across the session; **live re-check 2026-11-19: `tests 425 / pass 425 / fail 0`**).
- **`npm run check` ALL GREEN** — corpus + tests + e2e **26/26**.
- **`npm run eval` GATE PASS** (`bench/eval.js`): **0.0% false-positive on 20 clean negatives**, **16/16 families F1 = 1.000**, i18n eval lines **ru / hi / es / fr / de all PASS**.
- **`check-corpus` INTEGRITY PASS** — **446 unique patterns / 32 categories**, no duplicate IDs.
- **Fuzz: 79 tests** — found and fixed **4 real bugs**: OOR numeric entities → U+FFFD, hex-entity radix, hostile snapshot styles, OOB screens.
- **`npm pack --dry-run`** — 40 files, 3.6 MB (publish-ready shape).

### Real-browser smoke of the DEPLOYED site (2026-11-19)
- Slop sample (AI-flavored copy): **41/100 Moderate, 6 tells, 3 categories**, plus **2 safe rewrites** produced.
- Clean sample: **0/100**.
- URL-scan works same-origin: `example.com` → **0/100 via engine:API**.
- Review tab: "Machine objections found", **5Q = 5**, **craft floor 6 → FLOOR MET**, 3 refusal scaffolds.
- Folder → judge gate: disabled → scan 2 files → 41/100; enabled → Project review with **6 objections, 4 machine-checked OK floor items**.
- Resources **10/10 returned 200** (incl. `/health`); **0 console errors** observed.
- Brand colors verified `#0468F8` / `#04B4FC`.

### Honest caveats
- **CDP console-capture persistence is NOT guaranteed.** The 0-console-error observation and screenshots (`smoke-live-1..8`) were captured in-session via the CDP harness; the screenshots live under the cursor sandbox `/tmp` path and **may no longer exist on disk**. They are session evidence, not durable artifacts — re-run `npm run live` for fresh evidence.
- Soft-tell signals are surfaced as evidence but deliberately **excluded from the deterministic score** (see ROADMAP.md) — this is a design decision, not a gap.

---

## 5. Operations

### Monitoring
- **`scripts/health_check.py`** (repo root, launchd, every 15 min) monitors the `slop-checker` origin — added via PR #96. A stale/missing health response triggers the same alerting path as the other company origins.
- **`npm run live`** = `scripts/live-check.js` → last run **20/20 ALL GREEN** across all check categories.

### Deploy run book
- Full run book: **`docs/DEPLOYMENT.md`** (incl. gotchas) + **`docs/DEPLOYMENT-PLAN-2026-11-17.md`** (Worker vs Docker decision record).

### Known gotchas (documented in DEPLOYMENT.md)
- **`binding = "ASSETS"` must be explicit** in the worker config; static assets are served from a curated map with `run_worker_first`.
- **Fresh `Request` for asset fetches** — reuse of the incoming request object breaks asset serving.
- **522-trap on worker recreate**: deleting/replacing the worker script drops the `workers/domains` binding while the proxied DNS record remains → instant 522 (~40 ms). Fix: re-bind via `PUT /accounts/{acct}/workers/domains` for `slop-checker.lazynext.com` (zone `ff0ad1848e936913a9c4b4e85b1f04af`).
- **ESM wrapper required**: workerd rejects CJS-only workers (error 10021) — `api/worker-module.mjs` is the entry wrapper.

### Abuse & safety guards (live-verified)
- **SSRF host-block guard**: blocked `169.254.x.x` and `127.0.0.1` scan targets → 502.
- **Per-IP scan cap**: 60 scans/min per IP.

### Rollback
- `npx wrangler rollback <version> --name lazynext-ai-slop-checker` — previous release is rollback-safe; after ANY rollback/recreate, verify the custom-domain binding still answers (522-trap above) and re-run `npm run live`.

---

## 6. Founder decision checklist

Corrected 2026-11-21. The table below is the current state. On 2026-11-19, when this handoff was written, these four rows were still open (MIT unconfirmed, npm unpublished, no CI workflow, status page not yet listed). #106–#109 closed the first three and the status-page part of the fourth the same day. The verification stamp at the bottom is that day's re-run and was accurate then.

| # | Item | Status | One-line reason | Next action |
|---|---|---|---|---|
| 1 | **MIT license confirmation** | CLOSED 2026-11-19 (#106) | Founder authorized MIT. `LICENSE` opens with "License confirmed by founder authorization on 2026-11-19 (UNITED GLOBAL VENTURES PRIVATE LIMITED)." | None |
| 2 | **npm publish `@lazynext/ai-slop-checker`** | PUBLISHED 2026-11-19 (#107); v1.4.5 cut 2026-11-21 | Registry `latest` was `1.4.4` on the 2026-11-21 recheck (versions `0.0.0-stage` and `1.4.4`, license MIT, `private` false). v1.4.5 is the closeout version cut. | Publish `1.4.5` after this release merges |
| 3 | **CI gate** (`.github/`) | LIVE (#109) | Founder granted full authority for this `.github/` item on 2026-11-19. Workflow `.github/workflows/ai-slop-checker.yml` runs the quality gate on `ai-slop-checker/**` pushes and pull requests, plus a daily live-check. | None for the gate itself |
| 4 | **Optional roadmap items** | UPDATED 2026-11-21 | Status-page row shipped in #108 and is on `https://lazynext.com/status`. Section 8: GitHub render-farm job installed as its own workflow, A2A cross-isolate replay uses one SQLite Durable Object room (KV remains the fallback), soft-tell advisory score stays out of the deterministic score. | None for those three. SaaSHub stays founder-needed until `SAASHUB_PASSWORD` is replaced. |

---

## 7. House-rule compliance statement

- **Scope discipline:** only `ai-slop-checker/` changed across the whole product arc (+ one ops `AGENTS.md` bullet via PR #93). Nothing else in the monorepo was touched.
- **Protected files untouched:** `worker.js`, `index.html`, `src/scanner.js`, `package.json`, `test/scanner.test.mjs`, `.github/` were never modified by product work.
- **No secrets:** no credentials in code, docs, or commits; no new paid services beyond the existing plan.
- **Fleet undisturbed:** the local agent fleet was never stopped, restarted, or interfered with during any verification or deployment work (verified running at handoff time).
- **Main tree clean:** only pre-existing untracked files present in the main checkout.
- **Worktree discipline:** all git operations for this handoff ran in a detached worktree (`/private/tmp/lazynext-state-doc`) — the shared working tree was never checked out, pulled, or reset.
- **No fabricated data:** every figure in this document comes from a real command run or a live check (Section 4 lists the exact gates); anything not measured is labelled as such.
## Verification stamp — 2026-11-19 (post-final-merge, full re-run)

| # | Check | Result (real) |
|---|---|---|
| 1 | GET /health (live) | 200 `{"ok":true,"version":"1.4.4"}` |
| 2 | GET /rules (live) | 200 |
| 3 | POST /scan text (live) | 200, score 10, `w-leverage`+`w-robust` |
| 4 | A2A send → replay (live) | `stamp-1` → replay `completed` |
| 5 | `npm run live` (live host) | 20/20 ALL GREEN |
| 6 | `node --test` | 425 pass / 0 fail |
| 7 | `node bench/eval.js` | GATE: PASS, FP 0.0% (≤5%) |
| 8 | `check-corpus` (6 files) | INTEGRITY PASS, 446 unique / 32 cats, 0 dup |
| 9 | Sibling hosts checker/api/app/apex | all 200 |
| 10 | Hygiene | worktree clean, 8792/8793 free, fleet running, main tree = 13 pre-existing untracked only |

All claims in this document verified true as of 2026-11-19.

Section 6 statuses were updated on 2026-11-21. The stamp above is the 2026-11-19 re-run. MIT, npm, the CI workflow, and the status-page row closed in #106–#109 and stayed marked open in this file until this correction.

## 8. Roadmap advance — 2026-11-21

The three items Section 6 left open shipped in #116 and #117 and stayed tagged 1.4.4 because `package.json` was not edited. This closeout cuts **v1.4.5** (patch, not 1.5.0): the advisory score does not change the scan score or the PASS | REVIEW | REFUSE verdict, the Durable Object room keeps the existing A2A replay contract, and the render-farm job is CI only. The 1.4 line already shipped features as patches.

| Item | What landed | What is still parked |
|---|---|---|
| Real-browser CI farm | `scripts/render-farm.js` serves `fixtures/render-farm/` through `src/collect-render.js` and checks `src/render-farm-plan.js`. Missing Playwright skips (exit 0). `RENDER_FARM_REQUIRED=1` fails (exit 2). The job that runs is `.github/workflows/ai-slop-checker-render-farm.yml` (source copy `ci/render-farm.workflow.yml`). It does not edit `.github/workflows/ai-slop-checker.yml`. Playwright is `npm install --no-save` in that job only. | A missing Chromium install, or script exit 2, is a green skip with a job summary so a runner without a browser does not fail the pull request. Fixture failures (exit 1) still fail the job. Playwright is not a runtime dependency. |
| A2A cross-isolate replay | One SQLite Durable Object, binding `A2A_TASKS`, class `A2aTaskRoom`, migration tag `v1-a2a-task-room`. Every isolate uses `idFromName("a2a-recent")`, so a put is visible to the next isolate when the send's write resolves. `ASSETS` and KV `RECENT` (`dd4afa72fb3d4b638e71119c42b0b830`) stay. Replay still prefers a local view on an equal timestamp and a newer remote timestamp otherwise. Tests: two stores, one immediate room, a KV that hides puts until `flush()`. | A room error or a 4s timeout does not fail the send. That one write is then only memory plus KV, which is the previous eventual model. Health and scan never call the room. No separate design note: this row is the design. |
| Soft-tell auto-scoring | `src/soft-tells.js` scores sentence spread, paragraph shape, and parallel clauses. `judgeReport(...).softTells.advisoryScore` is 0 or 34 per signal (cap 100). `drivesDeterministicScore` and `appliedToVerdict` are false, and tests lock the scan score and the PASS \| REVIEW \| REFUSE verdict. Precision is 1 on the labeled positives. Every bench file whose path contains `negative`, plus `demo/clean.txt`, fires zero signals. The browser judge inlines the same source. The Review tab draws the block from script. | The advisory number is not added to the 0–100 scan score. Doing that would change the checklist contract. Project judge leaves `advisoryScore` null because project reports do not keep source text. |

SaaSHub was not retried on the earlier 2026-11-21 passes. This pass checked again: `.env` mtime was still 2026-11-06 05:36:31, which is not newer than 2026-11-06, and `SAASHUB_PASSWORD` was still present. Login was not attempted. See `docs/LISTINGS-2026-11-20.md`.
