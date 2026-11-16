"use strict";
/**
 * Fuzz-robustness battery: hostile inputs must never throw, must be
 * deterministic, must produce a valid report shape, and must stay bounded
 * in time (<1s per call). Runs the same inputs through every entry point:
 * scanText / scanHtml / scanDesign / scanProject (temp hostile fixture dir)
 * / rewriteText / scanRender (hostile snapshots).
 *
 * These are REGRESSION guards, not weak smoke tests: a throw, a shape
 * violation, a determinism drift, or a >1s call FAILS the suite. Fix the
 * engine, never loosen an assertion here.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { scanText, scanHtml, scanDesign } = require("../src/scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { scanProject } = require("../src/project-scanner.js");
const { scanRender } = require("../src/render-checks.js");

const TIME_BUDGET_MS = 1000;

// ---------------------------------------------------------------------------
// Hostile inputs
// ---------------------------------------------------------------------------

const REPEATED_1MB = "In today's fast-paced world, we must leverage our robust cutting-edge solution to unlock seamless growth.\n".repeat(14000);

const CASES = {
  "empty": "",
  "whitespace-only": " \t\n\r\v\f \t\n",
  "1MB-repeated": REPEATED_1MB,
  "binary-bytes": Buffer.from(Array.from({ length: 256 }, (_, i) => i)).toString("latin1") + "\n" + REPEATED_1MB.slice(0, 2048),
  "lone-surrogates": "a\uD800b\uDFFFc\uD800\uDFFF\uDC00\uDBFF",
  "astral-emoji": "\u{1F680}\u{1F389}\u{1F525}\u{1F4AF} " + "A".repeat(500),
  "rtl-hebrew-arabic": "טקסט בעברית בדיקה של, نصوص عربية للاختبار — وقت طويل جدا",
  "nul-bytes": "hello\u0000world\u0000\u0000\u0000end",
  "deep-html-1000": "<div class=x>".repeat(1000) + "x" + "</div>".repeat(1000),
  "malformed-html": '<div class=unquoted attr=1><p>hi<p><span>unclosed<b>misnested<garbage><br><input type=text value="hi>',
  "json-as-text": JSON.stringify({ a: [1, 2, 3], b: { c: "delve", d: "in today's world" }, nested: { deep: { level: [{ x: "tapestry" }] } } }, null, 2),
  "js-as-text": "function foo(x){ const obj = {a:1, b: 'tapestry', c: \"it's important to note\"}; return obj.a + x; } // delve",
  "punct-run": "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!?????????????????????????????.............----;;;;;;",
  "single-char": "x",
  "100k-word": "z".repeat(100000),
  "mixed-script-soup": "𝓗𝐞𝕝𝕝𝕠 грαβ ворд 日本語テスト العربية עברית delвe тапestry क्रांतिकारी 🧪♻️☣️In today's world.",
  "entity-storm": "<p>" + "&#x1F600;&#65;&#1114112;".repeat(30000) + "</p>",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shapeOk(r, kind) {
  if (typeof r.score !== "number" || r.score < 0 || r.score > 100) return `score out of range: ${r.score}`;
  if (typeof r.verdict !== "string") return "verdict not a string";
  if (!Array.isArray(r.matches)) return "matches not an array";
  for (const m of r.matches) {
    if (typeof m.id !== "string") return "match.id not a string";
    if (![1, 2, 3].includes(m.severity)) return `match.severity invalid: ${m.severity}`;
    if (typeof m.index !== "number") return "match.index not a number";
    if (typeof m.snippet !== "string") return "match.snippet not a string";
  }
  if (!Array.isArray(r.categories)) return "categories not an array";
  for (const c of r.categories) {
    if (typeof c.id !== "string" || typeof c.name !== "string") return "category id/name missing";
  }
  if (r.clean !== (r.score <= 9)) return "clean flag disagrees with score";
  return null;
}

const snapshotShapeOk = shapeOk; // render reports share the same shape

function timeOne(fn, label) {
  const t0 = process.hrtime.bigint();
  const out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { out, ms };
}

/** Deterministic check: run twice, deep-equal the JSON. */
function deterministic(fn, label) {
  const a = JSON.stringify(fn());
  const b = JSON.stringify(fn());
  assert.equal(a, b, `${label}: same input must give byte-identical JSON output`);
}

// Either a hostile temp project fixture (created once) or null when
// project-scan calls are skipped (they need a real dir).
let projectDir = null;
const PROJECT_FILES = {
  "README.md": "# In today's fast-paced world, we must leverage this.\n",
  "app.js": "const x = { gradient: 'linear-gradient(135deg,#6366f1,#a855f7)' };\nconst y = 'hover:scale-105 transition-all';\n",
  "styles.css": ".hero{background:linear-gradient(135deg,#6366f1,#a855f7)} .card{border:1px solid #eee;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}",
  "index.html": '<div class="hero"><h1>Welcome</h1><button class="rounded-full rounded-full">Get started</button></div>',
  "config.json": '{"features":["tapestry","delve"],"reasons":["in today\'s world"]}',
  "notes/raw.txt": "\u0000binary\u0000stuff\u0000with\ttabs\ndelve ",
  "deep/a/b/c/d/e/f/g/h/i/draft.md": "what nobody tells you about synergy\n",
};

test.before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-fuzz-project-"));
  for (const [rel, content] of Object.entries(PROJECT_FILES)) {
    const abs = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
});

test.after(() => {
  if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
});

function projectReport() {
  return scanProject(projectDir, { topFiles: 5 });
}

