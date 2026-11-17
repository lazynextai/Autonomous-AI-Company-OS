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
   revolutionize, unleash, next-generation, industry-leading, future-proof,
   enterprise-grade, this is huge. Name the mechanism instead.
2. **Empty phrases** — delete: it's worth noting, it's important to note, at
   the end of the day, at its core, in today's world, in the age of, in the
   world of, in a world where, the reality is, the truth is, when it comes
   to, in terms of, with regard to, in order to, going forward, let's dive
   in, it turns out, more than just.
3. **Throat-clearing and faux-insight** — delete: here's the thing, here's
   why, here's the problem though, let me be clear, i'll be honest, the
   uncomfortable truth is, what nobody tells you, what most people get
   wrong, the part everyone misses. State the claim.
4. **Rhythm crutches** — binary contrasts ("It's not X. It's Y." and the
   family: "Not because X. Because Y.", "stops being X and starts being Y"),
   colon reveals ("The best part: it learns."), negative listings ("Not a X.
   Not a Y. A Z."), dramatic fragments ("X. And Y. And Z."), em-dash
   clusters, rhetorical setups ("What if I told you", "And that's okay").
5. **Puffery and weasel words** — stands as a testament, marks a pivotal
   moment, plays a vital role, experts agree, studies show. Cut or cite.
6. **Empty adverbs** — really, just, literally, genuinely, simply, actually,
   truly, fundamentally, importantly, crucially, inherently, inevitably,
   arguably, deeply. Cut when they add nothing.
7. **Superficial analysis** — trailing -ing clauses that name a feeling:
   highlighting the team's commitment, underscoring the importance,
   reflecting our focus, showcasing our dedication. Say what the change does.
8. **Meta-commentary** — the key point is, this distinction matters, as you
   can see, let that sink in, make no mistake, this matters because, the
   rest of this essay, in this section we'll. Delete the aside.
9. **Vague declaratives** — the stakes are high, the implications are
   significant, the reasons are structural. Name the specific thing.
10. **False agency & passive voice** — the decision emerges, the data tells
    us, the market rewards, nobody designed this; it is believed that,
    mistakes were made, the decision was reached. Find the actor, make them
    the subject.
11. **Fake-strong verbs** — made a decision → decided, has the ability to →
    can, serves as a centralized hub → say what it does.
12. **Formatting slop** — emoji in headings, decorative bold, bullets where
    two sentences of prose belong, headers over two-sentence sections.

## Design (UI you generate)

- **Colour:** no indigo-violet gradients, no gradient-clipped headline text,
  no colored glow shadows, no warm amber/stone wash everywhere, no stock
  semantic rainbow (blue-50/amber-50/green-50/red-50 pairs), no one-hue
  status boxes, no glow halos or three-stop rainbow ramps. One justified
  accent, mixed from your own palette.
- **Type:** no one-word serif-italic emphasis in sans headlines, no display
  serifs in UI chrome, no tracked-caps kicker above every heading, no flat
  type hierarchy (headings must clearly outsize body), no full-sentence
  display headlines (compress to a few words), no crushed tracking, no
  decorative strikes/highlights, no editorial-dashboard costume (serif
  greeting, serif numerals, oldstyle figures on scanned UI), no default
  Inter/Space Grotesk pairing without a stated reason.
- **Components:** no glowing status dots (animate-ping), no colored
  border-left callouts on every list item, no rounded-square icon tiles or
  giant decorative icons in grids, no glassmorphism defaults, no badge/pill
  spam, no icon-in-a-tint-of-itself, no oversized soft shadows, no ghost
  cards (hairline + wide shadow), no hard offset shadows, no "Powered by
  AI" badges, no blob/mascot SVG marks, no tasteful-terminal costume (mono
  everywhere, ASCII art, near-black + warm accent).
- **Motion:** no hover:scale + transition-all on everything; transition only
  the properties that carry the state change; no wobbling spinners; no
  marquee/ticker strips; no reveal classes hiding content at rest without a
  `.js` gate.
- **Layout:** no invented stat rows (10k+ users, 99.9% uptime), no 01/02/03
  markers on unordered sections, no cards nested in cards, no single gap
  value stamped across the page, no equal-weight card grids with nothing
  leading, no codex-grid hairline backgrounds, no border that dies at a
  rounded corner, no "Built for the modern team" boilerplate, no
  middle-dot meta strings or glued arrows.

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
node api/cli.js --dir src              # whole-project scan
node api/cli.js --json "machine-readable"
```

Exit code 2 means findings (like a linter). The engine is deterministic, has
zero dependencies, and never invents content. For a whole-project pass, scan
→ triage (confirmed hit or deliberate choice?) → report → fix → re-scan until
the count drops; keep anything the user clearly chose (brand tokens, a logo,
a deliberate illustration).