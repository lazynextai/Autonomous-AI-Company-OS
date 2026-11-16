"use strict";
/**
 * Bench + dogfood tests: the bench runner must stay runnable over the
 * product's own corpus set, the demo fixtures stay controls, and the
 * dogfood-fixed files (web/index.html, skill visual-tells) stay clean.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { main: benchMain, BENCH_TARGETS } = require("../bench/run.js");

test("bench: every declared target exists and the runner completes", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (s) => logs.push(String(s));
  let code;
  try {
    code = await benchMain([]);
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
  for (const rel of BENCH_TARGETS) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", rel)), `bench target missing: ${rel}`);
  }
  const text = logs.join("\n");
  assert.match(text, /file\s+kind\s+score\s+matches/);
  assert.match(text, /README\.md/);
  assert.match(text, /demo\/slop\.txt/);
});

test("bench --json emits machine-readable rows", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    await benchMain(["--json"]);
  } finally {
    console.log = origLog;
  }
  const rows = JSON.parse(logs.join("\n"));
  assert.ok(Array.isArray(rows));
  assert.ok(rows.some((r) => r.file === "demo/clean.txt" && r.score === 0));
  assert.ok(rows.some((r) => r.file === "demo/slop.txt" && r.score > 50));
});

test("dogfood: web/index.html and skill visual-tells are clean (fixed finds stay fixed)", () => {
  const { scanHtml, scanText } = require("../src/scanner.js");
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const index = scanHtml(html);
  assert.equal(index.matches.length, 0, `web/index.html must be clean: ${JSON.stringify(index.matches.map((m) => m.id))}`);

  const vt = fs.readFileSync(path.join(__dirname, "..", "skill", "references", "visual-tells.md"), "utf8");
  const visualTells = scanText(vt);
  assert.equal(visualTells.matches.length, 0, `visual-tells.md must be clean: ${JSON.stringify(visualTells.matches.map((m) => m.id))}`);
});

test("dogfood: demo fixtures remain intentionally sloppy/clean controls", () => {
  const { scanText } = require("../src/scanner.js");
  const slop = fs.readFileSync(path.join(__dirname, "..", "demo", "slop.txt"), "utf8");
  const clean = fs.readFileSync(path.join(__dirname, "..", "demo", "clean.txt"), "utf8");
  assert.ok(scanText(slop).score > 50, "demo/slop.txt control must stay sloppy");
  assert.equal(scanText(clean).matches.length, 0, "demo/clean.txt control must stay clean");
});