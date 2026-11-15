---
name: lazynext-slop-guard
description: >-
  Scan drafts, product copy, and UI for AI slop — the predictable writing and
  design tells of generated content — and fix them while preserving the
  writer's voice. Use when the user asks to de-slop text, remove AI tells,
  make copy sound human, check a landing page for the AI look, or review a
  project the way impeccable-style reviewers do.
metadata:
  trigger: editing prose, reviewing copy for AI patterns, de-slopping, checking UI for AI-generated design tells
  version: 1.0.0
  license: MIT
  company: Lazynext (UNITED GLOBAL VENTURES PRIVATE LIMITED)
---

# Lazynext Slop Guard

A hard floor against the defaults every model was trained into. Run it on
anything an AI (or a tired person) wrote, and it will catch both the writing
tells of AI prose and the visual tells of AI-generated UI.

This skill is the agent-side twin of the Lazynext AI Slop Checker engine
(see the repo root: `data/slop-patterns.js` is the machine-readable corpus,
`src/scanner.js` scores text and HTML). You can run the engine directly:

```sh
node api/cli.js "text to check"
node api/cli.js --file drafts/post.md
node api/cli.js --url https://yoursite.io/landing
```

For a full report, use `node api/cli.js --json <text>`.

## Two jobs

**Audit (default when asked to check/review).** Name each tell you find,
quote the exact line, and give a fix in a few words. Do not rewrite the
whole piece, do not invent a score, do not guess whether an AI wrote it —
named patterns are evidence the writer can act on.

**Edit (default when given a draft to polish).** Apply the fixes below with
the minimum effective edit. Preserve the writer's voice: their vocabulary,
cadence, bluntness, humour, uncertainty and digressions. A rough draft with
a real voice should still sound like the same person when you are done.

## The writing tells

### 1. Cut the banned vocabulary

These words and phrases carry almost no information — they exist because a
model reaching for "important" or "useful" picks them. Replace or delete:

`delve`, `foster`, `leverage`, `utilize`, `facilitate`, `empower`,
`streamline`, `robust`, `cutting-edge`, `paradigm shift`, `game-changer`,
`tapestry`, `realm`, `beacon`, `multifaceted`, `meticulous`, `intricate`,
`paramount`, `transformative`, `elevate`, `embark`, `supercharge`, `harness`,
`ever-evolving`, `seamless`, `unlock`, `journey`, `synergy`, `next-level`,
`revolutionize`.

Fix: name the specific mechanism or consequence. "Streamlines onboarding"
becomes "reduces setup clicks from nine to two". "Seamless" gets deleted
until the workflow actually has no seams.

### 2. Kill the empty phrases

These burn words to announce a point instead of making it:

- `it's worth noting`, `it's important to note`
- `at the end of the day`, `at its core`
- `in today's world`, `in the age of`, `in the world of`
- `the reality is`, `the truth is`
- `when it comes to`, `in terms of`, `with regard to`, `in order to`
- `going forward`, `let's dive in`, `dive into`
- `it turns out`, `navigate the complexities of`

Fix: delete them. If the sentence survives without the phrase, the phrase
was dead weight. Keep one only when it carries the writer's real spoken
rhythm — that is the exception, not the rule.

### 3. Kill the throat-clearing and faux-insight

Openers that delay the point, and setups that flatter the writer as the one
expert who noticed:

- `here's the thing`, `let me be clear`, `i'll be honest`
- `the uncomfortable truth is`
- `here's what nobody tells you`, `what most people get wrong`
- `the part everyone misses`

Fix: state the claim directly. "The part everyone misses: distribution is
the moat" becomes "Distribution is the moat."

### 4. Break the rhythm crutches

- **Binary contrasts.** "It's not X. It's Y." State Y directly.
- **Colon reveals.** "The best part: it learns." Rewrite as a plain sentence.
- **Negative listings.** "Not a X. Not a Y. A Z." Say Z.
- **Dramatic fragments.** "X. And Y. And Z." Use complete sentences.
- **Em-dash clusters.** Three or more dashes in a short text is a rhythm
  habit. Use commas and periods; let sentence length vary.
- **Robotic symmetry.** Three identical sentence shapes in a row, stacked
  punchy one-liners, every paragraph ending on a mic drop.

### 5. Cut the puffery and weasel words

- **Importance puffery:** `stands as a testament`, `marks a pivotal moment`,
  `plays a vital role`, `underscores`, `solidifies its position`.
  State the fact and let the reader judge.
- **Weasel attribution:** `experts agree`, `studies show`, `researchers
  found`. Name the source or cut the claim. Never invent a citation.
