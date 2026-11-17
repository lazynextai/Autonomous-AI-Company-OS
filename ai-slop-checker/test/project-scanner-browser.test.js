"use strict";
/**
 * Browser-safe project scanner tests: lens classification parity with the
 * Node scanner, skipped-dir handling, pooling, determinism, and the exact
 * same aggregate as the Node scanner on the same tree.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { scanProjectBrowser, classify, SKIP_DIRS } = require("../src/project-scanner-browser.js");
const { scanProject } = require("../src/project-scanner.js");

const FIXTURE = path.join(__dirname, "..", "demo", "fixture-project");

function collectTree(dir) {
  const items = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, rel ? `${rel}/${e.name}` : e.name);
      else if (e.isFile()) {
        const text = fs.readFileSync(full, "utf8");
        items.push({ name: e.name, rel: rel ? `${rel}/${e.name}` : e.name, text });
      }
    }
  };
  walk(dir, "");
  return items;
}

// ---------------------------------------------------------------------------
// classify parity
// ---------------------------------------------------------------------------

test("classify: same lens mapping as the Node project scanner", () => {
  assert.equal(classify("a.md"), "prose");
  assert.equal(classify("a.txt"), "prose");
  assert.equal(classify("index.html"), "markup");
  assert.equal(classify("Hero.tsx"), "markup");
  assert.equal(classify("a.css"), "styles");
  assert.equal(classify("a.scss"), "styles");
  assert.equal(classify("config.json"), "code");
  assert.equal(classify("a.py"), "code");
  assert.equal(classify("logo.png"), null);
  assert.equal(classify("x.min.js"), null, "minified files are skipped");
  assert.equal(classify("package-lock.json"), null, "lockfiles are skipped");
  assert.equal(classify("tailwind.config.js"), "code");
});

test("classify: skipped dirs are recognised (node_modules, .git, dist, ...)", () => {
  for (const d of ["node_modules", ".git", "dist", "build", ".next", ".astro", "coverage", "vendor"]) {
    assert.ok(SKIP_DIRS.has(d), `expected ${d} in SKIP_DIRS`);
  }
});

// ---------------------------------------------------------------------------
// scanProjectBrowser behaviour
// ---------------------------------------------------------------------------

test("scanProjectBrowser: pools the fixture tree with the same score/top files as Node", () => {
  const items = collectTree(FIXTURE);
  const browser = scanProjectBrowser(items, { root: "fixture-project" });
  const node = scanProject(FIXTURE);

  assert.equal(browser.summary.filesScanned, node.summary.filesScanned);
  assert.equal(browser.summary.score, node.summary.score);
  assert.equal(browser.summary.totalMatches, node.summary.totalMatches);
  assert.deepEqual(browser.topFiles.map((f) => f.file), node.topFiles.map((f) => f.file));
});

test("scanProjectBrowser: skipped dirs are excluded", () => {
  const items = [
    { name: "README.md", rel: "README.md", text: "In today's fast-paced world, we must leverage this robust solution." },
    { name: "README.md", rel: "node_modules/pkg/README.md", text: "delve delve delve into a seamless journey" },
    { name: "app.js", rel: "src/app.js", text: "var x = 1;\n" },
    { name: "package-lock.json", rel: "package-lock.json", text: "leverage" },
  ];
  const project = scanProjectBrowser(items);
  assert.equal(project.summary.filesScanned, 2, "README + src/app.js only");
  assert.ok(project.files.some((f) => f.file === "README.md"));
  assert.ok(project.files.some((f) => f.file === "src/app.js"));
  assert.ok(!project.files.some((f) => f.file.includes("node_modules")));
  assert.ok(!project.files.some((f) => f.file.includes("package-lock")));
});

test("scanProjectBrowser: binary-like (null byte) content is skipped", () => {
  const project = scanProjectBrowser([
    { name: "a.md", rel: "a.md", text: "delve" },
    { name: "b.md", rel: "b.md", text: "bin\u0000ary" },
  ]);
  assert.equal(project.files.filter((f) => f.skipped === "binary").length, 1);
  assert.equal(project.summary.filesSkipped, 1);
});

test("scanProjectBrowser: empty and too-large files are skipped gracefully", () => {
  const project = scanProjectBrowser([
    { name: "a.md", rel: "a.md", text: "" },
    { name: "b.md", rel: "b.md", text: "x".repeat(600 * 1024) },
    { name: "c.md", rel: "c.md", text: "delve" },
  ]);
  const skipped = project.files.filter((f) => f.skipped);
  assert.equal(skipped.length, 2);
  assert.equal(project.summary.filesScanned, 3);
  assert.equal(project.summary.filesSkipped, 2);
});

test("scanProjectBrowser: clean files score 0", () => {
  const project = scanProjectBrowser([
    { name: "notes.md", rel: "notes.md", text: "The bakery opens at six. Maya counts the receipts twice." },
    { name: "app.py", rel: "app.py", text: "def add(a, b):\n    return a + b\n" },
  ]);
  assert.equal(project.summary.score, 0);
  assert.equal(project.summary.verdict, "clean");
  assert.equal(project.summary.filesWithHits, 0);
});

test("scanProjectBrowser: deterministic", () => {
  const items = collectTree(FIXTURE);
  const a = scanProjectBrowser(items);
  const b = scanProjectBrowser(items);
  assert.equal(a.summary.score, b.summary.score);
  assert.deepEqual(a.topFiles, b.topFiles);
  assert.deepEqual(a.categories, b.categories);
});

test("scanProjectBrowser: throws on non-array input", () => {
  assert.throws(() => scanProjectBrowser("nope"), /array/);
  assert.throws(() => scanProjectBrowser(null), /array/);
});

test("scanProjectBrowser: maxFiles cap applies", () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ name: `f${i}.md`, rel: `f${i}.md`, text: "delve" });
  const project = scanProjectBrowser(items, { maxFiles: 5 });
  assert.equal(project.summary.filesScanned, 5);
});

// ---------------------------------------------------------------------------
// web assets sanity (parse-level; the browser feature itself is exercised
// via the browser-safe module above)
// ---------------------------------------------------------------------------

test("web assets: index.html references the browser project scanner script", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  assert.match(html, /project-scanner-browser\.js/);
  assert.match(html, /tab-folder/);
  assert.match(html, /pane-folder/);
  assert.match(html, /folder-files/);
});

test("web assets: app.js defines the folder-scan surface", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  for (const token of ["showDirectoryPicker", "scanFolderLocal", "renderProjectReport", "SlopProjectBrowser", "btnPickFolder"]) {
    assert.ok(js.includes(token), `app.js must reference ${token}`);
  }
  // Parse-level check: the browser script must be valid JavaScript.
  assert.doesNotThrow(() => new Function(js), "web/app.js must parse");
});