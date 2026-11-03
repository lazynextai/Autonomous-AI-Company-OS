// Scan-provenance regression: the funnel must distinguish raw scan VOLUME
// from OUTSIDE traffic, and the benchmark corpus must refuse the junk the
// 2026-11-03 audit proved it was accepting (our own hosts, reserved test
// domains, malformed hostnames from pasted URL lists).
//
// The shipped implementations are lifted out of src/billing.ts,
// src/scanprovenance.ts and (when the product checkout is present)
// products/accessibility-checker/src/scan_pipeline.js and transpiled, so these
// tests cannot drift from what actually ships.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const workerSrc = join(here, "../src");
const billingSrc = readFileSync(join(workerSrc, "billing.ts"), "utf8");
const provenanceSrc = readFileSync(join(workerSrc, "scanprovenance.ts"), "utf8");
const indexSrc = readFileSync(join(workerSrc, "index.ts"), "utf8");

const transpile = (code) =>
  ts.transpileModule(code.replace(/^export /gm, ""), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

// --- src/scanprovenance.ts, whole module ---------------------------------
const provenanceJs = transpile(provenanceSrc);
const provenance = new Function(
  `${provenanceJs}; return { benchHost, isExternalScanUrl, countExternalReports, scanStatsHostViolation, countBySource, normalizeScanSource, SCAN_SOURCES };`,
)();
const { benchHost, isExternalScanUrl, countExternalReports, scanStatsHostViolation, countBySource, normalizeScanSource, SCAN_SOURCES } = provenance;

// --- src/billing.ts → handleBilling --------------------------------------
const billingImpl = billingSrc.match(/export async function handleBilling[\s\S]*?\n}/);
assert.ok(billingImpl, "handleBilling not found in src/billing.ts");
assert.match(
  billingSrc,
  /import \{ countExternalReports, countBySource \} from "\.\/scanprovenance";/,
  "handleBilling must use the shared provenance helpers, not a private copy",
);
const billingJs = transpile(billingImpl[0]);
const makeHandleBilling = (deps) =>
  new Function(
    "listAll",
    "json",
    "countExternalReports",
    "countBySource",
    `${billingJs}; return handleBilling;`,
  )(deps.listAll, deps.json, deps.countExternalReports, deps.countBySource);

const fakeJson = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// KV-shaped fake: `store` holds report:* records (and any other keys), and
// listAll returns {name} entries exactly like the real gateway helper.
const fakeEnv = (store) => ({
  API_TOKEN: "tok",
  EPHEMERAL: {
    __store: store,
    get: async (k) => (k in store ? store[k] : null),
    put: async (k, v) => void (store[k] = v),
  },
  DB: { prepare: () => ({ first: async () => ({ c: 0 }) }) },
});

const funnelDeps = (env) => ({
  listAll: async (_ns, prefix) =>
    Object.keys(env.EPHEMERAL.__store)
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name })),
  json: fakeJson,
  countExternalReports,
  countBySource,
});

const funnelRequest = () =>
  new Request("https://ai-company.test/api/v1/billing/funnel", {
    method: "GET",
    headers: { authorization: "Bearer tok" },
  });

const report = (url, src) => JSON.stringify({ score: 88, url, ts: Date.now(), plan: "free", ...(src ? { src } : {}) });

// ------------------------------------------------------------------------
// The host predicate
// ------------------------------------------------------------------------

// Every rejection case the audit proved was reaching (or would reach) the
// corpus. `null`/`''` stand for a pasted-HTML scan, which has no URL at all.
const OPERATOR_AND_JUNK_URLS = [
  null,
  "",
  "<html><body><h1>pasted</h1></body></html>",
  "https://lazynext.com",
  "https://lazynext.com/status",
  "https://checker.lazynext.com",
  "https://ai-company.lazynext.com",
  "https://lazynext.github.io",
  "https://lazynext-landing.github.io",
  "https://lazynext-ai.github.io/accessibility-checker/",
  "https://ai-company-os.dry-hall-6a50.workers.dev",
  "https://agent-forum.agent-forum-worker.workers.dev)",
  "https://agent-forum.agent-forum-worker.workers.dev),",
  "https://wellknown.network),",
  "https://example.com",
  "https://shop.example.org",
  "https://example.net",
  "https://foo.test",
  "https://foo.invalid",
  "https://printer.local",
  "http://localhost",
  "http://localhost:8080",
  "https://127.0.0.1",
  "https://127.0.0.1:9/callback",
  "https://10.0.0.5",
  "https://[::1]",
  "not a url",
];

