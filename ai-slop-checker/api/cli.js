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
 */

const fs = require("node:fs");
const path = require("node:path");

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { scanProject } = require("../src/project-scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const corpus = require("../data/slop-patterns.js");

function usage() {
  console.log(
    [
      "Usage:",
      "  node api/cli.js <text>",
      "  node api/cli.js --file <path>",
      "  node api/cli.js --url <url>",
      "  node api/cli.js --json <text>",
      "  node api/cli.js --rewrite <text>",
      "  node api/cli.js --rules",
      "  node api/cli.js --dir <path> [--top <n>] [--json]",
      "",
      "Scans text/HTML/URLs/directories for AI slop and prints a summary.",
    ].join("\n")
  );
}

function format(report) {
  const lines = [
    `Engine:  ${report.engine} v${report.version}`,
    `Input:   ${report.input.type} (${report.input.length} chars)`,
    `Score:   ${report.score}/100`,
    `Verdict: ${report.verdict}${report.clean ? " — clean" : ""}`,
    `Matches: ${report.matches.length}`,
    "",
  ];
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

  if (args.includes("--rules")) {
    console.log(JSON.stringify(corpus.patterns.map((p) => ({ id: p.id, category: p.category, severity: p.severity })), null, 2));
    return 0;
  }

  const jsonOut = args.includes("--json");
  const rewriteOut = args.includes("--rewrite");

  const dirIdx = args.indexOf("--dir");
  if (dirIdx !== -1) {
    const dir = args[dirIdx + 1];
    let top = 10;
    const topIdx = args.indexOf("--top");
    if (topIdx !== -1) top = Number.parseInt(args[topIdx + 1], 10) || 10;
    try {
      const project = scanProject(dir, { topFiles: top });
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
    const report = scanText(input);
    if (jsonOut) return console.log(JSON.stringify(report, null, 2)), 0;
    console.log(format(report));
    return report.clean ? 0 : 2;
  }

  if (urlIdx !== -1) {
    const { fetchRemote } = require("./server.js");
    try {
      const remote = await fetchRemote(args[urlIdx + 1]);
      const report = scanHtml(remote.html);
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
  const report = scanText(text);

  if (rewriteOut) {
    const result = rewriteText(text);
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