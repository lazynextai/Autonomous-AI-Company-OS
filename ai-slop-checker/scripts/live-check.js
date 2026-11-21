"use strict";
/**
 * Lazynext AI Slop Checker — live-service guard (scripts/live-check.js).
 *
 * Zero-dependency Node >= 20 script that validates the DEPLOYED Worker
 * (https://slop-checker.lazynext.com by default) over real HTTP and exits
 * non-zero on ANY failure. Against production it is strictly read-only:
 * GET/HEAD probes plus the POSTs the service exists for (/scan text,
 * /mcp initialize) and two deliberately-blocked SSRF-guard url scans that
 * return guarded errors (no real upstream is ever touched). Sibling hosts
 * are only HEAD/GET-probed at their root — the guard never reaches
 * through to scan their content.
 *
 * Checks (CHECK_SPEC below, 16 fixed + one per --hosts entry):
 *   service surface  GET /health /rules /openapi.json /.well-known/agent.json
 *                    /llms.txt / /web/index.html /data/slop-patterns.js and
 *                    HEAD /health (HEAD parity)
 *   scan contract    POST /scan {"text": "We must leverage this robust solution."}
 *                    -> 200, score > 0, w-leverage fired
 *   MCP handshake    POST /mcp initialize -> 200, jsonrpc 2.0
 *   SSRF guard       POST /scan {"url":"http://169.254.169.254/..."} and
 *                    POST /scan {"url":"http://127.0.0.1:9/"} -> >= 400
 *   asset gating     /test/... and /docs/... -> 404; allowed /src/... -> 200
 *   sibling hosts    HEAD/GET on each --hosts host -> 2xx or 301/302
 *
 * Transient failures (network errors / edge 5xx classes) are retried up to
 * MAX_ATTEMPTS times with a short backoff; an HTTP answer from the worker
 * (200/400/404/429/502...) is a definitive result and is never re-sent.
 *
 * Pure helpers (parseArgs, CHECK_SPEC, verify, formatTable, formatSummary,
 * summaryOf) are exported for test/live-check.test.js and never touch the
 * network; main() is the only code path that fetches, and it runs only
 * under `require.main === module`.
 *
 * Usage:
 *   node scripts/live-check.js                        # default base + hosts
 *   node scripts/live-check.js --base https://host --hosts a.com,b.com
 *   node scripts/live-check.js --quiet                # summary + failures only
 */

const DEFAULT_BASE = "https://slop-checker.lazynext.com";
const DEFAULT_HOSTS = [
  "checker.lazynext.com",
  "api.lazynext.com",
  "app.lazynext.com",
  "lazynext.com",
];
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 800;
const REQUEST_TIMEOUT_MS = 15000;

const SLOP_TEXT = "We must leverage this robust solution.";
const SSRF_TARGETS = [
  { id: "ssrf-169", url: "http://169.254.169.254/latest/meta-data" },
  { id: "ssrf-127", url: "http://127.0.0.1:9/" },
];
const GATED_PATHS = ["/test/live-check.test.js", "/docs/DEPLOYMENT.md"];

