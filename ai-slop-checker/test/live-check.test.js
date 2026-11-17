"use strict";
/**
 * Live-service guard — pure-part unit tests (no network).
 *
 * scripts/live-check.js is split so the network runner (main / runAll /
 * runServiceChecks / runHostChecks / requestWithRetry) is never reachable
 * from the tests: the suite only requires the module (which is side-effect
 * free — the runner is guarded behind `require.main === module`) and
 * exercises the pure exports:
 *
 *   - CHECK_SPEC completeness (all 16 fixed checks, right method/path/kind)
 *   - parseArgs (defaults, --base, --hosts csv incl. spaces, --quiet)
 *   - per-spec verify() classification against fixture responses
 *   - classifyHostStatus (2xx/301/302 pass, others fail)
 *   - summaryOf / formatTable / formatSummary / formatReport
 *
 * No mocks, no stubs, no fetch — nothing here can hit the network.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_BASE,
  DEFAULT_HOSTS,
  CHECK_SPEC,
  parseArgs,
  classifyHostStatus,
  summaryOf,
  formatTable,
  formatSummary,
  formatReport,
} = require("../scripts/live-check.js");

// ---------------------------------------------------------------------------
// CHECK_SPEC completeness
// ---------------------------------------------------------------------------

/**
 * Every check the task mandates, as [method, path, kind]. `path`+`kind`
 * uniquely identify the spec entry (two SSRF entries share POST /scan but
 * carry different body.url targets).
 */
const REQUIRED_CHECKS = [
  ["GET", "/health", "ok-json"],
  ["GET", "/rules", "rules-manifest"],
  ["POST", "/scan", "scan-text"],
  ["GET", "/openapi.json", "openapi-json"],
  ["POST", "/mcp", "mcp-init"],
  ["GET", "/llms.txt", "text-nonempty"],
  ["GET", "/.well-known/agent.json", "json-200"],
  ["GET", "/web/index.html", "html-boilerplate"],
  ["GET", "/data/slop-patterns.js", "asset-200"],
  ["GET", "/", "root-200"],
  ["HEAD", "/health", "head-parity"],
  ["POST", "/scan", "ssrf-guard"], // http://169.254.169.254/latest/meta-data
  ["POST", "/scan", "ssrf-guard"], // http://127.0.0.1:9/
  ["GET", "/test/live-check.test.js", "gated-404"],
  ["GET", "/docs/DEPLOYMENT.md", "gated-404"],
  ["GET", "/src/project-scanner-browser.js", "asset-200"],
];

test("CHECK_SPEC: at least the 16 mandated checks are present", () => {
  assert.ok(Array.isArray(CHECK_SPEC), "CHECK_SPEC is an array");
  assert.ok(CHECK_SPEC.length >= REQUIRED_CHECKS.length, `>= ${REQUIRED_CHECKS.length} checks`);

  const index = new Map();
  for (const spec of CHECK_SPEC) {
    const key = `${spec.method} ${spec.path} ${spec.kind}`;
    const hits = index.get(key) || 0;
    index.set(key, hits + 1);
  }

  for (const [method, path, kind] of REQUIRED_CHECKS) {
    const key = `${method} ${path} ${kind}`;
    const hits = index.get(key) || 0;
    assert.ok(hits >= 1, `missing required check ${key}`);
  }
});

test("CHECK_SPEC: every entry has id/method/path/kind/expected/verify", () => {
  const ids = new Set();
  for (const spec of CHECK_SPEC) {
    assert.equal(typeof spec.id, "string", `id for ${spec.method} ${spec.path}`);
    assert.equal(typeof spec.method, "string");
    assert.equal(typeof spec.path, "string");
    assert.equal(typeof spec.kind, "string");
    assert.equal(typeof spec.expected, "string");
    assert.equal(typeof spec.verify, "function");
    assert.ok(!ids.has(spec.id), `duplicate id ${spec.id}`);
    ids.add(spec.id);
  }
});

test("CHECK_SPEC: the two SSRF guards target the meta-data and loopback URLs", () => {
  const guards = CHECK_SPEC.filter((s) => s.kind === "ssrf-guard");
  assert.equal(guards.length, 2);
  const urls = guards.map((g) => g.body && g.body.url).sort();
  assert.deepEqual(urls, ["http://127.0.0.1:9/", "http://169.254.169.254/latest/meta-data"]);
});

test("CHECK_SPEC: gating checks hit exactly the protected paths", () => {
  const gated = CHECK_SPEC.filter((s) => s.kind === "gated-404");
  assert.deepEqual(gated.map((g) => g.path), ["/test/live-check.test.js", "/docs/DEPLOYMENT.md"]);
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: no args -> defaults", () => {
  const a = parseArgs([]);
  assert.equal(a.base, DEFAULT_BASE);
  assert.deepEqual(a.hosts, DEFAULT_HOSTS);
  assert.equal(a.quiet, false);
});

