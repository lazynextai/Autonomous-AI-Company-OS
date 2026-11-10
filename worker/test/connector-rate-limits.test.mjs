// Per-connector DAILY caps — the capacity guard PR #62 left as a follow-up.
//
// What this pins:
//   1. COUNTER — key shape `rl:conn:<id>:<utcDay>`, UTC day bucket, and an
//      explicit 2-day TTL (the `/kv/put` 60-second floor would silently reset
//      the counter every minute and enforce nothing).
//   2. CAP — refuse at `per_day`, allow below it, and leave uncapped
//      connectors entirely alone (no key written at all).
//   3. REFUSAL — one audit row, no provider call, no decision package, and a
//      structured payload a caller can act on.
//   4. DRY RUN — reads the counter, never consumes it.
//   5. FAIL-OPEN — a KV read/write failure allows the send and says it is
//      degraded, because this is a capacity limit, not a governance control.
//   6. SCHEDULED POSTS — the same counter applies to the queue-backed path, so
//      an ad-hoc dispatch and a scheduled post cannot jointly exceed one
//      ceiling.
//
// No provider is contacted: dispatch-level tests use a recording `fetch` and
// the governance collaborators are stubs that throw if consulted.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeCtx, fakeDb, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";

// Mirrors worker/src/gateway.ts `json(data, status, extra)` — the real helper
// takes response headers as a third argument, and `retry-after` is one of them.
const jsonFn = (data, status = 200, extra) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...(extra ?? {}) },
  });

const DAY_MS = 86_400_000;
const today = () => Math.floor(Date.now() / DAY_MS);
const TTL = 172_800;

/** KV that records `put` options — TTL is the thing under test. */
function recordingKv(seed = {}) {
  const map = new Map(Object.entries(seed));
  const puts = [];
  return {
    map,
    puts,
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v, opts) {
      puts.push({ key: k, value: String(v), opts });
      map.set(k, String(v));
    },
    async delete(k) {
      map.delete(k);
    },
  };
}

function servicesModule(kv, overrides = {}) {
  return loadModule(
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
      evidenceCorroborations: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => {
        throw new Error("the cap runs BEFORE the decision gate");
      },
      openDispatchDecision: async () => {
        throw new Error("a capped send must not open a decision package");
      },
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      breakerAdmin: async () => jsonFn({}),
      capabilityOf,
      puppeteer: {},
      ...overrides,
    },
    [
      "handleServices",
      "CONNECTOR_IDS",
      "consumeConnectorDailyCap",
      "peekConnectorDailyCap",
      "connectorCapKey",
      "capResetsAt",
    ],
  );
}

// --- 1. the counter --------------------------------------------------------
test("key shape is rl:conn:<id>:<utcDay> — the waitlist limiter's shape", () => {
  const mod = servicesModule(recordingKv());
  assert.equal(mod.connectorCapKey("x", 20370), "rl:conn:x:20370");
  // Default day is the same UTC bucket public_api.ts uses for rl:waitlist.
  assert.equal(mod.connectorCapKey("linkedin"), `rl:conn:linkedin:${today()}`);
  assert.match(mod.capResetsAt(), /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
});

test("consuming writes the counter with an explicit two-day TTL", async () => {
  const kv = recordingKv();
  const mod = servicesModule(kv);
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(v.allow, true);
  assert.equal(v.used, 1);
  assert.equal(v.remaining, 16);
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].key, `rl:conn:x:${today()}`);
  assert.equal(kv.puts[0].value, "1");
  // Without this the whole feature is a no-op: /kv/put floors a missing ttl
  // at 60s, so a "daily" counter would reset every minute.
  assert.deepEqual(kv.puts[0].opts, { expirationTtl: TTL });
});

test("uncapped connectors are not counted at all", async () => {
  const kv = recordingKv();
  const mod = servicesModule(kv);
  assert.equal(capabilityOf("reddit").rate_limit.per_day, null);
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "reddit");
  assert.equal(v.allow, true);
  assert.equal(v.limited, false);
  assert.equal(v.used, null);
  assert.equal(kv.puts.length, 0, "no ceiling ⇒ no counter, ever");
  assert.equal(kv.map.size, 0);
});

