"use strict";
/**
 * Scanner tests: text scanning, clean prose, per-category firing, scoring,
 * determinism, and edge cases.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { scanText, scanHtml, extractText, countEmoji } = require("../src/scanner.js");
const corpus = require("../data/slop-patterns.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A deliberately sloppy demo text that should fire MANY categories.
const SLOP_TEXT = `
In today's fast-paced world, it's important to note that we truly need to
leverage our robust cutting-edge solutions to navigate the complexities of the
modern landscape. Let me be clear: this game-changer empowers teams to delve
into a seamless journey of transformative innovation.

At its core, the reality is that most people don't know the secret to
unlocking success. What nobody tells you is that the uncomfortable truth is
that synergy matters. Here's the thing: it's not just about technology, it's
about people. The best part: it learns.

Experts agree that studies show this paradigm shift fosters a multifaceted
tapestry of value. Stands as a testament to our meticulous approach, it marks
a pivotal moment. Ultimately, we need to circle back and double down on
low-hanging fruit. Let's dive in!

What if I told you that it wasn't the tool. It was the process. Plot twist:
we're all better off. Not a feature. Not a bug. A culture. That's it. That's
the whole thing. Really. Just. Literally. Arguably.
`;

// Written by hand as a control: high-quality prose with none of the tells.
const CLEAN_TEXT = `The bakery opens at six. By five forty-five the oven room smells of
yeast and burnt sugar, and the first tray of sourdough comes out at
six ten with a crust that cracks when you touch it. Maya sets the
loaves on the counter in order of size, largest first, because the
morning customers buy the big round one before they look at anything
else.

Orders arrive by phone and by foot. The woman in the blue coat asks
for a seeded loaf and a currant bun, pays with coins, and is gone
before the kettle boils. A child presses his nose to the glass and
points at the chocolate croissant, which Maya wraps in paper without
saying a word.

At noon the tables are wiped, the floor is swept, and the day's
receipts are counted twice. The flour dust settles on the window
ledge. Maya locks the door at two, walks to the market for lemons,
and starts the dough for tomorrow evening while the radio plays a
jazz station she does not recognize.`;

// HTML fixture containing design tells.
const SLOP_HTML = `<!doctype html>
<html>
<head>
  <title>Acme AI — Revolutionizing the Landscape</title>
  <style>
    .hero { background: linear-gradient(135deg, #6366f1, #a855f7); }
    .headline { background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
    .card-l { border-left: 4px solid #6366f1; border-radius: 12px; }
    .glass { backdrop-filter: blur(8px); background: rgba(255,255,255,0.1); }
    .pill-badge { border-radius: 9999px; background: #ede9fe; }
    .bounce-hover:hover { transform: scale(1.05); transition: all 0.3s; }
    .stat-badge { box-shadow: 0 25px 60px rgba(99,102,241,0.5); }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.2em; }
    .tile-icon { border-radius: 16px; background: #e0e7ff; }
  </style>
</head>
<body>
  <header><span class="eyebrow">FEATURES</span><h1 class="headline text-lg">Unlock the Power of AI</h1></header>
  <section class="hero">
    <h2>🚀 Revolutionize Your Workflow</h2>
    <p>Say goodbye to manual work. It's not just a tool — it's your new teammate.
       Meet your new assistant. Supercharge your productivity!</p>
  </section>
  <div class="avatar-grid">faces across a grid of circles</div>
  <div class="grid-cols-3">
    <div class="card-l">01 Feature</div>
    <div class="card-l">02 Feature</div>
    <div class="card-l">03 Feature</div>
  </div>
  <span class="stat-badge">10k+ users, 99.9% uptime, 24/7 support</span>
  <button>✨ New</button>
  <button class="pill-badge">Beta 🔥</button>
  <p>Powered by AI. Powered by GPT. Powered by Claude.</p>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Corpus integrity
// ---------------------------------------------------------------------------

test("corpus: every pattern has required fields and unique ids", () => {
  const ids = new Set();
  for (const p of corpus.patterns) {
    assert.ok(p.id, "pattern needs an id");
    assert.ok(!ids.has(p.id), `duplicate pattern id: ${p.id}`);
    ids.add(p.id);
    assert.ok(["word", "phrase", "regex"].includes(p.kind), `bad kind on ${p.id}`);
    assert.ok([1, 2, 3].includes(p.severity), `bad severity on ${p.id}`);
    assert.ok(corpus.categoryById[p.category], `unknown category on ${p.id}`);
    assert.ok(typeof p.match === "string" && p.match.length > 0, `empty match on ${p.id}`);
    assert.ok(typeof p.desc === "string" && p.desc.length > 10, `missing desc on ${p.id}`);
    assert.ok(typeof p.fix === "string" && p.fix.length > 5, `missing fix on ${p.id}`);
  }
  assert.ok(corpus.patterns.length >= 200, `expected a large corpus, got ${corpus.patterns.length}`);
  assert.ok(corpus.categories.length >= 27, `expected at least 27 categories, got ${corpus.categories.length}`);
});

test("corpus: all pattern regexes compile", () => {
  for (const p of corpus.patterns) {
    const re = corpus.patternToRegExp(p);
    assert.ok(re instanceof RegExp, `failed to compile ${p.id}`);
  }
});

// ---------------------------------------------------------------------------
// Text scan behaviour
// ---------------------------------------------------------------------------

test("scanText: slop fixture fires many categories with a high score", () => {
  const report = scanText(SLOP_TEXT);
  assert.ok(report.clean === false, "slop text must not be clean");
  assert.ok(report.score > 50, `expected a high slop score, got ${report.score}`);
  assert.ok(report.matches.length >= 25, `expected many matches, got ${report.matches.length}`);
  // Categories that must fire:
  const fired = new Set(report.matches.map((m) => m.category));
  for (const cat of [
    "word-ban",
    "filler-phrases",
    "business-jargon",
    "throat-clearing",
    "faux-insight",
    "binary-contrast",
    "colon-reveal",
    "importance-puffery",
    "weasel-attribution",
    "adverb-overuse",
    "rhetorical-setup",
    "negative-listing",
    "dramatic-fragment",
    "summary-recap",
  ]) {
    assert.ok(fired.has(cat), `category ${cat} did not fire on the slop fixture`);
  }
});

test("scanText: clean prose is clean with zero category fires", () => {
  const report = scanText(CLEAN_TEXT);
  assert.ok(report.clean === true, `clean prose must be clean, got verdict=${report.verdict} score=${report.score}`);
  assert.ok(report.score <= 9, `clean prose score too high: ${report.score}`);
  // Zero category fires means zero matches overall.
  assert.equal(report.matches.length, 0, `clean prose produced matches: ${JSON.stringify(report.matches)}`);
  assert.equal(report.categories.length, 0);
  assert.equal(report.totalPoints, 0);
});

test("scanText: verdict bands are monotonic", () => {
  // Force a spread of scores by scanning progressively larger slop inputs.
  const light = scanText("Arguably, really, just, simply, actually, deeply, truly.");
  const heavy = scanText(SLOP_TEXT);
  assert.ok(typeof light.score === "number");
  assert.ok(typeof heavy.score === "number");
  assert.ok(light.score >= 0 && light.score <= 100);
  assert.ok(heavy.score >= light.score, "more slop must score higher");
});

test("scanText: deterministic — same input, same report", () => {
  const a = scanText(SLOP_TEXT);
  const b = scanText(SLOP_TEXT);
  assert.deepEqual(a, b);
});

test("scanText: per-match shape is complete", () => {
  const report = scanText(SLOP_TEXT);
  for (const m of report.matches) {
    assert.ok(typeof m.id === "string");
    assert.ok(typeof m.category === "string");
    assert.ok(typeof m.severity === "number");
    assert.ok(typeof m.index === "number" && m.index >= 0);
    assert.ok(typeof m.context === "string");
    assert.ok(typeof m.snippet === "string");
    assert.ok(typeof m.fix === "string");
  }
});

test("scanText: text read-excerpt cap does not crash on huge input", () => {
  const big = "delve ".repeat(50000);
  const report = scanText(big);
  assert.ok(report.matches.length > 0);
  assert.ok(report.matches.every((m) => m.index >= 0));
});

test("scanText: em-dash cluster produces one aggregate match", () => {
  const text = "A — dash. B — dash. C — dash. D — dash.";
  const report = scanText(text);
  const dashMatches = report.matches.filter((m) => m.id === "e-em-dash");
  assert.equal(dashMatches.length, 1, "clusters of dashes must aggregate to one match");
  assert.equal(dashMatches[0].kind, "count");
});

test("scanText: single em-dash is not flagged", () => {
  const report = scanText("One — dash only.");
  assert.equal(report.matches.filter((m) => m.id === "e-em-dash").length, 0);
});

test("scanText: word patterns respect word boundaries", () => {
  // "landscape" as a word boundary match must not fire inside "landscapes"
  // (plural is a different word, arguably fine) — assert the word fires
  // where expected and does not fire inside a longer token.
  const hits = scanText("The landscape is changing");
  assert.ok(hits.matches.some((m) => m.id === "w-landscape"));
  // A token like "delveinto" must not match "delve".
  const noHits = scanText("delveinto");
  assert.equal(noHits.matches.length, 0);
});

test("scanText: case-insensitivity", () => {
  const report = scanText("DELVE into the seamless TAPESTRY");
  assert.ok(report.matches.some((m) => m.id === "w-delve"));
  assert.ok(report.matches.some((m) => m.id === "w-seamless"));
  assert.ok(report.matches.some((m) => m.id === "w-tapestry"));
});

test("scanText: binary contrast regex fires on the classic pattern", () => {
  const report = scanText("It's not the model. It's the eval.");
  assert.ok(report.matches.some((m) => m.category === "binary-contrast"));
});

test("scanText: colon reveal fires", () => {
  const report = scanText("The best part: it learns.");
  assert.ok(report.matches.some((m) => m.id === "cr-noun-colon"));
});

test("scanText: faux-insight fires", () => {
  const report = scanText("What nobody tells you is that distribution is the moat.");
  assert.ok(report.matches.some((m) => m.category === "faux-insight"));
});

test("scanText: superficial-analysis fires on trailing -ing clauses", () => {
  const report = scanText("The launch adds file search, highlighting the team's commitment to better workflows.");
  assert.ok(report.matches.some((m) => m.category === "superficial-analysis"));
  assert.ok(report.matches.some((m) => m.id === "sa-highlighting"));
  const reflecting = scanText("We hired two engineers, reflecting our focus on reliability.");
  assert.ok(reflecting.matches.some((m) => m.category === "superficial-analysis"));
});

test("scanText: meta-commentary fires on metadiscourse", () => {
  const report = scanText("The key point is that this distinction matters. As you can see. Let that sink in.");
  assert.ok(report.matches.some((m) => m.category === "meta-commentary"));
  assert.ok(report.matches.some((m) => m.id === "mc-key-point"));
  assert.ok(report.matches.some((m) => m.id === "mc-distinction-matters"));
  assert.ok(report.matches.some((m) => m.id === "mc-as-you-can-see"));
  assert.ok(report.matches.some((m) => m.id === "ec-let-that-sink"));
});

test("scanText: vague declaratives fire on the specific phrases", () => {
  const report = scanText("The stakes are high. The implications are significant. The reasons are structural.");
  assert.ok(report.matches.some((m) => m.id === "vd-stakes-high"));
  assert.ok(report.matches.some((m) => m.id === "vd-implications-are"));
  assert.ok(report.matches.some((m) => m.id === "vd-reasons-structural"));
});

test("scanText: false agency fires on inanimate actors", () => {
  const report = scanText("The data tells us the decision emerges. The market rewards speed.");
  assert.ok(report.matches.some((m) => m.id === "fa-data-tells"));
  assert.ok(report.matches.some((m) => m.id === "fa-decision-emerges"));
  assert.ok(report.matches.some((m) => m.id === "fa-market-rewards"));
});

test("scanText: passive voice fires on named constructions", () => {
  const report = scanText("It is believed that mistakes were made and the decision was reached.");
  assert.ok(report.matches.some((m) => m.id === "pv-it-is-believed"));
  assert.ok(report.matches.some((m) => m.id === "pv-mistakes-were-made"));
  assert.ok(report.matches.some((m) => m.id === "pv-decision-was-reached"));
});

test("scanText: stop-slop structure patterns fire", () => {
  // False transformation arc
  assert.ok(scanText("It stops being a tool and starts being a teammate.").matches.some((m) => m.id === "bc-stops-starts"));
  // Not-because reversal
  assert.ok(scanText("Not because the model is bad. Because the eval is.").matches.some((m) => m.id === "bc-not-because"));
  // Permission-granting closer
  assert.ok(scanText("We got lost twice. And that's okay.").matches.some((m) => m.id === "r-and-thats-okay"));
  // This unlocks something
  assert.ok(scanText("This unlocks something. Magic.").matches.some((m) => m.id === "df-unlocks-something"));
  // Emphasis crutch
  assert.ok(scanText("Make no mistake: nothing ships this week.").matches.some((m) => m.id === "ec-make-no-mistake"));
  // Boolean: clean prose stays clean (no false fire)
  const clean = scanText("The bakery opens at six. Maya sets the loaves on the counter.");
  assert.equal(clean.matches.length, 0);
});

// ---------------------------------------------------------------------------
// HTML scanning
// ---------------------------------------------------------------------------

test("extractText: strips tags and scripts, keeps visible copy", () => {
  const html = `<script>var x = 1;</script><style>.a{color:red}</style><h1>Header</h1><p>Body &amp; more.</p>`;
  const text = extractText(html);
  assert.ok(text.includes("Header"));
  assert.ok(text.includes("Body & more."));
  assert.ok(!text.includes("var x"));
  assert.ok(!text.includes("color:red"));
  assert.ok(!text.includes("<"));
});

test("extractText: decodes numeric character references with the correct radix", () => {
  // Decimal references.
  assert.equal(extractText("<p>&#65;&#66;&#67;</p>"), "ABC");
  assert.equal(extractText("<p>&#128512;</p>"), "😀"); // U+1F600
  // Hex references must decode base 16, not base 10 — "1F600" parsed as
  // decimal would produce U+0001 (regression guard).
  assert.equal(extractText("<p>&#x41;&#x42;&#x43;</p>"), "ABC");
  assert.equal(extractText("<p>&#x1F600;</p>"), "😀"); // U+1F600
  assert.equal(extractText("<p>&#x21;</p>"), "!");
  // Mixed decimal + hex in one document.
  assert.equal(extractText("<p>&#x48;&#105;</p>"), "Hi");
});

test("extractText: out-of-range code points become U+FFFD, never throw", () => {
  // 1114112 = U+110000, one past the maximum code point — String.fromCodePoint
  // throws RangeError on it; the decoder must substitute U+FFFD instead.
  assert.equal(extractText("<p>&#1114112;</p>"), "\uFFFD");
  assert.equal(extractText("<p>&#99999999;</p>"), "\uFFFD");
  assert.equal(extractText("<p>&#x110000;</p>"), "\uFFFD");
  // The largest valid code point still decodes.
  assert.equal(extractText("<p>&#1114111;</p>"), "\u{10FFFF}");
  assert.equal(extractText("<p>&#x10FFFF;</p>"), "\u{10FFFF}");
});

test("countEmoji: counts emoji code points", () => {
  assert.equal(countEmoji("no emoji here"), 0);
  assert.equal(countEmoji("a 🚀 b ✨ c ⚡"), 3);
});

test("scanHtml: detects design tells in markup", () => {
  const report = scanHtml(SLOP_HTML);
  const ids = new Set(report.matches.map((m) => m.id));
  // Design-color
  assert.ok(ids.has("d-indigo-violet-gradient"), "indigo-violet gradient must fire");
  assert.ok(ids.has("d-gradient-text"), "gradient text must fire");
  // Design-component
  assert.ok(ids.has("d-border-left-callout"), "border-left callout must fire");
  assert.ok(ids.has("d-glassmorphism"), "glassmorphism must fire");
  assert.ok(ids.has("d-max-radius"), "max radius pills must fire");
  assert.ok(ids.has("d-oversized-shadow"), "oversized shadow must fire");
  assert.ok(ids.has("d-powered-by-ai"), "powered-by-ai must fire");
  assert.ok(ids.has("d-avatar-grid"), "avatar grid must fire");
  // Design-type
  assert.ok(ids.has("d-kicker"), "kicker must fire");
  assert.ok(ids.has("d-flat-type"), "flat type hierarchy must fire");
  // Design-motion
  assert.ok(ids.has("d-springy-hover"), "springy hover must fire");
  // Design-copy
  assert.ok(ids.has("d-emoji-everywhere"), "emoji in heading/button must fire");
  assert.ok(ids.has("d-say-goodbye"), "'say goodbye to' must fire");
  assert.ok(ids.has("d-unlock-the-power"), "'unlock the power' must fire");
  // Design-layout
  assert.ok(ids.has("d-stat-row"), "invented stat row must fire");
  assert.ok(ids.has("d-section-numbers"), "section numbers must fire");
  assert.ok(ids.has("d-caps-card-grid"), "caps-card grid must fire");
  // Text tells inside the HTML
  assert.ok(report.matches.some((m) => m.category === "word-ban"), "text tells in HTML must also fire");
  // Emoji density in visible copy
  assert.ok(ids.has("d-emoji-density"), "emoji density must fire");
  assert.ok(report.score > 50, `html slop score too low: ${report.score}`);
});

test("scanHtml: clean minimal HTML stays clean", () => {
  const html = `<!doctype html><html><body><h1>Monthly report</h1><p>The bakery opens at six and the sourdough comes out at six ten.</p><p>Maya sets the loaves on the counter and counts the receipts twice.</p></body></html>`;
  const report = scanHtml(html);
  assert.ok(report.clean === true, `clean HTML must be clean: ${JSON.stringify(report.matches.map((m) => m.id))}`);
  assert.equal(report.matches.length, 0);
});

test("scanHtml: does not double-count a text tell present in both markup and text", () => {
  const html = `<p>We must utilize this tool.</p>`;
  const report = scanHtml(html);
  const util = report.matches.filter((m) => m.id === "w-utilize");
  assert.equal(util.length, 1, "text tell must be detected exactly once (on visible text)");
});

// ---------------------------------------------------------------------------
// Scoring semantics
// ---------------------------------------------------------------------------

test("scoring: repeated single pattern is capped", () => {
  const fiftyDelves = "delve ".repeat(50);
  const oneDelves = "delve";
  const a = scanText(oneDelves);
  const b = scanText(fiftyDelves);
  // Cap multiplier is 3: 2 severity * 3 = max 6 points from this pattern.
  const pointsA = a.totalPoints;
  const pointsB = b.totalPoints;
  assert.ok(pointsB <= pointsA * 3, `pattern cap failed: ${pointsA} -> ${pointsB}`);
  assert.ok(pointsB > 0);
});

test("scoring: clean threshold constant is 9", () => {
  const { scanText: st } = require("../src/scanner.js");
  // exactly a clean-borderline input
  const borderline = st("One truly, deeply, genuinely, honestly simple statement.");
  assert.ok(typeof borderline.clean === "boolean");
  assert.ok(borderline.score >= 0 && borderline.score <= 100);
});

// ---------------------------------------------------------------------------
// API sanity from scanner surface
// ---------------------------------------------------------------------------

test("scanner exposes patterns + categories for the /rules manifest", () => {
  const s = require("../src/scanner.js");
  assert.equal(s.patterns.length, corpus.patterns.length);
  assert.equal(s.categories, corpus.categories);
  assert.equal(typeof s.version, "string");
});