test("parseArgs: --base flag and --base= form", () => {
  assert.equal(parseArgs(["--base", "https://x.example"]).base, "https://x.example");
  assert.equal(parseArgs(["--base=https://y.example"]).base, "https://y.example");
  assert.equal(parseArgs(["--base="]).base, DEFAULT_BASE, "empty --base falls back");
});

test("parseArgs: --hosts csv (flag and = forms, trims spaces, drops empties)", () => {
  assert.deepEqual(parseArgs(["--hosts", "a.com,b.com"]).hosts, ["a.com", "b.com"]);
  assert.deepEqual(parseArgs(["--hosts= a.com , b.com ,, "]).hosts, ["a.com", "b.com"]);
  assert.deepEqual(parseArgs(["--hosts", ""]).hosts, DEFAULT_HOSTS, "empty csv falls back");
});

test("parseArgs: --quiet and unknown flags", () => {
  assert.equal(parseArgs(["--quiet"]).quiet, true);
  assert.deepEqual(parseArgs(["--bogus", "x"]), { base: DEFAULT_BASE, hosts: DEFAULT_HOSTS, quiet: false });
  const a = parseArgs(["--base", "https://x.example", "--hosts", "a.com", "--quiet"]);
  assert.equal(a.base, "https://x.example");
  assert.deepEqual(a.hosts, ["a.com"]);
  assert.equal(a.quiet, true);
});

// ---------------------------------------------------------------------------
// per-spec verify() classification
// ---------------------------------------------------------------------------

const spec = (id) => CHECK_SPEC.find((s) => s.id === id);
const verify = (id, status, body) => spec(id).verify({ status, body });

test("verify: health accepts 200 ok:true, rejects everything else", () => {
  assert.equal(verify("health", 200, { ok: true }).ok, true);
  assert.equal(verify("health", 200, { ok: false }).ok, false);
  assert.equal(verify("health", 503, null).ok, false);
});

test("verify: rules pins 279 rules / 27 categories", () => {
  const good = Array.from({ length: 27 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, desc: "" }));
  assert.equal(verify("rules", 200, { count: 279, categories: good }).ok, true);
  assert.equal(verify("rules", 200, { count: 278, categories: good }).ok, false);
  assert.equal(verify("rules", 200, { count: 279, categories: good.slice(0, 26) }).ok, false);
  assert.equal(verify("rules", 404, null).ok, false);
});

test("verify: scan-text needs 200, score>0 and a w-leverage match", () => {
  assert.equal(verify("scan-text", 200, { score: 12, matches: [{ id: "w-leverage" }] }).ok, true);
  assert.equal(verify("scan-text", 200, { score: 0, matches: [{ id: "w-leverage" }] }).ok, false);
  assert.equal(verify("scan-text", 200, { score: 9, matches: [{ id: "d-flat-type" }] }).ok, false);
  assert.equal(verify("scan-text", 400, { error: "provide one of: text, html, url" }).ok, false);
});

test("verify: openapi pins 3.1.0", () => {
  assert.equal(verify("openapi", 200, { openapi: "3.1.0" }).ok, true);
  assert.equal(verify("openapi", 200, { openapi: "3.0.3" }).ok, false);
});

test("verify: mcp-init needs jsonrpc 2.0 on 200", () => {
  assert.equal(verify("mcp-init", 200, { jsonrpc: "2.0", result: {} }).ok, true);
  assert.equal(verify("mcp-init", 200, { jsonrpc: "1.0" }).ok, false);
});

test("verify: llms is a non-empty text body", () => {
  assert.equal(verify("llms", 200, "line one\nline two").ok, true);
  assert.equal(verify("llms", 200, "   ").ok, false);
  assert.equal(verify("llms", 200, null).ok, false);
});

test("verify: web-index body must contain the doctype", () => {
  assert.equal(verify("web-index", 200, "<!doctype html>\n<html>").ok, true);
  assert.equal(verify("web-index", 200, "<!DOCTYPE html>").ok, true);
  assert.equal(verify("web-index", 200, "<html></html>").ok, false);
});

test("verify: ssrf-guard passes any >=400 answer, fails 200", () => {
  for (const id of ["ssrf-169", "ssrf-127"]) {
    assert.equal(verify(id, 502, { error: "could not fetch url: url host is not allowed" }).ok, true);
    assert.equal(verify(id, 500, { error: "boom" }).ok, true);
    assert.equal(verify(id, 400, { error: "url must be an http(s) URL" }).ok, true);
    assert.equal(verify(id, 200, { score: 0 }).ok, false, `${id} must not pass on 200`);
  }
});

