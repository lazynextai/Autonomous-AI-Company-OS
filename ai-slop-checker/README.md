# Lazynext AI Slop Checker

A deterministic scanner for **AI slop** — the predictable writing and design
tells of generated content — with a branded web checker, a dependency-light
API, a conservative auto-rewriter, and an agent skill. Built by Lazynext
(UNITED GLOBAL VENTURES PRIVATE LIMITED), merging the ideas behind five
open-source anti-slop projects into one original codebase.

> ⚠️ **Legal note:** this is an **original implementation**. The five source
> projects were researched for their *ideas and taxonomies*, and are credited
> in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). Short factual words/phrases are
> listed as the classification corpus; all descriptions, fixes, docs, and code
> were written by Lazynext. The MIT license here applies to our original work
> only — review the attribution file and each source project's license before
> redistributing.

## What it does

- **Scans text** for 21 categories of writing tells: banned AI vocabulary
  (`delve`, `tapestry`, `game-changer`, …), empty filler phrases
  ("it's worth noting", "in today's fast-paced world", …), throat-clearing,
  faux-insight setups, binary contrasts ("It's not X. It's Y."), colon
  reveals, importance puffery, weasel attribution, empty adverbs, rhetorical
  setups, negative listings, dramatic fragments, summary-recap endings,
  em-dash clusters, superficial-analysis -ing clauses, meta-commentary,
  vague declaratives, false agency, and passive voice.
- **Scans HTML** for 6 categories of visual/design tells: indigo-violet
  gradients, gradient headline text, warm "cozy" palettes, the default
  semantic rainbow, one-hue status boxes, kickers over every heading, flat
  type hierarchies, display-size headlines, glassmorphism, glowing status
  dots, border-left callouts, badge/pill spam, invented stat rows, 01/02/03
  section markers, springy hovers, ghost cards, "Powered by AI" badges,
  tasteful-terminal and editorial-dashboard costumes, marquees, and more —
  as heuristics over markup and CSS.
- **Scans whole projects** (`--dir`): walks a directory tree, infers each
  file's lens (prose → text tells; markup → HTML; styles/code → design
  tells), and rolls per-file reports into one pooled summary with top
  offending files and a category breakdown. This is the scan→triage→
  report→fix workflow for an entire codebase.
- **Scores 0–100** deterministically (same input, same score — no LLM, no
  network, no randomness), with per-category breakdowns, per-match
  before/after fix suggestions, and a `clean` verdict for low scores.
- **Suggests conservative rewrites** that never invent new sentences:
  whole-word synonym swaps and safe phrase deletions only.
- **Extends with your own rules** (`--rules` / `rules_url`): deep-merge a
  custom corpus file — new categories are appended, existing ones merged,
  duplicate pattern ids rejected — and the merged corpus drives both scan
  and rewrite. The same mechanism is the i18n path (see `data/rules.ru.js`,
  an original Russian slop-tell sample).
- **Talks to agents**: MCP (`POST /mcp`) and a lightweight A2A surface
  (`POST /a2a`) with an agent card, an OpenAPI 3.1 contract, `llms.txt`,
  and an embeddable shadow-DOM widget (`/widget.js`).
- **Runs everywhere**: Node CLI, a plain-Node HTTP API, a Cloudflare Workers
  entry, a Docker container, and a fully in-browser web checker (no build
  step) that can also scan a whole folder of website assets locally.

## Quickstart

Requires Node ≥ 20. No install needed for the CLI or web checker (zero
dependencies).

