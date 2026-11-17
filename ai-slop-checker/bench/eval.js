"use strict";
/**
 * Lazynext AI Slop Checker — corpus quality benchmark (precision/recall gate).
 *
 * Runs the deterministic scanner over curated labelled corpora and reports
 * precision/recall/F1 by text-category family plus overall false-positive
 * rate on the negative corpus.
 *
 *   POSITIVE set  bench/corpus/positive/*.{txt,html}   — original short
 *                 slop samples (2-6 sentences), at least 2 per text family
 *                 (word-ban, filler-phrases, business-jargon,
 *                 throat-clearing, binary-contrast, weasel-attribution,
 *                 false-agency, passive-voice, meta-commentary,
 *                 vague-declarative, superficial-analysis,
 *                 rhetorical-setup, dramatic-fragment, negative-listing,
 *                 summary-recap) + ~6 design-positive HTML snippets.
 *   NEGATIVE set  bench/corpus/negative/*.{txt,html}   — original clean
 *                 prose (technical docs, product copy, academic-neutral,
 *                 narrative) + clean HTML, crafted to score low with no
 *                 intended tells.
 *   LANGUAGE      bench/corpus/positive-{fr,de}.md / negative-{fr,de}.md
 *                 — original i18n slop/clean samples scanned with the
 *                 merged base + data/rules.{fr,de}.js engines.
 *
 * Metrics per text family: hits on positives (recall proxy), hits on
 * negatives (false positives), per-family precision/recall/F1. Overall:
 * total matches, matches on positives, and the false-positive rate on the
 * negative corpus (file-level: negative files with >=1 match / total
 * negative files), shown as a percentage.
 *
 * GATE (the product-level contract): the negative-corpus FP rate must be
 * <= 5% (GATE_MAX_FPR). A family that exceeds it is reported explicitly
 * (with the offending negative filenames) so the responsible patterns can
 * be tightened — never deleted. i18n lines pass when the positive sample
 * fires and the clean sample scores 0 over the merged engine.
 *
 * Samples were authored in-repo for this benchmark (see docs/eval-report.md)
 * and are NOT taken from the five source projects.
 *
 * Usage:
 *   node bench/eval.js              # table + gate, exit 0/1
 *   node bench/eval.js --json       # machine-readable report
 *
 * Zero dependencies; Node >= 20. Pure helpers exported for tests.
 */

const fs = require("node:fs");
const path = require("node:path");

const { scanText, scanHtml, createEngine } = require("../src/scanner.js");
const { loadRules } = require("../src/rules-loader.js");

const ROOT = path.join(__dirname, "..");
const CORPUS_DIR = path.join(__dirname, "corpus");
const POSITIVE_DIR = path.join(CORPUS_DIR, "positive");
const NEGATIVE_DIR = path.join(CORPUS_DIR, "negative");

/** The product-level contract: negative-corpus FP rate must not exceed this. */
const GATE_MAX_FPR = 0.05;

/** Text-category families + the base categories each one maps to. */
const FAMILIES = [
  { id: "word-ban", categories: ["word-ban"] },
  { id: "filler-phrases", categories: ["filler-phrases"] },
  { id: "business-jargon", categories: ["business-jargon"] },
  { id: "throat-clearing", categories: ["throat-clearing"] },
  { id: "binary-contrast", categories: ["binary-contrast"] },
  { id: "weasel-attribution", categories: ["weasel-attribution"] },
  { id: "false-agency", categories: ["false-agency"] },
  { id: "passive-voice", categories: ["passive-voice"] },
  { id: "meta-commentary", categories: ["meta-commentary"] },
  { id: "vague-declarative", categories: ["vague-declarative"] },
  { id: "superficial-analysis", categories: ["superficial-analysis"] },
  { id: "rhetorical-setup", categories: ["rhetorical-setup"] },
  { id: "dramatic-fragment", categories: ["dramatic-fragment"] },
  { id: "negative-listing", categories: ["negative-listing"] },
  { id: "summary-recap", categories: ["summary-recap"] },
  { id: "design", categories: ["design-color", "design-type", "design-copy", "design-component", "design-motion", "design-layout"] },
];