// Cloudflare edge origin-connect failures — transient infrastructure 5xx
// that no worker handler ever produces (the worker's own 502s are real
// answers and are never retried).
const TRANSIENT_EDGE_CODES = new Set([522, 523, 524, 530]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ok(detail) {
  return { ok: true, detail };
}

function fail(detail) {
  return { ok: false, detail };
}

/**
 * The fixed service check matrix. Every entry carries a pure `verify` that
 * classifies { status, body } without any I/O — the same predicate the
 * runner uses against real responses and the tests use against fixtures.
 * `expected` is the human-readable contract shown in the table.
 *
 * Body convention (set by readBody): JSON responses arrive parsed; text
 * responses (text/plain, text/html, application/javascript, ...) arrive
 * as the raw string; unparseable JSON responses arrive as null.
 */
const CHECK_SPEC = [
  {
    id: "health",
    method: "GET",
    path: "/health",
    kind: "ok-json",
    expected: "200 ok:true",
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (!body || body.ok !== true) return fail("expected ok:true");
      return ok("ok:true");
    },
  },
  {
    id: "rules",
    method: "GET",
    path: "/rules",
    kind: "rules-manifest",
    expected: "200 count=279 cats=27",
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (!body || body.count !== 279) return fail(`expected count 279, got ${body && body.count}`);
      if (!Array.isArray(body.categories) || body.categories.length !== 27) {
        return fail(`expected 27 categories, got ${body && Array.isArray(body.categories) ? body.categories.length : body && body.categories}`);
      }
      return ok("count=279 categories=27");
    },
  },
  {
    id: "scan-text",
    method: "POST",
    path: "/scan",
    kind: "scan-text",
    expected: "200 score>0 w-leverage",
    body: { text: SLOP_TEXT },
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (!body || typeof body.score !== "number" || body.score <= 0) {
        return fail("expected a report with score > 0");
      }
      if (!Array.isArray(body.matches) || !body.matches.some((m) => m && m.id === "w-leverage")) {
        return fail("expected a w-leverage match");
      }
      return ok(`score=${body.score} w-leverage`);
    },
  },
  {
    id: "openapi",
    method: "GET",
    path: "/openapi.json",
    kind: "openapi-json",
    expected: "200 openapi 3.1.0",
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (!body || body.openapi !== "3.1.0") {
        return fail(`expected openapi 3.1.0, got ${body && body.openapi}`);
      }
      return ok("openapi 3.1.0");
    },
  },
  {
    id: "mcp-init",
    method: "POST",
    path: "/mcp",
    kind: "mcp-init",
    expected: "200 jsonrpc 2.0",
    body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (!body || body.jsonrpc !== "2.0") return fail("expected jsonrpc 2.0");
      return ok("jsonrpc 2.0");
    },
  },
  {
    id: "llms",
    method: "GET",
    path: "/llms.txt",
    kind: "text-nonempty",
    expected: "200 non-empty",
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (typeof body !== "string" || body.trim().length === 0) return fail("expected non-empty text");
      return ok(`${body.trim().split("\n").length} lines`);
    },
  },
  {
    id: "agent-card",
    method: "GET",
    path: "/.well-known/agent.json",
    kind: "json-200",
    expected: "200",
    verify: ({ status }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      return ok("200");
    },
  },
  {
    id: "web-index",
    method: "GET",
    path: "/web/index.html",
    kind: "html-boilerplate",
    expected: "200 <!doctype html",
    verify: ({ status, body }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      if (typeof body !== "string" || !/<!doctype html/i.test(body)) {
        return fail("expected <!doctype html");
      }
      return ok("<!doctype html");
    },
  },
  {
    id: "slop-patterns",
    method: "GET",
    path: "/data/slop-patterns.js",
    kind: "asset-200",
    expected: "200",
    verify: ({ status }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      return ok("200");
    },
  },
  {
    id: "root",
    method: "GET",
    path: "/",
    kind: "root-200",
    expected: "200",
    verify: ({ status }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      return ok("200");
    },
  },
  {
    id: "head-health",
    method: "HEAD",
    path: "/health",
    kind: "head-parity",
    expected: "200 (HEAD parity)",
    verify: ({ status }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      return ok("200");
    },
  },
  {
    id: SSRF_TARGETS[0].id,
    method: "POST",
    path: "/scan",
    kind: "ssrf-guard",
    expected: ">=400 blocked",
    body: { url: SSRF_TARGETS[0].url },
    verify: ({ status }) => {
      if (status >= 400) return ok(`blocked (${status})`);
      return fail(`expected >= 400, got ${status}`);
    },
  },
  {
    id: SSRF_TARGETS[1].id,
    method: "POST",
    path: "/scan",
    kind: "ssrf-guard",
    expected: ">=400 blocked",
    body: { url: SSRF_TARGETS[1].url },
    verify: ({ status }) => {
      if (status >= 400) return ok(`blocked (${status})`);
      return fail(`expected >= 400, got ${status}`);
    },
  },
  {
    id: "gate-test",
    method: "GET",
    path: GATED_PATHS[0],
    kind: "gated-404",
    expected: "404",
    verify: ({ status }) => {
      if (status !== 404) return fail(`expected 404, got ${status}`);
      return ok("404");
    },
  },
  {
    id: "gate-docs",
    method: "GET",
    path: GATED_PATHS[1],
    kind: "gated-404",
    expected: "404",
    verify: ({ status }) => {
      if (status !== 404) return fail(`expected 404, got ${status}`);
      return ok("404");
    },
  },
  {
    id: "gate-src",
    method: "GET",
    path: "/src/project-scanner-browser.js",
    kind: "asset-200",
    expected: "200",
    verify: ({ status }) => {
      if (status !== 200) return fail(`expected 200, got ${status}`);
      return ok("200");
    },
  },
];