```sh
npm install        # no-op today: declares no dependencies (package-lock generation only)

# Tests
npm test           # = node --test   (398 tests)

# Full quality gate: corpus integrity + unit suite + end-to-end matrix
npm run check      # sequential: check-corpus.js → node --test → e2e on 8793,
                   # prints a summary table, exits non-zero on any failure

# Corpus quality benchmark: per-family precision/recall/F1 + negative-FP gate
npm run eval       # = node bench/eval.js   (exit 0 = gate PASS; --json for machine output)
npm run eval:json  # = node bench/eval.js --json

# End-to-end API contract matrix (spawns api/server.js on port 8793)
npm run e2e        # asserts every route (GET/POST/MCP/A2A), prints a table, exits non-zero on failure

# Live verification — validates the DEPLOYED Worker over real HTTP (read-only
# probes + the service's own POSTs; exits non-zero on any failure)
npm run live       # https://slop-checker.lazynext.com + sibling hosts (default)
npm run live:all   # explicit full host matrix (same as the default)

# CLI
node api/cli.js "We must leverage this robust cutting-edge solution."
node api/cli.js --file demo/slop.txt
node api/cli.js --file demo/clean.txt
node api/cli.js --url https://example.com
node api/cli.js --json "machine readable report"
node api/cli.js --rules                                    # dump the corpus shorthand
node api/cli.js --rules data/rules.ru.js "В современном мире..."   # scan with external rules
node api/cli.js --rules data/rules.hi.js "आज के डिजिटल युग में..."   # Hindi i18n corpus
node api/cli.js --rules data/rules.es.js "En el mundo actual..."   # Spanish i18n corpus
node api/cli.js --rules data/rules.fr.js "Dans le monde d'aujourd'hui..."   # French i18n corpus
node api/cli.js --rules data/rules.de.js "In der heutigen schnelllebigen Welt..."   # German i18n corpus
node api/cli.js --rules "rules/**\/*.js" --dir src          # external rules + project scan
node api/cli.js --dir path/to/project        # whole-project scan
node api/cli.js --dir path/to/project --top 20
node api/cli.js --dir path/to/project --json
node api/cli.js --profile strict "delve deep into this"     # severity profile
node api/cli.js --profile lenient --dir path/to/project     # profile + project scan

# Judgement checklist (--judge): 5-question review + craft-floor gate +
# refusal scaffolds + machine PASS/REVIEW/REFUSE verdict
node api/cli.js --judge --file demo/slop.txt   # REVIEW → exit 2
node api/cli.js --judge --file demo/clean.txt  # PASS   → exit 0
node api/cli.js --judge --url https://example.com
node api/cli.js --judge --dir path/to/project
node api/cli.js --judge "We must leverage this."

# Rendered-tier checks (pure functions over computed snapshots)
node api/cli.js --snapshot snapshot.json                    # check a collected/pasted snapshot
node api/cli.js --render https://example.com                # collect (needs playwright) + check

# API server (also serves the web checker at http://localhost:8787)
node api/server.js
PORT=3000 node api/server.js
curl -s -X POST localhost:8787/render-scan -H 'content-type: application/json' \
  -d '{"snapshot":{"viewport":{"width":1280,"height":800},"elements":[]}}'

# Web checker (in-browser engine, no server needed): open web/index.html,
# or visit http://localhost:8787 with the API running. Includes a
# "Scan a folder" mode (File System Access API, file-input fallback) that
# scans chosen website assets entirely in the browser, and a
# "Design reviews" panel that runs the rendered-tier checks over a pasted
# snapshot JSON — also entirely in the browser. Installable as a PWA when
# served over http(s) (manifest + service worker; file:// stays untouched).
```

### Browser notes

