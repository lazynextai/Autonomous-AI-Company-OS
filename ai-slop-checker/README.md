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
npm test           # = node --test   (166 tests)

# CLI
node api/cli.js "We must leverage this robust cutting-edge solution."
node api/cli.js --file demo/slop.txt
node api/cli.js --file demo/clean.txt
node api/cli.js --url https://example.com
node api/cli.js --json "machine readable report"
node api/cli.js --rules                                    # dump the corpus shorthand
node api/cli.js --rules data/rules.ru.js "В современном мире..."   # scan with external rules
node api/cli.js --rules "rules/**\/*.js" --dir src          # external rules + project scan
node api/cli.js --dir path/to/project        # whole-project scan
node api/cli.js --dir path/to/project --top 20
node api/cli.js --dir path/to/project --json

# API server (also serves the web checker at http://localhost:8787)
node api/server.js
PORT=3000 node api/server.js

# Web checker (in-browser engine, no server needed): open web/index.html,
# or visit http://localhost:8787 with the API running. Includes a
# "Scan a folder" mode (File System Access API, file-input fallback) that
# scans chosen website assets entirely in the browser.
```

External rules files accept a path, a `.json` file, a glob, or a
comma-separated list, and deep-merge into the built-in corpus: custom
categories are appended, custom patterns in existing categories fold in,
and duplicate pattern ids are rejected with a clear error. The merged corpus
wins the report's `version`. `data/rules.ru.js` is a shipped sample — an
original Russian AI-slop-tell corpus demonstrating the general i18n path.

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
  version: "1.2.0",
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

const report = scanText("In today's fast-paced world, we must leverage our robust solution.");
const htmlReport = scanHtml("<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><h1>Hello</h1>");

const { text, changes } = rewriteText("We should utilize this tool and leverage the API.");
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
// merged.version is reported; merged.patterns.length = 279 + 36
```

### API

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/` | GET | — | JSON service descriptor (or the web checker when `web/` exists) |
| `/index.html` | GET | — | web checker page (alias of `/`) |
| `/health` | GET | — | liveness probe |
| `/rules` | GET | — | full pattern corpus manifest (279 rules, list-rules style) |
| `/scan` | POST | `{text}` · `{html}` · `{url}` · `{rules_url?}` | scan report; `{rewrite:true}` for text adds safe rewrites; `rules_url` (http(s) JSON, 10s timeout) deep-merges external rules for the scan |
| `/scan-project` | POST | `{dir}` · `{topFiles?}` | scan a directory tree; pooled report (local filesystem only) |
| `/mcp` | POST | JSON-RPC 2.0 | MCP: `initialize`/`ping`/`tools/list`/`tools/call` — tools `list_rules`, `scan_text`, `scan_html`, `scan_project`, `rewrite_text`; GET is 405 (no SSE) |
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
docker build -t lazynext/ai-slop-checker:1.2.0 .
docker run --rm -p 3000:3000 lazynext/ai-slop-checker:1.2.0
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
│   └── rules.ru.js           # original Russian sample corpus — external-rules/i18n demo
├── src/
│   ├── scanner.js            # scanText / scanHtml / scanDesign / extractText (UMD)
│   ├── project-scanner.js    # scanProject — whole-directory scan (--dir)
│   ├── project-scanner-browser.js  # browser-safe project scan (folder pick)
│   ├── rules-loader.js       # loadRules — deep-merge external corpora
│   └── rewriter.js           # conservative before/after rewrites (UMD; createRewriter)
├── api/
│   ├── server.js             # plain-Node HTTP API + static web checker host
│   ├── worker.js             # Cloudflare Workers entry (same contract)
│   ├── agent-surfaces.js     # MCP + A2A + agent card + widget (shared by both entries)
│   ├── openapi.json          # OpenAPI 3.1 contract
│   └── cli.js                # zero-dep CLI
├── web/
│   ├── index.html            # branded checker: paste-text / URL / folder input
│   ├── app.js                # in-browser engine + API fallback + folder scan
│   └── style.css             # Lazynext brand tokens
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
│   ├── api.test.js           # HTTP contract tests
│   ├── api-rules-url.test.js # POST /scan rules_url (local fixture server)
│   ├── agent-surfaces.test.js # MCP handshake + tools, A2A, discovery, widget
│   ├── rules-loader.test.js  # merge semantics, dup rejection, .ru corpus, CLI --rules
│   ├── openapi-parity.test.js # spec ⇄ server route parity
│   └── bench.test.js         # bench + dogfood-stays-fixed regression locks
├── bench/
│   └── run.js                # scan our own docs/web; print the bench table
├── demo/
│   ├── slop.txt              # a deliberately sloppy sample (test control)
│   ├── clean.txt             # a clean control sample (test control)
│   ├── fixture-project/      # a sloppy tree for project-scan demos + tests (control)
│   └── web-checker-scan.png  # verified screenshot of the web checker running
├── docs/
│   ├── DEPLOYMENT.md         # Docker + Worker run books (not executed)
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

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for what is genuinely left (rendered-tier
browser checks, a theme catalog, judgement tells, non-English built-ins,
severity profiles, CI gate, PWA shell, plugin packaging) and why each item
is deferred.

Deferred from this deliverable, consciously: no rendered-browser heuristics
(needs a browser dependency), no LLM-based scoring (the engine is deliberately
deterministic), and no deployment of the worker, API, or container (run books
in `docs/DEPLOYMENT.md`, not executed).

## License & attribution

MIT — see [`LICENSE`](LICENSE). Original work by Lazynext; the five source
projects are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). **Flag for
founder review:** the MIT header/naming policy for a Lazynext-authored open
product has not been confirmed by the founder — see the note in ATTRIBUTIONS.