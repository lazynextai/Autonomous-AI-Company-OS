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
const scanner = require("../src/scanner.js");

/**
 * A well-formed PRE-SCANNED project report object mirroring the
 * src/project-scanner.js / scanProjectBrowser shape the Folder tab
 * produces: { root, files: [{ file, kind, report }], summary: { ... },
 * topFiles, categories }. Built from a real scanner run so every match
 * object is authentic — the judge pools `files[].report.matches` exactly
 * like the Node judge's project mode.
 */
function buildProjectFixture() {
  const one = scanner.scanText(SLOP_SAMPLE);
  return {
    engine: "lazynext-ai-slop-checker",
    version: one.version,
    root: "demo/site",
    files: [{ file: "README.md", kind: "prose", report: one }],
    summary: {
      filesScanned: 1,
      filesWithHits: one.totalPoints > 0 ? 1 : 0,
      filesSkipped: 0,
      totalMatches: one.matches.length,
      totalPoints: one.totalPoints,
      score: one.score,
      verdict: one.verdict,
      verdictBands: [
        { max: 9, label: "clean" },
        { max: 29, label: "light" },
        { max: 59, label: "moderate" },
        { max: Infinity, label: "heavy" },
      ],
    },
    topFiles: [
      { file: "README.md", kind: "prose", score: one.score, points: one.totalPoints, matches: one.matches.length, verdict: one.verdict },
    ],
    categories: one.categories.map((c) => ({ id: c.id, name: c.name, count: c.count, points: c.points })),
  };
}

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

test("judge-browser: project path accepts a well-formed pre-scanned report object (same report shape as the text path)", () => {
  const projectReport = browserModule.judgeReport({ project: buildProjectFixture() });
  const textReport = browserModule.judgeReport({ text: SLOP_SAMPLE });

  // PARITY — the project path returns the SAME judge report shape as the
  // text path: identical top-level keys, identical section sizes, and the
  // verdict computed identically over the pooled matches.
  assert.deepEqual(
    Object.keys(projectReport).sort(),
    Object.keys(textReport).sort(),
    "same top-level report keys (engine, version, input, scan, 5Q, floor, refusals, summary)"
  );
  assert.equal(projectReport.fiveQuestionReview.length, 5, "5-question review: same 5 questions");
  assert.equal(projectReport.fiveQuestionReview.length, textReport.fiveQuestionReview.length);
  assert.equal(projectReport.craftFloor.length, 6, "craft floor: same 6 items");
  assert.equal(projectReport.craftFloor.length, textReport.craftFloor.length);
  assert.equal(projectReport.refusalScaffolds.length, 3, "refusal scaffolds: same 3");
  assert.equal(projectReport.refusalScaffolds.length, textReport.refusalScaffolds.length);
  assert.equal(projectReport.summary.verdict, textReport.summary.verdict, "same verdict on the same pooled copy tells");
  assert.equal(projectReport.summary.machineChecked.copyTells, textReport.summary.machineChecked.copyTells);
  assert.equal(projectReport.summary.machineChecked.designTells, textReport.summary.machineChecked.designTells);
  assert.equal(projectReport.scan.matches.length, textReport.scan.matches.length, "matches pooled identically from the report object");

  // Input descriptor reflects the PROJECT scope.
  assert.equal(projectReport.input.type, "project");
  assert.equal(projectReport.input.dir, "demo/site");
  assert.equal(projectReport.input.filesScanned, 1);

  // The floor difference is the CONTRACT, not drift: project input
  // machine-checks the checkable items (here, a text-lens scan carries no
  // design evidence → "ok"), while the text path keeps them human steps.
  // contrast/alignment stay human checkboxes in BOTH.
  const byId = (items) => Object.fromEntries(items.map((f) => [f.id, f]));
  const pf = byId(projectReport.craftFloor);
  const tf = byId(textReport.craftFloor);
  assert.equal(pf["contrast"].machine, "unchecked", "contrast stays a human step in project mode");
  assert.equal(pf["alignment"].machine, "unchecked", "alignment stays a human step in project mode");
  assert.equal(pf["text-hierarchy"].machine, "ok", "checkable floor item is machine-checked in project mode");
  for (const f of textReport.craftFloor) assert.equal(f.machine, "unchecked", "text path keeps every floor item a human step");
});

