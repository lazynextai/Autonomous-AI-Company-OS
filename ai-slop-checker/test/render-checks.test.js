"use strict";
/**
 * Rendered-tier checks tests: every check fires on a hand-crafted snapshot
 * and stays quiet on a clean one, with deterministic output. No browser —
 * the snapshot contract IS the input (see src/render-checks.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { scanRender, RENDER_CHECKS } = require("../src/render-checks.js");

// Minimal visible element helper (all required style keys default to
// "visible and on a white page").
function el(over = {}) {
  const { index, ...rest } = over;
  return {
    tag: "div",
    role: null,
    text: "",
    classes: [],
    style: {
      fontSizePx: 16,
      fontWeight: 400,
      lineHeightPx: 24,
      color: "#111111",
      backgroundColor: "#ffffff",
      backgroundImage: null,
      backgroundClip: null,
      position: "static",
      topPx: null,
      bottomPx: null,
      rect: { x: 0, y: 0, w: 400, h: 24, viewportY: 0 },
      animation: null,
      display: "block",
      visibility: "visible",
      opacity: 1,
      textTransform: null,
      letterSpacingEm: null,
      ...rest.style,
    },
    ...rest,
  };
}

const ids = (report) => report.matches.map((m) => m.id);
const has = (report, id) => ids(report).includes(id);
// Interleave "index" as the position: build a snapshot with the array index
// preserved in `_i` for assertions about match order determinism.
const SNAP = (elements, extra = {}) => ({
  viewport: { width: 1280, height: 800 },
  documentStyle: { backgroundColor: "#ffffff" },
  elements,
  ...extra,
});

// ---------------------------------------------------------------------------
// r-kicker-size
// ---------------------------------------------------------------------------

test("r-kicker-size: fires when a kicker reads as body size (flat type)", () => {
  const elements = [
    el({ tag: "section", role: "region", text: "Sec", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 300, viewportY: 0 } } }),
    el({ tag: "p", text: "Our kicker label", classes: ["kicker"], _i: 1, parents: [0], style: { fontSizePx: 22, rect: { x: 10, y: 10, w: 200, h: 26, viewportY: 10 } } }),
    el({ tag: "p", text: "Body paragraph text that is long enough to matter", _i: 2, parents: [0], style: { fontSizePx: 16, rect: { x: 10, y: 50, w: 300, h: 48, viewportY: 50 } } }),
    el({ tag: "h2", role: "heading", text: "Heading", _i: 3, parents: [0], style: { fontSizePx: 32, rect: { x: 10, y: 110, w: 200, h: 40, viewportY: 110 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const kicker = r.matches.filter((m) => m.id === "r-kicker-size");
  assert.ok(kicker.length >= 1, `expected kicker visibility: ${JSON.stringify(r.matches)}`);
  assert.equal(kicker[0].severity, 1, "flat-type kicker is warn-class");
  assert.match(kicker[0].fix, /0\.8x/, "fix mentions the size step");
});

test("r-kicker-size: fires severity 2 when a kicker shouts past 1.6x the body", () => {
  const elements = [
    el({ tag: "section", role: "region", text: "Sec", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 300, viewportY: 0 } } }),
    el({ tag: "span", text: "BIG KICKER", classes: ["eyebrow"], _i: 1, parents: [0], style: { fontWeight: 700, fontSizePx: 34, rect: { x: 10, y: 10, w: 200, h: 40, viewportY: 10 } } }),
    el({ tag: "p", text: "Body paragraph text that is long enough to matter", _i: 2, parents: [0], style: { fontSizePx: 16, rect: { x: 10, y: 60, w: 300, h: 48, viewportY: 60 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const kicker = r.matches.filter((m) => m.id === "r-kicker-size");
  assert.ok(kicker.some((m) => m.severity === 2), `expected a severity-2 match: ${JSON.stringify(r.matches)}`);
});

test("r-kicker-size: clean when the kicker is properly small", () => {
  const elements = [
    el({ tag: "section", role: "region", text: "Sec", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 300, viewportY: 0 } } }),
    el({ tag: "span", text: "Kicker", classes: ["eyebrow"], _i: 1, parents: [0], style: { fontSizePx: 12, rect: { x: 10, y: 10, w: 100, h: 16, viewportY: 10 } } }),
    el({ tag: "p", text: "Body paragraph text that is long enough to matter", _i: 2, parents: [0], style: { fontSizePx: 16, rect: { x: 10, y: 40, w: 300, h: 48, viewportY: 40 } } }),
    el({ tag: "h2", role: "heading", text: "Heading", _i: 3, parents: [0], style: { fontSizePx: 32, rect: { x: 10, y: 100, w: 200, h: 40, viewportY: 100 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-kicker-size"), `no kicker match expected: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-gradient-text
// ---------------------------------------------------------------------------

test("r-gradient-text: fires on background-clip gradient text", () => {
  const elements = [
    el({ tag: "h1", role: "heading", text: "Amazing gradient headline", _i: 0, style: { backgroundImage: "linear-gradient(135deg, rgb(99, 102, 241), rgb(168, 85, 247))", backgroundClip: "text", color: "transparent", fontSizePx: 44, rect: { x: 0, y: 0, w: 600, h: 50, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const m = r.matches.filter((x) => x.id === "r-gradient-text");
  assert.equal(m.length, 1);
  assert.equal(m[0].severity, 2);
  assert.match(m[0].fix, /solid color/);
});

test("r-gradient-text: fires on literal common blue/violet stop pairs without clip", () => {
  const elements = [
    el({ tag: "span", text: "Blue violet text", _i: 0, style: { backgroundImage: "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)", rect: { x: 0, y: 0, w: 200, h: 20, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(has(r, "r-gradient-text"), `expected gradient text: ${ids(r)}`);
});

test("r-gradient-text: clean on a solid-color headline", () => {
  const elements = [
    el({ tag: "h1", role: "heading", text: "Plain headline", _i: 0, style: { color: "#0f172a", fontSizePx: 44, rect: { x: 0, y: 0, w: 600, h: 50, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-gradient-text"), `no gradient match expected: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-tracked-caps
// ---------------------------------------------------------------------------

test("r-tracked-caps: fires with no tracking (<0.02em) and with absurd tracking (>0.35em)", () => {
  const elements = [
    el({ tag: "p", text: "FULL SPEED", _i: 0, style: { fontSizePx: 14, textTransform: "uppercase", letterSpacingEm: 0.01, rect: { x: 0, y: 0, w: 160, h: 20, viewportY: 0 } } }),
    el({ tag: "p", text: "OVERDONE", _i: 1, style: { fontSizePx: 14, textTransform: "uppercase", letterSpacingEm: 0.4, rect: { x: 0, y: 40, w: 160, h: 20, viewportY: 40 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const caps = r.matches.filter((m) => m.id === "r-tracked-caps");
  assert.equal(caps.length, 2, `both sizes fire: ${JSON.stringify(caps.map((m) => m.snippet))}`);
  assert.ok(caps.every((m) => m.severity === 2));
});

test("r-tracked-caps: clean with deliberate 0.05em tracking and on uppercase headings (not caption-size)", () => {
  const elements = [
    el({ tag: "p", text: "JUST RIGHT", _i: 0, style: { fontSizePx: 14, textTransform: "uppercase", letterSpacingEm: 0.05, rect: { x: 0, y: 0, w: 160, h: 20, viewportY: 0 } } }),
    el({ tag: "h2", role: "heading", text: "BIG HEADING", _i: 1, style: { fontSizePx: 24, textTransform: "uppercase", letterSpacingEm: 0.4, rect: { x: 0, y: 40, w: 300, h: 34, viewportY: 40 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-tracked-caps"), `no tracked-caps expected: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-glued-arrow
// ---------------------------------------------------------------------------

test("r-glued-arrow: fires on →, › and ; entities glued to the last word", () => {
  const elements = [
    el({ tag: "a", text: "Learn more\u2192", _i: 0, style: { rect: { x: 0, y: 0, w: 120, h: 20, viewportY: 0 } } }),
    el({ tag: "a", text: "Read the docs\u203A", _i: 1, style: { rect: { x: 0, y: 30, w: 140, h: 20, viewportY: 30 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const arrows = r.matches.filter((m) => m.id === "r-glued-arrow");
  assert.equal(arrows.length, 2, `both glued arrows: ${JSON.stringify(arrows.map((m) => m.snippet))}`);
});

test("r-glued-arrow: clean on a spaced arrow or no arrow", () => {
  const elements = [
    el({ tag: "a", text: "Learn more \u2192", _i: 0, style: { rect: { x: 0, y: 0, w: 120, h: 20, viewportY: 0 } } }),
    el({ tag: "a", text: "Read the docs", _i: 1, style: { rect: { x: 0, y: 30, w: 140, h: 20, viewportY: 30 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-glued-arrow"));
});

// ---------------------------------------------------------------------------
// r-marquee
// ---------------------------------------------------------------------------

test("r-marquee: fires on a marquee animation and on a literal <marquee>", () => {
  const elements = [
    el({ tag: "div", text: "Breaking news", _i: 0, style: { animation: "marquee 20s linear infinite", rect: { x: 0, y: 0, w: 500, h: 40, viewportY: 0 } } }),
    el({ tag: "marquee", role: "marquee", text: "Ticker", _i: 1, style: { rect: { x: 0, y: 50, w: 400, h: 30, viewportY: 50 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.equal(r.matches.filter((m) => m.id === "r-marquee").length, 2);
});

test("r-marquee: clean on a regular animation and static text", () => {
  const elements = [
    el({ tag: "div", text: "Gently fades", _i: 0, style: { animation: "fadeIn 300ms ease-out", rect: { x: 0, y: 0, w: 500, h: 40, viewportY: 0 } } }),
    el({ tag: "p", text: "Static paragraph", _i: 1, style: { rect: { x: 0, y: 50, w: 400, h: 20, viewportY: 50 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-marquee"));
});

// ---------------------------------------------------------------------------
// r-hidden-reveal
// ---------------------------------------------------------------------------

test("r-hidden-reveal: fires on hover-reveal classes (group-hover:block)", () => {
  const elements = [
    el({ tag: "div", text: "revealed only on hover of the card", classes: ["group-hover:block"], _i: 0, style: { display: "none", rect: { x: 0, y: 0, w: 300, h: 24, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(has(r, "r-hidden-reveal"), `expected hidden-reveal: ${ids(r)}`);
});

test("r-hidden-reveal: fires on aria-hidden text duplicated in the visible DOM", () => {
  const elements = [
    el({ tag: "span", text: "The same sentence repeated for decoration purposes right here", ariaHidden: true, _i: 0, style: { rect: { x: 0, y: 0, w: 400, h: 20, viewportY: 0 } } }),
    el({ tag: "span", text: "The same sentence repeated for decoration purposes right here", _i: 1, style: { rect: { x: 0, y: 30, w: 400, h: 20, viewportY: 30 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const m = r.matches.filter((x) => x.id === "r-hidden-reveal");
  assert.ok(m.length >= 1, `expected duplication flag: ${ids(r)}`);
  assert.match(m[0].detail, /aria-hidden/);
});

test("r-hidden-reveal: clean on visible content and aria-hidden without a visible twin", () => {
  const elements = [
    el({ tag: "div", text: "visible text that matters", _i: 0, style: { rect: { x: 0, y: 0, w: 300, h: 24, viewportY: 0 } } }),
    el({ tag: "span", text: "aria-hidden standalone", ariaHidden: true, _i: 1, style: { rect: { x: 0, y: 40, w: 200, h: 18, viewportY: 40 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-hidden-reveal"), `expected no hidden-reveal: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-fold-budget
// ---------------------------------------------------------------------------

test("r-fold-budget: fires when 3+ distinct section headers sit above the 1280x800 fold", () => {
  const elements = [];
  for (let s = 0; s < 4; s++) {
    elements.push(
      el({ tag: "section", role: "region", text: `S${s}`, _i: elements.length, style: { fontSizePx: 16, rect: { x: 0, y: s * 200, w: 1280, h: 200, viewportY: s * 200 } } })
    );
    elements.push(
      el({ tag: "h2", role: "heading", text: `Section ${s} heading`, _i: elements.length, parents: [s * 2], style: { fontSizePx: 24, rect: { x: 20, y: s * 200 + 20, w: 300, h: 30, viewportY: s * 200 + 20 } } })
    );
  }
  const r = scanRender(SNAP(elements));
  const fold = r.matches.filter((m) => m.id === "r-fold-budget");
  assert.ok(fold.some((m) => m.severity === 2), `budget breach expected: ${JSON.stringify(r.matches)}`);
});

test("r-fold-budget: fires severity 1 when a header straddles within 40px of the fold", () => {
  const elements = [
    el({ tag: "section", role: "region", text: "S", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 900, viewportY: 0 } } }),
    el({ tag: "h2", role: "heading", text: "Header on the edge", _i: 1, parents: [0], style: { fontSizePx: 24, rect: { x: 20, y: 780, w: 300, h: 30, viewportY: 780 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const fold = r.matches.filter((m) => m.id === "r-fold-budget");
  assert.ok(fold.some((m) => m.severity === 1 && /40px/.test(m.detail)), `edge straddle expected: ${JSON.stringify(r.matches)}`);
});

test("r-fold-budget: clean with two distinct headers above the fold", () => {
  const elements = [
    el({ tag: "section", role: "region", text: "S0", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 200, viewportY: 0 } } }),
    el({ tag: "h2", role: "heading", text: "Hero heading", _i: 1, parents: [0], style: { fontSizePx: 28, rect: { x: 20, y: 20, w: 300, h: 34, viewportY: 20 } } }),
    el({ tag: "section", role: "region", text: "S1", _i: 2, style: { rect: { x: 0, y: 200, w: 1280, h: 200, viewportY: 200 } } }),
    el({ tag: "h2", role: "heading", text: "Second section", _i: 3, parents: [2], style: { fontSizePx: 28, rect: { x: 20, y: 220, w: 300, h: 34, viewportY: 220 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-fold-budget"), `no fold breach expected: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-screen-budget
// ---------------------------------------------------------------------------

test("r-screen-budget: fires above ~80 words on a screen, clean below", () => {
  const words90 = Array.from({ length: 90 }, (_, i) => "word" + i).join(" ");
  const r90 = scanRender(SNAP([
    el({ tag: "div", text: words90, _i: 0, style: { rect: { x: 0, y: 0, w: 1200, h: 700, viewportY: 0 } } }),
  ]));
  assert.ok(has(r90, "r-screen-budget"), `90 words must breach: ${ids(r90)}`);

  const words40 = Array.from({ length: 40 }, (_, i) => "w" + i).join(" ");
  const r40 = scanRender(SNAP([
    el({ tag: "div", text: words40, _i: 0, style: { rect: { x: 0, y: 0, w: 1200, h: 700, viewportY: 0 } } }),
  ]));
  assert.ok(!has(r40, "r-screen-budget"), `40 words must stay clean: ${ids(r40)}`);
});

// ---------------------------------------------------------------------------
// r-section-rhythm
// ---------------------------------------------------------------------------

test("r-section-rhythm: fires on 6+ sibling cards with identical heights and gaps", () => {
  const parent = el({ tag: "div", text: "", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 800, viewportY: 0 } } });
  const cards = [];
  for (let i = 0; i < 6; i++) {
    cards.push(
      el({ tag: "article", role: "listitem", text: `Card ${i}`, classes: ["card"], _i: i + 1, parents: [0], style: { fontSizePx: 16, rect: { x: 50, y: i * 120 + 20, w: 300, h: 100, viewportY: i * 120 + 20 } } })
    );
  }
  const r = scanRender(SNAP([parent, ...cards]));
  const m = r.matches.filter((x) => x.id === "r-section-rhythm");
  assert.ok(m.length >= 1, `uniform grid expected: ${ids(r)}`);
  assert.match(m[0].detail, /identical/);
});

test("r-section-rhythm: clean on varied cards", () => {
  const parent = el({ tag: "div", text: "", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 800, viewportY: 0 } } });
  const cards = [];
  for (let i = 0; i < 6; i++) {
    cards.push(
      el({ tag: "article", role: "listitem", text: `Card ${i}`, classes: ["card"], _i: i + 1, parents: [0], style: { fontSizePx: 16, rect: { x: 50, y: i * 120 + 20, w: 300, h: 100 + (i % 2) * 40, viewportY: i * 120 + 20 } } })
    );
  }
  const r = scanRender(SNAP([parent, ...cards]));
  assert.ok(!has(r, "r-section-rhythm"), `varied cards must stay clean: ${ids(r)}`);
});

test("r-section-rhythm: clean with fewer than 6 cards", () => {
  const parent = el({ tag: "div", text: "", _i: 0, style: { rect: { x: 0, y: 0, w: 1280, h: 800, viewportY: 0 } } });
  const cards = [];
  for (let i = 0; i < 4; i++) {
    cards.push(
      el({ tag: "article", role: "listitem", text: `Card ${i}`, classes: ["card"], _i: i + 1, parents: [0], style: { fontSizePx: 16, rect: { x: 50, y: i * 120 + 20, w: 300, h: 100, viewportY: i * 120 + 20 } } })
    );
  }
  const r = scanRender(SNAP([parent, ...cards]));
  assert.ok(!has(r, "r-section-rhythm"));
});

// ---------------------------------------------------------------------------
// r-fake-progress
// ---------------------------------------------------------------------------

test("r-fake-progress: fires on a progressbar with no aria-valuenow and no animation", () => {
  const elements = [
    el({ tag: "div", role: "progressbar", text: "80%", _i: 0, style: { rect: { x: 0, y: 0, w: 200, h: 12, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(has(r, "r-fake-progress"), `expected fake progress: ${ids(r)}`);
});

test("r-fake-progress: fires on a static percent-age marker with no semantics", () => {
  const elements = [
    el({ tag: "div", text: "87%", classes: ["progress-percent"], _i: 0, style: { fontSizePx: 18, rect: { x: 0, y: 0, w: 80, h: 24, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(has(r, "r-fake-progress"), `expected fake percent: ${ids(r)}`);
});

test("r-fake-progress: clean on a live progressbar with aria-valuenow", () => {
  const elements = [
    el({ tag: "progress", role: "progressbar", text: "80%", ariaValuenow: "80", _i: 0, style: { rect: { x: 0, y: 0, w: 200, h: 12, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-fake-progress"), `live progress must stay clean: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// r-contrast
// ---------------------------------------------------------------------------

test("r-contrast: fires on normal text under 4.5:1 and large bold under 3:1", () => {
  const elements = [
    el({ tag: "p", text: "Dim gray text that is too close to the background for comfort", _i: 0, style: { fontSizePx: 16, fontWeight: 400, color: "#888888", backgroundColor: "#ffffff", rect: { x: 0, y: 0, w: 600, h: 24, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const m = r.matches.filter((x) => x.id === "r-contrast");
  assert.equal(m.length, 1);
  assert.equal(m[0].severity, 3, "contrast is the a11y floor — severity 3");
  assert.match(m[0].detail, /4\.5:1/);
});

test("r-contrast: fires when large text sits under the 3:1 large threshold", () => {
  // 24px bold #8a8a8a on #fff ≈ 3.5:1 — under the 3:1 large threshold? No:
  // 3.5 > 3 so this is a *clean* case. Use a darker gray to be *under* 3:1.
  const elements = [
    el({ tag: "h3", role: "heading", text: "Medium gray heading", _i: 0, style: { fontSizePx: 28, fontWeight: 700, color: "#8a8a8a", backgroundColor: "#ffffff", rect: { x: 0, y: 0, w: 400, h: 36, viewportY: 0 } } }),
    el({ tag: "h3", role: "heading", text: "Gray-silver heading", _i: 1, style: { fontSizePx: 28, fontWeight: 700, color: "#9c9c9c", backgroundColor: "#ffffff", rect: { x: 0, y: 60, w: 400, h: 36, viewportY: 60 } } }),
  ];
  const r = scanRender(SNAP(elements));
  const m = r.matches.filter((x) => x.id === "r-contrast");
  // #8a8a8a ≈ 3.5:1 (clean for large); #9c9c9c ≈ ~2.8:1 (fire)
  assert.equal(m.length, 1, `expected exactly the #9c9c9c heading: ${JSON.stringify(r.matches.map((x) => x.id + ":" + x.snippet))}`);
  assert.match(m[0].snippet, /Gray-silver/);
  assert.match(m[0].detail, /large text/);
});

test("r-contrast: clean on black-on-white", () => {
  const elements = [
    el({ tag: "p", text: "Black on white is fine", _i: 0, style: { fontSizePx: 16, fontWeight: 400, color: "#000000", backgroundColor: "#ffffff", rect: { x: 0, y: 0, w: 400, h: 24, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-contrast"));
});

test("r-contrast: resolves the nearest non-transparent ancestor background", () => {
  const elements = [
    el({ tag: "div", text: "", _i: 0, style: { backgroundColor: "#000000", rect: { x: 0, y: 0, w: 1280, h: 800, viewportY: 0 } } }),
    el({ tag: "p", text: "White on black resolves through the parent", _i: 1, parents: [0], style: { color: "#ffffff", backgroundColor: null, rect: { x: 10, y: 10, w: 400, h: 24, viewportY: 10 } } }),
  ];
  const r = scanRender(SNAP(elements));
  assert.ok(!has(r, "r-contrast"), `white on black must be clean: ${ids(r)}`);
});

// ---------------------------------------------------------------------------
// Determinism + report shape
// ---------------------------------------------------------------------------

test("scanRender: deterministic output for the same snapshot", () => {
  const elements = [
    el({ tag: "h1", role: "heading", text: "Gradient hero \u2192", _i: 0, style: { backgroundImage: "linear-gradient(135deg,#6366f1,#a855f7)", backgroundClip: "text", color: "transparent", fontSizePx: 40, rect: { x: 0, y: 0, w: 600, h: 50, viewportY: 0 } } }),
    el({ tag: "p", text: "Body copy that is clean and reasonably long", _i: 1, style: { fontSizePx: 16, rect: { x: 0, y: 60, w: 400, h: 24, viewportY: 60 } } }),
  ];
  const a = scanRender(SNAP(elements));
  const b = scanRender(SNAP(elements));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(a.score, b.score);
  assert.equal(a.matches.length, b.matches.length);
});

test("scanRender: matches are sorted by index then id", () => {
  const elements = [
    el({ tag: "h1", role: "heading", text: "Hero\u2192", _i: 0, style: { fontSizePx: 40, rect: { x: 0, y: 0, w: 600, h: 50, viewportY: 0 } } }),
  ];
  const r = scanRender(SNAP(elements));
  for (let i = 1; i < r.matches.length; i++) {
    const prev = r.matches[i - 1];
    const cur = r.matches[i];
    assert.ok(prev.index <= cur.index, "index order preserved");
  }
});

test("scanRender: report shape mirrors the base scanner", () => {
  const r = scanRender(SNAP([
    el({ tag: "p", text: "Learn more\u2192", _i: 0, style: { rect: { x: 0, y: 0, w: 120, h: 20, viewportY: 0 } } }),
  ]));
  assert.equal(r.engine, "lazynext-ai-slop-checker-render");
  assert.equal(typeof r.score, "number");
  assert.equal(typeof r.clean, "boolean");
  assert.ok(Array.isArray(r.matches));
  assert.ok(Array.isArray(r.categories));
  assert.ok(Array.isArray(r.checks));
  assert.ok(r.checks.some((c) => c.id === "r-contrast"), "manifest lists every check");
  assert.equal(r.checks.length, RENDER_CHECKS.length);
});

test("scanRender: validates its input", () => {
  assert.throws(() => scanRender(null), /snapshot/i);
  assert.throws(() => scanRender({}), /elements/i);
  assert.throws(() => scanRender({ viewport: {}, elements: "nope" }), /elements/);
});

// ---------------------------------------------------------------------------
// Optional playwright path — opt-in only, skipped when absent
// ---------------------------------------------------------------------------

test("render collector: absent playwright produces the documented opt-in path, no engine load", async () => {
  // The collector is lazily loaded and must NOT be part of the engine
  // requires. Check the module reports absence cleanly.
  const collector = require("../src/collect-render.js");
  assert.equal(typeof collector.collectRender, "function");
  assert.match(collector.OPT_IN_MSG, /playwright/);
  assert.match(collector.OPT_IN_MSG, /npm i -D playwright/);
  // isCollectorAvailable must be a boolean (true only when playwright is
  // actually installed).
  const avail = collector.isCollectorAvailable();
  assert.equal(typeof avail, "boolean");
  // Invoking the collector without playwright must reject with the opt-in
  // error, never a module-load error.
  if (!avail) {
    await assert.rejects(() => collector.collectRender("https://example.com"), /playwright/);
  } else {
    // playwright present: exercising a live browser is a deliberate opt-in;
    // this test only asserts the API is callable, not that a browser exists.
    assert.equal(typeof collector.collectRender, "function");
  }
});