test("the ceiling comes from the shipped table, not a hardcoded number", async () => {
  const kv = recordingKv();
  const mod = servicesModule(kv);
  const x = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(x.per_day, capabilityOf("x").rate_limit.per_day);
  assert.equal(x.per_day, 17);
  const li = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "linkedin");
  assert.equal(li.per_day, 100);
});

test("at the ceiling a dispatch is refused and nothing is written", async () => {
  const kv = recordingKv({ [`rl:conn:x:${today()}`]: "17" });
  const mod = servicesModule(kv);
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(v.allow, false);
  assert.equal(v.error, "'x' daily cap reached (17/day)");
  assert.equal(v.per_day, 17);
  assert.equal(v.used, 17);
  assert.equal(v.remaining, 0);
  assert.equal(kv.puts.length, 0, "a refused send must not inflate the counter");
});

test("a malformed counter reads as zero rather than exploding", async () => {
  const kv = recordingKv({ [`rl:conn:x:${today()}`]: "not-a-number" });
  const mod = servicesModule(kv);
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(v.allow, true);
  assert.equal(v.used, 1);
});

// --- 2. the route ----------------------------------------------------------
function routeEnv(kv, extra = {}) {
  return { EPHEMERAL: kv, DB: fakeDb([]), API_TOKEN: "tok", ...extra };
}

test("a capped send returns 429, writes one audit row, and never reaches a provider", async () => {
  const kv = recordingKv({
    "conn:x": "fake-x-bearer-token",
    [`rl:conn:x:${today()}`]: "17",
  });
  const audit = [];
  const mod = servicesModule(kv, {
    recordDispatchAudit: async (_env, id, ok, status, source, extra) =>
      audit.push({ id, ok, status, source, extra }),
  });
  let providerCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls++;
    throw new Error("a capped send must not touch the network");
  };
  try {
    const res = await mod.handleServices(
      new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "eighteenth post" }),
      }),
      routeEnv(kv), fakeCtx(), "/api/v1/connectors/x",
    );
    assert.equal(res.status, 429);
    assert.ok(res.headers.get("retry-after"), "a capped caller is told when to retry");
    const body = await readJson(res);
    assert.deepEqual(body, {
      ok: false,
      error: "'x' daily cap reached (17/day)",
      rate_limited: true,
      per_day: 17,
      used: 17,
      resets_at: mod.capResetsAt(),
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(providerCalls, 0);
  assert.equal(audit.length, 1, "exactly one audit row");
  assert.equal(audit[0].status, 429);
  assert.equal(audit[0].extra.rate_limited, true);
  assert.equal(audit[0].extra.per_day, 17);
  assert.equal(audit[0].extra.used, 17);
  assert.equal(kv.puts.length, 0);
});

test("a dispatch under the ceiling proceeds and debits exactly one slot", async () => {
  const kv = recordingKv({
    "conn:x": "fake-x-bearer-token",
    [`rl:conn:x:${today()}`]: "3",
  });
  const mod = servicesModule(kv, {
    decisionGate: async () => ({ allow: true, scope: "off" }),
    openDispatchDecision: async () => ({ id: 9 }),
  });
  let providerCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls++;
    return new Response(JSON.stringify({ data: { id: "1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const res = await mod.handleServices(
      new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "fourth post" }),
      }),
      routeEnv(kv), fakeCtx(), "/api/v1/connectors/x",
    );
    assert.equal(res.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(providerCalls, 1, "under the ceiling the send really happens");
  assert.deepEqual(kv.puts.map((p) => [p.key, p.value]), [[`rl:conn:x:${today()}`, "4"]]);
});