The web checker keeps an explicit scan lifecycle (shipped in v1.4.1 after
a real-browser smoke test caught the flaw): pressing **Scan for slop** on
any tab first **clears the previous results area**, so a new scan never
shows a stale report. If a scan fails — for example a URL that refuses
cross-origin reads (CORS) — the results area renders a **distinct error
state** (the verdict area shows `Scan failed` + the message, plus a
**Try again** button) instead of leaving the previous report on screen
with only an error line below the buttons. The inline error line under
the buttons stays (the URL tab's CORS-aware tip is preserved). The pure
state transitions behind this (`SlopAppState` on `window`) are unit-tested
in `test/app.test.js` with no browser and no DOM library.

External rules files accept a path, a `.json` file, a glob, or a
comma-separated list, and deep-merge into the built-in corpus: custom
categories are appended, custom patterns in existing categories fold in,
and duplicate pattern ids are rejected with a clear error. The merged corpus
wins the report's `version`. `data/rules.ru.js`, `data/rules.hi.js`,
`data/rules.es.js`, `data/rules.fr.js` and `data/rules.de.js` are shipped
samples — original Russian, Hindi, Spanish, French and German AI-slop-tell
corpora demonstrating the general i18n path (279 + 36 + 33 + 34 + 32 + 32
patterns when merged; zero duplication).

Project scans infer each file's lens — `.md`/`.txt` are prose-scanned,
`.html`/`.jsx`/`.tsx`/`.vue`/`.svelte`/`.astro` are HTML-scanned, and
`.css`/`.scss`/`.js`/`.ts`/`.json`/`.py` and friends get a design-only pass
over the raw source (class strings and style attrs), so a `flex justify-center
bg-gradient-to-r from-indigo-500 to-purple-500` in a `.tsx` file is caught
without drowning in code identifiers. `node_modules`, `.git`, `dist`, `build`,
lockfiles, and binaries are skipped.

## The report shape

```js
{
  engine: "lazynext-ai-slop-checker",
  version: "1.4.2",
  input: { type: "text", length: 412 },
  score: 63,                    // 0 (clean) - 100 (max slop)
  verdict: "moderate",          // clean | light | moderate | heavy
  clean: false,                 // true when score <= 9
  totalPoints: 28,
  matches: [
    {
      id: "w-delve", category: "word-ban", severity: 2, kind: "word",
      index: 41, snippet: "delve",
      context: "…teams to delve into a seamless journey…",
      fix: "Use 'explore', 'examine', or simply 'look into' — or state what you actually did.",
      rewrite: "explore"
    }
    // ...
  ],
  categories: [
    { id: "word-ban", name: "Banned words", count: 6, points: 9 }
    // ...
  ]
}
```

Scoring: each match contributes its severity; a single pattern is capped at
`severity × 3` so repeated tells cannot saturate the score; the total is
mapped through an exponential decay to a 0–100 scale.

## Usage

### Library

```js
const { scanText, scanHtml } = require("@lazynext/ai-slop-checker"); // or ./src/scanner.js
const { rewriteText } = require("./src/rewriter.js");
const { scanRender } = require("./src/render-checks.js"); // rendered-tier checks (pure)
const { judgeReport } = require("./src/judge.js"); // judgement checklist (deterministic)

const report = scanText("In today's fast-paced world, we must leverage our robust solution.");
const htmlReport = scanHtml("<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><h1>Hello</h1>");
const strictReport = scanText("We must utilize this.", { profile: "strict" }); // severity profile

// Rendered-tier checks over a computed snapshot (no browser needed):
const snapshot = { viewport: { width: 1280, height: 800 }, documentStyle: { backgroundColor: "#ffffff" }, elements: [...] };
const renderReport = scanRender(snapshot); // r-kicker-size, r-contrast, r-fold-budget, ...

const { text, changes } = rewriteText("We should utilize this tool and leverage the API.");

// Judgement checklist over any supported input (deterministic, no LLM):
const judge = judgeReport({ text: "We must leverage this robust solution." });
// judge.summary.verdict ∈ { "PASS", "REVIEW", "REFUSE" } — computed ONLY
// from machine-verifiable parts; the 5-question review + human-checkbox
// floor items stay human steps (see docs/usage.md "Judge report shape").
```

Custom rules, through an engine built over the merged corpus:

```js
const { loadRules } = require("./src/rules-loader.js");
const { createEngine } = require("./src/scanner.js");
const { createRewriter } = require("./src/rewriter.js");

const merged = loadRules("data/rules.ru.js");           // path, .json, glob, list, or object
const engine = createEngine(merged);                    // scan via the merged corpus
const rewriter = createRewriter(merged, engine);        // rewrites via the same corpus
const ruReport = engine.scanText("В современном мире …");
const hiEsMerged = loadRules("data/rules.hi.js,data/rules.es.js"); // Hindi + Spanish together
// merged.version is reported; merged.patterns.length = 279 + 36 + 33 + 34 (ru + hi + es)
```

### API

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/` | GET | — | JSON service descriptor (or the web checker when `web/` exists) |
| `/index.html` | GET | — | web checker page (alias of `/`) |
| `/health` | GET | — | liveness probe |
| `/rules` | GET | — | full pattern corpus manifest (279 rules, list-rules style) |
| `/scan` | POST | `{text}` · `{html}` · `{url}` · `{rules_url?}` · `{profile?}` | scan report; `{rewrite:true}` for text adds safe rewrites; `rules_url` (http(s) JSON, 10s timeout) deep-merges external rules; `profile` (`"default"|"strict"|"lenient"`) selects the severity threshold |
| `/judge` | POST | `{text}` · `{html}` · `{project}` | judgement checklist: 5-question review (with machine signals), craft-floor gate, refusal scaffolds, machine `PASS`\|`REVIEW`\|`REFUSE` verdict (`project` = local directory path; not on Workers) |
| `/scan-project` | POST | `{dir}` · `{topFiles?}` · `{profile?}` | scan a directory tree; pooled report (local filesystem only) |
| `/render-scan` | POST | `{snapshot}` · `{url}` · `{profile?}` | rendered-tier r-* checks over a computed snapshot (pure, no browser); `{url}` collects first and needs the optional playwright collector (501 when absent) |
| `/mcp` | POST | JSON-RPC 2.0 | MCP: `initialize`/`ping`/`tools/list`/`tools/call` — tools `list_rules`, `scan_text`, `scan_html`, `scan_project`, `scan_render`, `rewrite_text`, `judge`; GET is 405 (no SSE) |
| `/a2a` | POST | JSON-RPC 2.0 | lightweight A2A: `message/send`, `tasks/send`, `tasks/get`; task id == request id |
| `/a2a/tasks/{id}` | GET | — | replay a completed A2A task result (in-memory recent store, 30-min TTL) |
| `/.well-known/agent.json` | GET | — | agent discovery card |
| `/widget.js` | GET | — | embeddable shadow-DOM widget (runs the engine in-browser) |
| `/openapi.json` | GET | — | OpenAPI 3.1 contract for every route |
| `/llms.txt` | GET | — | LLM discovery file |

`{url}` scans fetch the target with a 10-second timeout (AbortSignal) and a
branded User-Agent; unreachable/unsupported targets return a clear `502`.
`rules_url` accepts **JSON only** over the network (arbitrary remote JS
execution is deliberately not offered; local `--rules` supports `.js`
modules).

### MCP

Minimal MCP handshake:

```sh
curl -s -X POST localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26",...}}

curl -s -X POST localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"scan_text","arguments":{"text":"We must leverage this."}}}'
```

### Embeddable widget

```html
<script src="https://localhost:8787/widget.js" data-target="#slop-box"></script>
```
(swap `localhost:8787` for the deployed origin). Mounts a textarea-to-scan
box into `#slop-box` (or a fresh div at script position) inside a Shadow
DOM; the engine loads from the widget's own origin and scans fully in the
browser. No external dependencies.

