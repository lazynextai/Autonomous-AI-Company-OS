// Copy-quality gate — the worker-side rule table (2026-11-10).
//
// Pins three things:
//   1. the severity contract — `block` is an unsupported conformance claim and
//      is the ONLY blocking class; `warn` is a style tell and never blocks;
//   2. the false-positive floor — quoted claims, code fences, headings,
//      negations, disclaimers and honest "scan/check/improve" copy all pass;
//   3. parity with the Python module (`core/quality/copy_quality.py`) through
//      ONE shared fixture file, so the two implementations cannot drift.
//
// The module is lifted from src/copygate.ts, so these assertions run against
// the shipped rule table, not a copy of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule } from "./helpers/lift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(HERE, "fixtures", "copy-quality-cases.json"), "utf8"),
);

const gate = loadModule("copygate.ts", {}, [
  "COPY_RULES",
  "SLOP_PHRASES",
  "PUFFERY_PHRASES",
  "SLOP_WEIGHTS",
  "SLOP_RULE_CAPS",
  "SLOP_SCORE_THRESHOLD",
  "lintCopy",
  "blockingFindings",
  "warningFindings",
  "slopScore",
  "describeCopyFindings",
]);

const ids = (findings) => [...new Set(findings.map((f) => f.rule_id))].sort();

// --- the rule table -------------------------------------------------------
test("the rule table matches the shared fixture table exactly", () => {
  const actual = gate.COPY_RULES.map((r) => ({ id: r.id, severity: r.severity }));
  assert.deepEqual(actual, fixtures.rules);
  for (const rule of gate.COPY_RULES) assert.ok(rule.purpose.length > 20, `${rule.id} needs a purpose`);
});

test("exactly one rule class blocks, and it is the conformance claim", () => {
  const blocking = gate.COPY_RULES.filter((r) => r.severity === "block").map((r) => r.id);
  assert.deepEqual(blocking, ["claim-unsupported-conformance"]);
});

test("the slop phrase list is short and defensible", () => {
  assert.ok(gate.SLOP_PHRASES.length >= 8 && gate.SLOP_PHRASES.length <= 15,
    "a long phrase list flags competent copy — keep it short");
  assert.ok(gate.PUFFERY_PHRASES.length >= 8 && gate.PUFFERY_PHRASES.length <= 15,
    "the puffery list must stay in the same deliberate size range");
});

test("the two phrase lists do not overlap, so one match is one finding", () => {
  const slop = new Set(gate.SLOP_PHRASES.map((p) => p.toLowerCase()));
  const dupes = gate.PUFFERY_PHRASES.filter((p) => slop.has(p.toLowerCase()));
  assert.deepEqual(dupes, [], "an overlapping phrase would be scored twice for one tell");
});

// --- shared behaviour -----------------------------------------------------
for (const c of fixtures.cases) {
  test(`fixture: ${c.name}`, () => {
    const findings = gate.lintCopy(c.text);
    assert.deepEqual(ids(gate.blockingFindings(findings)), [...c.block].sort(),
      `${c.name}: blocking set`);
    assert.deepEqual(ids(gate.warningFindings(findings)), [...c.warn].sort(),
      `${c.name}: warning set`);
    // The score is in the shared fixture, so the Python twin is pinned to the
    // same number on the same text — a scoring change on one side fails here.
    assert.equal(gate.slopScore(findings), c.score, `${c.name}: slop score`);
    if (c.line) {
      const first = gate.blockingFindings(findings)[0];
      assert.ok(first, `${c.name}: expected a blocking finding`);
      assert.equal(first.line, c.line, `${c.name}: finding line`);
    }
  });
}

// --- severity semantics ---------------------------------------------------
test("a warn-only finding is returned but never blocks", () => {
  const findings = gate.lintCopy("In today's fast-paced world, we unlock the power of seamless integration.");
  assert.equal(findings.length > 0, true);
  assert.equal(gate.blockingFindings(findings).length, 0, "style tells must not block");
  assert.equal(gate.warningFindings(findings).length, findings.length);
});

test("a blocked claim names the rule, the line and the matched text", () => {
  const findings = gate.lintCopy("Intro line.\n\nOur site is WCAG 2.1 AA compliant.");
  const blocked = gate.blockingFindings(findings);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].rule_id, "claim-unsupported-conformance");
  assert.equal(blocked[0].line, 3);
  assert.equal(blocked[0].match, "WCAG 2.1 AA compliant");
  assert.equal(blocked[0].severity, "block");

  const message = gate.describeCopyFindings(blocked);
  assert.match(message, /L3 claim-unsupported-conformance/);
  assert.match(message, /WCAG 2.1 AA compliant/);
  assert.match(message, /third-party audit/, "the message must say how to fix it");
});

test("empty copy is clean", () => {
  assert.deepEqual(gate.lintCopy(""), []);
  assert.deepEqual(gate.lintCopy("   \n\n "), []);
});

test("findings are ordered by line, then table order", () => {
  const findings = gate.lintCopy(
    "Our site is WCAG 2.1 AA compliant.\n\nIn today's fast-paced world, we supercharge things.",
  );
  assert.deepEqual(findings.map((f) => f.line), [...findings.map((f) => f.line)].sort((a, b) => a - b));
  assert.equal(findings[0].rule_id, "claim-unsupported-conformance");
});

