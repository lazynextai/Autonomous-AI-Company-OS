"use strict";
/**
 * Lazynext AI Slop Checker — performance bench (Phase 5).
 *
 * Real wall-clock measurements with real inputs synthesized from the demo
 * fixtures (no fabricated numbers): a ~100KB realistic prose mix (clean
 * bakery prose + a slop-heavy paragraph repeated), a ~200KB HTML document,
 * a project scan over demo/fixture-project/, and a rewriter pass over the
 * 100KB text. Prints ms, input size, KB/ms throughput, and the verdict.
 *
 * Usage:
 *   node bench/perf.js             # measurements + table
 *   node bench/perf.js --json      # machine-readable rows
 *
 * Exit code: 0 (informational bench; numbers are for README's PERFORMANCE
 * section on this machine — macOS Apple Silicon).
 */

const fs = require("node:fs");
const path = require("node:path");

const { scanText, scanHtml, scanDesign } = require("../src/scanner.js");
const { scanProject } = require("../src/project-scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { kindFor } = require("../src/project-scanner.js");

const ROOT = path.join(__dirname, "..");

/** Build a realistic ~100KB prose mix: demo/clean.txt repeated + a slop-heavy
 *  paragraph mosaic so both the clean baseline and the tells are measured. */
function buildProseMix(targetBytes) {
  const clean = fs.readFileSync(path.join(ROOT, "demo", "clean.txt"), "utf8");
  const slop = fs.readFileSync(path.join(ROOT, "demo", "slop.txt"), "utf8");
  const block = `${clean}\n\n${slop}\n\n`;
  const repeats = Math.ceil(targetBytes / Buffer.byteLength(block));
  const out = block.repeat(repeats);
  return out.length > targetBytes ? out.slice(0, targetBytes) : out;
}

/** HTML document: prose paragraphs inside real markup + design-tell CSS. */
function buildHtml(targetBytes) {
  const clean = fs.readFileSync(path.join(ROOT, "demo", "clean.txt"), "utf8");
  const style =
    ".hero{background:linear-gradient(135deg,#6366f1,#a855f7)}" +
    ".card{border:1px solid #eee;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}" +
    ".badge{border-radius:9999px}" +
    ".feature{opacity:0}.reveal{transition:all .3s ease-in-out}" +
    "a:hover{transform:scale(1.05)}";
  const body = [];
  let size = 0;
  const preamble = `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>`;
  const postamble = "</body></html>";
  let i = 0;
  while (size < targetBytes - preamble.length - postamble.length) {
    const para = `<div class="card ${i % 3 === 0 ? "feature" : ""}"><h2>Section ${i}</h2><p>${clean.slice(0, 900)}</p></div>`;
    body.push(para);
    size += para.length;
    i++;
  }
  return preamble + body.join("\n") + postamble;
}

function formatKB(bytes) {
  return (bytes / 1024).toFixed(1);
}

function measure(fn, bytes, label) {
  const t0 = process.hrtime.bigint();
  const report = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const kbPerMs = bytes > 0 && ms > 0 ? bytes / 1024 / ms : 0;
  const verdict = report ? (report.verdict ?? report.summary?.verdict) : undefined;
  const score = report ? (report.score ?? report.summary?.score) : undefined;
  return {
    label,
    ms: Number(ms.toFixed(1)),
    inputKB: formatKB(bytes),
    kbPerMs: Number(kbPerMs.toFixed(2)),
    verdict: verdict ?? "—",
    score: score ?? null,
  };
}

function main(argv) {
  const jsonOut = argv.includes("--json");
  const prose = buildProseMix(100 * 1024);
  const html = buildHtml(200 * 1024);
  const fixtureDir = path.join(ROOT, "demo", "fixture-project");

  const rows = [
    measure(() => scanText(prose), prose.length, "scanText ~100KB prose mix"),
    measure(() => scanHtml(html), html.length, "scanHtml ~200KB HTML"),
    measure(() => scanProject(fixtureDir, { topFiles: 10 }), 0, "scanProject demo/fixture-project/"),
    measure(() => rewriteText(prose), prose.length, "rewriteText ~100KB prose mix"),
  ];

  if (jsonOut) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Lazynext AI Slop Checker — perf bench (${new Date().toISOString()})`);
  console.log("macOS Apple Silicon (arm64), Node " + process.version);
  console.log("");
  console.log(`${pad("bench", 34)} ${pad("ms", 9)} ${pad("input", 10)} ${pad("KB/ms", 7)} ${pad("verdict", 9)} score`);
  console.log("-".repeat(84));
  for (const r of rows) {
    console.log(
      `${pad(r.label, 34)} ${pad(r.ms, 9)} ${pad(r.inputKB + " KB", 10)} ${pad(r.kbPerMs, 7)} ${pad(r.verdict, 9)} ${r.score ?? "—"}`
    );
  }
  console.log("");
  console.log("Numbers measured on this machine; record them in README.md → PERFORMANCE.");
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { buildProseMix, buildHtml, measure, main };