test("judge-browser: project input never accepts a path-like value (object-only contract)", () => {
  for (const bad of ["/tmp", "demo/site", "./src", "README.md", 42, null, {}, { files: "nope" }]) {
    assert.throws(
      () => browserModule.judgeReport({ project: bad }),
      /pre-scanned project report object/,
      `dir-path / non-object rejected: ${JSON.stringify(bad)}`
    );
  }
  // A well-formed report object still passes (the folder-judge path).
  assert.doesNotThrow(() => browserModule.judgeReport({ project: buildProjectFixture() }));
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
  assert.match(indexHtml, /id="btn-judge-project"/, "folder-judge button present in the Review pane");
  assert.match(indexHtml, /id="judge-project-status"/, "folder-judge hint present");
  assert.ok(/id="btn-judge-project"[\s\S]*disabled/.test(indexHtml), "folder-judge button starts disabled (no project report yet)");
  assert.match(indexHtml, /id="judge-results"/, "judge results section present");
  assert.match(indexHtml, /id="judge-results-title"/, "judge results title present (Project review for project input)");
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

// ├──────────────────────────────────────────────────────────────────────
// │ Folder-judge path (shipped in v1.4.4)
// ├──────────────────────────────────────────────────────────────────────
// The Review tab's "Judge scanned project" action sends the PRE-SCANNED
// PROJECT REPORT OBJECT from the Folder tab into the judge engine's
// `project` path — never a directory path (the browser has no filesystem;
// src/judge-browser.js rejects strings with the documented contract
// error). These are parse/structural locks, no browser required:
// app.js still parses, `runProjectReview` exists and calls
// judgeReport({ project: ... }) with the in-memory report, and the
// button wiring is referenced in both index.html and app.js.

test("web/app.js: folder-judge path exists (runProjectReview + wiring references)", () => {
  assert.match(appSrc, /runProjectReview\(\)/, "app.js defines runProjectReview");
  assert.match(appSrc, /lastProjectReport/, "app.js tracks the scanned project report object");
  assert.match(appSrc, /judgeReport\(\{ project: lastProjectReport \}\)/, "app.js passes the pre-scanned REPORT OBJECT (never a path) to the judge");
  assert.match(appSrc, /btnJudgeProject/, "app.js wires the folder-judge button");
  assert.match(appSrc, /projectJudgeState/, "app.js uses the pure DOM-free availability helper");
});

test("web/app.js: folder-judge availability helper is pure and DOM-free (exercisable in Node)", () => {
  // The disabled/enabled logic lives in the DOM-free SlopAppState helper;
  // here we exercise the exact predicate the wiring calls, via the vm
  // shim that strips the DOM entry point (init() never fires).
  const vm = require("node:vm");
  const sandbox = {
    console,
    window: {},
    fetch: () => Promise.resolve({ ok: false }),
    FileReader: function () {},
    document: {
      getElementById: () => ({}),
      addEventListener: () => {},
      createElement: () => ({}),
      querySelector: () => null,
      head: { appendChild: () => {} },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appSrc, sandbox, { filename: "app.js" });
  const H = sandbox.window.SlopAppState;
  assert.ok(H && typeof H.projectJudgeState === "function", "projectJudgeState is exposed on window.SlopAppState");

  // No report → disabled + scan-first hint.
  const none = H.projectJudgeState(null);
  assert.equal(none.available, false);
  assert.match(none.hint, /run a Folder scan first|scan first/i);

  // A path-like string is NOT a report — stays disabled (object-only contract).
  assert.equal(H.projectJudgeState("/tmp").available, false, "a dir-path string must never enable the folder-judge");

  // A well-formed pre-scanned report object → enabled + ready hint.
  const project = {
    root: "demo/site",
    files: [{ file: "README.md", kind: "prose", report: scanner.scanText(SLOP_SAMPLE) }],
    summary: { filesScanned: 1 },
  };
  const ready = H.projectJudgeState(project);
  assert.equal(ready.available, true);
  assert.match(ready.hint, /ready to judge 1 scanned file/);
});