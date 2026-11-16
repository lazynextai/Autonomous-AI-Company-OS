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
node api/cli.js --dir path/to/project    # whole-project scan (project-scan mode)
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

- **Binary contrasts.** "It's not X. It's Y." State Y directly. Also the
  family: "Not because X. Because Y.", "The answer isn't X. It's Y.",
  "It feels like X. It's actually Y.", "stops being X and starts being Y",
  "doesn't mean X, but actually Y", "not just X but also Y".
- **Colon reveals.** "The best part: it learns." Rewrite as a plain sentence.
- **Negative listings.** "Not a X. Not a Y. A Z." Say Z.
- **Dramatic fragments.** "X. And Y. And Z." Use complete sentences.
- **Em-dash clusters.** Three or more dashes in a short text is a rhythm
  habit. Use commas and periods; let sentence length vary.
- **Rhetorical setups.** "What if I told you...", "Think about it:",
  "Plot twist:", "And that's okay.", self-answered "Question? Answer." pairs.
- **Robotic symmetry.** Three identical sentence shapes in a row, stacked
  punchy one-liners, every paragraph ending on a mic drop, sentences
  starting with Wh- words as a crutch.

### 5. Cut the puffery and weasel words

- **Importance puffery:** `stands as a testament`, `marks a pivotal moment`,
  `plays a vital role`, `underscores`, `solidifies its position`.
  State the fact and let the reader judge.
- **Weasel attribution:** `experts agree`, `studies show`, `researchers
  found`. Name the source or cut the claim. Never invent a citation.
- **Empty adverbs:** `really`, `just`, `literally`, `genuinely`, `simply`,
  `actually`, `truly`, `fundamentally`, `importantly`, `crucially`,
  `inherently`, `inevitably`, `arguably`, `deeply`. Cut them when they add
  nothing.
- **Fake-strong verbs:** `made a decision` → `decided`, `has the ability to`
  → `can`, `serves as a centralized hub` → say what it does.

### 6. Cut the superficial analysis

Trailing `-ing` clauses that pretend to explain meaning:

- `highlighting the team's commitment`, `underscoring the importance`,
  `reflecting our focus`, `showcasing our dedication`, `hailing the
  milestone`, `a testament to our ingenuity`.

They name a feeling instead of a mechanism. "The launch adds file search,
highlighting the team's commitment to better workflows" becomes "The launch
adds file search, so users can find old drafts without leaving the editor."

### 7. Cut meta-commentary and emphasis crutches

Text that talks about the text instead of being it:

- **Interpretive asides:** `the key point is`, `this distinction matters`,
  `as you can see`, `in other words` (when redundant), `the bottom line is`.
- **Self-reference:** `the rest of this essay`, `in this section we'll`,
  `but that's another post`, `you already know this`, `hint:`, `spoiler:`,
  `a feature, not a bug` (as a meme-answer), `dressed up as`.
- **Performative emphasis:** `let that sink in`, `make no mistake`,
  `this matters because`, `here's why that matters`, `full stop`, `Period.`,
  `creeps in`, `i promise you`.

Delete the aside; the point was the sentence.

### 8. Cut vague declaratives

Sentences that announce depth without naming the specific thing:

- `the stakes are high`, `the implications are significant`,
  `the consequences are real`, `the reasons are structural`,
  `this is the deepest problem`, `there are no easy answers`.

Name the specific stake, implication, consequence, or structure.

### 9. Cut false agency and passive voice

Inanimate things doing human verbs — AI's way of hiding the actor:

- `the decision emerges`, `the data tells us`, `the market rewards`,
  `the culture shifts`, `the conversation moves toward`,
  `a complaint becomes a fix`, `lives or dies`.
- Narrator-from-a-distance: `nobody designed this`, `people tend to`,
  `this is why most...`. Put the reader in the scene.
- Named passive constructions: `it is believed that`, `mistakes were made`,
  `the decision was reached`, `it was decided`, `was created to`.

Find the actor and make them the subject: "The team fixed it that week" beats
"the complaint becomes a fix."

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
- **Warm "cozy" wash** — amber/stone/orange -50s everywhere, soft-beige
  hexes (`#fff7ed`, `#fdf6ec`). Neutral base plus one restrained accent;
  warmth comes from words.
- **The default semantic rainbow** — info=blue-50, tip=amber-50, success=
  green-50, error=red-50, each with its -600 text. Grow states from one
  palette; colour only real differences.
- **The one-hue status box** — border, text, and a `/10` background all one
  hue (`border-red-500 text-red-500 bg-red-500/10`). State in words and
  weight first.
- **Glow halos and rainbow ramps** — blurred orbs/aurora/mesh blobs behind
  text, zero-offset coloured glows, three-stop rainbow gradients. Depth from
  lightness and offset shadows, not atmosphere.

### Type tells

- **One word in serif italic** inside a sans headline. Emphasize with
  weight or line break.
- **Display serif** (Playfair/Lora/Cormorant) as UI or body face.
- **A kicker above every heading** (`uppercase tracking-widest`). Delete
  kickers that restate their heading.
- **Flat hierarchy** — headings barely bigger than body (`text-lg` on an
  h1). A scale with real contrast (1.25× and up).