for (const u of OPERATOR_AND_JUNK_URLS) {
  test(`benchHost rejects operator/junk scan source: ${JSON.stringify(u)}`, () => {
    assert.equal(benchHost(u), null);
    assert.equal(isExternalScanUrl(u), false);
  });
}

const EXTERNAL_URLS = [
  "https://www.corpusiq.io",
  "https://www.corpusiq.io/pricing",
  "https://en.wikipedia.org/wiki/Accessibility",
  "https://acme-shop.com",
  "https://sub.domain.co.uk/checkout?x=1#top",
  "http://example-shop.com",
];

for (const u of EXTERNAL_URLS) {
  test(`benchHost accepts external scan source: ${u}`, () => {
    assert.equal(isExternalScanUrl(u), true);
    assert.equal(benchHost(u), new URL(u).hostname.toLowerCase());
  });
}

// ------------------------------------------------------------------------
// Parity with the product worker's benchHost (canonical source of the rule).
// The product repo is a separate checkout; if it is absent (e.g. CI of this
// repo alone) the parity test is skipped rather than silently passing.
// ------------------------------------------------------------------------
const productPipeline = resolve(
  here,
  "../../products/accessibility-checker/src/scan_pipeline.js",
);

if (existsSync(productPipeline)) {
  const pSrc = readFileSync(productPipeline, "utf8");
  const hostRe = pSrc.match(/const HOSTNAME_RE = (.+);/);
  const benchFn = pSrc.match(/const benchHost = \(u\) => \{[\s\S]*?\n\};/);
  assert.ok(hostRe, "HOSTNAME_RE not found in the product scan_pipeline.js");
  assert.ok(benchFn, "benchHost not found in the product scan_pipeline.js");
  const productBenchHost = new Function(
    `const HOSTNAME_RE = ${hostRe[1]}; ${benchFn[0]}; return benchHost;`,
  )();

  test("platform benchHost and the product benchHost agree on every fixture", () => {
    for (const u of [...OPERATOR_AND_JUNK_URLS, ...EXTERNAL_URLS]) {
      assert.equal(
        benchHost(u),
        productBenchHost(u),
        `drift between worker/src/scanprovenance.ts and the product scan_pipeline.js for ${JSON.stringify(u)}`,
      );
    }
  });
}

// ------------------------------------------------------------------------
// Funnel: scans_30d keeps raw volume, scans_external_30d counts outside only
// ------------------------------------------------------------------------
test("funnel counts an operator and a CI-canary scan in scans_30d but not scans_external_30d, and an external scan in both", async () => {
  const store = {
    "report:dogfood": report("https://lazynext.com"),
    "report:canary": report("https://checker.lazynext.com"),
    "report:pasted": report(null),
    "report:malformed": report("https://wellknown.network),"),
    "report:external": report("https://www.corpusiq.io"),
  };
  const env = fakeEnv(store);
  const res = await makeHandleBilling(funnelDeps(env))(funnelRequest(), env, {}, "/api/v1/billing/funnel");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.scans_30d, 5, "raw volume counts every stored report");
  assert.equal(body.scans_external_30d, 1, "only the external host is outside traffic");
  assert.deepEqual(
    Object.keys(body).filter((k) => k.startsWith("scans_")).sort(),
    ["scans_30d", "scans_by_src", "scans_external_30d"],
    "scans_30d must stay for backward compatibility; scans_by_src is the additive provenance distribution",
  );
});

