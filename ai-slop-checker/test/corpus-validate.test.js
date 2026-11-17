"use strict";
/**
 * Corpus quality-gate tests: the same structural rules scripts/check-corpus.js
 * enforces, asserted as tests so the suite fails on a corpus regression even
 * when nobody runs the script.
 *
 * Covered:
 *   - base corpus: 279 patterns / 27 categories, all ids ^[a-z][a-z0-9-]*$,
 *     unique, every pattern has id/category/severity(1-3)/match/fix, kinds
 *     valid, no duplicate identical match strings per category
 *   - i18n corpora: data/rules.ru.js (36), data/rules.hi.js (33),
 *     data/rules.es.js (34); each references categories only in the merged
 *     universe; each appends exactly one new category (ru/hi/es-copy-tics)
 *   - the full merged corpus via loadRules: 382 patterns / 30 categories
 *   - zero pattern-id duplication across all four corpora
 *   - zero category-id duplication across all four corpora
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const base = require("../data/slop-patterns.js");
const ru = require("../data/rules.ru.js");
const hi = require("../data/rules.hi.js");
const es = require("../data/rules.es.js");
const { loadRules } = require("../src/rules-loader.js");
const { validateCorpus, ID_RE } = require("../scripts/check-corpus.js");

const ALL_CORPORA = [
  ["base", base],
  ["ru", ru],
  ["hi", hi],
  ["es", es],
];

const mergedCategorySet = new Set(
  ALL_CORPORA.flatMap(([, c]) => (c.categories || []).map((cat) => cat.id))
);
// loadRules rejects a pattern whose category is not declared in the
// extended corpus, so referencing base categories is fine here. Every
// shipped corpus must therefore be valid against the merged universe.
const VALID_KINDS = new Set(["word", "phrase", "regex"]);

function idsFor(c) {
  return (c.patterns || []).map((p) => p.id);
}

test("base corpus: 279 patterns / 27 categories, structurally valid", () => {
  const r = validateCorpus(base, "base", mergedCategorySet);
  assert.equal(r.count, 279);
  assert.equal(r.categoryCount, 27);
  assert.deepEqual(r.errors, []);
});

test("base corpus: every id matches ^[a-z][a-z0-9-]*$ and is unique", () => {
  const ids = idsFor(base);
  assert.equal(new Set(ids).size, ids.length, "ids unique");
  for (const id of ids) {
    assert.match(id, ID_RE, `id ${id}`);
  }
});

test("base corpus: every pattern has category, severity 1-3, non-empty match and suggestion", () => {
  for (const p of base.patterns) {
    assert.equal(typeof p.category, "string", `${p.id} category`);
    assert.ok(p.category.length > 0, `${p.id} category non-empty`);
    assert.ok([1, 2, 3].includes(p.severity), `${p.id} severity ${p.severity}`);
    assert.ok(typeof p.match === "string" && p.match.length > 0, `${p.id} match non-empty`);
    assert.ok(typeof p.fix === "string" && p.fix.length > 0, `${p.id} suggestion non-empty`);
    if (p.kind !== undefined) assert.ok(VALID_KINDS.has(p.kind), `${p.id} kind ${p.kind}`);
  }
});

test("base corpus: no duplicate identical match strings within a category", () => {
  const seen = new Map(); // `${category}\u0000${match}` -> id
  for (const p of base.patterns) {
    const key = `${p.category}\u0000${p.match}`;
    assert.ok(!seen.has(key), `duplicate match "${p.match}" in ${p.category} (${seen.get(key)}/${p.id})`);
    seen.set(key, p.id);
  }
});

test("i18n corpora: ru(36) hi(33) es(34) validate against the merged universe", () => {
  const expected = { ru: 36, hi: 33, es: 34 };
  for (const [name, corpus] of ALL_CORPORA.slice(1)) {
    const r = validateCorpus(corpus, name, mergedCategorySet);
    assert.equal(r.count, expected[name], `${name} pattern count`);
    assert.deepEqual(r.errors, [], `${name} structural errors`);
  }
});

test("i18n corpora: exactly one new category appended per corpus (+3 total)", () => {
  const expectedExtra = { ru: "ru-copy-tics", hi: "hi-copy-tics", es: "es-copy-tics" };
  for (const [name, corpus] of ALL_CORPORA.slice(1)) {
    const declared = new Set((corpus.categories || []).map((c) => c.id));
    assert.ok(declared.has(expectedExtra[name]), `${name} declares ${expectedExtra[name]}`);
    // Only the one extra; all other referenced categories come from base.
    const referenced = new Set((corpus.patterns || []).map((p) => p.category));
    const nonBase = [...referenced].filter((c) => !base.categories.some((b) => b.id === c));
    assert.deepEqual([...nonBase], [expectedExtra[name]], `${name} referenced categories`);
  }
});

test("merged corpus: 382 patterns / 30 categories with zero id duplication", () => {
  // The merge is the real product surface (loadRules deep-merges base + all
  // i18n corpora); the merged corpus must carry every pattern exactly once.
  const merged = loadRules("data/rules.ru.js,data/rules.hi.js,data/rules.es.js");
  assert.equal(merged.patterns.length, 382);
  assert.equal(merged.categories.length, 30);

  const ids = merged.patterns.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "merged ids unique");
  const catIds = merged.categories.map((c) => c.id);
  assert.equal(new Set(catIds).size, catIds.length, "merged category ids unique");
});

test("cross-file: zero pattern-id duplication across all four corpora", () => {
  const seen = new Map(); // id -> corpus name
  for (const [name, corpus] of ALL_CORPORA) {
    for (const id of idsFor(corpus)) {
      assert.ok(!seen.has(id), `id ${id} in ${name} duplicates ${seen.get(id)}`);
      seen.set(id, name);
    }
  }
  assert.equal(seen.size, 382, "382 unique ids across all four corpora");
});

test("cross-file: zero category-id duplication across all four corpora", () => {
  const seen = new Map();
  for (const [name, corpus] of ALL_CORPORA) {
    for (const c of corpus.categories || []) {
      assert.ok(!seen.has(c.id), `category ${c.id} in ${name} duplicates ${seen.get(c.id)}`);
      seen.set(c.id, name);
    }
  }
  assert.equal(seen.size, 30, "30 unique category ids across all four corpora");
});