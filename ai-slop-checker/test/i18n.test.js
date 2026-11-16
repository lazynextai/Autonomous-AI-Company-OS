"use strict";
/**
 * i18n corpora tests: both new sample corpora (data/rules.hi.js — Hindi,
 * data/rules.es.js — Spanish) fire on a sample in their script, score 0 on
 * the English clean demo, merge with ru without duplication, and keep
 * duplicate-id rejection working. The i18n path is the external-rules
 * mechanism (data/rules.ru.js pattern).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadRules } = require("../src/rules-loader.js");
const { createEngine } = require("../src/scanner.js");
const baseCorpus = require("../data/slop-patterns.js");

const BASE_COUNT = baseCorpus.patterns.length;
const BASE_CATS = baseCorpus.categories.length;

const EN_CLEAN =
  "The bakery opens at six. Maya sets the loaves on the counter in order " +
  "of size, largest first, and counts the receipts twice before the kettle boils.";

// ---------------------------------------------------------------------------
// Hindi
// ---------------------------------------------------------------------------

test("data/rules.hi.js: fires on Hindi slop, scores 0 on English clean, appends hi-copy-tics", () => {
  const merged = loadRules("data/rules.hi.js");
  const engine = createEngine(merged);
  assert.equal(merged.version, "1.0.0-hi");

  const hiSlop =
    "आज के डिजिटल युग में, व्यवसायों को अपनी प्रक्रियाओं को लेवरेज करना ही होगा। " +
    "यह बात ध्यान देने योग्य है कि सीमलेस अनुभव असली सफलता की कुंजी है। " +
    "विशेषज्ञों का कहना है कि यह क्रांतिकारी और अद्वितीय समाधान है। " +
    "अंत में हम यही कहना चाहेंगे कि आज के समय में यह बहुत ज़रूरी है।";
  const report = engine.scanText(hiSlop);
  assert.equal(report.clean, false, "Hindi slop must not be clean");
  assert.ok(report.score >= 30, `expected a firm Hindi score, got ${report.score}`);
  assert.ok(report.matches.some((m) => m.id === "hi-f-digital-yug"), "epoch opener fires");
  assert.ok(report.matches.some((m) => m.id === "hi-w-leverage"), "loanword leverage fires");
  assert.ok(report.matches.some((m) => m.id === "hi-w-krantikari"), "generic superlative fires");
  assert.ok(report.matches.some((m) => m.category === "hi-copy-tics"), "appended category fires");
  assert.ok(report.categories.some((c) => c.id === "hi-copy-tics"), "appended category reported");

  const enReport = engine.scanText(EN_CLEAN);
  assert.equal(enReport.clean, true, "English clean prose stays clean on the merged hi engine");
  assert.equal(enReport.matches.length, 0, "no false fires on clean English prose");
});

test("data/rules.hi.js: pattern count and category count when merged", () => {
  const merged = loadRules("data/rules.hi.js");
  const hiCount = require("../data/rules.hi.js").patterns.length;
  assert.ok(hiCount >= 15 && hiCount <= 40, `hi corpus within the 15-35-ish band (got ${hiCount})`);
  assert.equal(merged.patterns.length, BASE_COUNT + hiCount);
  assert.equal(merged.categories.length, BASE_CATS + 1);
});

// ---------------------------------------------------------------------------
// Spanish
// ---------------------------------------------------------------------------

test("data/rules.es.js: fires on Spanish slop, scores 0 on English clean, appends es-copy-tics", () => {
  const merged = loadRules("data/rules.es.js");
  const engine = createEngine(merged);
  assert.equal(merged.version, "1.0.0-es");

  const esSlop =
    "En un mundo cada vez más digital, es importante destacar que las empresas " +
    "deben apalancar sus procesos. Los expertos coinciden en que la transformación " +
    "digital y la inteligencia artificial son la clave del futuro. " +
    "En conclusión, cabe mencionar que se trata de una solución integral e innovadora " +
    "que aporta una experiencia seamless y excepcional.";
  const report = engine.scanText(esSlop);
  assert.equal(report.clean, false, "Spanish slop must not be clean");
  assert.ok(report.score >= 30, `expected a firm Spanish score, got ${report.score}`);
  assert.ok(report.matches.some((m) => m.id === "es-f-mundo-cada-vez"), "epoch opener fires");
  assert.ok(report.matches.some((m) => m.id === "es-w-apalancar"), "anglicism apalancar fires");
  assert.ok(report.matches.some((m) => m.id === "es-w-seamless"), "raw anglicism seamless fires");
  assert.ok(report.matches.some((m) => m.category === "es-copy-tics"), "appended category fires");
  assert.ok(report.categories.some((c) => c.id === "es-copy-tics"), "appended category reported");

  const enReport = engine.scanText(EN_CLEAN);
  assert.equal(enReport.clean, true, "English clean prose stays clean on the merged es engine");
  assert.equal(enReport.matches.length, 0, "no false fires on clean English prose");
});

test("data/rules.es.js: pattern count and category count when merged", () => {
  const merged = loadRules("data/rules.es.js");
  const esCount = require("../data/rules.es.js").patterns.length;
  assert.ok(esCount >= 15 && esCount <= 40, `es corpus within the 15-35-ish band (got ${esCount})`);
  assert.equal(merged.patterns.length, BASE_COUNT + esCount);
  assert.equal(merged.categories.length, BASE_CATS + 1);
});

// ---------------------------------------------------------------------------
// Merged ru + hi + es (all three external corpora)
// ---------------------------------------------------------------------------

test("merging ru + hi + es: 279 + ru + hi + es with no duplication", () => {
  const merged = loadRules("data/rules.ru.js,data/rules.hi.js,data/rules.es.js");
  const ruCount = require("../data/rules.ru.js").patterns.length;
  const hiCount = require("../data/rules.hi.js").patterns.length;
  const esCount = require("../data/rules.es.js").patterns.length;

  assert.equal(
    merged.patterns.length,
    BASE_COUNT + ruCount + hiCount + esCount,
    "every external pattern lands exactly once"
  );
  assert.equal(merged.categories.length, BASE_CATS + 3, "one new category per i18n corpus");
  assert.equal(new Set(merged.patterns.map((p) => p.id)).size, merged.patterns.length, "no duplicate ids in the merged set");

  const engine = createEngine(merged);
  const ruReport = engine.scanText(
    "В современном мире нельзя не отметить, что инновационный подход играет важную роль. " +
    "Эксперты считают, что синергия — это комплексное решение."
  );
  assert.ok(ruReport.matches.some((m) => m.id === "ru-w-sinergiya"));
  assert.equal(enCleanOnEngine(engine), true, "English clean stays clean on the fully merged engine");
});

test("i18n corpora are original files (not copies of each other)", () => {
  const ru = fs.readFileSync(path.join(__dirname, "..", "data", "rules.ru.js"), "utf8");
  const hi = fs.readFileSync(path.join(__dirname, "..", "data", "rules.hi.js"), "utf8");
  const es = fs.readFileSync(path.join(__dirname, "..", "data", "rules.es.js"), "utf8");
  // Distinct id prefixes prove they are hand-written corpora, not clones.
  assert.ok(ru.includes('id: "ru-'), "ru ids");
  assert.ok(hi.includes('id: "hi-'), "hi ids");
  assert.ok(es.includes('id: "es-'), "es ids");
  // And the .ru id set is entirely different from the new ones.
  const ruIds = new Set([...ru.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]));
  const hiIds = new Set([...hi.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]));
  const esIds = new Set([...es.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]));
  for (const id of hiIds) assert.ok(!ruIds.has(id), `hi id ${id} must not collide with ru`);
  for (const id of esIds) assert.ok(!ruIds.has(id), `es id ${id} must not collide with ru`);
  for (const id of esIds) assert.ok(!hiIds.has(id), `es id ${id} must not collide with hi`);
});

test("duplicate-id rejection still works after the i18n corpora exist", () => {
  // A hand-writer typo colliding with a base-corpus id must be rejected even
  // when merging next to an i18n corpus.
  const withHi = loadRules("data/rules.hi.js");
  const payload = { patterns: [{ id: "hi-w-leverage", category: "word-ban", severity: 2, kind: "word", match: "x", desc: "dup", fix: "dup" }] };
  assert.throws(() => loadRules(payload, { base: withHi }), /duplicate pattern id "hi-w-leverage"/);
  // And a duplicate of a base id in the same custom set is still rejected.
  const payload2 = { patterns: [{ id: "w-delve", category: "word-ban", severity: 2, kind: "word", match: "x", desc: "dup", fix: "dup" }] };
  assert.throws(() => loadRules(payload2), /duplicate pattern id "w-delve"/);
});

function enCleanOnEngine(engine) {
  const enReport = engine.scanText(EN_CLEAN);
  return enReport.clean && enReport.matches.length === 0;
}