test("funnel reports zero external scans when the window is entirely ours", async () => {
  const store = {
    "report:a": report("https://lazynext.com"),
    "report:b": report(null),
    "report:c": report("https://example.com"),
    "report:broken": "{not json",
  };
  const env = fakeEnv(store);
  const res = await makeHandleBilling(funnelDeps(env))(funnelRequest(), env, {}, "/api/v1/billing/funnel");
  const body = await res.json();
  assert.equal(body.scans_30d, 4);
  assert.equal(body.scans_external_30d, 0);
});

test("funnel still requires the internal bearer", async () => {
  const store = { "report:x": report("https://www.corpusiq.io") };
  const env = fakeEnv(store);
  env.EPHEMERAL.__store = store;
  const req = new Request("https://ai-company.test/api/v1/billing/funnel", { method: "GET" });
  const res = await makeHandleBilling(funnelDeps(env))(req, env, {}, "/api/v1/billing/funnel");
  assert.equal(res.status, 401);
});

test("countExternalReports treats unreadable records as not external", () => {
  assert.equal(countExternalReports([null, "", "{oops", "null"]), 0);
  assert.equal(countExternalReports([report("https://acme-shop.com")]), 1);
});

// ------------------------------------------------------------------------
// src stamp: additive provenance — records written before the stamp carried no
// `src`, and readers must tolerate null. The stamp must never feed the
// external-count metric (which stays purely host-based).
// ------------------------------------------------------------------------
test("records WITHOUT src still pass the external-count logic", () => {
  const oldRecords = [
    report("https://www.corpusiq.io"),
    report("https://lazynext.com"),
    report(null),
  ];
  const counts = countExternalReports(oldRecords);
  assert.equal(counts, 1, "a pre-stamp external scan is still external traffic");
  assert.equal(countExternalReports([report("https://acme-shop.com", "fixture")]), 1,
    "a fixture-labelled record of an external host still counts external — src never influences the metric");
});

test("countBySource buckets the closed vocabulary and sums to the record count", () => {
  const records = [
    report("https://acme-shop.com", "web"),
    report("https://acme-shop.com", "ci"),
    report("https://acme-shop.com", "monitor"),
    report("https://acme-shop.com", "mcp"),
    report("https://acme-shop.com", "a2a"),
    report("https://example.com", "fixture"),
    report(null, "fixture"),
    report("https://acme-shop.com", "unknown"),
    report("https://acme-shop.com"), // pre-stamp
    null, // expiring/blank
    "{not json", // malformed
    report("https://acme-shop.com", "not-a-source"), // unrecognised
  ];
  const src = countBySource(records);
  for (const s of SCAN_SOURCES) assert.equal(src[s], s === "fixture" ? 2 : 1, s);
  assert.equal(src.unstamped, 3, "pre-stamp + blank + malformed all count as unstamped");
  assert.equal(src.other, 1);
  assert.equal(Object.values(src).reduce((t, n) => t + n, 0), records.length,
    "the buckets always sum to the record count — nothing is dropped");
});

test("normalizeScanSource accepts only the closed vocabulary", () => {
  for (const s of SCAN_SOURCES) assert.equal(normalizeScanSource(s), s);
  for (const bad of [null, undefined, "", "WEB", "scraper", 42, "web;drop"]) {
    assert.equal(normalizeScanSource(bad), null);
  }
});

test("the funnel reports scans_by_src additively and never changes the external count", async () => {
  const store = {
    "report:dogfood": report("https://lazynext.com", "monitor"),
    "report:canary": report("https://checker.lazynext.com", "ci"),
    "report:pasted": report(null, "fixture"),
    "report:external": report("https://www.corpusiq.io", "web"),
    "report:legacy": report("https://en.wikipedia.org"), // pre-stamp, external
  };
  const env = fakeEnv(store);
  const res = await makeHandleBilling(funnelDeps(env))(funnelRequest(), env, {}, "/api/v1/billing/funnel");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.scans_30d, 5);
  assert.equal(body.scans_external_30d, 2, "pre-stamp external record must still count");
  assert.deepEqual(body.scans_by_src, {
    web: 1, ci: 1, monitor: 1, mcp: 0, a2a: 0, fixture: 1, unknown: 0, unstamped: 1, other: 0,
  });
});