// ---------------------------------------------------------------------------
// Pure CLI parsing
// ---------------------------------------------------------------------------

/**
 * Parse process arguments (default when given none). Supports:
 *   --base <url> | --base=<url>
 *   --hosts <csv> | --hosts=<csv>
 *   --quiet
 * Unknown flags are ignored. Empty --base/--hosts fall back to defaults.
 */
function parseArgs(argv = []) {
  const out = { base: DEFAULT_BASE, hosts: [...DEFAULT_HOSTS], quiet: false };
  const setHosts = (raw) => {
    const list = String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) out.hosts = list;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i] || DEFAULT_BASE;
    else if (a.startsWith("--base=")) out.base = a.slice("--base=".length) || DEFAULT_BASE;
    else if (a === "--hosts") setHosts(argv[++i]);
    else if (a.startsWith("--hosts=")) setHosts(a.slice("--hosts=".length));
    else if (a === "--quiet") out.quiet = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sibling-host classification (pure)
// ---------------------------------------------------------------------------

/** 2xx or a documented 3xx redirect (301/302) passes; everything else fails. */
function classifyHostStatus(status) {
  if (status >= 200 && status < 300) return ok(`${status}`);
  if (status === 301 || status === 302) return ok(`${status} redirect`);
  return fail(`expected 2xx/301/302, got ${status}`);
}

// ---------------------------------------------------------------------------
// Network runner (never invoked by the test suite)
// ---------------------------------------------------------------------------

async function readBody(res) {
  const text = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("json")) {
    try {
      return { text, body: JSON.parse(text) };
    } catch {
      return { text, body: null };
    }
  }
  return { text, body: text };
}

/**
 * One request with transient retry: fetch rejection (network/timeout) or an
 * edge origin-connect 5xx (522/523/524/530) retries up to MAX_ATTEMPTS with
 * BACKOFF_MS between. Any HTTP response from the worker is final — in
 * particular the SSRF guard's own 502s are the delivered answer, not
 * transient failures, so they are never re-sent.
 */
async function requestWithRetry(urlStr, opts) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(urlStr, {
        ...opts,
        redirect: opts.redirect || "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (TRANSIENT_EDGE_CODES.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`edge ${res.status}`);
        await sleep(BACKOFF_MS);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS);
    }
  }
  throw lastErr || new Error("request failed");
}

const UA = "LazynextSlopCheckerLiveCheck/1.4.5 (+https://lazynext.com)";

async function runServiceChecks(base) {
  const rows = [];
  for (const spec of CHECK_SPEC) {
    const urlStr = base + spec.path;
    const headers = { "User-Agent": UA };
    const init = { method: spec.method, headers };
    if (spec.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(spec.body);
    }
    try {
      const res = await requestWithRetry(urlStr, init);
      const { body } = await readBody(res);
      const verdict = spec.verify({ status: res.status, body });
      rows.push({
        id: spec.id,
        check: `${spec.method} ${spec.path}`,
        url: urlStr,
        expected: spec.expected,
        status: res.status,
        result: verdict.ok ? "PASS" : "FAIL",
        detail: verdict.detail,
      });
    } catch (err) {
      rows.push({
        id: spec.id,
        check: `${spec.method} ${spec.path}`,
        url: urlStr,
        expected: spec.expected,
        status: "ERR",
        result: "FAIL",
        detail: `${err.message} (${MAX_ATTEMPTS} attempts)`,
      });
    }
  }
  return rows;
}

/**
 * Sibling isolation: HEAD the host root first; fall back to GET only when
 * HEAD is refused (405/501/400 — the server wants GET) or the request
 * errors at the network/edge level. 2xx/301/302 passes; any other real
 * code fails. Never scans content.
 */
