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
  "lintCopy",
  "blockingFindings",
  "warningFindings",
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
});

// --- shared behaviour -----------------------------------------------------
for (const c of fixtures.cases) {
  test(`fixture: ${c.name}`, () => {
    const findings = gate.lintCopy(c.text);
    assert.deepEqual(ids(gate.blockingFindings(findings)), [...c.block].sort(),
      `${c.name}: blocking set`);
    assert.deepEqual(ids(gate.warningFindings(findings)), [...c.warn].sort(),
      `${c.name}: warning set`);
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
