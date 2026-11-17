# Changelog

All notable changes to the Lazynext AI Slop Checker. SemVer; unreleased
changes live in the "Unreleased" section until tagged.

## v1.4.1 — 2026-11-17 (phase 6: judgement checklist, quality gate, UX fix)

### Judgement checklist (`--judge` / `POST /judge` / MCP `judge`)
- **`src/judge.js`** — `judgeReport({text?|html?|project?})`: a
  deterministic, machine-built report that turns "judgement tells" into a
  checklist. Three parts + a verdict:
  1. **The 5-question review** (purpose / audience / decision / variety /
     defaults) — each question ships `hints` + `verdictHint`, plus
     machine-flagged `signals` where scan evidence bears on it (copy-heavy
     categories for purpose; `d-flat-type`/`d-display-headline`/`d-kicker`/
     `d-caps-card-grid` for decision; `d-one-gap`/`d-section-numbers` for
     variety; any design tell for defaults). The questions are labelled as
     human steps — the machine never answers them.
  2. **The craft-floor gate** (contrast / alignment / text-hierarchy /
     spacing / no-fake-data / no-decorative-effects) — mapped from
     machine evidence wherever it exists (`d-flat-type`,
     `d-display-headline`, `d-kicker`, `d-one-gap`, `d-stat-row`,
     `d-badge-spam`, `d-avatar-grid`, `d-gradient-text`,
     `d-crushed-tracking`, `d-glued-arrow`); genuinely non-machineable
     items (contrast, alignment — need computed styles) are emitted as
     human checkboxes `machine:"unchecked"` with guidance, **never a fake
     verdict**.
  3. **Refusal scaffolds** — the three professional sentences
     ("shape is wrong", "claim outruns the evidence", "floor passes, bar
     is the problem") from docs/design-review-guide.md §6.
  4. **Verdict** — `PASS` (no machine objections + floor met), `REVIEW`
     (copy/design objections), `REFUSE` (a machine-checked floor item
     failed) — computed **only** from machine-verifiable parts, with the
     checklist clearly labelled as human steps. Deterministic: same input
     → same report (`test/judge.test.js` pins byte-identical determinism).
- **CLI** `--judge` (composes with `--file` / `--url` / `--dir` /
  positional text; exit 0 = PASS, 2 = REVIEW, 3 = REFUSE).
- **API** `POST /judge {text|html|project}` (mirrors scan shapes; `project`
  is local-filesystem only and returns the documented 400 on the Workers
  entry).
- **MCP** — `tools/list` now returns **7 tools** (`judge` added;
  `{text}`/`{html}`/`{dir}`), agent card gains the `judge` skill and bumps
  to 1.4.1.
- **OpenAPI** — `/judge` route + `JudgeReport` schema (info.version 1.4.1).
- **Docs** — docs/usage.md: `--judge` flag matrix, exit codes incl. 3,
  judge report shape + verdict rules, MCP tool row.

### `npm run check` quality gate
- **`scripts/check.js`** — runs `check-corpus.js` (base + ru/hi/es), the
  full `node --test` suite, and `npm run e2e` (pinned port 8793; refuses
  8792) sequentially, prints a PASS/FAIL summary table with timings, and
  exits non-zero on any failure. Wired as the `check` npm script.

### Web-checker stale-results UX fix (real-browser smoke-test finding)
- **`web/app.js`** — a scan START on any tab now **clears the previous
  results area**; a failed scan renders a **distinct error state** in the
  results area (verdict area shows "Scan failed" + the message, plus a
  "Try again" button) instead of leaving the previous report on screen
  with only an error line below the buttons. The inline error line stays
  (the URL tab's CORS-aware tip is preserved).
- **Regression lock** — the pure, DOM-free `SlopAppState` lifecycle
  helpers (`started` / `finished` / `failed` — exposed on `window`) are
  exercised by the new `test/app.test.js` (8 tests, node-only, parse-level:
  new Function parse, vm load shim, state transitions, structural wiring
  assertions, CORS-tip preservation).

### Version + docs
- 1.4.0 → 1.4.1 in `package.json` (+ `./judge` export, `check` script),
  `data/slop-patterns.js` (corpus version), `api/agent-surfaces.js`
  (agent card), `api/openapi.json` (info.version), `src/render-checks.js`
  (fallback literal), `llms.txt`, README (report shape, docker tags,
  browser notes, roadmap), `docs/usage.md`, `docs/DEPLOYMENT.md` (docker
  tags).
- **ATTRIBUTIONS** — phase-6 note (judge checklist is original work;
  the 5-question review / craft floor / refusal scaffolds are our own
  docs-derived tables).
- Test count: 319 → **345** (node --test); e2e 22 → **26** checks
  (port 8793).

## v1.4.0 — 2026-11-16 (phase 5: hardening & release readiness)

### Fuzz robustness
- **Hostile-input battery** — `test/fuzz-robustness.test.js` (79 tests):
  empty / whitespace / 1 MB repeated / binary non-UTF8 / lone surrogates /
  astral emoji / RTL Hebrew-Arabic / NUL bytes / 1000-deep nested HTML /
  malformed HTML / JSON & JS-as-text / punctuation runs / single char /
  100k-char word / mixed-script soup / entity storms, run through
  `scanText`, `scanHtml`, `scanDesign`, `rewriteText` (no-throw,
  byte-identical determinism, valid report shape, <1s budget) plus a
  hostile temp fixture through `scanProject` and 10 hostile snapshots
  through `scanRender`.
- **4 crash/robustness fixes** (2 inherited + 2 reviewed while committing):
  1. out-of-range numeric character references (`&#1114112;`, `&#x110000;`)
     now decode to U+FFFD instead of `String.fromCodePoint` throwing
     `RangeError` on hostile markup;
  2. snapshot sanitization (`src/render-checks.js`) — hostile style values
     (string px, object `backgroundImage`, non-finite rects) and non-object
     elements are normalized deterministically before any check runs;
     conforming snapshots keep a zero-copy fast path;
  3. hex entity references (`&#x1F600;`) now decode base 16 — the inherited
     shared base-10 decoder silently corrupted every hex entity to U+0001..;
  4. an all-invalid `screens` array could reintroduce raw indices (fallback
     to the untrusted source) and crash `checkScreenBudget` — the sanitizer
     output is now authoritative.
- Regression-guarded in `test/scanner.test.js` + `test/render-checks.test.js`

### Corpus quality gates
- **`scripts/check-corpus.js`** — validates one or more corpora: ids unique
  and `^[a-z][a-z0-9-]*$`, required fields (id/category/severity 1-3/match/
  fix), valid kinds, category ids unique with name+desc, no duplicate
  identical match strings per category, per-category counts, and — when
  extra files are passed — cross-file pattern/category id uniqueness against
  the merged universe (i18n corpora legitimately reuse built-in category
  ids). Prints `INTEGRITY PASS`/`FAIL`; exits non-zero on failure.
- **`test/corpus-validate.test.js`** (9 tests) — base 279/27, ru(36) +
  hi(33) + es(34), merged via `loadRules` = **382 patterns / 30 categories**,
  zero id duplication across all four corpora.

### Performance bench
- **`bench/perf.js`** — real wall-clock measurements (ms, input size,
  KB/ms, verdict): `scanText` on a ~100 KB realistic prose mix,
  `scanHtml` on a ~200 KB HTML document, `scanProject` over
  `demo/fixture-project/`, `rewriteText` on the 100 KB text; `--json` for
  machine output. Real measured numbers recorded in README → PERFORMANCE
  (macOS Apple Silicon).

### Packaging validation
- **`package.json` `files` allowlist** — README, LICENSE, CHANGELOG,
  llms.txt, `data/`, `src/`, `api/`, `web/`, `skill/`, `docs/`, `assets/`;
  excludes `bench/`, `demo/`, `test/`, `scripts/`, `Dockerfile`,
  `wrangler.toml`. `npm pack --dry-run`: **38 files, 3.6 MB**, v1.4.0.
- **`test/package.test.js`** (4 tests) — metadata validity, `main`+every
  `exports` target resolves, allowlist covers the runtime surface, and the
  engine `require()`s through the package name from a temp dir
  (`os.tmpdir` + node_modules symlink, `child_process`).

### E2E contract matrix
- **`scripts/e2e.js`** (`npm run e2e`) — boots `api/server.js` on an
  isolated port (8793; refuses 8792), waits for `/health`, then asserts the
  full contract with real HTTP: 7 GET surfaces, `/scan` text/html/
  `rules_url`-400, `/scan-project` with a self-created temp fixture,
  `/render-scan` with a hand-built gradient snapshot, MCP
  initialize/tools/list/tools/call, A2A message/send + `GET /a2a/tasks/:id`
  replay. Prints a route→status table; exits non-zero on any failure.

### Version + docs
- 1.3.0 → 1.4.0 in `package.json`, `data/slop-patterns.js` (corpus
  version — reported by every engine), `api/agent-surfaces.js` (agent
  card), `api/openapi.json` (info.version), `src/render-checks.js`
  (fallback literal), `test/worker.test.js` (assertions), `docs/DEPLOYMENT.md`
  (docker tags), README (report shape + docker tags).
- **`docs/usage.md`** — complete usage reference: CLI flag matrix
  (`--profile`/`--rules`/`--dir`/`--top`/`--snapshot`/`--render`/`--json`/
  `--rewrite`/`--file`/`--url`) + CLI exit codes, every API route with
  request/response shapes, MCP tools, A2A, and the HTTP + JSON-RPC error
  code tables.
- README: new **PERFORMANCE** section (real bench numbers), hardening/
  robustness note, `npm run e2e` quickstart. ROADMAP: phase-5 items moved
  to SHIPPED. ATTRIBUTIONS: phase-5 note.
- Full suite: **319 tests, all green** (was 222).

## v1.3.0 — 2026-11-16 (phase 4: rendered-tier checks, profiles, i18n, PWA)

### Rendered-tier checks (pure functions over computed snapshots)
- **`src/render-checks.js`** — 11 `r-*` checks that are PURE functions over
  an immutable computed-snapshot contract (`{ viewport?, documentStyle?,
  elements: [...] }`, element styles serialized by a browser at collection
  time). No browser, no DOM, no dependencies: `scanRender(snapshot)` runs
  anywhere the base engine does, with the same score/verdict/categories
  shape and per-pattern point caps:
  `r-kicker-size` (flat-type / shouting kickers), `r-gradient-text` (AI
  gradient headlines + blue/violet stop pairs), `r-tracked-caps`
  (all-caps caption tracking outside 0.02–0.35em), `r-glued-arrow`
  (arrow glyph glued to the last word), `r-marquee` (marquee/ticker
  animations), `r-hidden-reveal` (static-provable hover reveals +
  aria-hidden duplication), `r-fold-budget` (the 1280×800 fold: ≤2
  distinct section headers above it, headers within 40px of the edge),
  `r-screen-budget` (~80 visible words per screen), `r-section-rhythm`
  (6+ identical sibling cards / 3+ identical sections),
  `r-fake-progress` (progressbars with no aria-valuenow and no animation),
  `r-contrast` (WCAG text contrast over the computed background, 4.5:1 /
  3:1 thresholds).
- **Optional collector** — `src/collect-render.js` is the ONLY browser
  part and is strictly OPTIONAL (never loaded at engine require-time;
  playwright import wrapped in try/catch). Without `npm i -D playwright`
  it throws a clear opt-in message. Tests use hand-crafted snapshots, no
  browser.
- **Wiring** — `POST /render-scan {snapshot}` on both the Node server and
  the Workers entry (pure, works everywhere); `{url}` collects first and
  needs the optional collector (501 with the opt-in message when absent).
  CLI: `--snapshot file.json` and `--render https://…`. Web checker:
  a "Design reviews" panel (injected additively from `app.js` so the page
  shell stays untouched) that pastes a snapshot JSON and runs the checks
  fully in-browser.
- **Tests** — `test/render-checks.test.js`: 34 tests, hand-crafted
  fire/non-fire snapshots for EVERY check, determinism, input validation,
  and the absent-playwright opt-in path (no browser, no playwright in the
  package).

### Severity profiles
- **`data/profiles.js`** — `default` (current behaviour: all severities,
  clean ≤ 9), `strict` (warn-class counts harder, clean ≤ 6), `lenient`
  (ignores severity-1 warn-class, clean ≤ 14). The profile selects the
  threshold + included severities; `applyProfileReport` re-scores
  non-mutatingly on the same decay curve.
- Wired through CLI `--profile`, API `scan`/`scan-project`/
  `render-scan` `profile` fields, MCP `scan_text`/`scan_html`/
  `scan_project`/`scan_render` tool args, and project-scan pooling.
  Tests in `test/profiles.test.js` (9 tests incl. CLI + API + render +
  project paths).

### i18n corpora (external-rules path)
- **`data/rules.hi.js`** — original Hindi AI-slop-tell corpus (33
  patterns): loanword English buzzwords in Devanagari (लेवरेज,
  ऑप्टिमाइज़, सीमलेस, सिनर्जी), epoch openers (आज के डिजिटल युग में),
  throat-clearing (यह बात ध्यान देने योग्य है), hedge phrases, generic
  superlatives (अद्वितीय, शानदार, क्रांतिकारी). Appends `hi-copy-tics`.
- **`data/rules.es.js`** — original Spanish corpus (34 patterns):
  anglicisms (apalancar, seamless, optimizar), epoch openers (en el
  mundo actual, en un mundo cada vez más), throat-clearing (es
  importante destacar, no es ningún secreto que), generic superlatives
  (innovador, revolucionario, vanguardia). Appends `es-copy-tics`.
- Both fire on their script samples, score 0 on the English clean demo,
  merge with `data/rules.ru.js` for 279 + 36 + 33 + 34 with zero
  duplication, and duplicate-id rejection keeps working after merging.
  Tests in `test/i18n.test.js` (7 tests).

### Design-review guide
- **`docs/design-review-guide.md`** — an original, human-facing merge of
  the impeccable/hallmark vocabulary: the one rule ("slop is the absence
  of a decision"), tone pairs, the four review modes (polish / critique /
  audit / refuse) with checklists, the craft floor (contrast, alignment,
  text hierarchy, spacing, no fake data, no decorative text-effects), the
  5-question review, refusal scaffolds, and a short theme catalog
  (founder / dev tool / agency / SaaS dashboard archetypes with their
  slop-to-fix lists) — a doc-only artifact.

### PWA shell (web checker)
- `web/manifest.webmanifest` (Lazynext AI Slop Checker, brand colors
  #0468F8/#04B4FC/#FCFCFC, icons generated from assets/favicon.png via
  `sips` to 192/512 PNG in `web/icons/`), `web/sw.js` (network-first
  page, cache-first versioned assets, scope-relative paths so the checker
  works from any mount path), `web/register-sw.js` (guards registration
  to http(s) — file:// never registers).
- `web/index.html` change is purely additive: `<link rel="manifest">` +
  theme-color meta + a `defer` register script (the web-checker smoke
  test surface stays intact).
- Tests in `test/pwa.test.js` (manifest keys + icon PNGs at declared
  sizes; sw.js parses via `new Function`, fetch/install handlers,
  scope-relative; register-sw.js guards on `location.protocol`).

### Version + docs
- 1.2.0 → 1.3.0 in `package.json`, `package-lock.json`,
  `data/slop-patterns.js` (corpus version), `api/openapi.json`,
  `api/agent-surfaces.js` (agent card). New package exports:
  `./profiles`, `./render-checks`, `./collect-render`.
- README quickstart additions (`--profile`, `--snapshot`, `--render`,
  PWA), ROADMAP update (rendered tier moved to SHIPPED), ATTRIBUTIONS
  phase-4 note, `docs/DEPLOYMENT.md` docker tags bumped.
- Full suite: **222 tests, all green** (was 166).

## v1.2.0 — 2026-11-16 (phase 3: agent ecosystem, rules i18n, deploy, dogfood)

### Agent-ecosystem surfaces
- **MCP server** — `POST /mcp` (JSON-RPC 2.0): `initialize`, `ping`,
  `tools/list`, `tools/call` with tools `list_rules`, `scan_text`,
  `scan_html`, `scan_project`, `rewrite_text`. Batches supported; GET is
  405 (no SSE). Both the plain-Node server and the Workers entry serve it.
- **OpenAPI contract** — `api/openapi.json` (OpenAPI 3.1) describing every
  route (`/`, `/index.html`, `/health`, `/rules`, `/scan`, `/scan-project`,
  `/mcp`, `/a2a`, `/a2a/tasks/{id}`, `/.well-known/agent.json`,
  `/widget.js`, `/openapi.json`, `/llms.txt`), with a structural parity test
  (`test/openapi-parity.test.js`) that fails when a server route has no spec
  entry or a spec path has no handler, and validates every `$ref`.
- **Discovery files** — `llms.txt` (product + endpoint pointers) and
  `GET /.well-known/agent.json` (A2A-style agent card).
- **Lightweight A2A** — `POST /a2a` (JSON-RPC 2.0: `message/send`,
  `tasks/send`, `tasks/get`) plus the REST shortcut
  `GET /a2a/tasks/:id`. Task id == JSON-RPC request id; results replay
  from an in-memory recent store (200 entries, 30-minute TTL). No KV, no
  files — honest analogue of the a11y sibling's KV-replay pattern for a
  zero-dependency Node server.
- **Embeddable widget** — `GET /widget.js`: a shadow-DOM `<textarea>`→scan
  box (~10KB) that loads the engine from its own origin and runs the scan
  fully in-browser. No external dependencies.

### Rules extension + i18n
- **External rules** — CLI `--rules /path/to/rules.js` (also `.json`,
  globs, comma-separated lists) and API `POST /scan {rules_url}` (http(s)
  only, 10s timeout, JSON payload). Deep-merge semantics: new categories
  appended, existing categories merged, duplicate pattern ids rejected with
  a clear error, unknown categories rejected.
- **Engine factories** — `src/scanner.js` now exports
  `createEngine(mergedCorpus)` and `src/rewriter.js` exports
  `createRewriter(mergedCorpus, engine)` so a merged corpus drives both the
  scan and the safe-rewrite halves consistently (fixes the phase-3 wiring
  bug where a custom engine's rewrite path was undefined).
- **i18n sample** — `data/rules.ru.js`: an original, Lazynext-written
  Russian slop-tell corpus (36 patterns, 1 new appended category). The
  extension mechanism is the general i18n path; non-English built-ins are
  still roadmap (see ROADMAP.md).

### Deployment artifacts (code + docs only; nothing deployed)
- `Dockerfile` (multi-stage `node:20-alpine`, non-root, port 3000,
  `/health` healthcheck), `.dockerignore`, `wrangler.toml` (account_id
  placeholder), `docs/DEPLOYMENT.md` (Worker + Docker run books with the
  `CLOUDFLARE_DEPLOY_TOKEN` note and custom-domain binding, marked as NOT
  executed).

### Bench & dogfood
- `bench/run.js` — scans the product's own docs + web assets and prints a
  table (file, kind, score, matches, top category). `--json` for machine
  output.
- Dogfood fixes: `web/index.html` em-dash habit (11 → 1) and middle-dot
  footer chains; `skill/references/visual-tells.md` em-dash cluster and a
  `genuinely` adverb in our own prose. Both now score 0. README /
  ATTRIBUTIONS / skill bodies deliberately QUOTE slop words as examples
  (what the tool flags) and are documented as expected-high in
  `docs/dogfood-report.md`.
- `docs/dogfood-report.md` records the bench table + found-and-fixed list.

### Web checker
- **In-browser project scan** — new "Scan a folder" tab: File System Access
  API (`showDirectoryPicker`) when available, fallback to multiple
  `<input type=file>`. New browser-safe `src/project-scanner-browser.js`
  reuses the prose/markup/styles/code lens classification and pooled
  scoring of the Node project scanner; zero build step, no external CDNs.
- The page also loads `project-scanner-browser.js` (UMD).

### Tests
- New suites: `rules-loader.test.js` (merge semantics, dup rejection, .ru
  corpus, CLI --rules), `agent-surfaces.test.js` (MCP handshake + every
  tool, A2A, discovery, widget parse), `api-rules-url.test.js` (rules_url
  over a local fixture HTTP server, offline-safe), `openapi-parity.test.js`
  (route/spec parity), `project-scanner-browser.test.js` (lens parity with
  Node + web asset sanity), `bench.test.js` (bench + dogfood stays fixed).
- All URL-fetch tests are offline-safe (local fixture servers; no external
  network). Full suite: **166 tests, all green** (`node --test`).

## v1.1.0 — 2026-11-16 (completeness pass)

- Corpus 170 → **279 patterns** across **27 categories** (added
  superficial-analysis, meta-commentary, vague-declarative, false-agency,
  passive-voice writing categories; ~45 writing patterns; ~20 design
  heuristics; stop-slop structures; kill-ai-slop tells 03/04/05/09/11/13/
  14/20/24/34/35; impeccable detector rules; hallmark sloplint signals).
- **Project-scan mode** — `src/project-scanner.js`: walks a tree, infers
  each file's lens (prose/markup/styles/code), pools per-file point-capped
  matches into one project score + category breakdown + top files.
  Exposed via CLI `--dir` and `POST /scan-project`.
- Design heuristics now cover Tailwind-class and raw-CSS variants.
- Skill distribution complete: `skill/SKILL.md`, `skill/CLAUDE.md`,
  `.cursor/rules/slop-guard.mdc`, `skill/references/visual-tells.md`.
- 71 tests green.

## v1.0.0 — 2026-11-15 (initial build)

- Deterministic scan engine (`src/scanner.js`): scanText / scanHtml /
  scanDesign (+ extractText, emoji counting), scoring 0–100 with
  exponential decay and per-pattern point caps, verdict bands
  (clean/light/moderate/heavy).
- Corpus: 170 patterns / 27 categories (word-ban, filler-phrases,
  business-jargon, throat-clearing, faux-insight, binary-contrast,
  colon-reveal, importance-puffery, weasel-attribution, fake-strong-verb,
  adverb-overuse, rhetorical-setup, negative-listing, dramatic-fragment,
  summary-recap, em-dash, meta-commentary, emphasis crutches, vague
  declaratives, false agency, passive voice + 6 design-* categories).
- Conservative rewriter (`src/rewriter.js`) — whole-word synonym swaps and
  curated phrase deletions only; before/after previews.
- Plain-Node HTTP API (`api/server.js`): `/`, `/health`, `/rules`,
  `POST /scan` ({text|html|url}, 10s timeout, branded UA), static web
  checker hosting.
- Cloudflare Workers entry (`api/worker.js`).
- Zero-dependency CLI (`api/cli.js`): text, `--file`, `--url`, `--json`,
  `--rewrite`, `--rules` (manifest).
- No-build branded web checker (`web/`): paste-text or URL scan, gauge,
  category breakdown, flagged snippets, safe-rewrite preview.
- Skill distro: SKILL.md + CLAUDE.md + Cursor rules + visual-tells field
  guide.
- Tests: 71 across scanner / rewriter / project-scanner / API.