async function runHostChecks(hosts) {
  const rows = [];
  for (const host of hosts) {
    const urlStr = `https://${host}/`;
    let verdict = null;
    let status = null;
    let via = "HEAD";
    try {
      const res = await requestWithRetry(urlStr, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "manual" });
      status = res.status;
      if (status === 405 || status === 501 || status === 400) {
        via = "GET";
        const res2 = await requestWithRetry(urlStr, { method: "GET", headers: { "User-Agent": UA }, redirect: "manual" });
        status = res2.status;
      }
    } catch (err) {
      via = "HEAD";
      status = "ERR";
      rows.push({
        id: `host:${host}`,
        check: `${via} ${host}/`,
        url: urlStr,
        expected: "2xx/301/302",
        status,
        result: "FAIL",
        detail: err.message,
      });
      continue;
    }
    verdict = classifyHostStatus(status);
    rows.push({
      id: `host:${host}`,
      check: `${via} ${host}/`,
      url: urlStr,
      expected: "2xx/301/302",
      status,
      result: verdict.ok ? "PASS" : "FAIL",
      detail: verdict.detail,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Reporting (pure)
// ---------------------------------------------------------------------------

function summaryOf(rows) {
  const failed = rows.filter((r) => r.result !== "PASS").length;
  return { total: rows.length, passed: rows.length - failed, failed };
}

function formatTable(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [];
  lines.push(`${pad("check", 34)} ${pad("url", 64)} ${pad("status/expected", 34)} ${pad("result", 6)} detail`);
  lines.push("-".repeat(34 + 1 + 64 + 1 + 34 + 1 + 6 + 1 + 60));
  for (const r of rows) {
    lines.push(
      `${pad(r.check, 34)} ${pad(r.url, 64)} ${pad(`${r.status} / ${r.expected}`, 34)} ${pad(r.result, 6)} ${r.detail}`
    );
  }
  return lines.join("\n");
}

function formatSummary(rows) {
  const s = summaryOf(rows);
  const verdict =
    s.failed === 0 ? "LIVE CHECK: ALL GREEN" : "LIVE CHECK: FAILURES PRESENT — fix and re-run";
  return `${s.total} checks, ${s.passed} passed, ${s.failed} failed\n${verdict}`;
}

/** --quiet: summary line + failed rows only (each prefixed FAIL). */
function formatReport(rows, quiet = false) {
  if (quiet) {
    const s = summaryOf(rows);
    const lines = [`${s.total} checks, ${s.passed} passed, ${s.failed} failed`];
    for (const r of rows) {
      if (r.result !== "PASS") {
        lines.push(`FAIL ${r.check} ${r.url} ${r.status} / ${r.expected} — ${r.detail}`);
      }
    }
    lines.push(s.failed === 0 ? "LIVE CHECK: ALL GREEN" : "LIVE CHECK: FAILURES PRESENT — fix and re-run");
    return lines.join("\n");
  }
  return `${formatTable(rows)}\n\n${formatSummary(rows)}`;
}

// ---------------------------------------------------------------------------
// Orchestrator + entry point
// ---------------------------------------------------------------------------

async function runAll(args) {
  const serviceRows = await runServiceChecks(args.base);
  const hostRows = await runHostChecks(args.hosts);
  return [...serviceRows, ...hostRows];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await runAll(args);
  console.log(
    `Lazynext AI Slop Checker — live-service guard (${new Date().toISOString()})\nbase: ${args.base}  hosts: ${args.hosts.join(",")}${args.quiet ? "  (quiet)" : ""}\n`
  );
  console.log(formatReport(rows, args.quiet));
  process.exit(summaryOf(rows).failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("live-check crashed:", err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_BASE,
  DEFAULT_HOSTS,
  MAX_ATTEMPTS,
  BACKOFF_MS,
  SLOP_TEXT,
  SSRF_TARGETS,
  GATED_PATHS,
  CHECK_SPEC,
  parseArgs,
  classifyHostStatus,
  summaryOf,
  formatTable,
  formatSummary,
  formatReport,
  runAll,
  main,
};