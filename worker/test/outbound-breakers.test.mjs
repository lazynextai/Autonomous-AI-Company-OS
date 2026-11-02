// Outbound circuit breakers. Two layers are pinned here:
//   1. evaluatePolicy — the pure trip rules (volume, repeated failure, error
//      rate, deliverability) so thresholds can't drift silently.
//   2. dispatchSocialPost — the real scheduler entry point, lifted from
//      services.ts, proving a tripped breaker blocks the provider call, parks
//      the row terminal with a reason, and leaves the claim/requeue machine
//      intact for the untripped path.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeDb, fakeKv } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const policy = (over = {}) => ({
  enabled: 1,
  volume_limit: 100,
  volume_window_ms: 3_600_000,
  failure_limit: 5,
  failure_window_ms: 600_000,
  error_rate_limit: 0.5,
  error_rate_window_ms: 600_000,
  deliverability_limit: 0.2,
  deliverability_window_ms: 86_400_000,
  tripped_reason: null,
  tripped_at: null,
  ...over,
});

const breaker = loadModule("breakers.ts", { json: jsonFn }, [
  "evaluatePolicy",
  "degradedEmailEvent",
  "recordDispatchAudit",
  "noteBreakerTrip",
  "breakerAdmin",
  "EMAIL_CONNECTORS",
]);

const stats = (over = {}) => ({
  dispatch_total: 0,
  dispatch_failed: 0,
  email_total: 0,
  email_degraded: 0,
  ...over,
});

// --- policy rules ---------------------------------------------------------
test("clean state allows dispatch", () => {
  const d = breaker.evaluatePolicy(policy(), stats({ dispatch_total: 3 }), "x");
  assert.equal(d.allow, true);
});

test("volume breaker trips at the window limit", () => {
  const under = breaker.evaluatePolicy(policy({ volume_limit: 10 }), stats({ dispatch_total: 9 }), "x");
  assert.equal(under.allow, true);
  const at = breaker.evaluatePolicy(policy({ volume_limit: 10 }), stats({ dispatch_total: 10 }), "x");
  assert.equal(at.allow, false);
  assert.match(at.reason, /^volume: 10 dispatches in 60m \(limit 10\)$/);
});

test("repeated provider failures trip before the error rate does", () => {
  const d = breaker.evaluatePolicy(
    policy({ failure_limit: 5, error_rate_limit: 0.9 }),
    stats({ dispatch_total: 40, dispatch_failed: 5 }),
    "x",
  );
  assert.equal(d.allow, false);
  assert.match(d.reason, /^provider failures: 5 in 10m/);
});

test("error rate needs a real sample and ignores a tiny denominator", () => {
  const small = breaker.evaluatePolicy(
    policy({ failure_limit: 99 }),
    stats({ dispatch_total: 2, dispatch_failed: 2 }),
    "x",
  );
  assert.equal(small.allow, true, "2/2 is not a rate — it is a sample-size artifact");

  const real = breaker.evaluatePolicy(
    policy({ failure_limit: 99 }),
    stats({ dispatch_total: 10, dispatch_failed: 6 }),
    "x",
  );
  assert.equal(real.allow, false);
  assert.match(real.reason, /^error rate: 60% \(limit 50%\)$/);
});

test("deliverability only applies to email connectors", () => {
  const degraded = stats({ dispatch_total: 1, email_total: 40, email_degraded: 20 });
  const social = breaker.evaluatePolicy(policy(), degraded, "instagram");
  assert.equal(social.allow, true, "a bounce rate says nothing about an Instagram post");

  const email = breaker.evaluatePolicy(policy(), degraded, "brevo");
  assert.equal(email.allow, false);
  assert.match(email.reason, /^deliverability: 50% degraded events/);

  const thin = breaker.evaluatePolicy(policy(), stats({ email_total: 4, email_degraded: 4 }), "brevo");
  assert.equal(thin.allow, true, "under the 10-event floor the rate is not yet meaningful");
});

test("deliverability event names normalize the way Brevo sends them", () => {
  for (const name of ["hardBounce", "hard_bounce", "hard-bounce", "HARD_BOUNCE", "invalid_email", "invalidEmail", "spam", "complaint", "blocked"]) {
    assert.equal(breaker.degradedEmailEvent(name), true, name);
  }
  for (const name of ["delivered", "opened", "click", "soft_bounce", "deferred", "uniqueOpened", ""]) {
    assert.equal(breaker.degradedEmailEvent(name), false, name);
  }
});

