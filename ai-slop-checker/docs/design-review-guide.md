# Design Review Guide

A human-facing guide for reviewing interfaces the way a sharp design partner
would: without mercy for defaults, and with a hard floor nobody gets to
negotiate. Written originally by Lazynext for the AI Slop Checker — inspired
by the vocabulary of *impeccable* (craft floor, flat type, the Refuse list)
and *hallmark* (quality floor, the Reflex gate, the 1280×800 fold, the
80-word screen) — and crediting both in ATTRIBUTIONS.md. This is a guide for
**people**, not a scanner: the machine checks (r-*/d-*) in this product
automate the provable subset; everything else here is judgement.

---

## 1. The one rule

**Slop is the absence of a decision.** Every tell in this guide is a default
nobody chose: a purple-to-blue gradient, an all-caps label, a "seamless
experience" claim, an equal-height card grid. The fix is never "choose a
better gradient" — it is *decide something*: what is this page for, who is
it for, and what does it ask the visitor to feel or do.

The gate (hallmark's Reflex gate, restated): a tell is only slop when it is
a **default**. If you can name an actual reason the gradient exists, it is a
decision, not slop. The guide works best as a *second pass*: design with
defaults first to move fast, then review for the defaults you left in.

---

## 2. Tone pairs

AI copy and AI design both collapse to a handful of "on" settings. Rewrite
toward the bolder column — these pairs appear constantly in generated
products:

| Default (slop) | Decision (better) |
|---|---|
| "Unlock the power of" | "It does exactly this" |
| "Seamless experience" | the one step it made easier |
| "Innovative, cutting-edge" | the concrete difference |
| "Our dedicated team" | what the team actually does |
| everyone gets a gradient | one meaningful accent, once |
| kicker + big heading + sub-heading | one sentence that says the thing |
| 6 equal cards | one card more important than the others |
| 40px radius, soft shadow | a radius and a shadow you can justify |
| "in today's fast-paced world" | delete the sentence |
| 4 section headers above the fold | one promise above the fold |
| a progress bar that never moves | a real count or no bar |
| "learn more →" on everything | the actual link text |

The pattern: **polish → bolder**. Polish is layering; bolder is deciding.
A polished page that still hedges every claim reads more sloppy than a
rough page with strong opinions.

---

## 3. The four review modes

One artifact, four lenses. You can run all four on a single page; they
frequently disagree, and that disagreement is the review.

### Mode 1 — Polish
**The page mostly satisfies. Find the small cuts that lift it.**
Move fast; touch nothing structural. Checklist:
- [ ] No filler word survives ("utilize", "crucially", "in order to").
- [ ] Every heading could not move to a different product.
- [ ] Em-dash clusters ≤ 1; hyphenated stacks checked.
- [ ] Spacing, radii, shadows consistent *and* relationship-driven.
- [ ] Colour palette: named tokens, not 12 one-off hexes.

Exit: a short list of sentences to delete and values to align. No drama.

### Mode 2 — Critique
**The page works but the thinking is default-shaped.**
The goal is not fixes but the *question behind the layout*. Checklist:
- [ ] Does the hero earn its own claim? (Not: "seamless", "revolutionary".)
- [ ] Is hierarchy decided, or is everything equal weight?
- [ ] Does anything below the fold matter more than what is above it?
- [ ] Are the benefits benefits or features with adjectives?
- [ ] Would a human reviewer call this "made by a person for a person"?

Exit: 3–5 questions the owner must answer, not fixes to apply.

### Mode 3 — Audit
**The receipts pass: contrast, typography, rhythm, a11y.**
Run the machine on it — this guide's scanner (text + design + rendered
snapshot checks) does the provable half; the RAISE checklist is the rest:
- [ ] Contrast ≥ 4.5:1 (normal) / ≥ 3:1 (large) — the craft floor.
- [ ] Effective lang, alt text, focus order, form labels.
- [ ] No motion without `prefers-reduced-motion` respect.
- [ ] Section rhythm: does the *content* justify the uniform grid?
- [ ] 1280×800 fold carries ≤ 2 distinct section headers; ~80 words/screen.

Exit: a defect list with severities. The floor items are non-negotiable.

