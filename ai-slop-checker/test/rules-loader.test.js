"use strict";
/**
 * Rules-loader tests: deep-merge semantics, duplicate-id rejection,
 * unknown-category rejection, the .ru sample corpus (fires on Russian
 * slop, NOT on English clean prose), and the CLI --rules path.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadRules, mergeCorpus, resolveRuleFiles } = require("../src/rules-loader.js");
const { createEngine } = require("../src/scanner.js");
const { createRewriter } = require("../src/rewriter.js");
const baseCorpus = require("../data/slop-patterns.js");

const BASE_COUNT = baseCorpus.patterns.length;
const BASE_CATS = baseCorpus.categories.length;

const CUSTOM_PAYLOAD = {
  version: "2.0.0-test",
  categories: [
    { id: "my-cat", name: "My category", desc: "A custom category." },
  ],
  patterns: [
    { id: "my-word", category: "my-cat", severity: 2, kind: "word", match: "blorptastic", desc: "A custom word tell.", fix: "Say what you actually mean." },
    { id: "my-phrase", category: "my-cat", severity: 3, kind: "phrase", match: "in the blorp age", desc: "A custom phrase tell.", fix: "Delete it." },
  ],
};

function tmpRulesFile(payload, name = "rules.custom.js") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-rules-"));
  const file = path.join(dir, name);
  const body = name.endsWith(".json")
    ? JSON.stringify(payload, null, 2)
    : `module.exports = ${JSON.stringify(payload, null, 2)};`;
  fs.writeFileSync(file, body);
  return { dir, file };
}

// ---------------------------------------------------------------------------
// loadRules merge semantics
// ---------------------------------------------------------------------------

test("loadRules: deep-merges a custom payload (new categories appended, existing merged)", () => {
  const merged = loadRules(CUSTOM_PAYLOAD);
  assert.equal(merged.version, "2.0.0-test", "custom version wins");
  assert.equal(merged.patterns.length, BASE_COUNT + 2);
  assert.equal(merged.categories.length, BASE_CATS + 1);
  assert.ok(merged.categoryById["my-cat"], "new category appended");
  assert.ok(merged.patterns.some((p) => p.id === "my-word"));
  assert.ok(merged.patterns.some((p) => p.id === "my-phrase"));
});

test("loadRules: custom patterns in an EXISTING category fold into it (no duplicate category)", () => {
  const payload = { patterns: [{ id: "extra-delve-ish", category: "word-ban", severity: 1, kind: "word", match: "galvanize", desc: "A galvanized tell.", fix: "Use a plain verb." }] };
  const merged = loadRules(payload);
  assert.equal(merged.categories.length, BASE_CATS, "no new category for existing id");
  assert.equal(merged.categoryById["word-ban"].name, "Banned words");
  assert.ok(merged.patterns.some((p) => p.id === "extra-delve-ish"));
});

test("loadRules: duplicate pattern ids are rejected with a clear error", () => {
  const payload = { patterns: [{ id: "w-delve", category: "word-ban", severity: 2, kind: "word", match: "delve", desc: "dup", fix: "dup" }] };
  assert.throws(() => loadRules(payload), /duplicate pattern id "w-delve"/);
});

test("loadRules: duplicate ids WITHIN the custom set are rejected too", () => {
  const payload = { patterns: [
    { id: "my-dup", category: "my-cat", severity: 1, kind: "word", match: "one", desc: "a", fix: "b" },
    { id: "my-dup", category: "my-cat", severity: 1, kind: "word", match: "two", desc: "a", fix: "b" },
  ], categories: [{ id: "my-cat", name: "X" }] };
  assert.throws(() => loadRules(payload), /duplicate pattern id "my-dup"/);
});

test("loadRules: patterns referencing an unknown category are rejected", () => {
  const payload = { patterns: [{ id: "orphan", category: "no-such-cat", severity: 1, kind: "word", match: "x", desc: "a", fix: "b" }] };
  assert.throws(() => loadRules(payload), /unknown category "no-such-cat"/);
});

test("loadRules: invalid pattern fields are rejected", () => {
  // Missing kind
  assert.throws(() => loadRules({ patterns: [{ id: "x", category: "word-ban", severity: 1, match: "foo" }] }), /kind/);
  // Bad severity
  assert.throws(() => loadRules({ patterns: [{ id: "x", category: "word-ban", severity: 9, kind: "word", match: "foo" }] }), /severity/);
  // Empty id
  assert.throws(() => loadRules({ patterns: [{ id: "", category: "word-ban", severity: 1, kind: "word", match: "foo" }] }), /id/);
  // Empty match
  assert.throws(() => loadRules({ patterns: [{ id: "x", category: "word-ban", severity: 1, kind: "word", match: "" }] }), /match/);
});

test("loadRules: accepts a bare array of patterns (without categories)", () => {
  const merged = loadRules([{ id: "arr-word", category: "word-ban", severity: 1, kind: "word", match: "arrword", desc: "d", fix: "f" }]);
  assert.equal(merged.patterns.length, BASE_COUNT + 1);
  assert.ok(merged.patterns.some((p) => p.id === "arr-word"));
});

// ---------------------------------------------------------------------------
// File / glob resolution (node)
// ---------------------------------------------------------------------------

test("loadRules: loads a .js rules file from a path", () => {
  const { dir, file } = tmpRulesFile(CUSTOM_PAYLOAD);
  try {
    const merged = loadRules(file);
    assert.equal(merged.patterns.length, BASE_COUNT + 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRules: loads a .json rules file", () => {
  const { dir, file } = tmpRulesFile(CUSTOM_PAYLOAD, "rules.custom.json");
  try {
    const merged = loadRules(file);
    assert.equal(merged.patterns.length, BASE_COUNT + 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRules: glob match collects multiple rule files in sorted order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-glob-"));
  try {
    fs.writeFileSync(path.join(dir, "b.rules.js"), "module.exports = { patterns: [{ id: 'glob-b', category: 'word-ban', severity: 1, kind: 'word', match: 'glob-b-word', desc: 'd', fix: 'f' }] };");
    fs.writeFileSync(path.join(dir, "a.rules.js"), "module.exports = { patterns: [{ id: 'glob-a', category: 'word-ban', severity: 1, kind: 'word', match: 'glob-a-word', desc: 'd', fix: 'f' }] };");
    const merged = loadRules(path.join(dir, "*.rules.js"));
    assert.equal(merged.patterns.length, BASE_COUNT + 2);
    // Sorted: glob-a before glob-b
    const ids = merged.patterns.slice(BASE_COUNT).map((p) => p.id);
    assert.deepEqual(ids, ["glob-a", "glob-b"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadRules: comma-separated list of paths", () => {
  const a = tmpRulesFile({ patterns: [{ id: "list-a", category: "word-ban", severity: 1, kind: "word", match: "list-a-word", desc: "d", fix: "f" }] });
  const b = tmpRulesFile({ patterns: [{ id: "list-b", category: "word-ban", severity: 1, kind: "word", match: "list-b-word", desc: "d", fix: "f" }] });
  try {
    const merged = loadRules(`${a.file},${b.file}`);
    assert.equal(merged.patterns.length, BASE_COUNT + 2);
  } finally {
    fs.rmSync(a.dir, { recursive: true, force: true });
    fs.rmSync(b.dir, { recursive: true, force: true });
  }
});

test("loadRules: nonexistent path throws", () => {
  assert.throws(() => loadRules("/definitely/not/here.js"), /not found/);
});

// ---------------------------------------------------------------------------
// Custom engine behaviour (scan + rewrite wired to the merged corpus)
// ---------------------------------------------------------------------------

test("custom engine: merged patterns fire via scanner.createEngine", () => {
  const merged = loadRules(CUSTOM_PAYLOAD);
  const engine = createEngine(merged);
  const report = engine.scanText("This is blorptastic in the blorp age.");
  assert.ok(report.matches.some((m) => m.id === "my-word"));
  assert.ok(report.matches.some((m) => m.id === "my-phrase"));
  assert.equal(report.version, "2.0.0-test");
  // Base corpus still fires on the custom engine.
  assert.ok(report.matches.some((m) => m.id === "w-delve") || engine.scanText("delve deep").matches.some((m) => m.id === "w-delve"));
});

test("custom engine: createRewriter wired to the merged corpus still rewrites base patterns", () => {
  // Regression for the phase-3 wiring bug: a custom engine built from
  // loadRules() must expose a WORKING rewrite path (the rewriter needs the
  // merged corpus + custom scanner, not the built-in corpus).
  const merged = loadRules("data/rules.ru.js");
  const scanner = createEngine(merged);
  const rewriter = createRewriter(merged, scanner);
  assert.equal(typeof rewriter.rewriteText, "function");
  const res = rewriter.rewriteText("We must leverage this robust tool and utilize it well.");
  assert.equal(res.changed, true);
  assert.ok(!res.text.includes("leverage"));
  assert.ok(!res.text.includes("utilize"));
});

test("built-in engine rewrite path is unchanged", () => {
  const { rewriteText } = require("../src/rewriter.js");
  const res = rewriteText("We must leverage this tool.");
  assert.equal(res.changed, true);
  assert.ok(res.text.includes("use this tool"));
});

// ---------------------------------------------------------------------------
// The .ru sample corpus
// ---------------------------------------------------------------------------

test("data/rules.ru.js: fires on Russian slop and NOT on English clean prose", () => {
  const merged = loadRules("data/rules.ru.js");
  const engine = createEngine(merged);
  assert.equal(merged.version, "1.0.0-ru");

  const ruSlop =
    "В современном мире нельзя не отметить, что инновационный подход играет важную роль. " +
    "В заключение хочется сказать, что синергия открывает новые горизонты. " +
    "Эксперты считают, что цифровая трансформация — это комплексное решение. " +
    "Подводя итог, стоит подчеркнуть: в эпоху цифровизации революционные изменения неизбежны.";
  const ruReport = engine.scanText(ruSlop);
  assert.equal(ruReport.clean, false, "Russian slop must not be clean");
  assert.ok(ruReport.score >= 30, `expected a firm Russian score, got ${ruReport.score}`);
  assert.ok(ruReport.matches.some((m) => m.id === "ru-f-v-sovremennom-mire"));
  assert.ok(ruReport.matches.some((m) => m.id === "ru-w-sinergiya"));
  assert.ok(ruReport.matches.some((m) => m.id === "ru-w-innovatsion"));
  assert.ok(ruReport.matches.some((m) => m.category === "ru-copy-tics"), "new appended category fires");
  // The new appended category appears in the pooled categories.
  assert.ok(ruReport.categories.some((c) => c.id === "ru-copy-tics"), "ru-copy-tics appended category must be reported");

  const enClean =
    "The bakery opens at six. Maya sets the loaves on the counter in order of size, largest first, " +
    "and counts the receipts twice before the kettle boils.";
  const enReport = engine.scanText(enClean);
  assert.equal(enReport.clean, true, "English clean prose stays clean on the merged engine");
  assert.equal(enReport.matches.length, 0, "no false fires on clean English prose");
});

test("data/rules.ru.js: 36 patterns, 28 categories when merged", () => {
  const merged = loadRules("data/rules.ru.js");
  assert.equal(merged.patterns.length, BASE_COUNT + 36);
  assert.equal(merged.categories.length, BASE_CATS + 1);
});

// ---------------------------------------------------------------------------
// CLI --rules
// ---------------------------------------------------------------------------

test("cli --rules <file> scans text with merged rules and exits lint-style", async () => {
  const { main } = require("../api/cli.js");
  const { dir, file } = tmpRulesFile(CUSTOM_PAYLOAD);
  try {
    const logs = [];
    const origLog = console.log;
    console.log = (s) => logs.push(String(s));
    let code;
    try {
      code = await main(["node", "api/cli.js", "--rules", file, "This is blorptastic in the blorp age."]);
    } finally {
      console.log = origLog;
    }
    assert.equal(code, 2, "exit 2 when findings exist (lint-style)");
    const text = logs.join("\n");
    assert.ok(text.includes("My category"), "custom category reported by name");
    assert.ok(text.includes("my-word"), "custom pattern reported");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cli --rules <file> --rewrite rewrites through the merged engine", async () => {
  const { main } = require("../api/cli.js");
  const file = path.join(__dirname, "..", "data", "rules.ru.js");
  const logs = [];
  const origLog = console.log;
  console.log = (s) => logs.push(String(s));
  let code;
  try {
    code = await main(["node", "api/cli.js", "--rules", file, "--rewrite", "We must leverage this."]);
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0, "--rewrite always exits 0 like the built-in path");
  const text = logs.join("\n");
  assert.ok(text.includes("use this"), `merged-engine rewrite must apply: ${text}`);
});

test("cli --rules alone still dumps the corpus shorthand", async () => {
  const { main } = require("../api/cli.js");
  const logs = [];
  const origLog = console.log;
  console.log = (s) => logs.push(String(s));
  let code;
  try {
    code = await main(["node", "api/cli.js", "--rules"]);
  } finally {
    console.log = origLog;
  }
  assert.equal(code, 0);
  const text = logs.join("\n");
  const parsed = JSON.parse(text);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.some((r) => r.id === "w-delve"));
});

test("cli --rules with a bad file path errors cleanly (exit 1)", async () => {
  const { main } = require("../api/cli.js");
  const errs = [];
  const origErr = console.error;
  console.error = (s) => errs.push(String(s));
  let code;
  try {
    code = await main(["node", "api/cli.js", "--rules", "/definitely/not/here.js", "text"]);
  } finally {
    console.error = origErr;
  }
  assert.equal(code, 1);
  assert.ok(errs.join("\n").includes("error loading rules"));
});

// ---------------------------------------------------------------------------
// resolveRuleFiles unit
// ---------------------------------------------------------------------------

test("resolveRuleFiles: returns absolute paths for literal + glob values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-resolve-"));
  try {
    fs.writeFileSync(path.join(dir, "one.js"), "module.exports = []");
    fs.writeFileSync(path.join(dir, "two.js"), "module.exports = []");
    const literal = resolveRuleFiles(path.join(dir, "one.js"));
    assert.equal(literal.length, 1);
    assert.ok(path.isAbsolute(literal[0]));
    const glob = resolveRuleFiles(path.join(dir, "*.js"));
    assert.equal(glob.length, 2);
    const listed = resolveRuleFiles(`${path.join(dir, "one.js")},${path.join(dir, "two.js")}`);
    assert.equal(listed.length, 2);
    const empty = resolveRuleFiles("");
    assert.deepEqual(empty, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeCorpus: returns a NEW object and does not mutate the base", () => {
  const before = BASE_CATS;
  const merged = mergeCorpus(baseCorpus, { categories: [{ id: "mut-probe", name: "P" }], patterns: [] });
  assert.equal(baseCorpus.categories.length, before, "base corpus unchanged");
  assert.equal(merged.categories.length, before + 1);
  assert.notStrictEqual(merged.categories, baseCorpus.categories);
});