- **Empty adverbs:** `really`, `just`, `literally`, `genuinely`, `simply`,
  `actually`, `truly`, `fundamentally`, `importantly`, `crucially`,
  `inherently`, `inevitably`, `arguably`. Cut them when they add nothing.
- **Fake-strong verbs:** `made a decision` → `decided`, `has the ability to`
  → `can`, `serves as a centralized hub` → say what it does.

## The design tells (visual slop)

These are the machine-default moves of generated UI. Every one of them is a
*default nobody chose* — the same element, chosen and defended, is fine.

### Colour tells

- **Indigo-violet gradient** (`from-indigo-500 to-violet-600`,
  `linear-gradient(..., #6366f1, #a855f7)`). One justified accent, or a
  gradient with a reason.
- **Gradient headline text** (`bg-clip-text text-transparent`). Solid
  colour; hierarchy from size and weight.
- **Colored glow shadows** (`box-shadow: 0 0 40px #a855f7`). Colourless,
  restrained elevation only.
- **Warm "cozy" wash** — amber/stone -50s everywhere. Neutral base plus one
  restrained accent.

### Type tells

- **One word in serif italic** inside a sans headline. Emphasize with
  weight or line break.
- **Display serif** (Playfair/Lora/Cormorant) as UI or body face.
- **A kicker above every heading** (`uppercase tracking-widest`). Delete
  kickers that restate their heading.
- **Flat hierarchy** — headings barely bigger than body (`text-lg` on an
  h1). A scale with real contrast (1.25× and up).
- **Inter/Space Grotesk by default.** Fine faces, but the stock pairing
  outsources the identity decision. Know why you chose the face.

### Component tells

- **Glowing status dot** (`animate-ping`, green halo). A small flat dot and
  a word.
- **Colored left-border callouts** on every list item. Callouts are scarce.
- **Rounded-square icon tiles** in a grid. An icon must carry meaning or go.
- **Glassmorphism** (`backdrop-blur`) as the default surface. One radius,
  real surfaces.
- **Badge/pill spam** — `✨ New`, `β Beta`, `🔥 Popular`. Real status only.
- **Icon in a tint of itself** (`bg-blue-50` behind a blue icon).
- **The "powered by AI" badge.** Say what the feature does for the user.
- **Oversized drop shadows** (huge blur, tiny offset). Tight, colourless
  elevation.

### Motion tells

- **Springy hover** (`hover:scale-105 transition-all`). Transition only the
  properties that carry the state change, 120–200 ms.
- **The wobbling spinner** — a rotate keyframe clobbering a translate centre.
  Centre the artwork; keep centring out of the animated transform.

### Layout tells

- **Invented stat rows** — `10k+ users`, `99.9% uptime` with nothing
  measured. Real figures, sourced, or none.
- **01 / 02 / 03 section markers** on unordered sections. Numbering is a
  claim of order.
- **Cards inside cards.** One surface per region; group with spacing and
  hairlines.
- **One gap everywhere** (`gap-4` ×N). Space by relationship: tight inside,
  generous between.
- **The all-caps card grid** — labels doing the work hierarchy should do.

## Before you ship

1. **Lead with the point** when the setup adds nothing.
2. **Be specific** — names, numbers, dates, mechanisms, consequences beat
   abstractions. Run the portability test: could this sentence move to any
   other product unchanged? Then it is probably filler.
3. **Active voice with human subjects.** The team shipped it Tuesday beats
   the decision emerged.
4. **Show, don't tell.** No "this highlights our commitment to" — show the
   fact and let the reader judge.
5. **Format slop:** emoji in headings, decorative bold, bullets where two
   sentences of prose belong, headers over two-sentence sections. Clean.

## Workflow

1. Read the full draft or page before touching anything.
2. Identify the core point and the voice to preserve.
3. For an audit: list each tell, quote the line, give the one-line fix. Stop.
4. For an edit: apply minimum effective changes, then re-read for robotic
   symmetry and lost voice.
5. Read the result aloud. If it sounds like it was written by a committee of
   models — remove the bit you just noticed.

## Principles

- **Decide before you decorate.** Every visual choice must be explainable.
- **Subtract first.** The first move toward not-ugly is removing things.
- **Specific beats punchy** in copy.
- **One accent, one voice.**
- **A tell is only slop when it is a default nobody chose.** A gradient, a
  serif, an emoji can be a deliberate, defended choice. Keep anything the
  user clearly chose — brand tokens, a logo, a real illustration.

## License

MIT. Original implementation by Lazynext; the tell catalogue is informed by
no-ai-slop, stop-slop, impeccable, hallmark and kill-ai-slop (see
ATTRIBUTIONS.md in the repo root).