### Web checker project scan

`web/index.html` has a "Scan a folder" tab: it uses the File System Access
API (`showDirectoryPicker`) when available and falls back to a multiple
`<input type=file>` picker, then runs the browser-safe project scanner
(`src/project-scanner-browser.js`) — the same prose/markup/styles/code lens
classification and pooled scoring as `--dir` — entirely in the browser.
Nothing is uploaded.

### Cloudflare Workers / Docker

`api/worker.js` mirrors the same contract and ships a `fetch` entry;
`Dockerfile` runs `api/server.js` on `node:20-alpine` (port 3000,
`/health` healthcheck). Deployment is documented in `docs/DEPLOYMENT.md`
and was **not** executed for this deliverable:

```sh
cd ai-slop-checker
docker build -t lazynext/ai-slop-checker:1.4.2 .
docker run --rm -p 3000:3000 lazynext/ai-slop-checker:1.4.2
# or the Worker:
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DEPLOY_TOKEN"   # see docs/DEPLOYMENT.md
wrangler deploy --name lazynext-ai-slop-checker
```

### Agent skill

`skill/SKILL.md` is the merged slop-guard skill (SKILL.md format),
`skill/CLAUDE.md` is the CLAUDE.md-style variant, `.cursor/rules/slop-guard.mdc`
is the Cursor rules format, and `skill/references/visual-tells.md` is a
field guide for visual AI tells.