// The platform's SCAN_SOURCES is the consumer-side copy of the product's
// closed vocabulary. The product classifier (src/scan_src.js) is the author of
// stamps, so the two lists must match — same skip-if-absent pattern as the
// benchHost parity test above.
const productScanSrc = resolve(
  here,
  "../../products/accessibility-checker/src/scan_src.js",
);
if (existsSync(productScanSrc)) {
  test("platform SCAN_SOURCES and the product vocabulary agree", () => {
    const src = readFileSync(productScanSrc, "utf8");
    const m = src.match(/export const SCAN_SOURCES = Object\.freeze\((\[[\s\S]*?\])\);/);
    assert.ok(m, "SCAN_SOURCES not found in the product src/scan_src.js");
    assert.deepEqual(SCAN_SOURCES, Function(`return ${m[1]}`)(), "vocabulary drift between the repos");
  });
}

// ------------------------------------------------------------------------
// Corpus write guard (/query) — junk cannot reach D1 at all
// ------------------------------------------------------------------------
const INSERT = "INSERT INTO scan_stats (score, pages, pro, host) VALUES (?,?,?,?)";

test("scan_stats insert with a valid external host passes the guard", () => {
  assert.equal(scanStatsHostViolation(INSERT, [91, 1, 0, "acme-shop.com"]), null);
});

for (const bad of ["lazynext.com", "checker.lazynext.com", "x.workers.dev)", "shop.example.org", "10.0.0.5", ""]) {
  test(`scan_stats insert with a non-external host is rejected: ${JSON.stringify(bad)}`, () => {
    const v = scanStatsHostViolation(INSERT, [91, 1, 0, bad]);
    assert.ok(v, "expected a rejection reason");
    assert.match(v, /non-external|missing/);
  });
}

test("the guard ignores statements that are not scan_stats inserts", () => {
  assert.equal(scanStatsHostViolation("INSERT INTO crm_leads (email) VALUES (?)", ["x@y.z"]), null);
  assert.equal(scanStatsHostViolation("SELECT * FROM scan_stats", []), null);
  assert.equal(scanStatsHostViolation("INSERT INTO scan_stats (score, pages) VALUES (?,?)", [1, 2]), null);
});

test("the /query route actually runs the scan_stats guard", () => {
  assert.match(
    indexSrc,
    /const badHost = scanStatsHostViolation\(body\.sql, body\.params\);/,
    "handleQuery must validate scan_stats inserts",
  );
  assert.match(indexSrc, /import \{ scanStatsHostViolation \} from "\.\/scanprovenance";/);
});

test("the /batch route runs the same guard before it executes anything", async () => {
  const batchImpl = indexSrc.match(/async function handleBatch[\s\S]*?\n}/);
  assert.ok(batchImpl, "handleBatch not found in src/index.ts");
  let executed = false;
  const handleBatch = new Function(
    "isReadQuery",
    "json",
    "scanStatsHostViolation",
    "fanOut",
    `${transpile(batchImpl[0])}; return handleBatch;`,
  )(() => false, fakeJson, scanStatsHostViolation, async () => undefined);
  const env = {
    DB: {
      batch: async () => {
        executed = true;
        return [];
      },
      prepare: () => ({ bind: () => ({ run: async () => ({}) }) }),
    },
  };
  const ctx = { waitUntil: () => undefined };
  const bad = await handleBatch(env, ctx, { statements: [{ sql: INSERT, params: [91, 1, 0, "x.workers.dev)"] }] });
  assert.equal(bad.status, 400);
  assert.equal(executed, false, "a rejected batch must not touch D1");
  const good = await handleBatch(env, ctx, { statements: [{ sql: INSERT, params: [91, 1, 0, "acme-shop.com"] }] });
  assert.equal(good.status, 200);
  assert.equal(executed, true);
});
