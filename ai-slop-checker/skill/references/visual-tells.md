# Field guide: visual AI tells

How to spot machine-default design at a glance, from a thumbnail to a full
page. Original field-guide text by Lazynext, informed by the kill-ai-slop
taxonomy, impeccable's design vocabulary and hallmark's floor. See
`../ATTRIBUTIONS.md` for the credit mapping.

## The rule under everything

Slop is the *absence of a decision*. A tell is only slop when it is a default
nobody chose. The same gradient, serif, or emoji, chosen and defended, is
fine. When you look at a page, ask: *did someone decide this, or did a model
fill the slot?*

## The signature in one paragraph

Vibe-coded pages are ugly in a specific way: they pile on every available
style without settling on a focus. A gradient, a glow, a mascot, emoji, a
wall of glowing cards — every default switched on at once, until every
product looks like the same garish template. It reads as "designed" in a
thumbnail and falls apart the moment anyone looks.

## Colour

| Tell | What it looks like | The fix |
|---|---|---|
| Indigo-violet gradient | `#6366f1 → #a855f7` diagonal on buttons, glows, hero backgrounds | One justified accent; a gradient needs a direction and a reason |
| Gradient headline | rainbow fill on headings via `background-clip:text` | Solid colour; hierarchy from size and weight |
| Warm "cozy" wash | amber/stone/orange -50s on soft beige everywhere | Neutral base + one restrained warm accent |
| Default semantic rainbow | info=blue, tip=amber, success=green, error=red, each a stock -50/-600 pair | Grow states from one palette; colour only real differences |
| One-hue status box | border+text+10% background all one hue | State in words and weight first; one muted accent |
| Gradient atmosphere | midnight-blue page with a top glow; card surfaces that are themselves gradients; per-card accent washes | One flat background; depth from hairlines and restrained shadows |
| Colored glow shadows | `box-shadow: 0 0 40px <accent>` as dark-mode depth | Colourless elevation; a glow must point at something |
| Three-stop rainbow | `linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)` on sections | One hue ramp or none |

## Type

| Tell | What it looks like | The fix |
|---|---|---|
| Serif-italic one word | one word of a sans headline swapped to serif italic | Weight, position, line break; keep one voice |
| Display serif everywhere | Playfair/Lora/Cormorant at UI sizes or oversized italic heroes | One legible sans you chose; serif only when the voice needs it |
| Decorative strikes | strike/underline/highlighter on a word, not for edits or links | Let structure carry emphasis |
| Kicker over every heading | tiny `uppercase tracking-widest` label above hero *and* each section | Delete kickers that restate their heading |
| Full-sentence display headline | a whole marketing sentence at `text-6xl extrabold`, crushed tracking | Compress to two or three words at display size; say the rest in a subline |
| Crushed tracking | `letter-spacing: -0.06em` past the point letterforms keep their shapes | Tighten only as far as the face was designed to go |
| Flat hierarchy | every size between 14-18px; hierarchy left to shades of gray | A scale with real steps (1.25×+); let the most important thing be big |
| Editorial dashboard | serif "Good evening" greeting, serif numerals, cream paper, tracked-caps kickers | Type follows the job: sans + tabular numerals for scanned surfaces |
| Default faces | Inter body + Space Grotesk display (or Geist/Manrope/Plus Jakarta) | Choose a face like a logo; landing on Inter after trying others is a choice |

## Components

