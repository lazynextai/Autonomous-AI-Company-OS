"use strict";
/**
 * Lazynext AI Slop Checker — `npm run check` (scripts/check.js).
 *
 * The full local quality gate, run sequentially in one invocation:
 *
 *   STEP 1  Corpus integrity gate   node scripts/check-corpus.js (base +
 *                                   ru/hi/es i18n corpora — merged 382/30,
 *                                   zero duplication; exits 1 on any FAIL)
 *   STEP 2  Unit + integration      node --test  (the full 300+ suite)
 *   STEP 3  End-to-end contract     npm run e2e  (spawns api/server.js on
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
  return { label, cmd: [cmd, ...args].join(" "), ok, ms, signal: res.signal || null };
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
  console.log("── STEP 1/3 · corpus integrity gate ─────────────────────────");
  steps.push(runStep(
    "corpus gate",
    process.execPath,
    ["scripts/check-corpus.js", "data/rules.ru.js", "data/rules.hi.js", "data/rules.es.js"]
  ));

  // STEP 2 — full unit + integration suite
  console.log("\n── STEP 2/3 · unit + integration suite (node --test) ────────");
  steps.push(runStep("node --test", process.execPath, ["--test"]));

  // STEP 3 — end-to-end contract matrix on the pinned port
  console.log("\n── STEP 3/3 · end-to-end contract matrix (npm run e2e) ──────");
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
    console.log(`${pad(s.label, 16)} ${pad(s.ok ? "PASS" : "FAIL", 7)} ${pad(s.ms + " ms", 8)} ${s.cmd}${s.signal ? ` (killed by ${s.signal})` : ""}`);
  }
  console.log("-".repeat(100));
  console.log(`${steps.length} steps, ${steps.length - failures} passed, ${failures} failed`);
  console.log(failures === 0 ? "CHECK: ALL GREEN" : "CHECK: FAILURES PRESENT — fix and re-run");
  process.exit(failures > 0 ? 1 : 0);
}

main();