## File tree

```
ai-slop-checker/
├── data/
│   ├── slop-patterns.js      # 279-rule corpus, 27 categories (UMD: Node + browser)
│   ├── profiles.js           # severity profiles: default / strict / lenient (UMD)
│   ├── rules.ru.js           # original Russian sample corpus — external-rules/i18n demo
│   ├── rules.hi.js           # original Hindi sample corpus (loanwords, epochs, hedges)
│   ├── rules.es.js           # original Spanish sample corpus (anglicisms, superlatives)
│   ├── rules.fr.js           # original French sample corpus (epochs, anglicisms, superlatives)
│   └── rules.de.js           # original German sample corpus (calques, consulting soup)
├── src/
│   ├── scanner.js            # scanText / scanHtml / scanDesign / extractText (UMD)
│   ├── project-scanner.js    # scanProject — whole-directory scan (--dir)
│   ├── project-scanner-browser.js  # browser-safe project scan (folder pick)
│   ├── rules-loader.js       # loadRules — deep-merge external corpora
│   ├── render-checks.js      # rendered-tier r-* checks — PURE functions over snapshots (UMD)
│   ├── collect-render.js     # OPTIONAL playwright collector (never loaded by the engine)
│   ├── judge.js              # judgement checklist: 5 questions, craft floor, refusal scaffolds, PASS|REVIEW|REFUSE
│   └── rewriter.js           # conservative before/after rewrites (UMD; createRewriter)
├── api/
│   ├── server.js             # plain-Node HTTP API + static web checker host
│   ├── worker.js             # Cloudflare Workers entry (same contract)
│   ├── agent-surfaces.js     # MCP + A2A + agent card + widget (shared by both entries)
│   ├── openapi.json          # OpenAPI 3.1 contract
│   └── cli.js                # zero-dep CLI
├── web/
│   ├── index.html            # branded checker: paste-text / URL / folder input + PWA links
│   ├── app.js                # in-browser engine + API fallback + folder scan + design reviews
│   ├── style.css             # Lazynext brand tokens
│   ├── manifest.webmanifest  # PWA manifest (brand colors, 192/512 icons)
│   ├── sw.js                 # service worker (network-first page, cache-first assets)
│   ├── register-sw.js        # http(s)-guarded SW registration
│   └── icons/                # icon-192.png + icon-512.png (sips-derived from favicon)
├── skill/
│   ├── SKILL.md              # agent skill (SKILL.md format)
│   ├── CLAUDE.md             # CLAUDE.md-style variant
│   └── references/visual-tells.md   # field guide
├── .cursor/rules/slop-guard.mdc     # Cursor rules format
├── test/
│   ├── scanner.test.js       # text/HTML scanning, clean-prose control, scoring
│   ├── rewriter.test.js      # rewrite correctness, determinism, safety
│   ├── project-scanner.test.js # directory scan, lenses, aggregation, CLI --dir
│   ├── project-scanner-browser.test.js  # browser lens parity + web asset checks
│   ├── render-checks.test.js # r-* checks over hand-crafted snapshots (fire + non-fire)
│   ├── judge.test.js         # judgement checklist: contract, verdict boundary, determinism
│   ├── app.test.js           # web-app UX regression: Scan-lifecycle state machine (node-only)
│   ├── profiles.test.js      # default/strict/lenient on the same text (CLI/API/render/project)
│   ├── i18n.test.js          # ru/hi/es/fr/de corpora, all-five merge, dup rejection
│   ├── pwa.test.js           # manifest keys, icon PNGs, sw.js parse, guarded registration
│   ├── api.test.js           # HTTP contract tests (incl. POST /judge)
│   ├── api-rules-url.test.js # POST /scan rules_url (local fixture server)
│   ├── agent-surfaces.test.js # MCP handshake + tools (incl. judge), A2A, discovery, widget
│   ├── rules-loader.test.js  # merge semantics, dup rejection, .ru corpus, CLI --rules
│   ├── openapi-parity.test.js # spec ⇄ server route parity
│   ├── eval-harness.test.js  # eval math (precision/recall/F1), FP gate, corpus readability
│   └── bench.test.js         # bench + dogfood-stays-fixed regression locks
├── bench/
│   ├── run.js                # scan our own docs/web; print the bench table
│   ├── eval.js               # corpus quality benchmark: per-family P/R/F1 + negative-FP gate
│   └── corpus/               # original labelled samples (positive/ + negative/ + per-language)
├── demo/
│   ├── slop.txt              # a deliberately sloppy sample (test control)
│   ├── clean.txt             # a clean control sample (test control)
│   ├── fixture-project/      # a sloppy tree for project-scan demos + tests (control)
│   └── web-checker-scan.png  # verified screenshot of the web checker running
├── docs/
│   ├── DEPLOYMENT.md         # Docker + Worker run books (not executed)
│   ├── design-review-guide.md # human review guide: modes, craft floor, 5 questions, refusal
│   └── dogfood-report.md     # bench table + real finds fixed
├── assets/
│   ├── lazynext-logo.jpg     # brand anchor (copied from the Lazynext brand kit)
│   └── favicon.png           # 128px PNG derived from the logo
├── llms.txt                  # LLM discovery file
├── CHANGELOG.md
├── ROADMAP.md
├── ATTRIBUTIONS.md
├── LICENSE
├── Dockerfile
├── .dockerignore
├── wrangler.toml
├── .gitignore
├── package.json
└── README.md
```

