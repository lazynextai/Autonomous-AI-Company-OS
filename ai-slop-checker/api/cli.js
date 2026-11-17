"use strict";
/**
 * Lazynext AI Slop Checker — minimal CLI.
 *
 * Usage:
 *   node api/cli.js "text to check"
 *   node api/cli.js --file demo/slop.txt
 *   node api/cli.js --url https://example.com
 *   node api/cli.js --json "text"
 *   node api/cli.js --rewrite "We should utilize this tool."
 *   node api/cli.js --rules
 *   node api/cli.js --dir path/to/project       (project scan)
 *   node api/cli.js --dir path --top 20 --json  (project scan, more top files)
 *   node api/cli.js --profile strict <text>     (severity profile)
 *   node api/cli.js --snapshot snap.json        (rendered-tier checks)
 *   node api/cli.js --render https://example.com (collect + rendered checks, needs playwright)
 *   node api/cli.js --judge --file demo/slop.txt   (judgement checklist)
 *   node api/cli.js --judge --url https://example.com
 *   node api/cli.js --judge "text"                 (judge plain text)
 */

const fs = require("node:fs");
const path = require("node:path");

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { scanProject } = require("../src/project-scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { loadRules } = require("../src/rules-loader.js");
const { resolveProfile } = require("../data/profiles.js");
const corpus = require("../data/slop-patterns.js");

function usage() {
  console.log(
    [
      "Usage:",
      "  node api/cli.js <text>",
      "  node api/cli.js --profile <default|strict|lenient> <text>",
      "  node api/cli.js --file <path> [--profile <p>]",
      "  node api/cli.js --url <url> [--profile <p>]",
      "  node api/cli.js --json <text>",
      "  node api/cli.js --rewrite <text>",
      "  node api/cli.js --rules",
      "  node api/cli.js --dir <path> [--top <n>] [--json] [--profile <p>]",
      "  node api/cli.js --snapshot <snapshot.json> [--profile <p>]",
      "  node api/cli.js --render <url> [--profile <p>]   (optional playwright collector)",
      "  node api/cli.js --judge --file <path> | --url <url> | --dir <path> | <text>",
      "                                     (judgement checklist: 5-question review,",
      "                                      craft-floor gate, refusal scaffolds, verdict)",
      "",
      "Scans text/HTML/URLs/directories/snapshots for AI slop and prints a summary.",
    ].join("\n")
  );
}

function format(report) {
  const len = report.input && (report.input.length ?? report.input.elements);
  const inputDesc = report.input
    ? report.input.type + (len !== undefined ? ` (${len}${report.input.elements !== undefined ? " elements" : " chars"})` : "")
    : "—";
  const lines = [
    `Engine:  ${report.engine} v${report.version}`,
    `Input:   ${inputDesc}`,
    report.profile ? `Profile: ${report.profile}` : null,
    `Score:   ${report.score}/100`,
    `Verdict: ${report.verdict}${report.clean ? " — clean" : ""}`,
    `Matches: ${report.matches.length}`,
    "",
  ].filter((l) => l !== null);
  for (const c of report.categories) {
    lines.push(`  ${c.name.padEnd(24)} ${String(c.count).padStart(3)} hit(s)  ${c.points} pts`);
  }
  lines.push("");
  for (const m of report.matches.slice(0, 20)) {
    lines.push(`  [${m.severity}] ${m.id.padEnd(28)} ${m.snippet}`);
  }
  if (report.matches.length > 20) lines.push(`  … and ${report.matches.length - 20} more`);
  return lines.join("\n");
}

function formatProject(project) {
  const s = project.summary;
  const lines = [
    `Engine:  ${project.engine} v${project.version}`,
    `Root:    ${project.root}`,
    `Files:   ${s.filesScanned} scanned, ${s.filesWithHits} with hits, ${s.filesSkipped} skipped`,
    `Matches: ${s.totalMatches} · ${s.totalPoints} pts`,
    `Score:   ${s.score}/100 (${s.verdict})`,
    "",
    `Top files (by slop points):`,
  ];
  const n = project.topFiles.length;
  for (let i = 0; i < n; i++) {
    const f = project.topFiles[i];
    lines.push(`  ${String(i + 1).padStart(2)}. ${f.file}  (${f.kind}, ${f.score}/100, ${f.points} pts, ${f.matches} matches)`);
  }
  if (s.filesWithHits > n) lines.push(`  … and ${s.filesWithHits - n} more files with hits`);
  lines.push("");
  if (project.categories.length) {
    lines.push("Category breakdown (pooled):");
    for (const c of project.categories) {
      lines.push(`  ${c.id.padEnd(22)} ${String(c.count).padStart(3)} hit(s)  ${c.points} pts`);
    }
  } else {
    lines.push("No slop signals found in this directory.");
  }
  return lines.join("\n");
}

async function main(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    return 0;
  }

  // --rules alone dumps the manifest; --rules <path|glob|list> loads
  // external rules and deep-merges them into the corpus for this scan.
  let engine = null; // null => built-in corpus
  let mergedCorpus = null;
  if (args.includes("--rules")) {
    const rulesIdx = args.indexOf("--rules");
    const next = args[rulesIdx + 1];
    const hasValue = next && !next.startsWith("--");
    if (!hasValue) {
      console.log(JSON.stringify(corpus.patterns.map((p) => ({ id: p.id, category: p.category, severity: p.severity })), null, 2));
      return 0;
    }
    try {
      mergedCorpus = loadRules(next);
      const scanner = require("../src/scanner.js");
      const rewriter = require("../src/rewriter.js");
      const scanEngine = scanner.createEngine(mergedCorpus);
      const rewriteEngine = rewriter.createRewriter(mergedCorpus, scanEngine);
      engine = {
        ...scanEngine,
        rewriteText: rewriteEngine.rewriteText,
        createPreview: rewriteEngine.createPreview,
        suggestionFor: rewriteEngine.suggestionFor,
      };
    } catch (err) {
      console.error(`error loading rules: ${err.message}`);
      return 1;
    }
    // Drop the --rules <value> pair from the args so the text positionals
    // and other flags parse normally.
    args.splice(rulesIdx, 2);
  }

  const jsonOut = args.includes("--json");
  const rewriteOut = args.includes("--rewrite");
  let profile;
  const profileIdx = args.indexOf("--profile");
  if (profileIdx !== -1) {
    const value = args[profileIdx + 1];
    if (!value || value.startsWith("--")) {
      console.error("error: --profile needs a value (default|strict|lenient)");
      return 1;
    }
    try {
      profile = resolveProfile(value).id;
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    args.splice(profileIdx, 2);
  }
  const scanText_ = (t) => (engine ? engine.scanText(t, { profile }) : scanText(t, { profile }));
  const scanHtml_ = (h) => (engine ? engine.scanHtml(h, { profile }) : scanHtml(h, { profile }));
  const scanProject_ = (dir, opts) =>
    scanProject(dir, { ...opts, ...(profile ? { profile } : {}), ...(engine ? { engine } : {}) });
  const rewriteText_ = engine ? engine.rewriteText : rewriteText;

  // --snapshot <file.json>: run the rendered-tier checks over a computed
  // snapshot (pure; no browser needed).
  const snapshotIdx = args.indexOf("--snapshot");
  if (snapshotIdx !== -1) {
    const file = args[snapshotIdx + 1];
    if (!file) {
      console.error("error: --snapshot needs a path to a snapshot JSON file");
      return 1;
    }
    let snapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    } catch (err) {
      console.error(`error: could not read snapshot: ${err.message}`);
      return 1;
    }
    const { scanRender } = require("../src/render-checks.js");
    let report;
    try {
      report = scanRender(snapshot, { profile });
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    if (jsonOut) return console.log(JSON.stringify(report, null, 2)), 0;
    console.log(format(report));
    return report.clean ? 0 : 2;
  }

  // --render <url>: collect a snapshot with the optional playwright
  // collector (needs `npm i -D playwright`), then run the checks.
  const renderIdx = args.indexOf("--render");
  if (renderIdx !== -1) {
    const url = args[renderIdx + 1];
    if (!url) {
      console.error("error: --render needs an http(s) URL");
      return 1;
    }
    const { collectRender } = require("../src/collect-render.js");
    const { scanRender } = require("../src/render-checks.js");
    let snapshot;
    try {
      snapshot = await collectRender(url);
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    let report;
    try {
      report = scanRender(snapshot, { profile });
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    if (jsonOut) return console.log(JSON.stringify({ url, ...report }, null, 2)), 0;
    console.log(`Collected ${snapshot.elements.length} elements from ${url}`);
    console.log(format(report));
    return report.clean ? 0 : 2;
  }

  // --judge: judgement checklist over --file / --url / --dir / positional text.
  // Exit codes: 0 = PASS, 1 = usage/IO error, 2 = REVIEW, 3 = REFUSE.
  const judgeMode = args.includes("--judge");
  if (judgeMode) {
    const { judgeReport, formatJudge } = require("../src/judge.js");
    const judgeIdx = args.indexOf("--judge");
    args.splice(judgeIdx, 1);
    const fileJ = args.indexOf("--file");
    const urlJ = args.indexOf("--url");
    const dirJ = args.indexOf("--dir");
    try {
      let report;
      if (fileJ !== -1) {
        const file = path.resolve(args[fileJ + 1]);
        const input = fs.readFileSync(file, "utf8");
        report = judgeReport({ text: input });
      } else if (urlJ !== -1) {
        const { fetchRemote } = require("./server.js");
        const remote = await fetchRemote(args[urlJ + 1]);
        report = judgeReport({ html: remote.html });
      } else if (dirJ !== -1) {
        report = judgeReport({ project: path.resolve(args[dirJ + 1]) });
      } else {
        const text = args.filter((a) => !a.startsWith("--")).join(" ");
        if (!text.trim()) {
          console.error("error: --judge needs a text argument, --file, --url, or --dir");
          return 1;
        }
        report = judgeReport({ text });
      }
      if (jsonOut) {
        console.log(JSON.stringify(report, null, 2));
        return report.summary.verdict === "PASS" ? 0 : report.summary.verdict === "REVIEW" ? 2 : 3;
      }
      console.log(formatJudge(report));
      return report.summary.verdict === "PASS" ? 0 : report.summary.verdict === "REVIEW" ? 2 : 3;
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
  }

  const dirIdx = args.indexOf("--dir");
  if (dirIdx !== -1) {
    const dir = args[dirIdx + 1];
    let top = 10;
    const topIdx = args.indexOf("--top");
    if (topIdx !== -1) top = Number.parseInt(args[topIdx + 1], 10) || 10;
    try {
      const project = scanProject_(dir, { topFiles: top });
      if (jsonOut) return console.log(JSON.stringify(project, null, 2)), 0;
      console.log(formatProject(project));
      return project.summary.score <= 9 ? 0 : 2;
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
  }

  const fileIdx = args.indexOf("--file");
  const urlIdx = args.indexOf("--url");

  if (fileIdx !== -1) {
    const file = path.resolve(args[fileIdx + 1]);
    const input = fs.readFileSync(file, "utf8");
    const report = scanText_(input);
    if (jsonOut) return console.log(JSON.stringify(report, null, 2)), 0;
    console.log(format(report));
    return report.clean ? 0 : 2;
  }

  if (urlIdx !== -1) {
    const { fetchRemote } = require("./server.js");
    try {
      const remote = await fetchRemote(args[urlIdx + 1]);
      const report = scanHtml_(remote.html);
      if (jsonOut) return console.log(JSON.stringify(report, null, 2)), 0;
      console.log(format(report));
      return report.clean ? 0 : 2;
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 1;
    }
  }

  // Plain text argument
  const text = args.filter((a) => !a.startsWith("--")).join(" ");
  const report = scanText_(text);

  if (rewriteOut) {
    const result = rewriteText_(text);
    if (jsonOut) {
      return console.log(JSON.stringify({ report, rewrite: result }, null, 2)), 0;
    }
    console.log(format(report));
    if (result.changed) {
      console.log("\nSafe auto-rewrite:");
      console.log(result.text);
      console.log("\nChanges:");
      for (const c of result.changes) console.log(`  - ${c.pattern}: "${c.before}" -> "${c.after}"`);
    } else {
      console.log("\nNo safe automatic rewrites (see fix suggestions in matches).");
    }
    return 0;
  }

  if (jsonOut) return console.log(JSON.stringify(report, null, 2)), 0;
  console.log(format(report));
  return report.clean ? 0 : 2;
}

if (require.main === module) {
  main(process.argv).then((code) => process.exit(code));
}

module.exports = { main, format, formatProject };