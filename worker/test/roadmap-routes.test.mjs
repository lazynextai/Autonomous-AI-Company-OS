// Route wiring: the evidence and breaker surfaces must be reachable through
// handleServices with the house auth rules — `lzk_` read for reads, write for
// evidence capture, admin for anything that changes outbound policy or acts as
// the company — and the hand-maintained OpenAPI table must describe them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, readJson, fakeCtx } from "./helpers/lift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const calls = [];
const services = (scopes) =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes } }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async (_env, leadId, body) => {
        calls.push({ fn: "recordLeadEvidence", leadId, body });
        return jsonFn({ id: 1, lead_id: leadId }, 201);
      },
      listLeadEvidence: async (_env, leadId) => {
        calls.push({ fn: "listLeadEvidence", leadId });
        return jsonFn({ lead_id: leadId, evidence: [] });
      },
      evidenceSummary: async () => {
        calls.push({ fn: "evidenceSummary" });
        return jsonFn({ summary: [] });
      },
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      breakerAdmin: async (_env, path, method, body) => {
        calls.push({ fn: "breakerAdmin", path, method, body });
        return jsonFn({ policy: {} });
      },
      puppeteer: {},
    },
    ["handleServices"],
  );

const req = (method, path, body) =>
  new Request(`https://ai-company.lazynext.net${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) }, EPHEMERAL: {} };

function reset() {
  calls.length = 0;
}

test("evidence read/write are reachable with a normal read,write key", async () => {
  reset();
  const mod = services("read,write");
  const ctx = fakeCtx();

  const list = await mod.handleServices(req("GET", "/api/v1/crm/leads/12/evidence"), env, ctx, "/api/v1/crm/leads/12/evidence");
  assert.equal(list.status, 200);
  assert.deepEqual(await readJson(list).then((b) => b.lead_id), 12);

  const create = await mod.handleServices(
    req("POST", "/api/v1/crm/leads/12/evidence", { claim: "Uses Workers", source_url: "https://x.test" }),
    env,
    ctx,
    "/api/v1/crm/leads/12/evidence",
  );
  assert.equal(create.status, 201);
  assert.deepEqual(calls.map((c) => c.fn), ["listLeadEvidence", "recordLeadEvidence"]);
  assert.equal(calls[1].leadId, 12);
  assert.equal(calls[1].body.claim, "Uses Workers");

  const summary = await mod.handleServices(req("GET", "/api/v1/crm/evidence/summary"), env, ctx, "/api/v1/crm/evidence/summary");
  assert.equal(summary.status, 200);
  assert.equal(calls[2].fn, "evidenceSummary");
});

test("the canonical lead route keeps working beside the evidence sub-route", async () => {
  // The evidence regex is anchored on /evidence, so a plain lead PATCH must
  // never be captured by it (a bare startsWith would have).
  reset();
  const mod = services("read,write");
  const ctx = fakeCtx();
  const res = await mod.handleServices(
    req("PATCH", "/api/v1/crm/leads/12", { status: "qualified" }),
    { ...env, DB: { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }) } },
    ctx,
    "/api/v1/crm/leads/12",
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [], "lead qualification writes bypass the evidence surface entirely");
});

test("breaker reads need only read, but policy changes require admin", async () => {
  reset();
  const reader = services("read");
  const ctx = fakeCtx();

  const read = await reader.handleServices(req("GET", "/api/v1/ops/breakers"), env, ctx, "/api/v1/ops/breakers");
  assert.equal(read.status, 200);

  const denied = await reader.handleServices(req("POST", "/api/v1/ops/breakers", { volume_limit: 1 }), env, ctx, "/api/v1/ops/breakers");
  assert.equal(denied.status, 403);
  assert.match((await readJson(denied)).error, /scope 'admin' required/);

  const deniedReset = await reader.handleServices(req("POST", "/api/v1/ops/breakers/reset", {}), env, ctx, "/api/v1/ops/breakers/reset");
  assert.equal(deniedReset.status, 403);
  assert.deepEqual(calls.map((c) => c.fn), ["breakerAdmin"], "no mutation reaches the policy writer without admin");

  reset();
  const admin = services("read,write,admin");
  const updated = await admin.handleServices(req("POST", "/api/v1/ops/breakers", { volume_limit: 1 }), env, ctx, "/api/v1/ops/breakers");
  assert.equal(updated.status, 200);
  const resetRes = await admin.handleServices(req("POST", "/api/v1/ops/breakers/reset", {}), env, ctx, "/api/v1/ops/breakers/reset");
  assert.equal(resetRes.status, 200);
  assert.deepEqual(calls.map((c) => [c.fn, c.path, c.method]), [
    ["breakerAdmin", "/api/v1/ops/breakers", "POST"],
    ["breakerAdmin", "/api/v1/ops/breakers/reset", "POST"],
  ]);
});

test("connector dispatch is breaker-gated before the provider call", async () => {
  // A tripped breaker must short-circuit dispatch with a 503 and the reason,
  // never reaching callConnector (which would post as the company).
  reset();
  const mod = loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "admin" } }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: false, reason: "volume: 10 dispatches in 60m (limit 10)", stats: {} }),
      noteBreakerTrip: async (_env, connector, reason) => calls.push({ fn: "trip", connector, reason }),
      recordDispatchAudit: async () => calls.push({ fn: "audit" }),
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["handleServices"],
  );
  const ctx = fakeCtx();
  // No conn:x credential, so without the breaker this would be a 503
  // "not connected" — the breaker runs first, which is the ordering under test.
  const res = await mod.handleServices(
    req("POST", "/api/v1/connectors/x", { text: "hello" }),
    { ...env, EPHEMERAL: { get: async () => "cred", delete: async () => {} } },
    ctx,
    "/api/v1/connectors/x",
  );
  assert.equal(res.status, 503);
  const body = await readJson(res);
  assert.equal(body.error, "blocked by outbound breaker");
  assert.match(body.reason, /^volume:/);
  await ctx.flush();
  assert.deepEqual(calls.map((c) => c.fn), ["trip"], "the trip is recorded and no audit/dispatch happens");
});

// --- OpenAPI table --------------------------------------------------------
const specSource = readFileSync(join(HERE, "..", "src", "openapi.ts"), "utf8");

test("the OpenAPI table declares every new evidence and breaker route", () => {
  for (const path of [
    "/api/v1/crm/leads/{id}/evidence",
    "/api/v1/crm/evidence/summary",
    "/api/v1/ops/breakers",
    "/api/v1/ops/breakers/reset",
    "/evidence/record",
    "/evidence/list",
  ]) {
    assert.ok(specSource.includes(`"${path}": {`), `${path} missing from openapi.ts`);
  }
});

test("internal evidence doors are marked x-internal and never inherit lzk auth", () => {
  const start = specSource.indexOf('"/evidence/record": {');
  const end = specSource.indexOf('"/kv/get": {');
  const block = specSource.slice(start, end);
  assert.match(block, /"x-internal": true/);
  assert.match(block, /security: \[\{ internalAuth: \[\] \}\]/);
  assert.equal(/bearerAuth/.test(block), false);
});

test("breaker mutations are documented as admin-gated and evidence POST as write", () => {
  const breaker = specSource.slice(specSource.indexOf('"/api/v1/ops/breakers": {'), specSource.indexOf('"/api/v1/media": {'));
  assert.match(breaker, /scope 'admin' required/);
  const evidence = specSource.slice(specSource.indexOf('"/api/v1/crm/leads/{id}/evidence": {'), specSource.indexOf('"/api/v1/support/tickets": {'));
  assert.match(evidence, /write scope/);
  assert.match(evidence, /verified\/inferred\/unknown/);
});
