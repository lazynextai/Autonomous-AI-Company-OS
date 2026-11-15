# CLAUDE.md — Lazynext Slop Guard

Companion instruction file for Claude Code / coding-agent harnesses. Drop this
file (or its contents) into a project to make every agent pass catch AI slop
before the work is called done. Original implementation by Lazynext, informed
by no-ai-slop, stop-slop, impeccable, hallmark and kill-ai-slop.

## Your job

When you edit prose, product copy, docs, marketing pages, or UI markup, check
your output against the tells below before declaring it finished. A *default
nobody chose* is slop. A deliberate choice (brand tokens, a logo, a real
illustration, a justified gradient) is taste — preserve it.

## Writing

1. **Banned vocabulary** — cut or replace: delve, foster, leverage, utilize,
   facilitate, empower, streamline, robust, cutting-edge, paradigm shift,
   game-changer, tapestry, realm, beacon, multifaceted, meticulous, intricate,
   paramount, transformative, elevate, embark, supercharge, harness,
   ever-evolving, seamless, unlock, journey, synergy, next-level,
   revolutionize. Name the mechanism instead.
2. **Empty phrases** — delete: it's worth noting, it's important to note, at
   the end of the day, at its core, in today's world, in the age of, in the
   world of, the reality is, the truth is, when it comes to, in terms of,
   with regard to, in order to, going forward, let's dive in, it turns out.
3. **Throat-clearing and faux-insight** — delete: here's the thing, let me be
   clear, i'll be honest, the uncomfortable truth is, what nobody tells you,
   what most people get wrong, the part everyone misses. State the claim.
4. **Rhythm crutches** — binary contrasts ("It's not X. It's Y."), colon
   reveals ("The best part: it learns."), negative listings ("Not a X. Not a
   Y. A Z."), dramatic fragments ("X. And Y. And Z."), em-dash clusters.
5. **Puffery and weasel words** — stands as a testament, marks a pivotal
   moment, plays a vital role, experts agree, studies show. Cut or cite.
6. **Empty adverbs** — really, just, literally, genuinely, simply, actually,
   truly, fundamentally, importantly, crucially, inherently, inevitably,
   arguably. Cut when they add nothing.
7. **Fake-strong verbs** — made a decision → decided, has the ability to →
   can, serves as a centralized hub → say what it does.
8. **Formatting slop** — emoji in headings, decorative bold, bullets where
   two sentences of prose belong, headers over two-sentence sections.

## Design (UI you generate)

- **Colour:** no indigo-violet gradients, no gradient-clipped headline text,
  no colored glow shadows, no warm amber wash everywhere. One justified
  accent.
- **Type:** no one-word serif-italic emphasis in sans headlines, no display
  serifs in UI chrome, no tracked-caps kicker above every heading, no flat
  type hierarchy (headings must clearly outsize body), no default
  Inter/Space Grotesk pairing without a stated reason.
- **Components:** no glowing status dots (animate-ping), no colored
  border-left callouts on every list item, no rounded-square icon tiles in
  grids, no glassmorphism defaults, no badge/pill spam, no
  icon-in-a-tint-of-itself, no oversized soft shadows, no "Powered by AI"
  badges.
- **Motion:** no hover:scale + transition-all on everything; transition only
  the properties that carry the state change; no wobbling spinners.
- **Layout:** no invented stat rows (10k+ users, 99.9% uptime), no 01/02/03
  markers on unordered sections, no cards nested in cards, no single gap
  value stamped across the page.

## Before you call it done

- Lead with the point.
- Specific beats punchy: names, numbers, dates, mechanisms, consequences.
- Portability test: could this sentence appear unchanged on any other
  product's site? If yes, it is filler.
- Active voice, human subjects.
- Show, don't tell — no "this highlights our commitment to".
- Preserve the user's voice: vocabulary, cadence, bluntness, humour,
  uncertainty. Do not smooth distinctive writing into generic polish.

## Tool integration

The Lazynext AI Slop Checker engine ships with this repo:

```sh
node api/cli.js "check this text"
node api/cli.js --file path/to/draft.md
node api/cli.js --url https://example.site/landing
node api/cli.js --json "machine-readable"
```

Exit code 2 means findings (like a linter). The engine is deterministic, has
zero dependencies, and never invents content.