## Architecture

- **Engine** (`src/scanner.js`) compiles corpus patterns once (cached), scans
  text for non-design patterns, raw HTML for design patterns, and raw source
  (`.css`/`.js`/`.ts` class strings) via `scanDesign` for the project
  scanner's styles/code lens. Dedupes naturally (html text-tells are detected
  on extracted visible text only), and builds a deterministic report. Em-dash
  clusters aggregate to one match; the pattern-level scoring cap prevents
  single-pattern saturation.
- **Project scanner** (`src/project-scanner.js`) walks a directory tree,
  classes each file by extension (prose / markup / styles / code), skips
  `node_modules`, `.git`, `dist`, lockfiles, and binaries, and pools every
  file's point-capped matches into one project-level score and category
  breakdown. Zero dependencies, never edits files.
- **Corpus** (`data/slop-patterns.js`) is plain data — every rule has an id,
  category, severity, match, a human description and a fix. `GET /rules`
  serializes it directly, so the API can never drift from the engine.
- **External rules** (`src/rules-loader.js`) deep-merge custom corpora into
  the built-in corpus: new categories appended, existing categories merged,
  duplicate ids rejected. `scanner.createEngine(merged)` and
  `rewriter.createRewriter(merged, engine)` rebuild the scan + rewrite
  halves over the merged corpus, so custom rules drive both consistently.
- **Rewriter** (`src/rewriter.js`) only acts on patterns with a safe
  substitution or a curated deletion, processes matches end-to-front so
  indices stay valid, and never re-scans/invents. When in doubt, it offers
  the match's human fix instead.
- **Agent surfaces** (`api/agent-surfaces.js`) — MCP (JSON-RPC 2.0 over
  `POST /mcp`), lightweight A2A (`POST /a2a`, in-memory task store), the
  agent card, and the embeddable widget — are shared by the Node server and
  the Workers entry, so the two deployments can't drift.
- **Browser** — the engine files are UMD modules (IIFE-wrapped) so the
  same code runs in Node and in the page as classic `<script>` tags with
  zero build step. `src/project-scanner-browser.js` reuses the same lenses
  over in-memory files picked via the File System Access API (or a file
  input), so the web checker's folder scan matches `--dir`.
- **Rendered tier** (`src/render-checks.js` + optional
  `src/collect-render.js`) — 11 `r-*` checks are PURE functions over a
  computed snapshot (`{elements: [...]}` with serialized computed styles),
  so they run in Node, in the browser ("Design reviews" panel), on the
  Workers entry, and over hand-crafted fixtures with no browser. The only
  browser part is the OPTIONAL collector (`collectRender(url)`), lazily
  loaded and never required by the engine; without `npm i -D playwright`
  it throws the documented opt-in message.