- **The full-sentence display headline** — a whole pitch at `text-6xl
  font-extrabold tracking-tight`, wrapping three or four lines. Compress to
  a few words at display size.
- **Crushed tracking** — `letter-spacing: -0.06em` past the point letterforms
  keep their shapes. Tighten only as far as the face was designed to go.
- **Decorative strikes** — `line-through`, `<s>`, `<mark>`, underline used
  for emphasis, not for edits/links/annotation.
- **The editorial dashboard** — a serif "Good morning" greeting, serif
  numerals, cream paper, tracked-caps kickers on a scanned console. Type
  follows the job: sans + tabular numerals for surfaces you scan all day.
- **Inter/Space Grotesk by default.** Fine faces, but the stock pairing
  outsources the identity decision. Know why you chose the face.

### Component tells

- **Glowing status dot** (`animate-ping`, green halo). A small flat dot and
  a word.
- **Colored left-border callouts** on every list item. Callouts are scarce.
- **Rounded-square icon tiles** in a grid. An icon must carry meaning or go
  — including a giant decorative line icon (`w-24 h-24`, `<svg>` at 96px+)
  parked in a card as filler.
- **Glassmorphism** (`backdrop-blur`) as the default surface. One radius,
  real surfaces.
- **Badge/pill spam** — `✨ New`, `β Beta`, `🔥 Popular`. Real status only.
- **Icon in a tint of itself** (`bg-blue-50` behind a blue icon).
- **The "powered by AI" badge.** Say what the feature does for the user.
- **Oversized drop shadows** (huge blur, tiny offset). Tight, colourless
  elevation. The **ghost card** variant (hairline border *and* a wide soft
  shadow) commits to nothing — pick the edge or the elevation.
- **Hard offset shadows** (`box-shadow: 4px 4px 0 #000`) outside a world
  that is actually neobrutalist. A costume, not a depth system.
- **AI-drawn icon art** — a blob-with-dot-eyes, a mascot SVG, a primitive
  shape-assembled mark. Get real, crisp, on-brand artwork.
- **The tasteful terminal** — mono everywhere, near-black, one warm accent,
  `╔═╗` ASCII art. "An AI that read one Vercel blog post." Mono is for code.

### Motion tells

- **Springy hover** (`hover:scale-105 transition-all`). Transition only the
  properties that carry the state change, 120–200 ms.
- **The wobbling spinner** — a rotate keyframe clobbering a translate centre.
  Centre the artwork; keep centring out of the animated transform.
- **Marquees/tickers** — `animation: marquee`, `ticker` strips. Static
  content or a real feed; let the reader scroll.
- **Content hidden at rest** — a `.reveal`/`.animate` class setting
  `opacity: 0` with no `.js` gating ships blank when a script fails.
  Visible by default; hide only under a `.js` class.

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
- **Equal-weight card grids** (`grid-cols-3 items-stretch` everywhere) —
  every item boxed the same, nothing leading.
- **The codex grid** — a 1px hairline background grid (`linear-gradient...
  1px`) behind content with nothing under it. A costume.
- **The border that dies at the corner** — `rounded-xl overflow-hidden` on a
  wrapper whose child owns the border. Put border + radius on the same box.
- **Built-for boilerplate** — "Built for the modern team", "In today's
  digital age", "The future of X is…". Say what the product does.
- **Middle-dot meta strings and glued arrows** — "A · B · C", "Learn more →".
  Line breaks and verbs; one dot in a byline at most.

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

## Whole-project scans (project-scan mode)

When the user asks to "de-slop this project", "remove the AI look from the
codebase", or "check the site source", do not eyeball it file by file — run
the scanner over the tree:

```sh
node api/cli.js --dir src              # grouped report: per-file + pooled
node api/cli.js --dir src --top 20     # more top offending files
node api/cli.js --dir src --json       # machine-readable, for triage
```

The scanner walks the tree, infers each file's lens (prose → text tells;
markup → HTML; styles/code → design tells over raw source), skips
`node_modules`/`dist`/`.git`/lockfiles/binaries, and never edits anything.
Use its output as a starting map, not gospel — confirm each hit by reading
the code.

Then follow the kill-ai-slop style **scan → triage → report → fix → verify**
loop:

1. **Scan** and read the grouped summary.
2. **Triage** — this is the step that separates the skill from a lint rule.
   A gradient, serif, or emoji can be a real, defended choice (brand tokens,
   a logo, a deliberate illustration). Flag only defaults nobody chose.
3. **Report** the grouped findings before changing anything: each tell, the
   `file:line` hits you confirmed, one sentence on why, the proposed fix.
   Ask which groups to apply, or whether to proceed on all.
4. **Fix** with the smallest change that removes the tell while preserving
   intent: prefer shared tokens/components over touching every call site;
   never invent new brand colours; keep copy meaning.
5. **Verify** — re-run `node api/cli.js --dir src` and confirm the count
   dropped. Note hits you intentionally left, with the reason.

Guardrails: respect authorship (ask before stripping an unfamiliar file),
small reviewable diffs, never `git add -A`, no new dependencies, and verify
visually when a dev server exists — a passing scan is not a better page.

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