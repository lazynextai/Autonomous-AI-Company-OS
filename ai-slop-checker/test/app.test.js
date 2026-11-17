"use strict";
/**
 * Web app UX regression tests (v1.4.1) — the failed-URL-scan fix.
 *
 * The verified flaw (real-browser smoke test): a failed URL scan left the
 * previous scan's results on screen with only an error line below the
 * buttons. This file locks the fix at the levels that can run in Node
 * with NO browser and NO DOM library:
 *
 *   1. parse-level — web/app.js is valid JS (new Function, like sw.js).
 *   2. pure-function level — the scan lifecycle state machine lives in
 *      the DOM-free `SlopAppState` helpers (exposed on window/globalThis
 *      by the script), exercised via a minimal vm load shim: START clears
 *      the results area, FAILURE is a distinct error state (never stale).
 *   3. structural wiring — `run()` calls the clear on START and the fail
 *      path calls the error-state renderer; the URL tab's CORS-aware tip
 *      string is preserved.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "web", "app.js");
const appSrc = fs.readFileSync(appPath, "utf8");

// Minimal load shim: enough for the IIFE to evaluate and expose
// SlopAppState without executing any DOM logic (init() never fires —
// DOMContentLoaded is never dispatched). No DOM library is used; the
// assertions target the pure state transitions only.
function loadAppState() {
  const sandbox = {
    console,
    window: {},
    fetch: () => Promise.resolve({ ok: false }),
    FileReader: function () {},
    document: {
      getElementById: () => ({}),
      addEventListener: () => {},
      createElement: () => ({}),
      querySelector: () => null,
      head: { appendChild: () => {} },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appSrc, sandbox, { filename: "app.js" });
  return sandbox.window.SlopAppState;
}

const CORS_TIP = "CORS";

test("web/app.js parses as a classic script", () => {
  assert.doesNotThrow(() => new Function(appSrc), "app.js must parse in a Node-only context");
});

test("web/app.js exposes the SlopAppState lifecycle helpers", () => {
  const S = loadAppState();
  assert.ok(S, "window.SlopAppState is exposed");
  assert.equal(typeof S.started, "function");
  assert.equal(typeof S.finished, "function");
  assert.equal(typeof S.failed, "function");
});

test("scan START state: results hidden, no error, never stale", () => {
  const S = loadAppState();
  const st = S.started();
  assert.equal(st.resultsHidden, true);
  assert.equal(st.error, null);
  assert.equal(st.staleReport, false, "START must not carry a stale report");
});

test("scan FAILURE state: distinct error state, never stale results", () => {
  const S = loadAppState();
  const err = S.failed("could not fetch URL (HTTP 403)");
  assert.equal(err.resultsHidden, false, "the error state is visible in the results area");
  assert.equal(err.staleReport, false, "FAILURE never presents stale results");
  assert.ok(err.error && err.error.length > 0, "the message is shown");
  assert.equal(err.heading, "Scan failed");
  assert.equal(err.score, "\u2014", "no fake score in the error state");
  assert.equal(err.retry, true, "a retry affordance is signalled");
});

test("scan FINISH state: fresh results, no error", () => {
  const S = loadAppState();
  const fin = S.finished({ score: 12 });
  assert.equal(fin.resultsHidden, false);
  assert.equal(fin.error, null);
  assert.equal(fin.staleReport, false);
  assert.equal(fin.report, true);
});

test("run() clears the previous results area on scan START", () => {
  // Structural lock: the fix calls the clear inside run() before any scan
  // work, and the fail path renders the distinct error state.
  assert.match(appSrc, /clearResultsArea\(\);/, "run() clears the results area at start");
  assert.ok(
    appSrc.indexOf("clearResultsArea)") < appSrc.indexOf(`const finishProject`),
    "the clear happens before any scan/finish work in run()"
  );
  assert.match(appSrc, /renderError\(|renderError\)/, "a distinct error-state renderer exists");
  assert.match(appSrc, /showError\(message\);\s*\n\s*renderError\(message/, "the fail path shows the inline line AND the error state");
  assert.match(appSrc, /hideRetryButton\(\)/, "fresh reports hide the retry affordance");
});

test("URL tab failure tip stays CORS-aware (never 'fixed' away)", () => {
  const tipLines = appSrc.match(/URL scan failed:[\s\S]*?CORS[^\n]*/);
  assert.ok(tipLines && tipLines.length > 0, "the CORS-aware tip survives in the URL fail message");
});

test("results area shows an error and a retry button, not stale content", () => {
  // The renderError body must clear the per-scan lists/preview: the stale
  // report would otherwise remain visible under the error header.
  assert.match(appSrc, /categoryList\.innerHTML = "";/, "categories cleared in the error state");
  assert.match(appSrc, /matchList\.innerHTML = "";/, "matches cleared in the error state");
  assert.match(appSrc, /els\.results\.hidden = st\.resultsHidden/, "error state controls the results section visibility");
});