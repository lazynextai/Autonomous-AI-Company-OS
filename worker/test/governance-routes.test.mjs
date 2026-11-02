// Route wiring for the roadmap surfaces + the fail-closed governance record on
// both external dispatch paths. Same shape as roadmap-routes.test.mjs: behave
// through handleServices / dispatchSocialPost, and assert the hand-maintained
// OpenAPI table and the internal-bearer wiring from the shipped source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, readJson, fakeCtx, fakeDb, fakeKv } from "./helpers/lift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const calls = [];
const services = (scopes, over = {}) =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes } }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async (_e, id, ok) => calls.push({ fn: "audit", id, ok }),
      openDispatchDecision: over.openDispatchDecision ?? (async (_e, input) => {
        calls.push({ fn: "open", input });
        return { id: 21, authority: "approval" };
      }),
      closeDispatchDecision: over.closeDispatchDecision ?? (async (_e, id, ok) => calls.push({ fn: "close", id, ok })),
      recordDispatchLedger: over.recordDispatchLedger ?? (async (_e, id, meta) => calls.push({ fn: "ledger", id, meta })),
      estimateCostCents: () => 3,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["handleServices", "dispatchSocialPost"],
  );

const req = (method, path, body) =>
  new Request(`https://ai-company.lazynext.net${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const kvWith = (entries) => fakeKv(entries);

test("a direct dispatch opens a decision package, audits it, and closes it with the outcome", async () => {
  calls.length = 0;
  const mod = services("read,write,admin");
  const ctx = fakeCtx();
  const env = { DB: fakeDb(), EPHEMERAL: kvWith({ "conn:x": "token" }),
    fetch: undefined };
  // callConnector for x posts to the X API; stub the global fetch so no request leaves.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { id: "1" } }), { status: 201, headers: { "content-type": "application/json" } });
  try {
    const res = await mod.handleServices(req("POST", "/api/v1/connectors/x", { text: "hello" }), env, ctx, "/api/v1/connectors/x");
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.equal(body.decision_id, 21, "the response carries the decision record id");
    await ctx.flush();

    const opened = calls.find((c) => c.fn === "open");
    assert.ok(opened, "an external side effect must open a decision record");
    assert.equal(opened.input.connector, "x");
    assert.equal(opened.input.action, "connector.dispatch");
    assert.equal(opened.input.cost_cents, 3);
    assert.ok(calls.find((c) => c.fn === "close")?.ok, "the record is closed with a real outcome");
    assert.ok(calls.find((c) => c.fn === "ledger")?.meta.duration_ms >= 0, "the ledger row carries a duration");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a dispatch whose decision record cannot be written is blocked, not sent", async () => {
  calls.length = 0;
  const mod = services("read,write,admin", {
    openDispatchDecision: async () => { throw new Error("decision_invalid: title required"); },
  });
  const ctx = fakeCtx();
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; return new Response("{}", { status: 201 }); };
  try {
    const res = await mod.handleServices(
      req("POST", "/api/v1/connectors/x", { text: "hello" }),
      { DB: fakeDb(), EPHEMERAL: kvWith({ "conn:x": "token" }) },
      ctx,
      "/api/v1/connectors/x",
    );
    assert.equal(res.status, 503);
    const body = await readJson(res);
    assert.match(body.error, /decision record unavailable/);
    assert.match(body.reason, /decision_invalid/);
    await ctx.flush();
    assert.equal(providerCalls, 0, "fail closed: the provider is never called");
    assert.equal(calls.some((c) => c.fn === "audit"), false, "no dispatch audit claims a send that did not happen");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// --- scheduled path -------------------------------------------------------
const dispatchEnv = (social) => {
  const writes = [];
  const db = fakeDb([
    {
      match: /UPDATE social_posts SET status = 'posting'/,
      handle: (_sql, params) => {
        writes.push({ sql: "claim", params });
        const row = social.find((r) => r.id === params[1] && r.status === "queued");
        return { meta: { changes: row ? 1 : 0 } };
      },
    },
    { match: /SELECT connector, payload, attempts FROM social_posts/, handle: (_s, p) => social.find((r) => r.id === p[0]) ?? null },
    { match: /UPDATE social_posts SET/, handle: (sql, params) => { writes.push({ sql, params }); return { meta: { changes: 1 } }; } },
  ]);
  return { env: { DB: db, EPHEMERAL: fakeKv({ "conn:x": "tok" }) }, writes };
};

test("a scheduled post carries a decision record and a ledger row", async () => {
  const { env, writes } = dispatchEnv([{ id: 8, connector: "x", payload: JSON.stringify({ text: "hi" }), attempts: 2, status: "queued" }]);
  const opened = [];
  const closed = [];
  const ledger = [];
  const mod = loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ res: jsonFn({}, 401) }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      openDispatchDecision: async (_e, input) => { opened.push(input); return { id: 33, authority: "approval" }; },
      closeDispatchDecision: async (_e, id, ok) => closed.push({ id, ok }),
      recordDispatchLedger: async (_e, id, meta) => ledger.push({ id, meta }),
      estimateCostCents: () => 0,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["dispatchSocialPost"],
  );
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { id: "9" } }), { status: 201, headers: { "content-type": "application/json" } });
  try {
    const outcome = await mod.dispatchSocialPost(env, 8);
    assert.equal(outcome, "posted");
    assert.equal(opened.length, 1);
    assert.equal(opened[0].action, "social.post");
    assert.equal(opened[0].source, "scheduled");
    assert.deepEqual(closed, [{ id: 33, ok: true }]);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].meta.retries, 1, "attempts-1 is the retry count");
    assert.ok(writes.some((w) => /status = 'posted'/.test(w.sql)));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a scheduled post whose decision cannot be recorded is parked failed", async () => {
  const { env, writes } = dispatchEnv([{ id: 9, connector: "x", payload: "{}", attempts: 1, status: "queued" }]);
  const mod = loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ res: jsonFn({}, 401) }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      openDispatchDecision: async () => { throw new Error("D1 unavailable"); },
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["dispatchSocialPost"],
  );
  const outcome = await mod.dispatchSocialPost(env, 9);
  assert.equal(outcome, "failed");
  const parked = writes.find((w) => /SET status = 'failed'/.test(w.sql));
  assert.match(String(parked.params[0]), /^decision: D1 unavailable/);
  assert.equal(writes.some((w) => /status = 'posted'/.test(w.sql)), false);
});

// --- internal-bearer wiring -----------------------------------------------
const indexSource = readFileSync(join(HERE, "..", "src", "index.ts"), "utf8");
const specSource = readFileSync(join(HERE, "..", "src", "openapi.ts"), "utf8");

test("every new operator route is wired in index.ts behind the bearer gate", () => {
  const surface = indexSource.slice(indexSource.indexOf("async function route("), indexSource.indexOf("export default {"));
  for (const path of [
    "/decision/packages", "/ledger/summary", "/ledger/append", "/capability/matrix",
    "/observer/review", "/observer/reviews", "/manifests", "/manifests/latest",
    "/manifests/validate", "/manifests/activate",
  ]) {
    assert.ok(surface.includes(`"${path}"`), `${path} not wired in index.ts route()`);
  }
  // The internal gate is the API_TOKEN check that precedes route().
  assert.ok(indexSource.includes('if (auth !== `Bearer ${env.API_TOKEN}`) return unauthorized();'));
});

test("the cron sweeps ride the existing tick instead of a new scheduler", () => {
  const scheduled = indexSource.slice(indexSource.indexOf("async scheduled("), indexSource.indexOf("async queue("));
  assert.match(scheduled, /refreshCapabilityReadiness\(env\)/);
  assert.match(scheduled, /runDailyMaintenance\(env\)/);
  const maint = indexSource.slice(indexSource.indexOf("async function runDailyMaintenance"));
  assert.match(maint, /buildOutcomeLedger\(env\)/);
  assert.match(maint, /expireDecisionPackages\(env\)/);
  assert.match(maint, /maint:last_run/, "the ledger build stays inside the existing ~20h gate");
});

test("the OpenAPI table declares every new path as internal", () => {
  for (const path of [
    "/decision/packages", "/decision/packages/{id}/decide", "/decision/packages/{id}/void",
    "/ledger/append", "/ledger/summary", "/observer/review", "/observer/reviews",
    "/capability/matrix", "/manifests", "/manifests/latest", "/manifests/validate", "/manifests/activate",
  ]) {
    assert.ok(specSource.includes(`"${path}": {`), `${path} missing from openapi.ts`);
  }
  const start = specSource.indexOf('"/decision/packages": {');
  const end = specSource.indexOf('"/kv/get": {');
  const block = specSource.slice(start, end);
  assert.match(block, /"x-internal": true/);
  assert.match(block, /security: \[\{ internalAuth: \[\] \}\]/);
  assert.equal(/bearerAuth/.test(block), false, "operator routes never inherit lzk_ auth");
});

test("no new route leaks onto the public lzk_ surface", () => {
  const pub = indexSource.slice(indexSource.indexOf("async fetch("), indexSource.indexOf("async scheduled("));
  for (const prefix of ["/decision/", "/ledger/", "/capability/", "/observer/", "/manifests/"]) {
    assert.equal(pub.includes(`startsWith("${prefix}")`), false, `${prefix} must not be in the public dispatch table`);
  }
});