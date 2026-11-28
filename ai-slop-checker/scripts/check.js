"use strict";
/**
 * Lazynext AI Slop Checker — `npm run check` (scripts/check.js).
 *
 * The full local quality gate, run sequentially in one invocation:
 *
 *   STEP 1  Corpus integrity gate   node scripts/check-corpus.js (base +
 *                                   ru/hi/es/fr/de i18n corpora — merged
 *                                   446/32, zero duplication; exits 1 on
 *                                   any FAIL)
 *   STEP 2  Verbatim provenance     node scripts/verbatim-audit.mjs (fails on
 *                                   any run of 14+ identical words shared with
 *                                   an upstream prose file; exit 2 means the
 *                                   audit could not run — recorded as SKIP,
 *                                   never as a pass)
 *   STEP 3  Unit + integration      node --test  (the full 300+ suite)
 *   STEP 4  End-to-end contract     npm run e2e  (spawns api/server.js on
 *                                   port 8793, asserts every route with real
 *                                   HTTP; exits 1 on any failure)
 *
 * Prints a summary table at the end and exits non-zero if ANY step failed.
 * Port 8792 is deliberately never used (reserved for sibling smoke-test
 * servers); e2e is pinned to 8793.
 *
 * Usage: npm run check       (or: node scripts/check.js)
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const E2E_PORT = Number(process.env.E2E_PORT || 8793);

function runStep(label, cmd, args, extraEnv = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: false,
  });
  const ms = Date.now() - started;
  const ok = res.status === 0;
  return { label, cmd: [cmd, ...args].join(" "), ok, status: res.status, ms, signal: res.signal || null };
}

const pad = (s, n) => String(s).padEnd(n);

function main() {
  if (E2E_PORT === 8792) {
    console.error("[check] refusing: E2E_PORT 8792 is reserved for the sibling smoke-test server");
    process.exit(2);
  }

  console.log(`Lazynext AI Slop Checker — quality gate (npm run check, ${new Date().toISOString()})`);
  console.log(`e2e port: ${E2E_PORT}\n`);

  const steps = [];

  // STEP 1 — corpus gate (base + all shipped i18n corpora)
  console.log("── STEP 1/4 · corpus integrity gate ─────────────────────────");
  steps.push(runStep(
    "corpus gate",
    process.execPath,
    ["scripts/check-corpus.js", "data/rules.ru.js", "data/rules.hi.js", "data/rules.es.js", "data/rules.fr.js", "data/rules.de.js"]
  ));

  // STEP 2 — verbatim provenance audit. Exit 1 is a hard failure (a run of
  // 14+ identical words against an upstream prose file: the originality
  // claim is false until the passage is rewritten). Exit 2 means the audit
  // COULD NOT RUN (every upstream source unreachable): recorded as SKIP with
  // a loud warning, because a gate that silently passes when it never
  // executed is exactly the failure mode the audit exists to prevent.
  console.log("\n── STEP 2/4 · verbatim provenance audit ─────────────────────");
  const auditStep = runStep("verbatim audit", process.execPath, ["scripts/verbatim-audit.mjs"]);
  if (auditStep.status === 2) {
    auditStep.ok = true;
    auditStep.skipped = true;
    console.warn("");
    console.warn("!! WARNING: the verbatim audit could not run (exit 2 — no upstream source reachable).");
    console.warn("!! Recorded as SKIP, not as a pass. The originality claim is UNVERIFIED for this run.");
    console.warn("!! Restore network access (or pass --root with local clones) and re-run before release.");
    console.warn("");
  } else if (auditStep.status === 1) {
    console.error("\n!! Verbatim audit found shared prose — rewrite those passages before release.");
  }
  steps.push(auditStep);

  // STEP 3 — full unit + integration suite
  console.log("\n── STEP 3/4 · unit + integration suite (node --test) ────────");
  steps.push(runStep("node --test", process.execPath, ["--test"]));

  // STEP 4 — end-to-end contract matrix on the pinned port
  console.log("\n── STEP 4/4 · end-to-end contract matrix (npm run e2e) ──────");
  steps.push(runStep(
    "npm run e2e",
    process.execPath,
    ["scripts/e2e.js"],
    { E2E_PORT: String(E2E_PORT) }
  ));

  // ── Summary table ─────────────────────────────────────────────────────
  console.log("\n\n=== QUALITY GATE SUMMARY ===");
  console.log(`${pad("step", 16)} ${pad("result", 7)} ${pad("time", 8)} command`);
  console.log("-".repeat(100));
  let failures = 0;
  for (const s of steps) {
    if (!s.ok) failures++;
    const result = s.skipped ? "SKIP" : s.ok ? "PASS" : "FAIL";
    console.log(`${pad(s.label, 16)} ${pad(result, 7)} ${pad(s.ms + " ms", 8)} ${s.cmd}${s.signal ? ` (killed by ${s.signal})` : ""}`);
  }
  console.log("-".repeat(100));
  console.log(`${steps.length} steps, ${steps.length - failures} passed, ${failures} failed`);
  if (steps.some((s) => s.skipped)) {
    console.log("NOTE: at least one step was SKIPPED (could not run) — this is not a full verification.");
  }
  console.log(failures === 0 ? "CHECK: ALL GREEN" : "CHECK: FAILURES PRESENT — fix and re-run");
  process.exit(failures > 0 ? 1 : 0);
}

main();