# Roadmap — Lazynext AI Slop Checker

What is genuinely left after v1.3.0. Ordered roughly by leverage; nothing
here has a hard date. The engine stays deterministic and dependency-free.

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
- **Remaining (deferred):** a real-browser CI harness proving the
  *collector* against live pages (see CI gate below — `.github/`-gated
  and devops-owned per house rules, so it wasn't created in this
  deliverable). The checks are deterministic; the collection pass remains
  the only non-deterministic input.

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
this class with rendered trace + heuristics; here it would be a
`--judge` mode combining structural heuristics (sentence-length spread,
paragraph shape, parallel-clause detectors) with the existing corpus. Kept
out of the deterministic core until precision beats recall.

## Non-English built-ins (i18n corpus)

The i18n path is the external-rules mechanism; three ORIGINAL sample
corpora ship: `data/rules.ru.js` (36), `data/rules.hi.js` (33),
`data/rules.es.js` (34). The mechanism is the product; the corpora are
content. More built-in languages (German, French, …) stay roadmap until
each has a real reviewer; an auto-translated corpus would import
English-false-positive mistakes.

## Weighted severity profiles

**SHIPPED in v1.3.0** — `data/profiles.js`: `default` (current), `strict`
(warn-class ×1.5, clean ≤ 6), `lenient` (ignores severity-1, clean ≤ 14).
Wired through CLI `--profile`, API `profile` fields, MCP tool args, and
project-scan pooling. Future: per-domain presets (marketing copy,
technical docs, UI copy) as named profile *.js modules — content choice,
not engineering.

## CI gate

A `slop-check` GitHub Action exit-code gate for prose/docs PRs. The CLI
already exits 2 on findings, so the action is a thin wrapper — but it
would run on the monorepo's real PR flow and needs a founder decision on
enforcement policy (hard fail vs comment-only). **Deliberately not created
in v1.3.0:** `.github/` is devops-role-gated per house rules, and the
real-browser render CI harness (playwright collector against live
fixtures) would live here too. Founder decision + devops action required
before either lands.

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

## Deferred in v1.3.0 (with reasons)

- **No deployment executed** — code + docs only (`Dockerfile`,
  `wrangler.toml`, `docs/DEPLOYMENT.md`); deploying is a founder decision.
  Docker tags bumped to 1.3.0 but nothing was built or pushed.
- **Real-browser render CI** — the collector (`src/collect-render.js`)
  needs playwright + a browser farm; that lives under `.github/` which is
  devops-gated. The pure checks are fully tested without a browser
  (34 hand-crafted snapshot tests).
- **A2A is deliberately lightweight** — task results replay from an
  in-memory store (bounded, 30-min TTL), not persistent KV/files, because
  the plain-Node server has no KV. Production persistence for A2A tasks is a
  follow-up if a hosted deployment lands.
- **rules_url accepts JSON only** over the network — remote JS execution is
  deliberately not offered (arbitrary-code risk); local `--rules` supports
  `.js` modules.
- **No `batch` A2A, no SSE streaming on MCP** — the MCP surface is the
  single-POST subset; streaming needs a hosted upgrade.
- **Theme catalog stays a human guide** — shipped as documentation
  (`docs/design-review-guide.md`), never as machine-applied code.