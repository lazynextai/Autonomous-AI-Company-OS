"use strict";
/**
 * Soft-tell advisory scorer.
 *
 * Precision gate: every file in bench/corpus whose path contains "negative",
 * plus demo/clean.txt, must score zero signals. Labeled positives must fire
 * the detector they exist to show. The advisory score must not move the
 * scan score or the PASS|REVIEW|REFUSE verdict.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const soft = require("../src/soft-tells.js");
const { judgeReport } = require("../src/judge.js");
const { scanText } = require("../src/scanner.js");

const ROOT = path.join(__dirname, "..");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const POSITIVES = {
  "sentence-spread":
    "The platform helps teams move work forward today. The dashboard shows the metrics that matter most. The workflow keeps every active project on track. The report gives leaders one clear status view.",
  "parallel-clauses":
    "We reduce onboarding time for new hires, we reduce reporting work for managers, and we reduce handoff risk for operators.",
  "paragraph-shape": [
    "The rollout gives operators one queue and one owner. The rollout gives managers one number and one meeting.",
    "The support desk keeps a written record of each handoff. The support desk keeps a written record of each fix.",
    "In conclusion, the rollout gives every team the same operating picture and the same weekly decision.",
  ].join("\n\n"),
};

test("soft tells: clean corpus and demo/clean.txt fire nothing", () => {
  const files = walk(path.join(ROOT, "bench", "corpus")).filter((p) => p.includes("negative"));
  assert.ok(files.length >= 20, `expected the negative corpus, saw ${files.length}`);
  const fired = [];
  for (const file of files) {
    let text = fs.readFileSync(file, "utf8");
    if (file.endsWith(".html")) text = soft.plainTextFromHtml(text);
    const report = soft.scoreSoftTells(text);
    if (report.signals.length) fired.push(`${path.relative(ROOT, file)}:${report.signals.map((s) => s.id).join(",")}`);
  }
  const clean = soft.scoreSoftTells(fs.readFileSync(path.join(ROOT, "demo", "clean.txt"), "utf8"));
  assert.equal(clean.advisoryScore, 0);
  assert.deepEqual(clean.signals, []);
  assert.deepEqual(fired, []);
});

test("soft tells: each labeled positive fires its detector and stays advisory", () => {
  for (const [id, text] of Object.entries(POSITIVES)) {
    const report = soft.scoreSoftTells(text);
    assert.equal(report.drivesDeterministicScore, false, id);
    assert.equal(report.appliedToVerdict, false, id);
    assert.ok(report.advisoryScore > 0, id);
    assert.ok(report.signals.some((s) => s.id === id), `${id} missing in ${report.signals.map((s) => s.id).join(",")}`);
  }
});

test("soft tells: precision on the pinned set is 1 and beats recall when a positive is partial", () => {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const [id, text] of Object.entries(POSITIVES)) {
    const hit = soft.scoreSoftTells(text).signals.some((s) => s.id === id);
    if (hit) tp += 1;
    else fn += 1;
  }
  const negatives = [
    fs.readFileSync(path.join(ROOT, "demo", "clean.txt"), "utf8"),
    fs.readFileSync(path.join(ROOT, "bench", "corpus", "negative", "meeting-notes-01.txt"), "utf8"),
    fs.readFileSync(path.join(ROOT, "bench", "corpus", "negative", "tech-docs-01.txt"), "utf8"),
    fs.readFileSync(path.join(ROOT, "bench", "corpus", "negative", "product-copy-01.txt"), "utf8"),
  ];
  for (const text of negatives) {
    if (soft.scoreSoftTells(text).signals.length) fp += 1;
  }
  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);
  assert.equal(fp, 0);
  assert.equal(precision, 1);
  assert.ok(precision >= recall, `precision ${precision} should not lose to recall ${recall}`);
});

test("soft tells: judge attaches the advisory score without moving the verdict or the scan score", () => {
  const spread = POSITIVES["sentence-spread"];
  const scan = scanText(spread);
  const judged = judgeReport({ text: spread });
  assert.equal(judged.scan.score, scan.score);
  assert.equal(judged.summary.verdict, scan.matches.length ? "REVIEW" : "PASS");
  assert.equal(judged.softTells.drivesDeterministicScore, false);
  assert.equal(judged.softTells.appliedToVerdict, false);
  assert.ok(judged.softTells.signals.some((s) => s.id === "sentence-spread"));
  assert.match(require("../src/judge.js").formatJudge(judged), /SOFT TELLS/);
  assert.match(require("../src/judge.js").formatJudge(judged), /not part of the score or the verdict/);

  const project = judgeReport({ project: path.join(ROOT, "demo", "fixture-project") });
  assert.equal(project.softTells.advisoryScore, null);
  assert.match(project.softTells.skipped, /do not keep the source text/);
  assert.ok(project.summary.verdict === "PASS" || project.summary.verdict === "REVIEW" || project.summary.verdict === "REFUSE");
});

test("soft tells: epoch-setting preambles fire, near-miss scenery does not", () => {
  // Fires on the classic slop opener family.
  for (const text of [
    "In today's fast-paced world, teams need a better way to work.",
    "In today’s digital landscape, clarity decides who wins.",
    "In an ever-changing world, only the adaptable survive.",
    "in todays fast paced world everything moves quickly.",
  ]) {
    const hit = soft.preambleFamily(text);
    assert.ok(hit, `expected a hit for: ${text}`);
    assert.equal(hit.id, "preamble-cliche");
  }

  // Ordinary scenery must stay silent — this is the precision bar.
  for (const text of [
    "In today's market, buyers compare three vendors before they call.",
    "In this world, most teams ship weekly.",
    "The world is changing and our roadmap reflects that.",
    "Today we shipped the new report view.",
    "In an ever changing market we keep our pricing simple.",
  ]) {
    assert.equal(soft.preambleFamily(text), null, `expected silence for: ${text}`);
  }

  // The advisory layer must never touch the score or the verdict.
  const report = soft.scoreSoftTells("In today's fast-paced world, we must move faster.");
  assert.equal(report.drivesDeterministicScore, false);
  assert.equal(report.appliedToVerdict, false);
  assert.ok(report.signals.some((s) => s.id === "preamble-cliche"));
});

test("soft tells: judge-browser inlines the same source as src/soft-tells.js", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "soft-tells.js"), "utf8").trim();
  const browser = fs.readFileSync(path.join(ROOT, "src", "judge-browser.js"), "utf8");
  const start = browser.indexOf("/* BEGIN SOFT-TELLS */");
  const end = browser.indexOf("/* END SOFT-TELLS */");
  assert.ok(start > 0 && end > start);
  const inlined = browser.slice(start + "/* BEGIN SOFT-TELLS */".length, end).trim();
  assert.equal(inlined, source);
});

test("soft tells: same input is byte-identical, including the advisory block", () => {
  const a = JSON.stringify(soft.scoreSoftTells(POSITIVES["parallel-clauses"]));
  const b = JSON.stringify(soft.scoreSoftTells(POSITIVES["parallel-clauses"]));
  assert.equal(a, b);
});