| Tell | What it looks like | The fix |
|---|---|---|
| Glowing status dot | solid dot in a pale halo, pulsing, saturated green | Small flat dot + a word; no halo, no pulse |
| Colored left border | 4px bar on the left of every rounded list row | Lists are lists; callouts are scarce (1-2 a page) |
| Icon tiles | rounded-square chip + line icon per feature in a grid | An icon must carry meaning or go |
| Giant decorative icon | a `w-24 h-24` line icon or 96px+ SVG parked in a card | A clear label + one sentence beats a row of glyphs |
| Max radius + glass | every card a `rounded-full` pill or `backdrop-blur` pane | One small radius, held site-wide; depth from solids |
| Oversized shadow | small card under a huge soft blur, opaque, no offset | Tight blur, small offset; often a hairline suffices |
| Ghost card | a hairline border *and* a wide diffuse shadow on the same card | Commit to an edge or an elevation; usually the hairline |
| Hard offset shadow | `box-shadow: 4px 4px 0 #000` (neobrutalist costume) | A real elevation scale, or no shadow at all |
| Corners that don't nest | same big radius on outer box and inner box | inner radius = outer − padding |
| Border that dies at corners | hairline on straight edges, nothing on the arcs | border + radius on the same box |
| Badge/pill spam | `✨ New`, `β Beta`, `🔥 Popular` everywhere | A badge only for real status |
| AI-drawn SVG icons | blob with dot eyes / rounded square with a face as the mark | Get real, crisp, on-brand artwork |
| Icon in a tint of itself | `bg-blue-50` behind a blue icon, repeated per hue | Icons inherit text colour, no container |
| Avatar grid | rows of generic circles standing in for social proof | Real named people with real roles, or none |
| "Powered by AI" | a tech-laundry badge under the hero | Say what the feature does for the user |
| Tasteful terminal | mono everywhere, near-black, one warm accent, ASCII art | Mono for code only; terminal metaphors only where they serve |

## Motion

| Tell | What it looks like | The fix |
|---|---|---|
| Springy hover | every card `hover:scale-105 transition-all`; elastic ease | Background/border/opacity only, 120-200 ms, standard ease |
| Wobbling spinner | arc wobbles around a wandering centre while spinning | Centre the artwork; keep centring out of the animated transform |
| Marquee/ticker | a scrolling strip of content behind a `marquee`/`ticker` class | Static content or a real data feed |
| Hidden reveal | `.reveal`/`.animate` sets `opacity: 0` with no `.js` gating | Visible by default; hide only under a `.js` class |
| Layout-property animation | animating width/height/margin/padding | Never animate layout properties |

## Layout

| Tell | What it looks like | The fix |
|---|---|---|
| All-caps card grid | uppercase micro-labels on interchangeable cards | Show the one important thing fully |
| Invented stat rows | `10k+ developers`, `99.9% uptime`, `24/7` | Real, odd, sourced numbers; one checkable figure beats three round ones |
| `01 / 02 / 03` markers | giant faint ordinals on unordered marketing sections | Number what is genuinely ordered |
| Cards inside cards | bordered+rounded+shadowed card holding another, three deep | One surface per region; group with spacing and hairlines |
| One gap everywhere | `gap-4` from heading to body to unrelated section | Space by relationship, not by token |
| Equal-weight grid | `grid-cols-3 items-stretch` with nothing leading | Decide the most important thing and show it fully |
| Codex grid | a 1px hairline grid background behind content with nothing under it | Let the grid be the content |
| Boilerplate opener | "Built for the modern team", "In today's digital age", "The future of X is…" | Say what the product does, in its own nouns |
| Middle dots & arrows | "A · B · C" meta strings, "Learn more →" glued arrows | Line breaks and verbs; one dot in a byline at most |

## Evolved slop (the second wave)

The model learned the first list, so it now produces *quieter* uniforms that
still dodge the identity decision:

- **The tasteful terminal** — mono everywhere, near-black background, one
  warm accent, ASCII art. "An AI that read one Vercel blog post."
- **The editorial dashboard** — giant serif "Good evening" greeting, serif
  numerals in stat cards, cream paper, tracked-caps kickers. A magazine is
  read once; a console is scanned all day.
- **The stock pairing, politely** — Space Grotesk + Inter with good spacing,
  but still the training-data average. The face is the loudest signal of who
  made this.

Held against each: *is this a decision you can explain, or this season's
safest template?*

## The five-question review

Before you sign off a UI, answer these:

1. **Would a neighbouring prompt produce this exact combination?** If yes,
   change one decision and say which.
2. **Does every visual choice have an owner?** (a declarer, not a linter)
3. **What is the single most important thing on this screen, and does it
   look like it?**
4. **Does any decoration carry information?** If an icon, badge, or glow
   could be deleted without losing meaning, delete it.
5. **Specific beats punchy?** Real nouns, real numbers, real consequences.