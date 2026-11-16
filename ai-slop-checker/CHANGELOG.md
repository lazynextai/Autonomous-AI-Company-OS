# Changelog

All notable changes to the Lazynext AI Slop Checker. SemVer; unreleased
changes live in the "Unreleased" section until tagged.

## Unreleased

Nothing yet.

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