### Mode 4 — Refuse
**The page meets the floor but not the bar — and the "bar" is a fixed
list of scaffolds.**
Some page shapes are so over-produced by models that they read as AI no
matter how well executed (impeccable's Refuse list, restated):
- Kicker above every heading (eyebrow text as a rhythm crutch).
- Section numbers 01/02/03 on unstyled marketing pages.
- Hero metric cards: 98%, 24/7, "Join 10,000+".
- "Not just X, but Y" framing.
- A gradient headline or an "AI-powered" badge as the headline.
- Glassmorphism as a personality substitute.

Refusal is not rejection: it is *saying no to the shape*, then offering
the alternative shape. See section 6.

---

## 4. The craft floor

The craft floor is the small set of quality rules that **never bend**. It
is hallmark's "Floor" and impeccable's craft-floor checks, absorbed as a
floor a reviewer can stand on without taste: these are measurements, not
preferences.

1. **Contrast** — text over its real (computed) background: ≥ 4.5:1 for
   normal text, ≥ 3:1 for large text (24px+, or 18.66px+ bold). The
   machine check `r-contrast` computes this from the actual background,
   including inherited fills through ancestor elements.
2. **Alignment** — things that look aligned must be aligned by the same
   grid; never by eye-felt. Two elements sharing a visual axis must share
   an edge within 1px. Hairline-off misalignment reads as carelessness
   because it is: it is *unmeasured*.
3. **Text hierarchy** — one type scale doing real work: a size step is a
   promise about importance. If the kicker is the same size as the body
   (flat type) it competes with the heading; if a "kicker" is larger than
   what it labels, it is shouting. The `r-kicker-size` check encodes the
   provable half: below ~0.8x or above ~1.6x of the section body size.
4. **Spacing** — space by relationship, not by one gap value stamped
   everywhere. Tight inside groups, generous between groups; the spacing
   between two elements should encode whether they belong together.
5. **No fake data** — invented metrics ("10,000+ users"), testimonials
   without attribution, progress bars that never progress, badges that
   manufacture buzz ("New!", "Hot!"). If the number is real, name its
   source; if the progress is real, it should animate; otherwise, cut it.
6. **No decorative text-effects** — clipped gradient headlines,
   all-caps-with-wayward-tracking labels, glued arrows (learn-more-→).
   These three are machine-checkable (`r-gradient-text`,
   `r-tracked-caps`, `r-glued-arrow`).

A page can be ugly and meet the floor. The floor is about *provable*
craft, not taste. The bar (section 6) is about taste.

---

## 5. The 5-question review

From the field guide (visual-tells.md), distilled to the questions that
catch most slop in one pass. Ask them in order; a single honest "no"
usually identifies the page's real problem.

1. **What is this for?** — The page does *one* job. If you cannot name it
   in one sentence, the page is hedging, and the hedge is the slop.
2. **Who is it for?** — A real person with a real context. "Everyone" is
   not an audience; it is a default nobody chose.
3. **Does it decide?** — Every element has a chosen importance. If the
   hero, the first card, the primary button, and the footer CTA all shout,
   nothing leads.
4. **Does it vary?** — The rhythm of sections, the weight of sentences,
   the shape of cards. Uniformity everywhere is the machine's comfort zone.
5. **Does it use defaults nobody chose?** — The gradient, the Inter font,
   the equal cards, the "seamless" line. Name the default; then decide
   whether to keep it *deliberately*.

These five questions ARE the critique mode's structure; mode 3 (audit) is
the only place the machine runs.

---

## 6. Refusal scaffolds

You meet the floor but not the bar. What do you say? Refusal is a
professional sentence, not a tantrum. Three scaffolds, in writing the
reviewer can send to the owner:

> **The shape is wrong, here is the shape I'd choose.**
> "The craft is fine — the contrast passes, the type is clean. The
> problem is the shape: a kicker, a huge claim, and six equal cards is
> the machine's landing page, not this product's. I'd cut the kicker,
> make the first card state the single promise, and let the other five
> be tertiary."

> **The claim outruns the evidence.**
> "You say 'seamless' and 'revolutionary' above the fold, but the page
> shows three features. The fix is not better adjectives — it is one
> sentence about the actual hardest thing this product solves."

> **The floor passes, the bar is the problem.**
> "Nothing here is broken and nothing here is chosen. Every pixel is
> defensible and nothing is memorable. Let's start from the one thing a
> visitor must understand in five seconds, and rebuild the hierarchy
> from that."

Keep the refusal tied to the artifact: *what to change* and *what it
should become*, never just "this is generic". If the owner cannot decide
the single most important thing, that decision is the deliverable — the
page is downstream of it.

---

## 7. Theme catalog (guide)

Archetypal templates, with the slop-to-fix list per archetype. This is a
creative-direction aid — a guide, not a code artifact (hallmark's theme
catalog absorbed as a guide). Pick one archetype, then fix its tells
rather than inheriting them.

### Founder / personal brand page
Common tells: purple-to-blue gradient hero, "I help teams…" with three
buzzword pillars, avatar + giant name + LinkedIn button, one-emotion
everywhere, "Let's connect!" glue arrows.
- Fix list: one concrete promise above the fold; one photo that looks
  like the person; a portfolio entry the visitor can finish; contrast a
  real opinion (even a wrong one) with the generic warm tone.

### Dev tool page
Common tells: terminal-window hero screenshot, "Supercharge your
workflow", three equal feature cards, benchmark bars with no axis labels,
"Built by developers for developers", indigo-violet gradient on the
logo mark.
- Fix list: show the API call; name the specific pain; real benchmark
  axes and sample sizes; docs link in the hero; keep the terminal window
  only if it shows the tool actually running.

### Agency / services page
Common tells: "We're a full-service partner", six equal service cards,
client logos with no names, a process section numbered 01-02-03-04,
"Let's build something amazing together".
- Fix list: one case study with numbers; name the client or drop the
  logo; process steps that say what *you* do at each stage; one service
  the agency is best at, shown more prominently than the others.

### SaaS dashboard
Common tells: gradient sidebar, glowing status dot on every row, funnel
numbers that can't be derived, ALL-CAPS labels with wide tracking, a
uniform card grid for charts of wildly different importance, empty-state
illustrations that are just icon tiles.
- Fix list: default route that shows a real insight; numbers that sum or
  derive; status via colour *and* text (not colour alone); hierarchy by
  chart importance, not grid symmetry; empty states that teach.

---

## 8. Where the machine meets the guide

This guide's product — the Lazynext AI Slop Checker — automates the
provable half of the floor:
- text checks (word-ban, filler-phrases, weasel-attribution, …) cover
  section 2's copy pairs,
- `d-*` markup checks cover the machine-visible design tics,
- `r-*` rendered checks (contrast, kicker size, tracked caps, glued
  arrows, fold budget, screen budget, section rhythm, fake progress,
  hidden reveal, marquee) cover the computed-style half of the craft
  floor and hallmark's rendered-tier gates.

The rest — alignment by eye, hierarchy judgement, refusal, the theme
catalog — stays human. That division is intentional: a deterministic
scanner can measure contrast; it cannot decide the page's claim.

*Original Lazynext work. Ideas drawn from pbakaus/impeccable and
Nutlope/hallmark (see ATTRIBUTIONS.md); every sentence here was written by
us, not copied.*