// --- slop score -----------------------------------------------------------
// The score is advisory in both runtimes: nothing blocks on it. What it has to
// be is (a) deterministic, (b) identical to the Python twin, and (c) 0 on the
// copy we already send. The shared fixtures pin (b) case by case; these pin
// the properties that justify the weighting.

test("competent product copy scores 0", () => {
  const clean = [
    "Scan any page and find WCAG 2.1 AA issues in seconds.",
    "Pro adds site crawls, daily monitoring and shareable reports for $9/mo.",
    "Our scanner renders the page, so contrast is measured as painted.",
    "Cancel any time; the 14-day trial needs a card up front.",
  ];
  for (const text of clean) assert.equal(gate.slopScore(gate.lintCopy(text)), 0, text);
});

test("one tell can never reach the threshold", () => {
  // The heaviest single finding is 20 (the not-just frame); the threshold is 60.
  const heaviest = gate.lintCopy("It's not just a scan, it's an audit.");
  assert.equal(gate.slopScore(heaviest), 20);
  assert.ok(gate.slopScore(heaviest) < gate.SLOP_SCORE_THRESHOLD);
});

test("the score is capped at 100 however much slop is present", () => {
  // Synthetic findings, because the per-rule caps mean no realistic document
  // can reach 100 through one rule — which is the point of the caps, so the
  // clamp is asserted directly rather than through text.
  const many = Array.from({ length: 10 }, (_, i) => ({
    rule_id: "slop-empty-phrase", severity: "warn", line: i + 1, match: "x", why: "x",
  }));
  const puffery = Array.from({ length: 10 }, (_, i) => ({
    rule_id: "slop-puffery", severity: "warn", line: i + 1, match: "y", why: "y",
  }));
  const frame = Array.from({ length: 3 }, (_, i) => ({
    rule_id: "slop-not-just-x-its-y", severity: "warn", line: i + 1, match: "z", why: "z",
  }));
  // 45 + 24 + 40 = 109 → clamped.
  assert.equal(gate.slopScore([...many, ...puffery, ...frame]), 100);
});

test("repetition is capped per rule, so length alone cannot inflate the score", () => {
  const weight = gate.SLOP_WEIGHTS["slop-puffery"];
  const cap = gate.SLOP_RULE_CAPS["slop-puffery"];
  const one = gate.slopScore(gate.lintCopy("We unleash it."));
  const atCap = gate.slopScore(gate.lintCopy(Array(cap).fill("We unleash it.").join("\n")));
  const past = gate.slopScore(gate.lintCopy(Array(cap * 5).fill("We unleash it.").join("\n")));
  assert.equal(one, weight);
  assert.equal(atCap, weight * cap);
  assert.equal(past, atCap, "past the cap, more repetitions must not add score");
});

test("a blocking claim contributes nothing to the style score", () => {
  // A legal risk is not a style number — folding it in would let a style
  // threshold imply a legal one, which is the confusion this module avoids.
  assert.equal(gate.slopScore(gate.lintCopy("Our platform is WCAG 2.1 AA compliant.")), 0);
});

test("the score is a pure function of the findings, in table order", () => {
  const text = "In today's fast-paced world we unleash synergy.";
  const a = gate.lintCopy(text);
  const b = gate.lintCopy(text);
  assert.equal(gate.slopScore(a), gate.slopScore(b));
  assert.deepEqual(a, b, "the gate must be deterministic end to end");
});

test("the documented threshold is exported and sits above any single tell", () => {
  assert.equal(gate.SLOP_SCORE_THRESHOLD, 60);
  const heaviest = Math.max(...Object.values(gate.SLOP_WEIGHTS));
  assert.ok(heaviest < gate.SLOP_SCORE_THRESHOLD, "no one tell may reach the threshold");
});

// --- the live nurture sequence must not start failing ---------------------
// SEQUENCE is the copy already in customers' inboxes (email 1 fires at lead
// capture; 2 and 3 follow at +3d/+7d). A gate that starts flagging it would
// silently cost the funnel, so it is pinned statically against the SHIPPED
// exports — both the copy constant and the rule table.
test("the live nurture SEQUENCE passes the gate with no blocking finding and score 0", () => {
  const svc = loadModule("services.ts", {}, ["SEQUENCE", "SEQ_DAYS"]);
  assert.equal(svc.SEQUENCE.length, 3, "three emails are live");
  assert.deepEqual(svc.SEQ_DAYS, [0, 3, 7]);

  for (const email of svc.SEQUENCE) {
    const findings = gate.lintCopy(`${email.subject}\n${email.html}`);
    assert.deepEqual(gate.blockingFindings(findings), [],
      `SEQUENCE "${email.subject}" must never block a send`);
    assert.deepEqual(gate.warningFindings(findings), [],
      `SEQUENCE "${email.subject}" should stay clean, not merely non-blocking`);
    assert.equal(gate.slopScore(findings), 0, `SEQUENCE "${email.subject}" slop score`);
  }
});

test("SEQUENCE copy is checked with the same subject+html shape the send route uses", () => {
  const src = readFileSync(join(HERE, "..", "src", "services.ts"), "utf8");
  assert.match(src, /lintCopy\(`\$\{String\(camp\.subject \?\? ""\)\}\\n\$\{String\(camp\.html \?\? ""\)\}`\)/,
    "the static test must scan the same text the route scans");
});
