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

- **Scans text** for 16 categories of writing tells: banned AI vocabulary
  (`delve`, `tapestry`, `game-changer`, …), empty filler phrases
  ("it's worth noting", "in today's fast-paced world", …), throat-clearing,
  faux-insight setups, binary contrasts ("It's not X. It's Y."), colon
  reveals, importance puffery, weasel attribution, empty adverbs, rhetorical
  setups, negative listings, dramatic fragments, summary-recap endings, and
  em-dash clusters.
- **Scans HTML** for 6 categories of visual/design tells: indigo-violet
  gradients, gradient headline text, kickers over every heading, flat type
  hierarchies, glassmorphism, glowing status dots, border-left callouts,
  badge/pill spam, invented stat rows, 01/02/03 section markers, springy
  hovers, "Powered by AI" badges, and more — as heuristics over markup and CSS.
- **Scores 0–100** deterministically (same input, same score — no LLM, no
  network, no randomness), with per-category breakdowns, per-match
  before/after fix suggestions, and a `clean` verdict for low scores.
- **Suggests conservative rewrites** that never invent new sentences:
  whole-word synonym swaps and safe phrase deletions only.
- **Runs everywhere**: Node CLI, a plain-Node HTTP API, a Cloudflare Workers
  entry, and a fully in-browser web checker (no build step).

## Quickstart

Requires Node ≥ 20. No install needed for the CLI or web checker (zero
dependencies).

```sh
npm install        # no-op today: declares no dependencies (package-lock generation only)

# Tests
npm test           # = node --test   (47 tests)

# CLI
node api/cli.js "We must leverage this robust cutting-edge solution."
node api/cli.js --file demo/slop.txt
node api/cli.js --file demo/clean.txt
node api/cli.js --url https://example.com
node api/cli.js --json "machine readable report"
node api/cli.js --rules

# API server (also serves the web checker at http://localhost:8787)
node api/server.js
PORT=3000 node api/server.js

# Web checker (in-browser engine, no server needed): open web/index.html,
# or visit http://localhost:8787 with the API running.
```

## The report shape

```js
{
  engine: "lazynext-ai-slop-checker",
  version: "1.0.0",
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

### API

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/` | GET | — | JSON service descriptor (or the web checker when `web/` exists) |
| `/health` | GET | — | liveness probe |
| `/rules` | GET | — | full pattern corpus manifest (170 rules, list-rules style) |
| `/scan` | POST | `{text}` · `{html}` · `{url}` | scan report; `{rewrite:true}` for text adds safe rewrites |

`{url}` scans fetch the target with a 10-second timeout (AbortSignal) and a
branded User-Agent; unreachable/unsupported targets return a clear `502`.

### Cloudflare Workers

`api/worker.js` mirrors the same contract and ships a `fetch` entry.
Deployment is documented here but was **not** executed for this deliverable:

```sh
cd ai-slop-checker
wrangler deploy --name lazynext-ai-slop-checker   # requires wrangler + account
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
│   └── slop-patterns.js      # 170-rule corpus, 22 categories (UMD: Node + browser)
├── src/
│   ├── scanner.js            # scanText / scanHtml / extractText — deterministic engine (UMD)
│   └── rewriter.js           # conservative before/after rewrites (UMD)
├── api/
│   ├── server.js             # plain-Node HTTP API + static web checker host
│   ├── worker.js             # Cloudflare Workers entry (same contract)
│   └── cli.js                # zero-dep CLI
├── web/
│   ├── index.html            # branded checker: paste-text OR url input
│   ├── app.js                # in-browser engine + API fallback
│   └── style.css             # Lazynext brand tokens
├── skill/
│   ├── SKILL.md              # agent skill (SKILL.md format)
│   ├── CLAUDE.md             # CLAUDE.md-style variant
│   └── references/visual-tells.md   # field guide
├── .cursor/rules/slop-guard.mdc     # Cursor rules format
├── test/
│   ├── scanner.test.js       # text/HTML scanning, clean-prose control, scoring
│   ├── rewriter.test.js      # rewrite correctness, determinism, safety
│   └── api.test.js           # HTTP contract tests
├── demo/
│   ├── slop.txt              # a deliberately sloppy sample
│   ├── clean.txt             # a clean control sample
│   └── web-checker-scan.png  # verified screenshot of the web checker running
├── assets/
│   ├── lazynext-logo.jpg     # brand anchor (copied from the Lazynext brand kit)
│   └── favicon.png           # 128px PNG derived from the logo
├── ATTRIBUTIONS.md
├── LICENSE
├── .gitignore
├── package.json
└── README.md
```

## Architecture

- **Engine** (`src/scanner.js`) compiles corpus patterns once (cached), scans
  text for non-design patterns and raw HTML for design patterns, dedupes
  naturally (html text-tells are detected on extracted visible text only),
  and builds a deterministic report. Em-dash clusters aggregate to one match;
  the pattern-level scoring cap prevents single-pattern saturation.
- **Corpus** (`data/slop-patterns.js`) is plain data — every rule has an id,
  category, severity, match, a human description and a fix. `GET /rules`
  serializes it directly, so the API can never drift from the engine.
- **Rewriter** (`src/rewriter.js`) only acts on patterns with a safe
  substitution or a curated deletion, processes matches end-to-front so
  indices stay valid, and never re-scans/invents. When in doubt, it offers
  the match's human fix instead.
- **Browser** — the three engine files are UMD modules (IIFE-wrapped) so the
  same code runs in Node and in the page as three classic `<script>` tags
  with zero build step; `web/app.js` tries the API for URL scans and falls
  back to a direct fetch with a clear CORS hint.

## Roadmap

- **Weighted severity profiles** — per-domain presets (marketing copy,
  technical docs, UI copy) that adjust severities without changing the corpus.
- **Rendered-page checks** — fetch + render (Playwright/Browser Rendering) for
  computed-style tells (contrast, spacing) that text heuristics can't reach.
- **CI gate** — a `slop-check` GitHub Action exit-code gate for prose/docs PRs.
- **i18n corpus** — non-English tells (the Russian-copy example in kill-ai-slop
  shows the shape; English patterns don't fire on other languages).
- **PWA shell** for the web checker (service worker + offline engine).
- **Plugin/distro packaging** for the skill (Claude Code plugin, Codex,
  OpenCode command) mirroring the inspirations' installers.

Deferred from this deliverable, consciously: no rendered-browser heuristics
(needs a browser dependency), no LLM-based scoring (the engine is deliberately
deterministic), and no deployment of the worker or API (out of scope per the
task brief).

## License & attribution

MIT — see [`LICENSE`](LICENSE). Original work by Lazynext; the five source
projects are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md). **Flag for
founder review:** the MIT header/naming policy for a Lazynext-authored open
product has not been confirmed by the founder — see the note in ATTRIBUTIONS.