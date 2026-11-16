# ATTRIBUTIONS

The Lazynext AI Slop Checker is an **original implementation** by Lazynext
(UNITED GLOBAL VENTURES PRIVATE LIMITED). It consolidates the *functionality*
of five open-source "AI slop" projects into one codebase. This file records
what was absorbed from each project and where it landed.

**License status of the sources (verified in-clone, 2026-11-16):**

| Repo | License (in clone) | Status |
|---|---|---|
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | Licensed |
| [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | MIT | Licensed |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | MIT | Licensed |
| [yetone/kill-ai-slop](https://github.com/yetone/kill-ai-slop) | Apache-2.0 | Licensed |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | MIT | Licensed |

> Note: `gh repo view` reported `license: null` for all five repos, but every
> cloned repository ships a LICENSE file (MIT ×3, Apache-2.0 ×2). The clone
> contents are authoritative. Our work is original code and copy; short
> individual words and phrases from the slop lists are factual terms rather
> than creative expression, and are listed in the classification corpus.
> Nothing from any source repo was copied verbatim — descriptions, fixes,
> skill text, docs and code were written by Lazynext.

## What was absorbed from each project

> **Completeness pass (2026-11-16, `v1.1.0`)** — a second audit re-read every
> file in all five source repos and closed the material gaps: the
> superficial-analysis / meta-commentary / vague-declarative / false-agency /
> passive-voice writing categories (no-ai-slop + stop-slop), ~45 more
> writing patterns (stop-slop phrase/structures lists, kill-ai-slop copy
> voice), ~20 more design heuristics (kill-ai-slop tells 03/04/05/09/11/13/
> 14/20/24/34/35 + impeccable detector rules + hallmark sloplint signals),
> and the **project-scan mode** (`src/project-scanner.js` + `--dir` + API
> route), which is kill-ai-slop's scanner-as-code workflow re-expressed for
> this engine. What follows is the full credit mapping.

### 1. [pbakaus/impeccable](https://github.com/pbakaus/impeccable) — Apache-2.0
"The design vocabulary for your coding agent."

Absorbed:
- **The design-vocabulary concept** — a reviewer/critic framing for
  interfaces rather than a pure lint. Reflected in the
  `skill/references/visual-tells.md` five-question review and the skill's
  design-tells sections.
- **Slop-detector rule categories** — the deterministic, no-LLM detector idea
  and several of its flags (cramped/flat type hierarchy, overused default
  fonts, kickers, identical card grids, ghost cards, gradient text, glyph
  icons). Re-expressed as our own heuristics in `data/slop-patterns.js`
  (`design-*` categories) with original descriptions and fixes.
- **The "Refuse" list of page scaffolds** (kicker above heading, section
  numbers, hero-metric template). Landed in `skill/SKILL.md` layout tells and
  `.cursor/rules/slop-guard.mdc`.
- **Craft-floor checks** (contrast, spacing-by-relationship, motion as
  information, browser-surface theming) as quality-floor guidance; the
  machine-checkable subset (transition-all, wobble spinner, one-gap) became
  `design-motion` / `design-layout` heuristics.

Where: `data/slop-patterns.js` (design-*), `skill/*`, `web/index.html`
"About" copy.

### 2. [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) — MIT
"Removes 20+ patterns of AI slop from any piece of writing."

Absorbed:
- **The banned-words list** (delve, foster, leverage, utilize, facilitate,
  empower, streamline, robust, cutting-edge, paradigm shift, game changer,
  tapestry, realm, beacon, multifaceted, meticulous, intricate, paramount,
  transformative, elevate, embark, supercharge, harness, ever-evolving, …).
  These are pre-existing words; listed as factual terms in `word-ban`.
- **The "words to cut" / phrase list** ("it's worth noting", "it's important
  to note", "at the end of the day", "when it comes to", "at its core", "in
  today's world", "in the age of", "in the world of", "the reality is", "the
  truth is", "in terms of", "with regard to", "in order to", "going
  forward", "let's dive in", …) in `filler-phrases`.
- **Pattern vocabulary** — binary contrasts, throat-clearing openers,
  faux-insight setups, colon reveals, importance puffery, weasel attribution,
  fake-strong verbs, synonym cycling, negative listing, dramatic fragments,
  robotic rhythm, summary-recap endings, formatting slop, em-dash guidance.
  Re-expressed as our own regexes/phrases in `binary-contrast`,
  `colon-reveal`, `importance-puffery`, `weasel-attribution`, etc.
- **The detect-vs-edit two-job model** and "preserve the writer's voice"
  workflow — reshaped into `skill/SKILL.md` "Two jobs" and the editing
  principles.
- **The portability test** ("could this sentence move to another product?")
  — used in `skill/SKILL.md` and `.cursor/rules/slop-guard.mdc`.

Where: `data/slop-patterns.js` (most text categories), `src/rewriter.js`
(substitutions/removals mirror this project's guidance), `skill/*`.

### 3. [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) — MIT
"A skill file for removing AI tells from prose."

Absorbed:
- **Phrase lists** — throat-clearing openers ("Here's the thing:", "It turns
  out", "Let me be clear"), emphasis crutches ("Full stop.", "Let that sink
  in"), business jargon (navigate, unpack, lean into, landscape,
  game-changer, double down, deep dive, take a step back, moving forward,
  circle back, on the same page), adverb offenders, meta-commentary,
  performative emphasis, vague declaratives. Re-expressed in `filler-phrases`,
  `business-jargon`, `throat-clearing`, `adverb-overuse`.
- **Structure lists** — binary contrasts, negative listings, dramatic
  fragmentation, rhetorical setups, false agency (inanimate-object verbs),
  narrator-from-a-distance, passive voice, sentence starters (Wh- words),
  rhythm patterns (three-item lists, em-dashes, staccato). The machine-checkable
  subset became `binary-contrast`, `negative-listing`, `dramatic-fragment`,
  `rhetorical-setup`, `em-dash` patterns with *our own* regexes and fixes.
- **The scoring-rubric idea** (rate directness/rhythm/trust/authenticity/
  density) — reframed in our steerable score/verdict design.

Where: `data/slop-patterns.js`, `skill/SKILL.md`.

### 4. [yetone/kill-ai-slop](https://github.com/yetone/kill-ai-slop) — Apache-2.0
"A field guide to the visual & copy tics of AI-generated products."

Absorbed:
- **The taxonomy of 35 tells** — indigo-violet gradients, gradient-clipped
  headlines, warm "cozy" palettes, default semantic rainbow, one-hue status
  boxes, gradient atmosphere, serif-italic on one word, serif-where-sans,
  decorative strikes, kickers, full-sentence display headlines, flat type,
  highlighted keywords, AI copywriting voice, emoji everywhere, glowing
  status dots, bordered callouts, icon tiles, glassmorphism, oversized
  shadows, non-nesting corners, border dies at corners, badge/pill spam,
  AI-drawn SVG icons, icon-in-a-tint, springy hovers, wobbling spinners,
  all-caps card grids, invented stat rows, 01/02/03 markers, cards-in-cards,
  one-gap, Inter-everywhere, tasteful-terminal, editorial-dashboard.
  Re-expressed as `design-color`, `design-type`, `design-copy`,
  `design-component`, `design-motion`, `design-layout` heuristics with
  original regexes (both Tailwind-class and raw-CSS variants), descriptions
  and fixes.
- **"Slop is the absence of a decision"** — the governing rule, restated in
  our own words across the field guide and skill.
- **The scan→triage→report→fix workflow and the scanner-as-code idea** —
  reshaped into `src/scanner.js` + `api/cli.js` + `GET /rules` (always
  leaving a paper trail; our engine never edits files either).
- **The field-guide form** — `skill/references/visual-tells.md`.

Where: `data/slop-patterns.js` (all design-* categories), `skill/references/
visual-tells.md`, `test/scanner.test.js` (HTML fixtures).

### 5. [Nutlope/hallmark](https://github.com/Nutlope/hallmark) — MIT
"Anti-AI-slop design skill for Claude Code, Cursor, and Codex."

Absorbed:
- **The "Floor" concept** — a small set of non-waivable quality rules
  (tokens for colour/fonts, no `transition: all`, no one-italic-word
  headings, no invented metrics/testimonials, no eyebrows/kickers, no
  purple-to-blue gradients, no cards-in-cards, no emoji-as-icon, hero fits
  the first viewport, ~80 words a screen). Re-expressed in
  `.cursor/rules/slop-guard.mdc` "Quality floor" and `skill/SKILL.md`.
- **The Reflex-gate spirit** — defaults a model falls into, waivable with a
  reason; inherited as "a tell is only slop when it is a default nobody
  chose."
- **Machine-checkable specifics** — `sloplint`-style signals: tracked-caps
  labels, eyebrowse, gradient text, middle-dot joined meta strings, glued
  arrows, decorative status dots. Landed in `design-type` / `design-copy` /
  `design-component`.
- **The harness-format distribution model** (SKILL.md + Cursor rules +
  CLAUDE.md-style) — `skill/` and `.cursor/rules/` mirror that shape with our
  own content.

Where: `.cursor/rules/slop-guard.mdc`, `skill/SKILL.md`, `skill/CLAUDE.md`,
`data/slop-patterns.js` (design-*).

## What was NOT absorbed

- **Impeccable's engine/CLI/browser-extension/live-mode** — proprietary-ish
  heavy tooling, product features we reimplemented differently (deterministic
  JS engine, our own CLI/API) or intentionally did not build (live browser
  overlay, native-platform audits).
- **Impeccable's rendered/computed-style detector depth** (kicker
  font-size ceilings, em-dash density over rendered text with CJK-aware dash
  counting, nested-radius math) — needs a rendering pass; our heuristics are
  markup-level leads by design.
- **Hallmark's 50-theme catalog, photo library, and image generation** —
  a creative-direction feature, out of scope for a deterministic checker.
- **Hallmark's rendered-tier gates** (fold at 1280×800, 80-word screen
  budget, section gap at 1440, dead-band/heights) — needs a browser; the
  `--render` tier of sloplint is a design-direction tool we consciously
  didn't port to a deterministic scanner.
- **Kill-ai-slop's standalone scanner CLI** — reimplemented as our own
  zero-dep CLI with the same report/triage spirit, and now with a native
  project-scan mode (`--dir`).
- **No source code from any project was copied verbatim.** Anything
  resembling a sentence from a source README/skill file in our docs is an
  independent paraphrase of a factual idea.

## Files referencing these projects

- `data/slop-patterns.js` — corpus categories/patterns
- `src/scanner.js`, `src/rewriter.js` — engine
- `src/render-checks.js` — rendered-tier checks (impeccable/hallmark
  rendered-floor concepts; our own pure-function architecture)
- `skill/SKILL.md`, `skill/CLAUDE.md`, `.cursor/rules/slop-guard.mdc`,
  `skill/references/visual-tells.md` — skill distro
- `docs/design-review-guide.md` — human-facing review guide (mode
  vocabulary, craft floor, refusal scaffolds, theme catalog)
- `README.md`, `web/index.html`, this file — docs & credits
- `test/scanner.test.js`, `test/api.test.js`, `test/render-checks.test.js`
  — fixtures/tests

## Phase 3 note (v1.2.0, 2026-11-16)

The agent-ecosystem, rules-extension, deployment-artifact, and web-folder-scan
work added **no new absorbed content** from the five source projects:

- `data/rules.ru.js` — an **original, Lazynext-written** Russian slop-tell
  corpus. The Russian copy conventions it flags ("в современном мире", "стоит
  отметить", "синергия", "эксперты считают", …) are common-knowledge
  phrases; the list, every description, fix, and category were written by us
  from knowledge of Russian copy, **not** copied from kill-ai-slop's Russian
  example or any other source. Short factual phrases are listed as the corpus
  (same reasoning as the base corpus).
- `src/rules-loader.js`, `createEngine`/`createRewriter` — pure engine work;
  no source-project material.
- `api/agent-surfaces.js`, `api/openapi.json`, `llms.txt`, `bench/run.js`,
  `docs/DEPLOYMENT.md`, `docs/dogfood-report.md`, `web/` folder scan,
  `Dockerfile`, `wrangler.toml` — all original Lazynext code and copy.
- The `Dockerfile`/`wrangler.toml` are generic deployment artifacts, not
  derived from any source project's files.

No new accounts, keys, signups, or deployments were made in phase 3.

## Phase 4 note (v1.3.0, 2026-11-16)

The rendered-tier, profiles, i18n, design-guide, and PWA work added **no
new absorbed content** from the five source projects — everything is
Lazynext's own expression of the ideas already credited above:

- `src/render-checks.js`, `src/collect-render.js` — the rendered-tier
  checks are our own pure-function architecture over a serialized computed
  snapshot. The *concepts* (flat-type kickers, gradient text, tracked-caps,
  glued arrows, the 1280×800 fold rule, ~80 words a screen, uniform grids,
  contrast floor) are the impeccable/hallmark ideas already mapped in the
  sections above; every threshold, message, fix, and the snapshot contract
  itself were designed and written by us. No source code was ported.
- `data/profiles.js` — pure scoring work; no source-project material.
- `data/rules.hi.js`, `data/rules.es.js` — **original, Lazynext-written**
  Hindi and Spanish corpora. The Hindi tells (लेवरेज, सीमलेस,
  आज के डिजिटल युग में, अद्वितीय, …) and Spanish tells (apalancar,
  seamless, en el mundo actual, innovador, …) are common-knowledge copy
  conventions; the lists, every description and fix were written by us
  from knowledge of the languages, **not** copied from any source
  repository (kill-ai-slop includes a Russian example only, and nothing
  was taken from it).
- `docs/design-review-guide.md` — an original human-facing guide that
  *names* the impeccable/hallmark vocabulary (craft floor, four modes,
  refusal scaffolds, theme catalog) and re-expresses it in our own words;
  the guide credits both projects in its intro. The theme catalog is
  absorbed as a guide (4 archetypes with our own slop-to-fix lists), never
  as code.
- `web/manifest.webmanifest`, `web/sw.js`, `web/register-sw.js`,
  `web/icons/*.png` — all original Lazynext code and assets (icons
  `sips`-derived from the existing favicon). The sibling product's PWA
  shell was used as an *idea* reference only, per the task brief; no files
  were copied.

No new accounts, keys, signups, or deployments were made in phase 4.

## License flags for founder review

1. **Our MIT license choice.** This repository's code is original Lazynext
   work. The MIT license header was chosen for consistency with the source
   ecosystem; **the founder has not yet confirmed** Lazynext's licensing/
   naming policy for open products. Confirm before any public release.
2. **The source projects keep their own licenses.** Any future redistribution
   that includes *their* text (e.g. vendoring a skill file) must comply with
   each license (MIT requires preserving copyright notices; Apache-2.0
   requires notice/file retention). This deliverable does not include their
   files.
3. **No personal/company gateway was opened** for these projects — no
   accounts, keys, or signups were created; no deployments were made.