- **Severity profiles** (`data/profiles.js`) — `default` / `strict` /
  `lenient` select the score threshold + included severities; applied as a
  non-mutating re-score over the same decay curve, so the corpus never
  changes between profiles.

## Hardening & robustness

The engine treats every input as hostile. A fuzz battery
(`test/fuzz-robustness.test.js`, 79 tests) throws binary bytes, lone
surrogates, 1 MB repeats, 1000-deep nested HTML, malformed markup,
JSON/JS-as-text, entity storms, and mixed-script soup at every entry point
(`scanText`, `scanHtml`, `scanDesign`, `rewriteText`, `scanProject`,
`scanRender`) and asserts no-throw, byte-identical determinism, valid report
shape, and a <1s per-call budget. Four crash classes were fixed and
regression-guarded: out-of-range numeric character references
(`&#1114112;`, `&#x110000;`) decode to U+FFFD instead of throwing;
hex entity references decode base 16 (`&#x1F600;` → 😀); hostile snapshot
styles (string px values, object `backgroundImage`, non-finite rects) are
sanitized deterministically with a zero-copy fast path for conforming
snapshots; and all-invalid `screens` indices are dropped instead of
crashing `checkScreenBudget`. The corpus itself is structure-gated:
`scripts/check-corpus.js` validates ids (`^[a-z][a-z0-9-]*$`), required
fields, severities, per-category duplicate matches, and cross-file
uniqueness (base 279/27 + ru/hi/es → merged 382/30, zero duplication),
with `test/corpus-validate.test.js` pinning the same rules in the suite.

## PERFORMANCE

Measured on macOS Apple Silicon (arm64) with Node v25.9.0 — real wall-clock
`ms` from `node bench/perf.js`, inputs synthesized from the demo fixtures:

| bench | ms | input | KB/ms | verdict |
|---|---|---|---|---|
| `scanText` ~100 KB prose mix | 8.4 | 100.0 KB | 11.93 | heavy |
| `scanHtml` ~200 KB HTML | 27.0 | 200.8 KB | 7.45 | light |
| `scanProject` demo/fixture-project/ | 9.2 | — | — | heavy |
| `rewriteText` ~100 KB prose mix | 16.7 | 100.0 KB | 6.01 | — |

A 100 KB realistic prose document scans in ~8 ms. Re-run anytime with
`node bench/perf.js` (or `--json`) — numbers vary by machine, so record
your own.

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for what is genuinely left (a theme catalog
as a human guide, non-English built-ins as content, a
`.github/`-gated CI, plugin packaging) and why each item is deferred.
Phase 5 (v1.4.0) shipped fuzz robustness, corpus quality gates, the perf
bench, the e2e contract matrix, and packaging validation. Phase 6 (v1.4.1)
shipped the judgement checklist (`--judge`/`POST /judge`/MCP `judge`), the
`npm run check` quality gate, the web-checker stale-results UX fix
(regression-locked in `test/app.test.js`), the corpus quality benchmark
(`bench/eval.js` — per-family precision/recall/F1 against original labelled
samples with a ≤5% negative-corpus FP gate), and the French + German i18n
corpora (`data/rules.fr.js` / `data/rules.de.js`); the real-browser render
CI harness and the `.github/` CI gate stay devops-gated follow-ups.

Deferred from this deliverable, consciously: no real-browser CI gate
(`.github/`-gated and devops-owned per house rules — not created here), no
LLM-based scoring (the engine is deliberately deterministic), and no
deployment of the worker, API, or container (run books in
`docs/DEPLOYMENT.md`, not executed).

## License & attribution

MIT — see [`LICENSE`](LICENSE). Original work by Lazynext; the five source
projects are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). **Flag for
founder review:** the MIT header/naming policy for a Lazynext-authored open
product has not been confirmed by the founder — see the note in ATTRIBUTIONS.