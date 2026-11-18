"use strict";
/**
 * Judge-browser tests (v1.4.3): the Review tab's in-browser judgement
 * engine (src/judge-browser.js) is the browser-safe twin of src/judge.js
 * and MUST NOT diverge from it.
 *
 *   - parse/load level — src/judge-browser.js parses as a classic script
 *     (new Function) and exposes window.SlopJudge via a minimal vm shim;
 *   - parity — judge-browser vs src/judge.js produce byte-identical JSON
 *     reports for the SAME input (demo/slop.txt → REVIEW, demo/clean.txt
 *     → PASS), run in Node through the CommonJS arm of the UMD;
 *   - behaviour — the honesty boundary is preserved in the browser twin:
 *     text input can never REFUSE, contrast/alignment always ship as
 *     human checkboxes, the verdict is deterministic;
 *   - wiring — web/app.js still parses (new Function) and the Review tab
 *     references (tab/pane/buttons/script src) exist in web/index.html.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const judgeBrowserSrc = fs.readFileSync(path.join(__dirname, "..", "src", "judge-browser.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");

const SLOP_SAMPLE = fs.readFileSync(path.join(__dirname, "..", "demo", "slop.txt"), "utf8");
const CLEAN_SAMPLE = fs.readFileSync(path.join(__dirname, "..", "demo", "clean.txt"), "utf8");

// The Node twins (the thing the CLI/API already ship).
const { judgeReport: nodeJudge } = require("../src/judge.js");
const browserModule = require("../src/judge-browser.js");

// ---------------------------------------------------------------------------
// Parse / load level
// ---------------------------------------------------------------------------

test("judge-browser: src/judge-browser.js parses as a classic script", () => {
  assert.doesNotThrow(() => new Function(judgeBrowserSrc), "judge-browser.js must parse in a Node-only context");
});

test("judge-browser: the UMD exposes the judge function via a window shim", () => {
  const sandbox = {
    console,
    window: {},
    document: undefined,
  };
  sandbox.globalThis = sandbox;
  // The browser arm needs the scanner + corpus globals the page loads
  // before this script; the factory only touches them when called, so a
  // bare load must expose window.SlopJudge with the judge surface.
  vm.createContext(sandbox);
  vm.runInContext(judgeBrowserSrc, sandbox, { filename: "judge-browser.js" });
  const api = sandbox.window.SlopJudge;
  assert.ok(api, "window.SlopJudge is exposed");
  assert.equal(typeof api.judgeReport, "function", "judgeReport is present on the global");
  assert.equal(typeof api.formatJudgeLines, "function");
  assert.equal(api.ENGINE_NAME, "lazynext-ai-slop-checker-judge");
});

test("judge-browser: CommonJS arm exposes the same surface", () => {
  assert.equal(typeof browserModule.judgeReport, "function");
  assert.equal(browserModule.ENGINE_NAME, "lazynext-ai-slop-checker-judge");
});

// ---------------------------------------------------------------------------
// Parity: browser judge === node judge (byte-identical JSON)
// ---------------------------------------------------------------------------

test("parity: demo/slop.txt → identical JSON, verdict REVIEW", () => {
  const a = JSON.stringify(browserModule.judgeReport({ text: SLOP_SAMPLE }));
  const b = JSON.stringify(nodeJudge({ text: SLOP_SAMPLE }));
  assert.equal(a, b, "judge-browser must produce the SAME report as src/judge.js");
  const report = JSON.parse(a);
  assert.equal(report.summary.verdict, "REVIEW");
  assert.equal(report.input.type, "text");
  assert.ok(report.summary.reasons.some((x) => /copy objections/.test(x)), "copy objections named");
});

test("parity: demo/clean.txt → identical JSON, verdict PASS", () => {
  const a = JSON.stringify(browserModule.judgeReport({ text: CLEAN_SAMPLE }));
  const b = JSON.stringify(nodeJudge({ text: CLEAN_SAMPLE }));
  assert.equal(a, b, "judge-browser must produce the SAME report as src/judge.js");
  const report = JSON.parse(a);
  assert.equal(report.summary.verdict, "PASS");
  assert.equal(report.scan.score, 0);
});

test("parity: html input → identical JSON incl. the REFUSE path", () => {
  const html = '<style>.hero{background-clip:text;-webkit-background-clip:text;color:transparent}</style><h1>Welcome</h1><p>We must leverage this.</p>';
  const a = JSON.stringify(browserModule.judgeReport({ html }));
  const b = JSON.stringify(nodeJudge({ html }));
  assert.equal(a, b, "html parity must hold (craft-floor machine checks)");
  assert.equal(JSON.parse(a).summary.verdict, "REFUSE");
});

// ---------------------------------------------------------------------------
// Behavioural honesty boundary (mirrors the src/judge.js tests)
// ---------------------------------------------------------------------------

test("judge-browser: text input can never REFUSE and floor items stay human steps", () => {
  const r = browserModule.judgeReport({ text: SLOP_SAMPLE });
  assert.equal(r.summary.verdict, "REVIEW");
  for (const f of r.craftFloor) {
    assert.equal(f.machine, "unchecked", "text input: no machine floor verdicts");
    assert.equal(f.humanCheckbox, true);
  }
  assert.equal(r.craftFloorMet, true);
});

test("judge-browser: contrast and alignment NEVER carry a machine verdict", () => {
  const html = '<div><p>Join 10,000+ developers</p></div>';
  const r = browserModule.judgeReport({ html });
  for (const id of ["contrast", "alignment"]) {
    const item = r.craftFloor.find((f) => f.id === id);
    assert.equal(item.machine, "unchecked");
    assert.equal(item.humanCheckbox, true);
    assert.ok(item.guidance && item.guidance.length > 0, "guidance present");
  }
});

test("judge-browser: same input → byte-identical report (determinism)", () => {
  const a = JSON.stringify(browserModule.judgeReport({ text: SLOP_SAMPLE }));
  const b = JSON.stringify(browserModule.judgeReport({ text: SLOP_SAMPLE }));
  assert.equal(a, b);
});

test("judge-browser: project input requires a pre-scanned report object (no filesystem)", () => {
  assert.throws(() => browserModule.judgeReport({ project: "/tmp" }), /pre-scanned project report object/);
  const report = require("../src/project-scanner-browser.js").scanProjectBrowser(
    [{ name: "README.md", text: SLOP_SAMPLE }],
    { root: "demo" }
  );
  const r = browserModule.judgeReport({ project: report });
  assert.equal(r.input.type, "project");
  assert.equal(r.input.dir, "demo");
  assert.ok(r.input.filesScanned >= 1);
  assert.ok(r.summary.verdict === "REVIEW" || r.summary.verdict === "REFUSE", "sloppy fixture is not PASS");
});

// ---------------------------------------------------------------------------
// Web wiring (parse + Review tab references)
// ---------------------------------------------------------------------------

test("web/app.js still parses as a classic script", () => {
  assert.doesNotThrow(() => new Function(appSrc), "app.js must remain valid JS in a Node-only context");
});

test("index.html: Review tab wiring exists (tab, pane, buttons, judge script src)", () => {
  assert.match(indexHtml, /id="tab-review"/, "Review tab button present");
  assert.match(indexHtml, /aria-controls="pane-review"/, "Review tab targets pane-review");
  assert.match(indexHtml, /id="pane-review"/, "Review pane present");
  assert.match(indexHtml, /id="input-review"/, "Review input present");
  assert.match(indexHtml, /id="btn-judge"/, "Run review button present");
  assert.match(indexHtml, /id="btn-judge-reuse"/, "reuse-last-scan button present");
  assert.match(indexHtml, /id="judge-results"/, "judge results section present");
  assert.match(indexHtml, /src="\.\.\/src\/judge-browser\.js"/, "judge-browser script loads before app.js");
  // The script order matters: judge-browser.js must come after the engine
  // files it consumes (patterns → scanner) and before app.js.
  const idxPatterns = indexHtml.indexOf("slop-patterns.js");
  const idxScanner = indexHtml.indexOf("src/scanner.js");
  const idxJudge = indexHtml.indexOf("judge-browser.js");
  const idxApp = indexHtml.indexOf("src=\"./app.js\"");
  assert.ok(idxPatterns >= 0 && idxScanner > idxPatterns, "patterns load before scanner");
  assert.ok(idxJudge > idxScanner, "judge-browser loads after the scanner");
  assert.ok(idxApp > idxJudge, "app.js loads last (it consumes window.SlopJudge)");
});

test("web/app.js: Review tab wiring references exist", () => {
  assert.match(appSrc, /window\.SlopJudge/, "app.js references the judge global");
  assert.match(appSrc, /tabReview/, "app.js tracks the Review tab");
  assert.match(appSrc, /paneReview/, "app.js tracks the Review pane");
  assert.match(appSrc, /runReview\(\)/, "app.js defines runReview");
  assert.match(appSrc, /renderJudgeReport\(report\)/, "app.js renders the judge report");
  assert.match(appSrc, /btnJudgeReuse/, "app.js wires the reuse button");
  assert.match(appSrc, /judgeEngine\.judgeReport/, "app.js calls judgeReport through the judge engine");
});