const LANGUAGE_LINES = ["fr", "de"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for test/eval-harness.test.js)
// ---------------------------------------------------------------------------

/** Map a positive sample filename to its family id (prefix match), or null. */
function familyFromFilename(name) {
  for (const f of FAMILIES) {
    if (name.startsWith(`${f.id}-`)) return f.id;
  }
  return null;
}

/**
 * Compute precision/recall/F1 for one family.
 *   posHit: positive samples with >=1 match in the family (true positives)
 *   negHit: negative samples with >=1 match in the family (false positives)
 *   posTotal: positive samples labelled for the family
 * Returns { precision, recall, f1 } with null for undefined axes.
 */
function computeMetrics(posHit, negHit, posTotal) {
  const precision = posHit + negHit > 0 ? posHit / (posHit + negHit) : null;
  const recall = posTotal > 0 ? posHit / posTotal : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { precision, recall, f1 };
}

/** File-level FP rate: negative files with >=1 match / total negative files. */
function computeFpr(negativeFilesHit, negativeFilesTotal) {
  return negativeFilesTotal > 0 ? negativeFilesHit / negativeFilesTotal : 0;
}

/** The gate: FP rate on the negative corpus must be <= GATE_MAX_FPR. */
function gatePassed(fpr) {
  return fpr <= GATE_MAX_FPR;
}

// ---------------------------------------------------------------------------
// Corpus loading
// ---------------------------------------------------------------------------

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(txt|html?|md)$/i.test(e.name)) out.push(abs);
    }
  };
  walk(dir);
  return out.sort();
}

function scanSample(file, raw) {
  return /\.html?$/i.test(file) ? scanHtml(raw) : scanText(raw);
}

