# Roadmap — Lazynext AI Slop Checker

What is genuinely left after v1.2.0. Ordered roughly by leverage; nothing
here has a hard date. The engine stays deterministic and dependency-free.

## Rendered-tier browser checks (biggest remaining gap)

Markup heuristics can't reach computed styles. A rendered tier (Playwright /
Cloudflare Browser Rendering) would enable:

- **Impeccable's rendered-floor gates** — kicker font-size ceilings,
  em-dash density over *rendered* text with CJK-aware dash counting,
  nested-radius math.
- **Hallmark's rendered-tier gates** — fold at a real viewport, ~80 words a
  screen, section gap at a set width, dead-band/heights.
- **Computed-style tells** — actual contrast, spacing-by-relationship,
  `transition` breadth, hover transforms, emoji rendering in headings.

This needs a browser dependency (or a Cloudflare Browser Rendering binding)
and a `/render`-style trace — a deliberate scope boundary now, not a
regression. Deterministic scoring would be preserved; the render itself is
the only non-deterministic input.

## Theme catalog

Hallmark ships a 50-theme creative-direction catalog (color/font/pattern
bundles with intent). A Lazynext equivalent would fit the *category-
safe-by-default* doctrine: a small original set of curated tokens
(neutral base + one accent, named rationale), not a copy of any source
catalog, used by the skill's "choose a theme deliberately" step.

## Judgement tells (soft, non-regex)

Some tells resist regexing without exploding false positives: "this
sentence could move to any product", "the paragraph is conclusion-shaped",
"three parallel examples of roughly equal length". The a11y sibling solves
this class with rendered trace + heuristics; here it would be a
`--judge` mode combining structural heuristics (sentence-length spread,
paragraph shape, parallel-clause detectors) with the existing corpus. Kept
out of the deterministic core until precision beats recall.

## Non-English built-ins (i18n corpus)

`data/rules.ru.js` ships as an *external* demo of the extension mechanism —
the general i18n path. Built-in non-English corpora (Russian, German,
Spanish, …) stay roadmap until each has a real reviewer; an auto-translated
corpus would import English-false-positive mistakes. The mechanism is the
product; the corpora are content.

## Weighted severity profiles

Per-domain presets (marketing copy, technical docs, UI copy) that adjust
severities without changing the corpus. The engine already caps per-pattern
points, so profiles are a thin mapping layer — but choosing honest defaults
per domain is a content decision, not an engineering one.

## CI gate

A `slop-check` GitHub Action exit-code gate for prose/docs PRs. The CLI
already exits 2 on findings, so the action is a thin wrapper — but it would
run on the monorepo's real PR flow and needs a founder decision on
enforcement policy (hard fail vs comment-only).

## PWA shell for the web checker

Service worker + offline engine caching. The web checker is currently
online-only unless self-hosted; offline support requires a `sw.js` and icon
assets and is a small, self-contained follow-up.

## Plugin / distro packaging

Claude Code plugin, Codex, OpenCode command packaging for the skill, mirroring
the inspirations' installers. The skill content exists; packaging is an
account/release decision (no accounts or paid services were opened for this
deliverable).

## Deferred in v1.2.0 (with reasons)

- **No deployment executed** — code + docs only (`Dockerfile`,
  `wrangler.toml`, `docs/DEPLOYMENT.md`); deploying is a founder decision.
- **A2A is deliberately lightweight** — task results replay from an
  in-memory store (bounded, 30-min TTL), not persistent KV/files, because
  the plain-Node server has no KV. Production persistence for A2A tasks is a
  follow-up if a hosted deployment lands.
- **rules_url accepts JSON only** over the network — remote JS execution is
  deliberately not offered (arbitrary-code risk); local `--rules` supports
  `.js` modules.
- **No `batch` A2A, no SSE streaming on MCP** — the MCP surface is the
  single-POST subset; streaming needs a hosted upgrade.