// --- 3. dry run ------------------------------------------------------------
test("a dry run reports the live counter and consumes nothing", async () => {
  const kv = recordingKv({
    "conn:x": "fake-x-bearer-token",
    [`rl:conn:x:${today()}`]: "5",
  });
  const mod = servicesModule(kv);
  const res = await mod.handleServices(
    new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "preview me", dry_run: true }),
    }),
    routeEnv(kv), fakeCtx(), "/api/v1/connectors/x",
  );
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.dry_run, true);
  // Declared ceiling + live counter in one object.
  assert.equal(body.rate_limit.per_day, 17);
  assert.equal(body.rate_limit.enforced, true);
  assert.equal(body.rate_limit.used, 5);
  assert.equal(body.rate_limit.remaining, 12);
  assert.equal(body.rate_limit.day, today());
  // THE POINT: a preview has no external effect, so it must not spend a slot.
  assert.equal(kv.puts.length, 0, "a dry run must not consume capacity");
  assert.equal(kv.map.get(`rl:conn:x:${today()}`), "5", "the counter is untouched");
});

test("a dry run at the ceiling still previews — the cap blocks sends, not previews", async () => {
  const kv = recordingKv({
    "conn:x": "fake-x-bearer-token",
    [`rl:conn:x:${today()}`]: "17",
  });
  const mod = servicesModule(kv);
  const res = await mod.handleServices(
    new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "preview at the ceiling", dry_run: true }),
    }),
    routeEnv(kv), fakeCtx(), "/api/v1/connectors/x",
  );
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.supported, true);
  assert.equal(body.rate_limit.remaining, 0);
});

// --- 4. fail-open ----------------------------------------------------------
test("a KV read failure allows the send and says it is degraded", async () => {
  const kv = {
    async get() {
      throw new Error("KV unavailable");
    },
    async put() {
      throw new Error("KV unavailable");
    },
    async delete() {},
  };
  const mod = servicesModule(kv);
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(v.allow, true, "capacity, not governance — fail OPEN");
  assert.equal(v.degraded, true);
  assert.equal(v.used, null);
  assert.equal(v.per_day, 17);
});

test("a KV write failure also allows the send, degraded", async () => {
  const mod = servicesModule({});
  const kv = {
    async get() {
      return "3";
    },
    async put() {
      throw new Error("KV write rejected");
    },
    async delete() {},
  };
  const v = await mod.consumeConnectorDailyCap({ EPHEMERAL: kv }, "x");
  assert.equal(v.allow, true);
  assert.equal(v.degraded, true);
});

// --- 5. the scheduled path -------------------------------------------------
function scheduledEnv(kv, row) {
  const db = fakeDb([
    {
      match: /UPDATE social_posts SET status = 'posting'/,
      handle: () => ({ meta: { changes: 1 } }),
    },
    {
      match: /SELECT connector, payload, attempts FROM social_posts/,
      handle: () => row,
    },
  ]);
  return { EPHEMERAL: kv, DB: db };
}

const socialMod = (kv, audit) =>
  loadModule(
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
      evidenceCorroborations: async () => jsonFn({}),
      outboundDecision: async () => {
        throw new Error("the cap runs before the breaker");
      },
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async (_env, id, ok, status, source, extra) =>
        audit.push({ id, ok, status, source, extra }),
      decisionGate: async () => {
        throw new Error("the cap runs before the decision gate");
      },
      openDispatchDecision: async () => {
        throw new Error("a capped row must not open a decision package");
      },
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      breakerAdmin: async () => jsonFn({}),
      capabilityOf,
      puppeteer: {},
    },
    ["dispatchSocialPost"],
  );

test("a scheduled post that hits the cap is parked failed, never dispatched", async () => {
  const kv = recordingKv({ [`rl:conn:x:${today()}`]: "17" });
  const audit = [];
  const mod = socialMod(kv, audit);
  const env = scheduledEnv(kv, {
    connector: "x", payload: JSON.stringify({ text: "queued post" }), attempts: 1,
  });
  const { env: realEnv } = { env };
  let providerCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls++;
    throw new Error("no provider call on a capped scheduled post");
  };
  try {
    const outcome = await mod.dispatchSocialPost(realEnv, 7);
    assert.equal(outcome, "failed");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(providerCalls, 0);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].source, "scheduled");
  assert.equal(audit[0].status, 429);
  // No new provider slot spent by the refusal itself.
  assert.equal(kv.puts.length, 0);
});
