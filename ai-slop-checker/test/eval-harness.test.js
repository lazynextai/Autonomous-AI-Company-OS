"use strict";
/**
 * Corpus quality benchmark harness tests: the pure helpers in bench/eval.js
 * (metric math + the FP-rate gate) must be pinned, and the corpus files
 * themselves must exist, be readable and non-empty. No network, no writes.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  computeMetrics,
  computeFpr,
  gatePassed,
  familyFromFilename,
  evaluateLanguage,
  FAMILIES,
  GATE_MAX_FPR,
  LANGUAGE_LINES,
} = require("../bench/eval.js");

const CORPUS_DIR = path.join(__dirname, "..", "bench", "corpus");
const POSITIVE_DIR = path.join(CORPUS_DIR, "positive");
const NEGATIVE_DIR = path.join(CORPUS_DIR, "negative");

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(abs);
    }
  };
  walk(dir);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Corpus file existence + parseability
// ---------------------------------------------------------------------------

test("eval corpus: every positive/negative sample exists, is readable and non-empty", () => {
  for (const dir of [POSITIVE_DIR, NEGATIVE_DIR]) {
    const files = listFiles(dir);
    assert.ok(files.length > 0, `expected samples in ${dir}`);
    for (const f of files) {
      const raw = fs.readFileSync(f, "utf8"); // throws if unreadable
      assert.ok(raw.trim().length > 0, `sample must not be empty: ${f}`);
    }
  }
});

test("eval corpus: every positive text sample maps to a declared family", () => {
  const files = listFiles(POSITIVE_DIR);
  const textSamples = files.filter((f) => /\.(txt|html?)$/i.test(f));
  const unmapped = textSamples
    .map((f) => path.basename(f))
    .filter((name) => !name.startsWith("design-") && familyFromFilename(name) === null);
  assert.deepEqual(unmapped, [], `no positive filename should fall through: ${unmapped.join(", ")}`);
});

test("eval corpus: at least 2 positives per text family + >=6 design snippets", () => {
  const counts = new Map();
  let design = 0;
  for (const f of listFiles(POSITIVE_DIR)) {
    const name = path.basename(f);
    if (name.startsWith("design-")) {
      design += 1;
      continue;
    }
    const fam = familyFromFilename(name);
    counts.set(fam, (counts.get(fam) || 0) + 1);
  }
  assert.ok(design >= 6, `expected >=6 design-positive snippets, got ${design}`);
  for (const f of FAMILIES) {
    const label = f.id === "design" ? "(design counted above)" : `${f.id}`;
    const c = f.id === "design" ? design : counts.get(f.id) || 0;
    assert.ok(c >= 2, `family ${label} needs >=2 positives, got ${c}`);
  }
});

// ---------------------------------------------------------------------------
// Metric math
// ---------------------------------------------------------------------------

test("computeMetrics: hand-fed synthetic hits produce exact precision/recall/F1", () => {
  // 4 positives in the set, 3 fired; 1 negative fired -> precision 3/4, recall 3/4
  const m = computeMetrics(3, 1, 4);
  assert.equal(m.precision, 0.75);
  assert.equal(m.recall, 0.75);
  assert.equal(m.f1, 0.75); // (2*0.75*0.75) / 1.5
});

test("computeMetrics: no negatives hit -> precision 1", () => {
  const m = computeMetrics(2, 0, 2);
  assert.equal(m.precision, 1);
  assert.equal(m.recall, 1);
  assert.equal(m.f1, 1);
});

test("computeMetrics: zero-sized axes are null, not NaN", () => {
  const m = computeMetrics(0, 2, 0);
  assert.equal(m.precision, 0);
  assert.equal(m.recall, null);
  assert.equal(m.f1, null);
  const n = computeMetrics(0, 0, 2);
  assert.equal(n.precision, null);
  assert.equal(n.recall, 0);
  assert.equal(n.f1, null);
});

test("computeFpr: file-level rate is hit/total", () => {
  assert.equal(computeFpr(1, 20), 0.05);
  assert.equal(computeFpr(0, 20), 0);
  assert.equal(computeFpr(3, 60), 0.05);
});

// ---------------------------------------------------------------------------
// The gate function (product-level contract)
// ---------------------------------------------------------------------------

test("gate: FPR <= 0.05 passes, 0.06 fails, boundary 0.05 passes", () => {
  assert.equal(gatePassed(0.05), true, "boundary (5%) must pass");
  assert.equal(gatePassed(0.04), true);
  assert.equal(gatePassed(0.06), false, "6% must fail");
  assert.equal(gatePassed(0), true);
});

test("gate: the constant exported matches the contract", () => {
  assert.equal(GATE_MAX_FPR, 0.05);
});

// ---------------------------------------------------------------------------
// i18n lines (fr/de/ru/hi/es) via the same path bench/eval.js uses
// ---------------------------------------------------------------------------

test("eval i18n: every language corpus file exists, is readable and non-empty", () => {
  for (const lang of LANGUAGE_LINES) {
    for (const side of ["positive", "negative"]) {
      const f = path.join(CORPUS_DIR, `${side}-${lang}.md`);
      assert.ok(fs.existsSync(f), `missing language corpus file: ${f}`);
      const raw = fs.readFileSync(f, "utf8"); // throws if unreadable
      assert.ok(raw.trim().length > 0, `language corpus file must not be empty: ${f}`);
    }
  }
});

test("eval i18n: every language evaluator passes on shipped samples", () => {
  for (const lang of LANGUAGE_LINES) {
    const r = evaluateLanguage(lang);
    assert.equal(r.posHit, true, `${lang} positive sample must fire`);
    assert.equal(r.negHit, false, `${lang} clean sample must stay clean`);
    assert.equal(r.pass, true, `${lang} line must pass`);
  }
});