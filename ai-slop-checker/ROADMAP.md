# Roadmap — Lazynext AI Slop Checker

What is genuinely left after v1.4.2. Ordered roughly by leverage; nothing
here has a hard date. The engine stays deterministic and dependency-free.

## SHIPPED — Phase 6 polish & judgement checklist (v1.4.1, 2026-11-17)

- **Judgement checklist (`--judge` / `POST /judge` / MCP `judge`)** — the
  deferred "judgement tells" item shipped as a **deterministic
  machine-built checklist** (`src/judge.js`): the 5-question review
  (purpose/audience/decision/variety/defaults) with hints + verdictHint +
  machine-flagged signals, the craft-floor gate (contrast / alignment /
  text-hierarchy / spacing / no-fake-data / no-decorative-effects) mapped
  from scanner evidence with genuinely non-machineable items left as
  human checkboxes (never fake verdicts), refusal scaffolds, and a
  PASS | REVIEW | REFUSE verdict computed ONLY from machine-verifiable
  parts. Wired through the CLI (`--judge --file|--url|--dir|<text>`), the
  API (`POST /judge {text|html|project}`), and MCP (`judge` tool —
  tools/list now 7), with OpenAPI and docs. 10 new tests pin the contract,
  the machine-only verdict boundary, and byte-identical determinism.
- **`npm run check`** — `scripts/check.js`: sequential quality gate
  (corpus integrity → `node --test` → e2e on 8793) with a summary table
  and non-zero exit on any failure.
- **Web-checker stale-results UX fix** — scan START clears the previous
  results area; failure renders a distinct error state with a retry
  affordance (never stale results); the CORS-aware URL tip stays.
  Regression-locked in `test/app.test.js` (8 node-only tests over the
  pure `SlopAppState` lifecycle helpers).

## SHIPPED — Phase 5 hardening & release readiness (v1.4.0, 2026-11-16)

- **Fuzz robustness** — `test/fuzz-robustness.test.js` (79 tests): hostile
  inputs (binary bytes, lone surrogates, 1 MB repeats, deep/malformed HTML,
  entity storms, mixed-script soup…) across scanText/scanHtml/scanDesign/
  rewriteText/scanProject/scanRender with no-throw, determinism, shape, and
  <1s budgets. 4 crash fixes landed (out-of-range entities → U+FFFD;
  snapshot style sanitization; hex-entity radix; all-invalid screen
  indices).
- **Corpus quality gates** — `scripts/check-corpus.js` (ids
  `^[a-z][a-z0-9-]*$`, required fields, severity 1-3, no duplicate matches
  per category, per-category counts, cross-file uniqueness, FAIL exit 1) +
  `test/corpus-validate.test.js` (base 279/27 + ru/hi/es → merged 382/30,
  zero id duplication).
- **Performance bench** — `bench/perf.js` (real ms / input size / KB/ms /
  verdict; numbers in README → PERFORMANCE, macOS Apple Silicon).
- **E2E contract matrix** — `scripts/e2e.js` (`npm run e2e`): boots the
  real server on an isolated port, asserts every documented route with real
  HTTP, prints a pass/fail table, exits non-zero on failure.
- **Packaging validation** — `package.json` `files` allowlist +
  `test/package.test.js` (exports resolve, engine require()s from a temp
  dir); `npm pack --dry-run` = 38 files / 3.6 MB. Nothing published.

## SHIPPED — Rendered-tier browser checks (v1.3.0, 2026-11-16)

The rendered-tier roadmap item is **implemented and shipped** as *pure
functions over a computed snapshot* — no browser needed for the checks
themselves:

- `src/render-checks.js` (`scanRender(snapshot)`) — 11 `r-*` checks:
  kicker size (flat-type / shouting), gradient text, tracked all-caps,
  glued arrows, marquees, hidden-reveal (static-provable subset),
  1280×800 fold budget, ~80-word screen budget, section rhythm
  (uniform grids), fake progress, and WCAG text contrast over the
  computed background.
