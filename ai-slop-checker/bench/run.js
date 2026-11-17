"use strict";
/**
 * Lazynext AI Slop Checker — bench & dogfood runner.
 *
 * Scans the product's own docs and web assets with the engine and prints a
 * table (file, kind, score, matches, top category). `demo/slop.txt`,
 * `demo/clean.txt`, and `demo/fixture-project/` are TEST CONTROLS — they are
 * intentionally sloppy/clean fixtures and are never part of the dogfood fix
 * loop (they document the scanner, they are not product copy).
 *
 * Usage:
 *   node bench/run.js                  # scan the built-in corpus set
 *   node bench/run.js --json           # machine-readable rows
 *
 * Exit code: 0 (informational — this is a bench, not a lint gate).
 */

const fs = require("node:fs");
const path = require("node:path");

const { scanText, scanHtml, scanDesign } = require("../src/scanner.js");
const { kindFor } = require("../src/project-scanner.js");

const ROOT = path.join(__dirname, "..");

const BENCH_TARGETS = [
  "README.md",
  "ATTRIBUTIONS.md",
  "skill/SKILL.md",
  "skill/CLAUDE.md",
  "skill/references/visual-tells.md",
  "web/index.html",
  "web/app.js",
  "demo/clean.txt",
  "demo/slop.txt",
];

const MAX_BYTES = 512 * 1024;

function scanOne(rel, raw, baseName) {
  const kind = kindFor(path.join(ROOT, rel), baseName || rel);
  if (kind === "prose") return scanText(raw);
  if (kind === "markup") return scanHtml(raw);
  if (kind === "styles" || kind === "code") return scanDesign(raw);
  return scanText(raw); // fallback
}

function main(argv) {
  const jsonOut = argv.includes("--json");
  const rows = [];
  for (const rel of BENCH_TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      rows.push({ file: rel, kind: "missing", score: null, matches: null, topCategory: null, notes: "file not found" });
      continue;
    }
    const st = fs.statSync(abs);
    if (st.size > MAX_BYTES) {
      rows.push({ file: rel, kind: "too-large", score: null, matches: null, topCategory: null, notes: "skipped (>512KB)" });
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const kind = kindFor(abs, path.basename(rel)) || "prose";
    let report;
    try {
      report = scanOne(rel, raw, path.basename(rel));
    } catch (err) {
      rows.push({ file: rel, kind, score: null, matches: null, topCategory: null, notes: `error: ${err.message}` });
      continue;
    }
    const topCat = report.categories[0] ? `${report.categories[0].id} (${report.categories[0].count})` : "—";
    rows.push({
      file: rel,
      kind,
      score: report.score,
      verdict: report.verdict,
      matches: report.matches.length,
      topCategory: topCat,
      clean: report.clean,
      notes: report.clean ? "clean" : "needs review",
    });
  }

  if (jsonOut) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Lazynext AI Slop Checker — bench (${new Date().toISOString()})`);
  console.log("");
  console.log(`${pad("file", 34)} ${pad("kind", 7)} ${pad("score", 6)} ${pad("matches", 8)} top category`);
  console.log("-".repeat(80));
  for (const r of rows) {
    if (r.score === null) {
      console.log(`${pad(r.file, 34)} ${pad(r.kind, 7)} ${pad("—", 6)} ${pad("—", 8)} ${r.notes}`);
      continue;
    }
    console.log(`${pad(r.file, 34)} ${pad(r.kind, 7)} ${pad(r.score, 6)} ${pad(r.matches, 8)} ${r.topCategory}${r.clean ? "  (clean)" : ""}`);
  }
  console.log("");
  const scanned = rows.filter((r) => r.score !== null);
  const needsReview = scanned.filter((r) => !r.clean);
  console.log(`Scanned: ${scanned.length} file(s), ${needsReview.length} above the clean floor (score > 9).`);
  console.log("demo/* and demo/fixture-project/ are intentional test controls — excluded from the fix loop.");
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, BENCH_TARGETS, scanOne };