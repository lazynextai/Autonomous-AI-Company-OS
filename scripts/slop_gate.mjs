#!/usr/bin/env node
/**
 * Lazynext marketing slop gate — `node scripts/slop_gate.mjs`.
 *
 * Scans every user-facing marketing page with the product engine and fails on
 * a regression against a committed baseline. The baseline exists because an
 * absolute threshold would either be unreachable for legacy pages or useless
 * for new ones; the property worth protecting is "no page got worse".
 *
 * A regression is a score increase of MORE than TOLERANCE points. Score moves
 * down freely (that is the point). A new page with no baseline entry is
 * reported and does not fail the gate — but it must be committed with a
 * baseline before it can regress.
 *
 * Usage:
 *   node scripts/slop_gate.mjs                  # check against the baseline
 *   node scripts/slop_gate.mjs --update-baseline # rewrite the baseline
 *   node scripts/slop_gate.mjs --json            # machine-readable output
 *
 * Exit codes: 0 clean or improved, 1 regression, 2 the gate could not run.
 *
 * Zero dependencies. The engine is the product's own scanner (CommonJS), loaded
 * through createRequire because this file is ESM.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PUBLIC = join(ROOT, "marketing", "public");
const BASELINE_PATH = join(ROOT, "marketing", "slop-baseline.json");

/** A page may drift up by this much before it counts as a regression. */
const TOLERANCE = 3;

const require = createRequire(import.meta.url);

/** Find every .html file under marketing/public, recursively. */
function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

function loadEngine() {
  const candidates = [
    join(ROOT, "ai-slop-checker", "src", "scanner.js"),
    join(ROOT, "..", "ai-slop-checker", "src", "scanner.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const mod = require(p);
      if (typeof mod.scanHtml !== "function") {
        throw new Error(`${p} does not export scanHtml`);
      }
      return mod;
    }
  }
  throw new Error(
    "product engine not found — expected ai-slop-checker/src/scanner.js next to scripts/",
  );
}

function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update-baseline");
  const asJson = args.includes("--json");

  if (!existsSync(PUBLIC)) {
    console.error(`slop gate: marketing/public not found at ${PUBLIC}`);
    process.exit(2);
  }

  let engine;
  try {
    engine = loadEngine();
  } catch (err) {
    console.error(`slop gate: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const baseline = update
    ? {}
    : existsSync(BASELINE_PATH)
      ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")).pages ?? {}
      : null;

  if (!update && baseline === null) {
    console.error(
      `slop gate: no baseline at ${BASELINE_PATH}. ` +
        "Run `node scripts/slop_gate.mjs --update-baseline` and commit the result.",
    );
    process.exit(2);
  }

  const files = htmlFiles(PUBLIC);
  const rows = [];
  let regressions = 0;
  let errors = 0;

  for (const file of files) {
    const rel = relative(PUBLIC, file).split("\\").join("/");
    let score = null;
    let matches = null;
    try {
      const html = readFileSync(file, "utf8");
      const report = engine.scanHtml(html);
      score = report.score;
      matches = (report.matches || []).length;
    } catch (err) {
      errors += 1;
      rows.push({ page: rel, score: null, matches: null, error: String(err).slice(0, 160) });
      continue;
    }

    const prior = baseline[rel];
    const isNew = prior === undefined;
    const delta = isNew ? 0 : score - prior;
    const regressed = !isNew && delta > TOLERANCE;
    if (regressed) regressions += 1;
    rows.push({ page: rel, score, matches, baseline: prior ?? null, delta, isNew, regressed });
  }

  if (update) {
    const pages = {};
    for (const r of rows) if (r.score !== null) pages[r.page] = r.score;
    const payload = {
      $comment:
        "Baseline scores for marketing/public/*.html. Regenerate with `node scripts/slop_gate.mjs --update-baseline` after an intentional copy change, and review the diff before committing.",
      tolerance: TOLERANCE,
      generated: new Date().toISOString().slice(0, 10),
      pages,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    if (asJson) {
      console.log(JSON.stringify({ updated: true, count: Object.keys(pages).length, pages }));
    } else {
      console.log(`slop gate: wrote baseline for ${Object.keys(pages).length} page(s) to ${BASELINE_PATH}`);
    }
    return 0;
  }

  if (asJson) {
    console.log(JSON.stringify({ tolerance: TOLERANCE, regressions, errors, rows }, null, 2));
  } else {
    console.log(`Lazynext marketing slop gate — ${files.length} page(s), tolerance +${TOLERANCE}\n`);
    const w = Math.max(...rows.map((r) => r.page.length), 4) + 2;
    console.log(`${"PAGE".padEnd(w)}SCORE  BASE   DELTA  HITS  STATUS`);
    for (const r of rows) {
      const score = r.score === null ? "  --" : String(r.score).padStart(5);
      const base = r.baseline === null ? "   --" : String(r.baseline).padStart(5);
      const delta = r.isNew ? "   new" : (r.delta > 0 ? `  +${r.delta}` : `  ${r.delta}`).padStart(6);
      const hits = r.matches === null ? "   --" : String(r.matches).padStart(4);
      const status = r.error ? "ERROR" : r.regressed ? "REGRESSED" : r.isNew ? "new" : "ok";
      console.log(`${r.page.padEnd(w)}${score}  ${base}  ${delta}  ${hits}  ${status}`);
    }
    console.log("");
    if (regressions) {
      console.log(`REGRESSED: ${regressions} page(s) scored more than +${TOLERANCE}. Rewrite the copy, or run --update-baseline if the change was intentional.`);
    }
    if (errors) console.log(`ERRORS: ${errors} page(s) could not be scanned.`);
    if (!regressions && !errors) console.log("SLOP GATE: PASS — no page regressed.");
  }

  if (errors) return 2;
  return regressions ? 1 : 0;
}

process.exit(main());