- `src/collect-render.js` — the ONLY browser part, OPTIONAL and never
  loaded by the engine; playwright is wrapped in try/catch and the module
  throws the documented opt-in error without it.
- Exposed everywhere: `POST /render-scan {snapshot|url}` on the Node
  server and the Workers entry, CLI `--snapshot file.json` / `--render
  <url>`, and a "Design reviews" panel in the web checker (paste a
  snapshot → in-browser checks). 34 tests over hand-crafted snapshots
  (fire + non-fire per check), no browser.
- **Local render farm and the GitHub job.**
  `node scripts/render-farm.js` serves `fixtures/render-farm/` to the
  Playwright collector and checks `src/render-farm-plan.js`. It skips
  when Playwright is absent and fails when `RENDER_FARM_REQUIRED=1`.
  Pull-request CI runs `.github/workflows/ai-slop-checker-render-farm.yml`
  (Playwright installed only in that job). A missing browser is a green
  skip. The checks themselves stay deterministic.

## Theme catalog

Hallmark ships a 50-theme creative-direction catalog (color/font/pattern
bundles with intent). A Lazynext equivalent landed in v1.3.0 as a
**doc-only human guide** — `docs/design-review-guide.md` §7 "Theme
catalog (guide)": archetypal templates (founder, dev tool, agency, SaaS
dashboard) with their slop-to-fix lists. This stays a guide, not code:
the catalog is creative direction, and a deterministic scanner should
never auto-apply themes.

## Judgement tells (soft, non-regex)

Some tells resist regexing without exploding false positives: "this
sentence could move to any product", "the paragraph is conclusion-shaped",
"three parallel examples of roughly equal length". The a11y sibling solves
this class with rendered trace + heuristics.

**SHIPPED in v1.4.1 as a deterministic checklist (`--judge` / `POST
/judge` / MCP `judge`)** — rather than pretend the machine can score soft
tells, the product now answers the *reviewer's* question: the 5-question
review (purpose/audience/decision/variety/defaults) with machine-flagged
signals, the craft-floor gate mapped from real evidence (non-machineable
items stay human checkboxes), refusal scaffolds, and a machine-computed
PASS | REVIEW | REFUSE verdict over only the machine-verifiable parts.
**Advisory soft-tell score shipped** (`src/soft-tells.js`, wired through
`judgeReport` as `softTells`). Sentence-spread, paragraph-shape, and
parallel-clause detectors produce an advisory score. That score does
not change the scan score and does not change PASS | REVIEW | REFUSE.
Precision on the pinned positives is 1, and the clean bench corpus
(every `negative` file plus `demo/clean.txt`) fires zero signals.
Folding the advisory number into the deterministic score stays parked:
that would change a contract the checklist judge promises not to move.

## Non-English built-ins (i18n corpus)

The i18n path is the external-rules mechanism; five ORIGINAL sample
corpora ship: `data/rules.ru.js` (36), `data/rules.hi.js` (33),
`data/rules.es.js` (34), `data/rules.fr.js` (32), `data/rules.de.js`
(32). The mechanism is the product; the corpora are content. More built-in
languages stay roadmap until each has a real reviewer; an
auto-translated corpus would import English-false-positive mistakes.

## Weighted severity profiles

**SHIPPED in v1.3.0** — `data/profiles.js`: `default` (current), `strict`
(warn-class ×1.5, clean ≤ 6), `lenient` (ignores severity-1, clean ≤ 14).
Wired through CLI `--profile`, API `profile` fields, MCP tool args, and
project-scan pooling. Future: per-domain presets (marketing copy,
technical docs, UI copy) as named profile *.js modules — content choice,
not engineering.

## CI gate

**SHIPPED 2026-11-19** — `.github/workflows/ai-slop-checker.yml` (quality
gate + daily live-check). Founder granted FULL AUTHORITY on 2026-11-19 for
the previously devops-gated `.github/` item. The workflow mirrors the local
analogue (`npm run check`) as a hard-fail gate:

- **Triggers:** `push` + `pull_request` on `ai-slop-checker/**` (and the
  workflow file itself), plus `schedule` (`0 4 * * *`, daily 04:00 UTC)
  and `workflow_dispatch`.
- **`quality` job** (all triggers, `needs`-gated only downstream): `npm run
  check` (corpus integrity → `node --test` → e2e 26/26), `node bench/eval.js`
  (GATE PASS, FP ≤ 5%), and the explicit 5-i18n-corpus integrity check
  (`data/rules.{ru,hi,es,fr,de}.js`, merged 446/32) — each a separate
  `run:` step so a failure names the step.
- **`live` job** (`schedule`/`workflow_dispatch`, `needs: quality` so it
  never runs on a red tree): `npm run live` — read-only probes of the
  deployed worker at `https://slop-checker.lazynext.com` (GET/HEAD surface,
  `/scan` text contract, MCP handshake, two deliberately-blocked SSRF
  `url` scans, asset-gating, sibling hosts). Site down → job fails →
  normal CI notifications.

The **local render farm** is `node scripts/render-farm.js`. The GitHub
job is `.github/workflows/ai-slop-checker-render-farm.yml` (source copy
`ci/render-farm.workflow.yml`). It is not part of
`.github/workflows/ai-slop-checker.yml`. The pure checks stay covered
without a browser.

## Package publishing

`npm pack --dry-run` is validated (38 files / 3.6 MB, `files` allowlist,
v1.4.0) and the engine require()s through the package name from a temp
dir — but **nothing is published**. Publishing `@lazynext/ai-slop-checker`
is a founder decision: license confirmation (MIT header/naming policy,
see ATTRIBUTIONS) must land first, then an npm account is required (no
accounts or paid services were opened for this deliverable).

## PWA shell for the web checker

**SHIPPED in v1.3.0** — `web/manifest.webmanifest`,
`web/sw.js` (network-first page, cache-first versioned assets,
scope-relative paths), `web/register-sw.js` (http(s)-guarded
registration) + `web/icons/` (sips-derived 192/512 PNGs). The `web/
index.html` change is purely additive (manifest link + register script).

## Plugin / distro packaging

Claude Code plugin, Codex, OpenCode command packaging for the skill, mirroring
the inspirations' installers. The skill content exists; packaging is an
account/release decision (no accounts or paid services were opened for this
deliverable).

## Deferred (founder-gated / devops-gated, with reasons)

- **No deployment executed** — code + docs only (`Dockerfile`,
  `wrangler.toml`, `docs/DEPLOYMENT.md`); deploying is a founder decision.
  Docker tags bumped to 1.4.1 but nothing was built or pushed.
- **License confirmation** — the MIT header/naming policy for a
  Lazynext-authored open product has not been confirmed by the founder
  (see the note in ATTRIBUTIONS). Ship shape is ready (LICENSE, package
  metadata, `files` allowlist); the license decision is a founder call.
- **Real-browser render CI on GitHub** — installed as
  `.github/workflows/ai-slop-checker-render-farm.yml` (the quality
  workflow is separate). Playwright is installed only in that job.
  A missing browser is a green skip. The pure checks stay tested
  without a browser.
- **A2A cross-isolate replay** — each isolate keeps its own memory map.
  The Worker binds one SQLite Durable Object room (`A2A_TASKS`,
  name `a2a-recent`) so a put is visible to the next isolate when the
  send's write resolves. KV `RECENT` remains the eventual fallback when
  the room call throws or times out (4s). A local view still wins a
  timestamp tie.
- **rules_url accepts JSON only** over the network — remote JS execution is
  deliberately not offered (arbitrary-code risk); local `--rules` supports
  `.js` modules.
- **No `batch` A2A, no SSE streaming on MCP** — the MCP surface is the
  single-POST subset; streaming needs a hosted upgrade.
- **Theme catalog stays a human guide** — shipped as documentation
  (`docs/design-review-guide.md`), never as machine-applied code.
- **Judgement soft-tell heuristics** — the detectors and an advisory
  score ship (see Judgement tells). They do not drive the deterministic
  scan score or the checklist verdict.