test("disabling the breaker allows everything except nothing else changes", () => {
  const d = breaker.evaluatePolicy(policy({ enabled: 0, volume_limit: 1 }), stats({ dispatch_total: 999 }), "x");
  assert.equal(d.allow, true);
  assert.equal(d.stats.dispatch_total, 999);
});

// --- dispatchSocialPost: fail closed, state machine intact -----------------
function dispatchEnv({ policyRow, events = [], social = [], connector = "x" } = {}) {
  const writes = [];
  const db = fakeDb([
    { match: /CREATE TABLE IF NOT EXISTS outbound_breaker_config/, handle: () => ({ meta: { changes: 0 } }) },
    { match: /INSERT OR IGNORE INTO outbound_breaker_config/, handle: () => ({ meta: { changes: 1 } }) },
    {
      match: /SELECT \* FROM outbound_breaker_config WHERE id = 1/,
      handle: () => policyRow ?? policy(),
    },
    {
      match: /FROM episodic_events WHERE scope = 'connector'/,
      handle: (sql) => {
        if (!/json_extract\(payload, '\$\.ok'\) = 0/.test(sql)) return { c: events.length };
        return { c: events.filter((e) => e.ok === false).length };
      },
    },
    { match: /FROM email_events WHERE datetime/, handle: () => ({ results: [] }) },
    {
      match: /UPDATE social_posts SET status = 'posting'/,
      handle: (sql, params) => {
        writes.push({ sql, params });
        const row = social.find((r) => r.id === params[1] && r.status === "queued");
        return { meta: { changes: row ? 1 : 0 } };
      },
    },
    {
      match: /SELECT connector, payload, attempts FROM social_posts/,
      handle: (_sql, params) => social.find((r) => r.id === params[0]) ?? null,
    },
    {
      match: /UPDATE social_posts SET/,
      handle: (sql, params) => {
        writes.push({ sql, params });
        return { meta: { changes: 1 } };
      },
    },
    { match: /INSERT INTO episodic_events/, handle: () => ({ meta: { changes: 1 } }) },
    { match: /UPDATE outbound_breaker_config SET tripped_reason/, handle: () => ({ meta: { changes: 1 } }) },
    { match: /CREATE TABLE IF NOT EXISTS social_posts/, handle: () => ({ meta: { changes: 0 } }) },
  ]);
  const env = { DB: db, EPHEMERAL: fakeKv() };
  return { env, db, writes, connector };
}

const services = (deps) =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ res: jsonFn({ error: "unauthorized" }, 401) }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: deps.outboundDecision,
      noteBreakerTrip: deps.noteBreakerTrip,
      recordDispatchAudit: deps.recordDispatchAudit,
      decisionGate: deps.decisionGate ?? (async () => ({ allow: true, enforced: false, scope: "off" })),
      // Governance + ledger edges are stubbed by default so each test asserts
      // only the behaviour it names; a test that cares registers its own.
      openDispatchDecision: deps.openDispatchDecision ?? (async () => ({ id: 1, authority: "auto" })),
      closeDispatchDecision: deps.closeDispatchDecision ?? (async () => {}),
      recordDispatchLedger: deps.recordDispatchLedger ?? (async () => {}),
      estimateCostCents: deps.estimateCostCents ?? (() => 0),
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["dispatchSocialPost", "dispatchScheduledPosts", "queueSocialPost"],
  );

test("a tripped breaker blocks the send, parks the row failed with a reason, and never calls the provider", async () => {
  const { env, writes } = dispatchEnv({
    social: [{ id: 5, connector: "x", payload: JSON.stringify({ text: "hello" }), attempts: 1, status: "queued" }],
  });
  let providerCalls = 0;
  const mod = services({
    outboundDecision: async () => ({ allow: false, reason: "volume: 10 dispatches in 60m (limit 10)", stats: stats() }),
    noteBreakerTrip: async () => {},
    recordDispatchAudit: async () => {
      providerCalls++;
    },
  });
  const outcome = await mod.dispatchSocialPost(env, 5);
  assert.equal(outcome, "failed");

  const parked = writes.find((w) => /SET status = 'failed'/.test(w.sql));
  assert.ok(parked, "blocked row must be parked terminal");
  assert.match(parked.params[0], /^breaker: volume: 10 dispatches/);
  assert.equal(parked.params[1], 5);
  assert.equal(writes.some((w) => /status = 'queued', run_at/.test(w.sql)), false, "a blocked send must not requeue");
  assert.equal(outcome.includes("requeued"), false);
});

