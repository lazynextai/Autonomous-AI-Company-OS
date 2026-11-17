"use strict";
/**
 * Judge-mode tests (v1.4.1): judgeReport is deterministic, machine-built,
 * and honest about what the machine can and cannot verify.
 *
 *   - the 5-question review always ships 5 questions with hints + verdictHint
 *   - the craft floor ships 6 items; contrast + alignment are human
 *     checkboxes that can NEVER carry a machine verdict
 *   - floor items with machine evidence (d-* design patterns) flip REFUSE
 *     when flagged and "ok" when the evidence is absent
 *   - the verdict (PASS | REVIEW | REFUSE) uses ONLY machine-verifiable
 *     parts; same input → same report (determinism)
 *   - text input can never REFUSE (no design floor is machine-verifiable
 *     from plain text) — that is the honest boundary
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { judgeReport } = require("../src/judge.js");
const { scanText } = require("../src/scanner.js");

const SLOP_TEXT = "In today's fast-paced world, we must leverage our robust cutting-edge solution to unlock seamless growth.";
const CLEAN_TEXT = `The bakery opens at six. By five forty-five the oven room smells of yeast and
burnt sugar, and the first tray of sourdough comes out at six ten with a crust
that cracks when you touch it.`;

const GRADIENT_HTML = '<style>.hero{background-clip:text;-webkit-background-clip:text;color:transparent}</style><h1>Welcome</h1><p>We must leverage this.</p>';
const STAT_ROW_HTML = '<div><p>Join 10,000+ developers</p><p>24/7 uptime support</p></div>';
const BADGE_HTML = '<button class="rounded-full">beta</button><p class="rounded-full">New!</p>';

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test("judge: needs exactly one of text | html | project", () => {
  assert.throws(() => judgeReport({}), /needs one of/);
  assert.throws(() => judgeReport({ text: "a", html: "<p>b</p>" }), /exactly one of/);
  assert.throws(() => judgeReport({ text: 42 }), /text must be a string/);
  assert.throws(() => judgeReport({ html: 42 }), /html must be a string/);
  assert.throws(() => judgeReport({ project: "" }), /non-empty directory/);
});

// ---------------------------------------------------------------------------
// Report contract
// ---------------------------------------------------------------------------

test("judge: report shape — engine, 5 questions, 6 floor items, scaffolds, summary", () => {
  const r = judgeReport({ text: SLOP_TEXT });
  assert.equal(r.engine, "lazynext-ai-slop-checker-judge");
  assert.ok(r.version);
  assert.equal(r.input.type, "text");
  assert.equal(r.fiveQuestionReview.length, 5);
  for (const q of r.fiveQuestionReview) {
    assert.ok(q.question && q.question.length > 0, "question text");
    assert.ok(Array.isArray(q.hints) && q.hints.length >= 1, "hints");
    assert.ok(q.verdictHint && q.verdictHint.length > 0, "verdictHint");
    assert.ok(Array.isArray(q.signals), "signals array");
  }
  assert.equal(r.craftFloor.length, 6);
  assert.ok(Array.isArray(r.refusalScaffolds) && r.refusalScaffolds.length >= 3, "refusal scaffolds");
  assert.ok(r.summary.verdict && ["PASS", "REVIEW", "REFUSE"].includes(r.summary.verdict));
  assert.ok(Array.isArray(r.summary.reasons));
  assert.equal(r.summary.humanStepsRequired, true, "checklist is labelled as human steps");
  assert.ok(r.summary.note.includes("machine-verifiable"), "note states the machine-only computation boundary");
});

test("judge: cleanliness verdict matches the scanner (deterministic contract)", () => {
  const r = judgeReport({ text: CLEAN_TEXT });
  assert.equal(r.scan.clean, scanText(CLEAN_TEXT).clean);
  assert.equal(r.scan.score, scanText(CLEAN_TEXT).score);
  assert.equal(r.summary.verdict, "PASS", "clean text passes with no machine objections");
  assert.ok(r.summary.machineChecked.floorFlagged === 0);
});

test("judge: same input → byte-identical report (determinism)", () => {
  const a = JSON.stringify(judgeReport({ text: SLOP_TEXT }));
  const b = JSON.stringify(judgeReport({ text: SLOP_TEXT }));
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------
// Verdict logic — ONLY machine-verifiable parts
// ---------------------------------------------------------------------------

test("judge: sloppy text → REVIEW (copy objections; text cannot machine-check the design floor)", () => {
  const r = judgeReport({ text: SLOP_TEXT });
  assert.equal(r.summary.verdict, "REVIEW");
  assert.ok(r.summary.reasons.some((x) => /copy objections/.test(x)), "copy objection named");
  // No floor item may carry a machine verdict for a text input — the
  // design floor needs markup/styles/render, so all six are human steps.
  for (const f of r.craftFloor) {
    assert.equal(f.machine, "unchecked", "text input: no machine floor verdicts");
    assert.equal(f.humanCheckbox, true);
  }
  assert.equal(r.craftFloorMet, true, "unchecked floor items never fail the floor (machine-only boundary)");
});

test("judge: machine-checked floor item (gradient text) → REFUSE", () => {
  const r = judgeReport({ html: GRADIENT_HTML });
  assert.equal(r.summary.verdict, "REFUSE");
  const flags = r.craftFloor.filter((f) => f.machine === "flag");
  assert.ok(flags.some((f) => f.id === "no-decorative-effects"), "decorative effects flagged");
  assert.ok(r.summary.reasons.some((x) => /craft floor not met/.test(x)));
});

test("judge: stat-row + badges → REFUSE via no-fake-data", () => {
  const r = judgeReport({ html: STAT_ROW_HTML });
  assert.equal(r.summary.verdict, "REFUSE");
  const fake = r.craftFloor.find((f) => f.id === "no-fake-data");
  assert.equal(fake.machine, "flag");
  assert.ok((fake.evidence || []).includes("d-stat-row"));
});

test("judge: contrast and alignment NEVER carry a machine verdict", () => {
  for (const html of [GRADIENT_HTML, STAT_ROW_HTML, BADGE_HTML, "<p>clean</p>"]) {
    const r = judgeReport({ html });
    for (const id of ["contrast", "alignment"]) {
      const item = r.craftFloor.find((f) => f.id === id);
      assert.equal(item.machine, "unchecked", `${id} must stay a human checkbox on every input`);
      assert.equal(item.humanCheckbox, true);
      assert.ok(item.guidance && item.guidance.length > 0, "guidance present");
    }
  }
});

test("judge: clean html with no design tells → PASS (floor items machine-ok)", () => {
  const r = judgeReport({ html: "<main><h1>The bakery</h1><p>The oven room smells of yeast.</p></main>" });
  assert.equal(r.summary.verdict, "PASS");
  for (const f of r.craftFloor) {
    if (f.machine === "ok") assert.equal(f.evidence.length, 0);
  }
});

test("judge: project input → pooled verdict over real files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-judge-proj-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), SLOP_TEXT);
    fs.writeFileSync(path.join(dir, "page.html"), GRADIENT_HTML);
    const r = judgeReport({ project: dir });
    assert.equal(r.input.type, "project");
    assert.equal(r.input.dir, dir);
    assert.ok(r.input.filesScanned >= 2);
    assert.ok(r.summary.verdict === "REVIEW" || r.summary.verdict === "REFUSE", "sloppy fixture project is not PASS");
    // Deterministic across runs.
    const again = judgeReport({ project: dir });
    assert.equal(JSON.stringify(r), JSON.stringify(again));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});