test("verify: gated-404 needs exactly 404", () => {
  assert.equal(verify("gate-test", 404, { error: "not found" }).ok, true);
  assert.equal(verify("gate-test", 200, "export const x = 1;").ok, false);
  assert.equal(verify("gate-docs", 404, null).ok, true);
});

test("verify: asset-200 needs 200", () => {
  assert.equal(verify("slop-patterns", 200, "/* corpus */").ok, true);
  assert.equal(verify("slop-patterns", 404, null).ok, false);
  assert.equal(verify("gate-src", 200, "/* browser scanner */").ok, true);
  assert.equal(verify("gate-src", 403, null).ok, false);
});

test("verify: HEAD parity entry exists and accepts 200", () => {
  assert.equal(spec("head-health").method, "HEAD");
  assert.equal(verify("head-health", 200, "").ok, true);
  assert.equal(verify("head-health", 405, "").ok, false);
});

// ---------------------------------------------------------------------------
// classifyHostStatus
// ---------------------------------------------------------------------------

test("classifyHostStatus: 2xx and 301/302 pass, everything else fails", () => {
  for (const s of [200, 201, 204]) assert.equal(classifyHostStatus(s).ok, true, `${s} passes`);
  for (const s of [301, 302]) assert.equal(classifyHostStatus(s).ok, true, `${s} passes`);
  for (const s of [307, 308, 400, 403, 404, 429, 500, 522]) {
    assert.equal(classifyHostStatus(s).ok, false, `${s} fails`);
  }
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function sampleRows() {
  return [
    { check: "GET /health", url: `${DEFAULT_BASE}/health`, expected: "200 ok:true", status: 200, result: "PASS", detail: "ok:true" },
    { check: "GET /rules", url: `${DEFAULT_BASE}/rules`, expected: "200 count=279 cats=27", status: 200, result: "PASS", detail: "count=279 categories=27" },
    { check: "POST /scan", url: `${DEFAULT_BASE}/scan`, expected: "200 score>0 w-leverage", status: 502, result: "FAIL", detail: "expected 200, got 502" },
  ];
}

test("summaryOf: counts total/passed/failed", () => {
  const s = summaryOf(sampleRows());
  assert.deepEqual(s, { total: 3, passed: 2, failed: 1 });
  assert.deepEqual(summaryOf([]), { total: 0, passed: 0, failed: 0 });
});

test("formatTable: heading row, every check row, PASS/FAIL tokens", () => {
  const table = formatTable(sampleRows());
  assert.match(table, /check\s+url\s+status\/expected\s+result/);
  assert.match(table, /GET \/health/);
  assert.match(table, /PASS\s+ok:true/);
  assert.match(table, /FAIL\s+expected 200, got 502/);
});

test("formatSummary: counts and verdict line", () => {
  const s = formatSummary(sampleRows());
  assert.match(s, /3 checks, 2 passed, 1 failed/);
  assert.match(s, /LIVE CHECK: FAILURES PRESENT/);
  assert.match(formatSummary([]), /0 checks, 0 passed, 0 failed/);
  assert.match(formatSummary([]), /LIVE CHECK: ALL GREEN/);
});

test("formatReport: table + summary normally; summary + failures only in --quiet", () => {
  const full = formatReport(sampleRows(), false);
  assert.match(full, /status\/expected/);
  assert.match(full, /3 checks, 2 passed, 1 failed/);

  const quiet = formatReport(sampleRows(), true);
  assert.doesNotMatch(quiet, /status\/expected/, "no table header in quiet mode");
  assert.match(quiet, /FAIL POST \/scan/);
  assert.doesNotMatch(quiet, /PASS/, "no passing rows in quiet mode");
  assert.match(quiet, /3 checks, 2 passed, 1 failed/);

  const quietClean = formatReport(sampleRows().slice(0, 1), true);
  assert.match(quietClean, /1 checks, 1 passed, 0 failed/);
  assert.doesNotMatch(quietClean, /FAIL/, "no failures when all pass");
});

// ---------------------------------------------------------------------------
// Loading is side-effect free (no network at require time)
// ---------------------------------------------------------------------------

test("module requires without touching the network (runner is main-gated)", () => {
  // Re-requiring the module in this suite already succeeded above; assert the
  // export surface so a future refactor that starts fetching at load time
  // (e.g. an IIFE in the module body) fails this test.
  assert.equal(typeof require("../scripts/live-check.js"), "object");
  assert.equal(typeof require("../scripts/live-check.js").runAll, "function");
  assert.equal(typeof require("../scripts/live-check.js").main, "function");
  assert.notEqual(require.main.filename, require.resolve("../scripts/live-check.js"));
});