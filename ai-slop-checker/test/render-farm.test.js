"use strict";
/**
 * Render-farm contract tests. No browser: the plan is applied to
 * hand-built snapshots. The live collector is scripts/render-farm.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { scanRender } = require("../src/render-checks.js");
const { FIXTURES, evaluateFixture } = require("../src/render-farm-plan.js");

const ROOT = path.join(__dirname, "..");

function el(over = {}) {
  return {
    tag: "p",
    role: null,
    text: "The oven runs from six until two.",
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
      rect: { x: 0, y: 40, w: 400, h: 24, viewportY: 40 },
      animation: null,
      display: "block",
      visibility: "visible",
      opacity: 1,
      textTransform: null,
      letterSpacingEm: null,
    },
    ...over,
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
      rect: { x: 0, y: 40, w: 400, h: 24, viewportY: 40 },
      animation: null,
      display: "block",
      visibility: "visible",
      opacity: 1,
      textTransform: null,
      letterSpacingEm: null,
      ...(over.style || {}),
    },
  };
}

const SNAP = (elements) => ({
  viewport: { width: 1280, height: 800 },
  documentStyle: { backgroundColor: "#ffffff" },
  elements,
});

test("render farm: fixture files exist for every plan row", () => {
  assert.equal(FIXTURES.length, 2);
  for (const fixture of FIXTURES) {
    const file = path.join(ROOT, "fixtures", "render-farm", fixture.file);
    assert.equal(fs.existsSync(file), true, fixture.file);
  }
});

test("render farm: a slop snapshot must include marquee and a glued arrow", () => {
  const report = scanRender(SNAP([
    el({ text: "Read the field notes→" }),
    el({ tag: "marquee", text: "Live ticker of things nobody asked to scroll", style: { rect: { x: 0, y: 80, w: 420, h: 24, viewportY: 80 } } }),
  ]));
  const slop = FIXTURES.find((f) => f.id === "slop");
  const result = evaluateFixture(report, slop);
  assert.deepEqual(result.missing, [], result.ids.join(","));
  assert.equal(result.ok, true);
});

test("render farm: a clean snapshot must not include the slop ids", () => {
  const report = scanRender(SNAP([
    el({ tag: "h1", role: "heading", text: "Field notes", style: { fontSizePx: 32, fontWeight: 700, rect: { x: 0, y: 0, w: 300, h: 40, viewportY: 0 } } }),
    el({ text: "The oven runs from six until two. Orders are written in the book by the door." }),
  ]));
  const clean = FIXTURES.find((f) => f.id === "clean");
  const result = evaluateFixture(report, clean);
  assert.deepEqual(result.unexpected, [], result.ids.join(","));
  assert.equal(result.ok, true);
});

test("render farm: the devops workflow is a proposal outside .github", () => {
  const proposal = path.join(ROOT, "ci", "render-farm.workflow.yml");
  const text = fs.readFileSync(proposal, "utf8");
  assert.match(text, /RENDER_FARM_REQUIRED=1/);
  assert.match(text, /scripts\/render-farm\.js/);
  assert.equal(fs.existsSync(path.join(ROOT, "..", ".github", "workflows", "render-farm.yml")), false);
});