function loadSampleFile(abs) {
  const raw = fs.readFileSync(abs, "utf8");
  return { name: path.basename(abs), rel: path.relative(CORPUS_DIR, abs), raw, report: scanSample(abs, raw) };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function evaluateLanguage(lang) {
  const engine = createEngine(loadRules(`data/rules.${lang}.js`));
  const posPath = path.join(CORPUS_DIR, `positive-${lang}.md`);
  const negPath = path.join(CORPUS_DIR, `negative-${lang}.md`);
  const pos = engine.scanText(fs.readFileSync(posPath, "utf8"));
  const neg = engine.scanText(fs.readFileSync(negPath, "utf8"));
  return {
    lang,
    posHit: pos.matches.length > 0,
    posMatches: pos.matches.length,
    negHit: neg.matches.length > 0,
    negMatches: neg.matches.length,
    pass: pos.matches.length > 0 && neg.matches.length === 0,
  };
}

function evaluateAll() {
  const positives = listFiles(POSITIVE_DIR).map(loadSampleFile);
  const negatives = listFiles(NEGATIVE_DIR).map(loadSampleFile);

  const negativeHitFiles = new Set();
  const totalMatchesPerSample = (r) => r.report.matches.length;
  let totalMatches = 0;
  let matchesOnPositives = 0;
  for (const s of [...positives, ...negatives]) {
    totalMatches += totalMatchesPerSample(s);
    if (negatives.includes(s) && s.report.matches.length > 0) negativeHitFiles.add(s.name);
  }
  for (const s of positives) matchesOnPositives += totalMatchesPerSample(s);

  const familyRows = FAMILIES.map((f) => {
    const posSamples = positives.filter((s) => familyFromFilename(s.name) === f.id);
    const catSet = new Set(f.categories);
    const posHitSamples = posSamples.filter((s) => s.report.matches.some((m) => catSet.has(m.category)));
    const negHitSamples = negatives.filter((s) => s.report.matches.some((m) => catSet.has(m.category)));
    const posHit = posHitSamples.length;
    const negHit = negHitSamples.length;
    const metrics = computeMetrics(posHit, negHit, posSamples.length);
    return {
      family: f.id,
      categories: f.categories,
      positivesHit: posHit,
      positivesTotal: posSamples.length,
      negativesHit: negHit,
      negativeSamples: negHitSamples.map((s) => s.name),
      precision: metrics.precision,
      recall: metrics.recall,
      f1: metrics.f1,
    };
  });

  const negativeFilesTotal = negatives.length;
  const negativeFilesHit = negativeHitFiles.size;
  const fpRate = computeFpr(negativeFilesHit, negativeFilesTotal);

  const languageLines = LANGUAGE_LINES.map(evaluateLanguage);
  const gate = gatePassed(fpRate) && languageLines.every((l) => l.pass);

  const familiesWithFP = familyRows.filter((r) => r.negativesHit > 0);
  return {
    negativeFilesTotal,
    negativeFilesHit,
    fpRate,
    gate,
    gateMaxFpr: GATE_MAX_FPR,
    totalMatches,
    matchesOnPositives,
    familyRows,
    familiesWithFP,
    languageLines,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const pct = (n) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const num = (n) => (n === null || n === undefined ? "—" : n.toFixed(3));

function formatTable(evalResult) {
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [];
  const hdr = `${pad("family", 24)} ${pad("pos-hit", 9)} ${pad("neg-hit", 9)} ${pad("precision", 10)} ${pad("recall", 8)} ${pad("F1", 8)} verdict`;
  const rule = "-".repeat(78);
  lines.push(hdr, rule);
  for (const r of evalResult.familyRows) {
    const verdict = r.positivesHit > 0 && r.negativesHit === 0 ? "PASS" : r.negativesHit > 0 ? `FP:${r.negativeSamples.join(",")}` : "n/a";
    lines.push(
      `${pad(r.family, 24)} ${pad(`${r.positivesHit}/${r.positivesTotal}`, 9)} ${pad(String(r.negativesHit), 9)} ` +
        `${pad(pct(r.precision), 10)} ${pad(pct(r.recall), 8)} ${pad(num(r.f1), 8)} ${verdict}`
    );
  }
  lines.push(rule);
  return lines.join("\n");
}

function main(argv) {
  const jsonOut = argv.includes("--json");
  const result = evaluateAll();

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
    return result.gate ? 0 : 1;
  }

  console.log(`Lazynext AI Slop Checker — corpus quality benchmark (${new Date().toISOString()})`);
  console.log("samples authored in-repo; not from the 5 source projects");
  console.log("");
  console.log("── per-family precision/recall/F1 ─────────────────────────────");
  console.log(formatTable(result));
  console.log("");
  console.log("── i18n lines (merged base + data/rules.{fr,de}.js) ───────────");
  for (const l of result.languageLines) {
    console.log(
      `  ${l.lang.padEnd(4)} positive hits: ${l.posHit ? `yes (${l.posMatches} match${l.posMatches === 1 ? "" : "es"})` : "NO"}   ` +
        `negative FP: ${l.negHit ? `YES (${l.negMatches})` : "none"}   verdict: ${l.pass ? "PASS" : "FAIL"}`
    );
  }
  console.log("");
  console.log("── overall ────────────────────────────────────────────────────");
  console.log(`  total matches:          ${result.totalMatches}`);
  console.log(`  matches on positives:   ${result.matchesOnPositives}`);
  console.log(`  negative files:         ${result.negativeFilesTotal}`);
  console.log(`  negative files hit:     ${result.negativeFilesHit}`);
  console.log(`  FP rate on negatives:   ${(result.fpRate * 100).toFixed(1)}%  (gate <= ${(result.gateMaxFpr * 100).toFixed(0)}%)`);
  if (result.familiesWithFP.length > 0) {
    console.log("");
    console.log("  families with false positives (pattern tightening candidates):");
    for (const r of result.familiesWithFP) {
      console.log(`    - ${r.family}: neg-hit ${r.negativesHit} -> ${r.negativeSamples.join(", ")}`);
    }
  }
  console.log("");
  console.log(`GATE: ${result.gate ? "PASS" : "FAIL"}`);
  return result.gate ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  main,
  evaluateAll,
  evaluateLanguage,
  familyFromFilename,
  computeMetrics,
  computeFpr,
  gatePassed,
  FAMILIES,
  GATE_MAX_FPR,
  LANGUAGE_LINES,
};