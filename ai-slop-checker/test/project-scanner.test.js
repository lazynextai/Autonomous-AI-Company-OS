"use strict";
/**
 * Project scanner tests: directory walking, lens selection, per-file reports,
 * aggregation, determinism, error tolerance, and the CLI --dir path.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { scanProject, kindFor, walk } = require("../src/project-scanner.js");
const { main: cliMain } = require("../api/cli.js");

// ---------------------------------------------------------------------------
// Fixture: a tiny in-memory tree built per test so tests never share state.
// ---------------------------------------------------------------------------
function makeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-proj-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}

function rmRf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// kindFor
// ---------------------------------------------------------------------------
test("kindFor: classifies extensions into lenses", () => {
  assert.equal(kindFor("/x/a.md", "a.md"), "prose");
  assert.equal(kindFor("/x/a.txt", "a.txt"), "prose");
  assert.equal(kindFor("/x/index.html", "index.html"), "markup");
  assert.equal(kindFor("/x/Hero.tsx", "Hero.tsx"), "markup");
  assert.equal(kindFor("/x/a.css", "a.css"), "styles");
  assert.equal(kindFor("/x/a.scss", "a.scss"), "styles");
  assert.equal(kindFor("/x/config.json", "config.json"), "code");
  assert.equal(kindFor("/x/a.py", "a.py"), "code");
  assert.equal(kindFor("/x/logo.png", "logo.png"), null);
  assert.equal(kindFor("/x/tailwind.config.js", "tailwind.config.js"), "code");
});

// ---------------------------------------------------------------------------
// Basic scan behavior
// ---------------------------------------------------------------------------
test("scanProject: scans a tree, aggregates scores, reports top files", () => {
  const dir = makeTree({
    "README.md": "In today's fast-paced world, we must leverage this robust solution.",
    "index.html": "<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><h1>Hello</h1>",
    "notes/clean.txt": "The bakery opens at six. Maya counts the receipts twice.",
    "app/util.py": "def f(x):\n    return x * 2\n",
  });
  try {
    const project = scanProject(dir);
    assert.equal(project.summary.filesScanned, 4);
    assert.ok(project.summary.filesWithHits >= 2, "README + index should have hits");
    assert.equal(project.summary.totalMatches >= 2, true);
    assert.ok(project.summary.score > 0, "directory with slop must score above 0");
    // README is the top file (prose slop piles up)
    assert.equal(project.topFiles[0].file, "README.md");
    assert.ok(project.topFiles[0].points > 0);
    // clean txt should not be in top files
    assert.ok(!project.topFiles.some((f) => f.file === "notes/clean.txt"));
  } finally {
    rmRf(dir);
  }
});

test("scanProject: skip dirs and lockfiles are excluded", () => {
  const dir = makeTree({
    "README.md": "delve",
    "node_modules/x/README.md": "in today's fast-paced world, delve more",
    ".git/HEAD": "ref: refs/heads/main",
    "package-lock.json": "leverage robust",
    "dist/app.js": "leverage",
    "src/app.js": "var x = 1; // fine",
  });
  try {
    const project = scanProject(dir);
    // README + src/app.js only (node_modules, .git, dist, lockfile excluded)
    assert.equal(project.summary.filesScanned, 2);
    assert.ok(project.files.some((f) => f.file === "README.md"));
    assert.ok(project.files.some((f) => f.file === "src/app.js"));
    assert.ok(!project.files.some((f) => f.file.includes("node_modules")));
    assert.ok(!project.files.some((f) => f.file.includes("dist")));
    assert.ok(!project.files.some((f) => f.file.includes("package-lock")));
  } finally {
    rmRf(dir);
  }
});

test("scanProject: empty dir scans clean with zero files", () => {
  const dir = makeTree({});
  try {
    const project = scanProject(dir);
    assert.equal(project.summary.filesScanned, 0);
    assert.equal(project.summary.totalMatches, 0);
    assert.equal(project.summary.score, 0);
    assert.equal(project.summary.verdict, "clean");
    assert.deepEqual(project.topFiles, []);
    assert.deepEqual(project.categories, []);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: clean tree scores 0 and verdict clean", () => {
  const dir = makeTree({
    "notes/a.md": "The bakery opens at six. Maya counts the receipts twice.",
    "src/app.py": "def add(a, b):\n    return a + b\n",
  });
  try {
    const project = scanProject(dir);
    assert.equal(project.summary.score, 0);
    assert.equal(project.summary.verdict, "clean");
    assert.equal(project.summary.filesWithHits, 0);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: code files use the design lens (no text-tell noise)", () => {
  const dir = makeTree({
    "src/site.js": 'classNames("rounded-xl bg-indigo-100 p-2 backdrop-blur")',
  });
  try {
    const project = scanProject(dir);
    const entry = project.files[0];
    assert.equal(entry.kind, "code");
    assert.ok(entry.report.matches.some((m) => m.id === "d-icon-tiles"), "design tell in class string must fire");
    assert.ok(!entry.report.matches.some((m) => m.id === "w-delve"), "no text-tell noise in code");
  } finally {
    rmRf(dir);
  }
});

test("scanProject: determinism — same tree, same report", () => {
  const dir = makeTree({
    "README.md": "In today's fast-paced world, we must leverage this robust solution.",
    "index.html": "<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style>",
  });
  try {
    const a = scanProject(dir);
    const b = scanProject(dir);
    assert.equal(a.summary.score, b.summary.score);
    assert.equal(a.summary.totalPoints, b.summary.totalPoints);
    assert.deepEqual(a.topFiles, b.topFiles);
    assert.deepEqual(a.categories, b.categories);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: a binary file is skipped, not crashed on", () => {
  const dir = makeTree({
    "README.md": "delve",
  });
  fs.writeFileSync(path.join(dir, "data.md"), Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x44, 0x65, 0x6c, 0x76, 0x65]));
  try {
    const project = scanProject(dir);
    // README.md scans; data.md is walked (it's a .md) but skipped as binary.
    assert.equal(project.summary.filesScanned, 2);
    assert.equal(project.files.filter((f) => f.skipped === "binary").length, 1);
    assert.equal(project.summary.filesSkipped, 1);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: too-large files are skipped gracefully", () => {
  const dir = makeTree({
    "README.md": "delve",
  });
  const big = path.join(dir, "huge.md");
  fs.writeFileSync(big, "x");
  fs.truncateSync(big, 600 * 1024);
  try {
    const project = scanProject(dir);
    assert.equal(project.files.filter((f) => f.skipped === "too-large").length, 1);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: throws on a non-directory path", () => {
  const dir = makeTree({ "a.md": "delve" });
  try {
    assert.throws(() => scanProject(path.join(dir, "a.md")), /not a directory/);
  } finally {
    rmRf(dir);
  }
});

// ---------------------------------------------------------------------------
// walk: exercised through scanProject (maxFiles)
// ---------------------------------------------------------------------------
test("walk: respects the maxFiles cap", () => {
  const dir = makeTree({});
  const files = {};
  for (let i = 0; i < 12; i++) files[`f${i}.md`] = "delve";
  for (const [rel, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), body);
  }
  try {
    const listed = walk(dir, 5);
    assert.equal(listed.length, 5);
  } finally {
    rmRf(dir);
  }
});

test("scanProject: pooled category counts are correct", () => {
  const dir = makeTree({
    "a.md": "delve delve delve", // w-delve sev 2, capped at 3× per file = 6 pts
    "b.md": "robust", // w-robust sev 1 = 1 pt
  });
  try {
    const project = scanProject(dir);
    const wb = project.categories.find((c) => c.id === "word-ban");
    assert.ok(wb, "word-ban must be in pooled categories");
    assert.equal(project.summary.totalPoints, 6 + 1);
    assert.equal(wb.points, 7);
    assert.equal(wb.count, 4);
  } finally {
    rmRf(dir);
  }
});

// ---------------------------------------------------------------------------
// CLI --dir
// ---------------------------------------------------------------------------
test("cli --dir prints a formatted project summary", async () => {
  const dir = makeTree({
    "README.md": "In today's fast-paced world, we must leverage this robust solution.",
  });
  try {
    const logs = [];
    const origLog = console.log;
    console.log = (s) => logs.push(String(s));
    try {
      // main(argv) slices argv.slice(2), so pass a full argv-shaped array.
      const code = await cliMain(["node", "api/cli.js", "--dir", dir]);
      assert.equal(code, 2, "exit 2 when findings exist (lint-style)");
    } finally {
      console.log = origLog;
    }
    const text = logs.join("\n");
    assert.ok(text.includes("Engine:"), "summary shows engine");
    assert.ok(text.includes("Files:"), "summary shows file counts");
    assert.ok(text.includes("README.md"), "summary shows the offending file");
    assert.ok(text.includes("Category breakdown"), "summary shows pooled categories");
  } finally {
    rmRf(dir);
  }
});

test("cli --dir --json emits the machine report", async () => {
  const dir = makeTree({
    "README.md": "delve",
  });
  try {
    const logs = [];
    const origLog = console.log;
    console.log = (s) => logs.push(String(s));
    try {
      await cliMain(["node", "api/cli.js", "--dir", dir, "--json"]);
    } finally {
      console.log = origLog;
    }
    const jsonStr = logs.join("\n");
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.engine, "lazynext-ai-slop-checker");
    assert.ok(Array.isArray(parsed.files));
    assert.ok(parsed.summary.filesScanned >= 1);
  } finally {
    rmRf(dir);
  }
});

test("cli --dir with a missing path errors cleanly", async () => {
  const errs = [];
  const origErr = console.error;
  console.error = (s) => errs.push(String(s));
  try {
    const code = await cliMain(["node", "api/cli.js", "--dir", "/definitely/not/a/real/path"]);
    assert.equal(code, 1);
  } finally {
    console.error = origErr;
  }
  assert.ok(errs.length > 0);
});