function projectShapeOk(r) {
  if (typeof r.summary.score !== "number" || r.summary.score < 0 || r.summary.score > 100) return "summary.score out of range";
  if (typeof r.summary.verdict !== "string") return "summary.verdict missing";
  if (!Array.isArray(r.files)) return "files not an array";
  if (!Array.isArray(r.categories)) return "categories not an array";
  for (const f of r.files) {
    if (f.report && typeof f.report.score !== "number") return "file report score missing";
  }
  return null;
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

for (const [name, input] of Object.entries(CASES)) {
  test(`fuzz text: ${name}`, () => {
    const scan = () => scanText(input);
    const { out: r, ms } = timeOne(scan, name);
    assert.ok(ms < TIME_BUDGET_MS, `${name}: scanText took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
    const bad = shapeOk(r, "text");
    assert.equal(bad, null, `${name}: ${bad}`);
    deterministic(scan, `${name} text`);
  });

  test(`fuzz html: ${name}`, () => {
    const scan = () => scanHtml(input);
    const { out: r, ms } = timeOne(scan, name);
    assert.ok(ms < TIME_BUDGET_MS, `${name}: scanHtml took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
    const bad = shapeOk(r, "html");
    assert.equal(bad, null, `${name}: ${bad}`);
    deterministic(scan, `${name} html`);
  });

  test(`fuzz design: ${name}`, () => {
    const scan = () => scanDesign(input);
    const { out: r, ms } = timeOne(scan, name);
    assert.ok(ms < TIME_BUDGET_MS, `${name}: scanDesign took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
    const bad = shapeOk(r, "design");
    assert.equal(bad, null, `${name}: ${bad}`);
    deterministic(scan, `${name} design`);
  });

  test(`fuzz rewrite: ${name}`, () => {
    const rw = () => rewriteText(input);
    const { out: r, ms } = timeOne(rw, name);
    assert.ok(ms < TIME_BUDGET_MS, `${name}: rewriteText took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
    assert.equal(typeof r.changed, "boolean", `${name}: changed flag`);
    assert.equal(typeof r.text, "string", `${name}: output text`);
    assert.ok(Array.isArray(r.changes), `${name}: changes array`);
    deterministic(rw, `${name} rewrite`);
  });
}

test("fuzz project-scan: hostile fixture is scanned without throwing, in budget, deterministically", () => {
  const { out: r, ms } = timeOne(projectReport, "project");
  assert.ok(ms < TIME_BUDGET_MS, `scanProject took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
  const bad = projectShapeOk(r);
  assert.equal(bad, null, `project: ${bad}`);
  deterministic(projectReport, "project");
});

// ---------------------------------------------------------------------------
// Hostile snapshots for the rendered tier
// ---------------------------------------------------------------------------

const SNAPSHOT_CASES = {
  "null-elements-entry": { elements: [null, undefined, 42, "hi", { tag: "p" }] },
  "string-styles": { elements: [{ tag: "p", text: "Learn more\u2192" + "word ".repeat(90), style: { fontSizePx: "16", rect: { x: "0", y: "0", w: "400", h: "24", viewportY: "0" } } }] },
  "object-bg": { elements: [{ tag: "h1", text: "gradient", style: { backgroundImage: { url: "x" }, backgroundClip: [1, 2], fontSizePx: 40, rect: { x: 0, y: 0, w: 400, h: 50, viewportY: 0 } } }] },
  "bad-parents": { elements: [{ tag: "p", text: "x", style: { fontSizePx: 16 }, parents: ["a", 999999, -3, null, 0], depth: NaN }] },
  "non-finite": { elements: [{ tag: "p", text: "y", style: { fontSizePx: Infinity, lineHeightPx: -Infinity, opacity: NaN, rect: { x: NaN, y: 0, w: -5, h: Infinity, viewportY: 0 } } }] },
  "oob-screens": { elements: [], screens: [[999999, 2, "x"]] },
  "weird-viewport": { viewport: { width: "1280", height: [] }, documentStyle: { backgroundColor: 42 }, elements: [] },
  "huge-elements": { elements: Array.from({ length: 6000 }, (_, i) => ({ tag: i % 2 ? "p" : "h1", text: `text ${i} word `.repeat(5), style: { fontSizePx: i % 3 + 14, rect: { x: i, y: i, w: 100, h: 20, viewportY: i } }, parents: i ? [i - 1] : [] })) },
  "string-screens-with-valid": { elements: [{ tag: "h1", text: "word ".repeat(100), style: { fontSizePx: 32, rect: { x: 0, y: 0, w: 800, h: 40, viewportY: 10 } } }], screens: [["0", 0, -1, 999999]] },
};

for (const [name, snapshot] of Object.entries(SNAPSHOT_CASES)) {
  test(`fuzz render-snapshot: ${name}`, () => {
    const run = () => scanRender(snapshot);
    const { out: r, ms } = timeOne(run, name);
    assert.ok(ms < TIME_BUDGET_MS, `${name}: scanRender took ${ms.toFixed(1)}ms (budget ${TIME_BUDGET_MS}ms)`);
    const bad = snapshotShapeOk(r, "render");
    assert.equal(bad, null, `${name}: ${bad}`);
    deterministic(run, `${name} snapshot`);
  });
}

test("fuzz render-snapshot: string-index screenshot group keeps valid indices under the sanitizer", () => {
  // Index 0 is valid (h1 with 100 words) — the sanitizer keeps it, drops
  // the string/negative/OOB entries, and the screen budget still fires.
  const elements = [{ tag: "h1", text: "word ".repeat(100), style: { fontSizePx: 32, rect: { x: 0, y: 0, w: 800, h: 40, viewportY: 10 } } }];
  const r = scanRender({ elements, screens: [["0", 0, -1, 999999]] });
  assert.ok(r.matches.some((m) => m.id === "r-screen-budget"), "over-budget screen fires through mixed screens");
});