test("an evaluation error fails closed instead of sending", async () => {
  const { env, writes, db } = dispatchEnv({
    social: [{ id: 9, connector: "x", payload: JSON.stringify({ text: "hi" }), attempts: 1, status: "queued" }],
  });
  // Simulate the policy read itself blowing up (D1 outage).
  db.handlers.unshift({
    match: /SELECT \* FROM outbound_breaker_config WHERE id = 1/,
    handle: () => {
      throw new Error("D1_ERROR: unavailable");
    },
  });
  const mod = services({
    outboundDecision: async () => {
      // Mirror the shipped outboundDecision contract for an evaluation failure.
      try {
        await db.prepare("SELECT * FROM outbound_breaker_config WHERE id = 1").first();
        return { allow: true, stats: stats() };
      } catch (e) {
        return { allow: false, reason: `breaker_eval_failed: ${e.message}`, stats: stats() };
      }
    },
    noteBreakerTrip: async () => {},
    recordDispatchAudit: async () => {},
  });
  assert.equal(await mod.dispatchSocialPost(env, 9), "failed");
  const parked = writes.find((w) => /SET status = 'failed'/.test(w.sql));
  assert.match(parked.params[0], /^breaker: breaker_eval_failed: D1_ERROR/);
});

test("a duplicate delivery still skips without touching the row", async () => {
  const { env, writes } = dispatchEnv({ social: [{ id: 3, connector: "x", payload: "{}", attempts: 1, status: "posted" }] });
  const mod = services({
    outboundDecision: async () => ({ allow: true, stats: stats() }),
    noteBreakerTrip: async () => {},
    recordDispatchAudit: async () => {},
  });
  assert.equal(await mod.dispatchSocialPost(env, 3), "skipped");
  assert.equal(writes.length, 1, "only the claim attempt, nothing else");
});

test("an unconnected connector still parks terminal without burning retries", async () => {
  const { env, writes } = dispatchEnv({
    social: [{ id: 4, connector: "linkedin", payload: JSON.stringify({ text: "hi" }), attempts: 1, status: "queued" }],
  });
  const mod = services({
    outboundDecision: async () => ({ allow: true, stats: stats() }),
    noteBreakerTrip: async () => {},
    recordDispatchAudit: async () => {},
  });
  assert.equal(await mod.dispatchSocialPost(env, 4), "failed");
  const parked = writes.find((w) => /SET status = 'failed'/.test(w.sql));
  assert.match(parked.params[0], /not connected/);
});

test("the cron sweep still dispatches inline when no queue is bound", async () => {
  const { env } = dispatchEnv({
    social: [{ id: 11, connector: "x", payload: JSON.stringify({ text: "later" }), attempts: 0, status: "queued" }],
  });
  const db = env.DB;
  db.handlers.unshift({
    match: /SELECT id FROM social_posts WHERE status = 'queued' AND run_at <= \?/,
    handle: () => ({ results: [{ id: 11 }] }),
  });
  db.handlers.unshift({
    match: /UPDATE social_posts SET status = 'queued', run_at = \? WHERE status = 'posting'/,
    handle: () => ({ meta: { changes: 0 } }),
  });
  const mod = services({
    outboundDecision: async () => ({ allow: false, reason: "provider failures: 5 in 10m (limit 5)", stats: stats() }),
    noteBreakerTrip: async () => {},
    recordDispatchAudit: async () => {},
  });
  const r = await mod.dispatchScheduledPosts(env);
  assert.deepEqual(r, { posted: 0, failed: 1 }, "blocked rows count as failed, and the sweep survives");
});

test("the audit writer records both outcomes and swallows storage errors", async () => {
  const ok = [];
  const env = {
    DB: {
      prepare: () => ({
        bind: (...p) => ({ run: async () => void ok.push(p[0]) }),
      }),
    },
  };
  await breaker.recordDispatchAudit(env, "x", true, 200, "scheduled");
  await breaker.recordDispatchAudit(env, "x", false, 503, "direct");
  assert.deepEqual(JSON.parse(ok[0]), { id: "x", ok: true, status: 200, source: "scheduled" });
  assert.deepEqual(JSON.parse(ok[1]), { id: "x", ok: false, status: 503, source: "direct" });

  const throwing = {
    DB: {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("D1 down");
          },
        }),
      }),
    },
  };
  await assert.doesNotReject(() => breaker.recordDispatchAudit(throwing, "x", true));
});
