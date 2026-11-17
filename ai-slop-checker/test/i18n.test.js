"use strict";
/**
 * i18n corpora tests: the shipped sample corpora (data/rules.{ru,hi,es,fr,de}.js)
 * fire on a sample in their language, score 0 on the English clean demo,
 * merge without duplication, and keep duplicate-id rejection working. The
 * i18n path is the external-rules mechanism (data/rules.ru.js pattern).
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
// French
// ---------------------------------------------------------------------------

test("data/rules.fr.js: fires on French slop, scores 0 on English clean, appends fr-copy-tics", () => {
  const merged = loadRules("data/rules.fr.js");
  const engine = createEngine(merged);
  assert.equal(merged.version, "1.0.0-fr");

  const frSlop =
    "Dans le monde d'aujourd'hui, il est important de noter que les entreprises " +
    "doivent optimiser leurs processus. Il convient de souligner qu'une " +
    "transformation digitale et une solution intégrée apportent une réelle valeur ajoutée. " +
    "En conclusion, les experts s'accordent à dire que cette approche innovante " +
    "est révolutionnaire et offre une expérience utilisateur optimale.";
  const report = engine.scanText(frSlop);
  assert.equal(report.clean, false, "French slop must not be clean");
  assert.ok(report.score >= 30, `expected a firm French score, got ${report.score}`);
  assert.ok(report.matches.some((m) => m.id === "fr-f-monde-aujourdhui"), "epoch opener fires");
  assert.ok(report.matches.some((m) => m.id === "fr-w-innovant"), "generic superlative fires");
  assert.ok(report.matches.some((m) => m.category === "fr-copy-tics"), "appended category fires");
  assert.ok(report.categories.some((c) => c.id === "fr-copy-tics"), "appended category reported");

  const enReport = engine.scanText(EN_CLEAN);
  assert.equal(enReport.clean, true, "English clean prose stays clean on the merged fr engine");
  assert.equal(enReport.matches.length, 0, "no false fires on clean English prose");
});

test("data/rules.fr.js: pattern count and category count when merged", () => {
  const merged = loadRules("data/rules.fr.js");
  const frCount = require("../data/rules.fr.js").patterns.length;
  assert.ok(frCount >= 25 && frCount <= 40, `fr corpus within the 25-35-ish band (got ${frCount})`);
  assert.equal(merged.patterns.length, BASE_COUNT + frCount);
  assert.equal(merged.categories.length, BASE_CATS + 1);
});

// ---------------------------------------------------------------------------
// German
// ---------------------------------------------------------------------------

test("data/rules.de.js: fires on German slop, scores 0 on English clean, appends de-copy-tics", () => {
  const merged = loadRules("data/rules.de.js");
  const engine = createEngine(merged);
  assert.equal(merged.version, "1.0.0-de");

  const deSlop =
    "In der heutigen schnelllebigen Welt ist es wichtig zu erwähnen, dass " +
    "Unternehmen ihre Prozesse optimieren müssen. Experten sind sich einig, " +
    "dass diese innovative Lösung eine nahtlose Benutzererfahrung bietet. " +
    "Zusammenfassend lässt sich sagen, dass die digitale Transformation von " +
    "großer Bedeutung ist und Synergien wirklich Mehrwert schaffen.";
  const report = engine.scanText(deSlop);
  assert.equal(report.clean, false, "German slop must not be clean");
  assert.ok(report.score >= 30, `expected a firm German score, got ${report.score}`);
  assert.ok(report.matches.some((m) => m.id === "de-f-heutigen-schnelllebigen"), "epoch opener fires");
  assert.ok(report.matches.some((m) => m.id === "de-w-nahtlos"), "seamless calque fires");
  assert.ok(report.matches.some((m) => m.category === "de-copy-tics"), "appended category fires");
  assert.ok(report.categories.some((c) => c.id === "de-copy-tics"), "appended category reported");

  const enReport = engine.scanText(EN_CLEAN);
  assert.equal(enReport.clean, true, "English clean prose stays clean on the merged de engine");
  assert.equal(enReport.matches.length, 0, "no false fires on clean English prose");
});

test("data/rules.de.js: pattern count and category count when merged", () => {
  const merged = loadRules("data/rules.de.js");
  const deCount = require("../data/rules.de.js").patterns.length;
  assert.ok(deCount >= 25 && deCount <= 40, `de corpus within the 25-35-ish band (got ${deCount})`);
  assert.equal(merged.patterns.length, BASE_COUNT + deCount);
  assert.equal(merged.categories.length, BASE_CATS + 1);
});

// ---------------------------------------------------------------------------
// Merged ru + hi + es + fr + de (all five external corpora)
// ---------------------------------------------------------------------------

test("merging ru + hi + es + fr + de: 279 + all five with no duplication", () => {
  const merged = loadRules("data/rules.ru.js,data/rules.hi.js,data/rules.es.js,data/rules.fr.js,data/rules.de.js");
  const ruCount = require("../data/rules.ru.js").patterns.length;
  const hiCount = require("../data/rules.hi.js").patterns.length;
  const esCount = require("../data/rules.es.js").patterns.length;
  const frCount = require("../data/rules.fr.js").patterns.length;
  const deCount = require("../data/rules.de.js").patterns.length;

  assert.equal(
    merged.patterns.length,
    BASE_COUNT + ruCount + hiCount + esCount + frCount + deCount,
    "every external pattern lands exactly once"
  );
  assert.equal(merged.categories.length, BASE_CATS + 5, "one new category per i18n corpus");
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
  const fr = fs.readFileSync(path.join(__dirname, "..", "data", "rules.fr.js"), "utf8");
  const de = fs.readFileSync(path.join(__dirname, "..", "data", "rules.de.js"), "utf8");
  // Distinct id prefixes prove they are hand-written corpora, not clones.
  assert.ok(ru.includes('id: "ru-'), "ru ids");
  assert.ok(hi.includes('id: "hi-'), "hi ids");
  assert.ok(es.includes('id: "es-'), "es ids");
  assert.ok(fr.includes('id: "fr-'), "fr ids");
  assert.ok(de.includes('id: "de-'), "de ids");
  // And every new corpus's id set is disjoint from every other.
  const corpora = [
    ["ru", ru], ["hi", hi], ["es", es], ["fr", fr], ["de", de],
  ].map(([name, text]) => [name, new Set([...text.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]))]);
  for (let i = 0; i < corpora.length; i++) {
    for (let j = i + 1; j < corpora.length; j++) {
      const [nameA, idsA] = corpora[i];
      const [nameB, idsB] = corpora[j];
      for (const id of idsA) assert.ok(!idsB.has(id), `${nameA} id ${id} must not collide with ${nameB}`);
    }
  }
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
  // New corpora must reject dupes among themselves as well.
  const withFr = loadRules("data/rules.fr.js");
  const frPayload = { patterns: [{ id: "fr-w-seamless", category: "word-ban", severity: 2, kind: "word", match: "x", desc: "dup", fix: "dup" }] };
  assert.throws(() => loadRules(frPayload, { base: withFr }), /duplicate pattern id "fr-w-seamless"/);
});

function enCleanOnEngine(engine) {
  const enReport = engine.scanText(EN_CLEAN);
  return enReport.clean && enReport.matches.length === 0;
}