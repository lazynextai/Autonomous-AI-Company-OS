// Outcome and cost ledger (roadmap P2) — derived estimates, idempotent task
// and campaign mapping, and the roll-up the operator reads. Every mapper is
// pure, so the ledger's shape is pinned without a database.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeDb, readJson } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const mod = loadModule(
  "ledger.ts",
  { json: jsonFn },
  [
    "LEDGER_REF_TYPES", "ACCEPTANCE_VALUES", "estimateCostCents", "normalizeLedgerRow",
    "appendLedger", "recordDispatchLedger", "taskLedgerRows", "campaignLedgerRows",
    "buildOutcomeLedger", "summarizeLedger", "ledgerSummary", "handleLedgerRoutes",
  ],
);

// --- derived cost ----------------------------------------------------------
test("cost is derived from the provider, never asserted by the caller", () => {
  assert.equal(mod.estimateCostCents("workers-ai"), 0);
  assert.equal(mod.estimateCostCents("brevo", 40), 40);
  assert.equal(mod.estimateCostCents("brevo"), 1);
  assert.equal(mod.estimateCostCents("not-a-provider"), 0);
  assert.equal(mod.estimateCostCents("brevo", -5), 1, "bad unit counts fall back to one");
});

test("ref_type and acceptance enums are enforced", () => {
  const badType = mod.normalizeLedgerRow({ ref_type: "invoice", ref_id: "1" });
  assert.equal(badType.ok, false);
  assert.match(badType.errors.join(" "), /ref_type must be/);

  const badAcceptance = mod.normalizeLedgerRow({ ref_type: "task", ref_id: "1", acceptance: "maybe" });
  assert.equal(badAcceptance.ok, false);
  assert.match(badAcceptance.errors.join(" "), /acceptance must be/);

  const noRef = mod.normalizeLedgerRow({ ref_type: "task" });
  assert.equal(noRef.ok, false);
  assert.match(noRef.errors.join(" "), /ref_id/);
});

test("numeric fields are clamped to non-negative integers", () => {
  const { row } = mod.normalizeLedgerRow({
    ref_type: "task", ref_id: "t1", duration_ms: -3, retries: "2", est_cost_cents: -10,
  });
  assert.equal(row.duration_ms, 0);
  assert.equal(row.retries, 2);
  assert.equal(row.est_cost_cents, 0);
});

// --- task mapping ----------------------------------------------------------
test("task rows carry duration, retries, provider and acceptance", () => {
  const rows = mod.taskLedgerRows([
    {
      task_id: "abc", agent_id: "eng", status: "completed", attempts: 3,
      started_at: "2026-11-02T10:00:00Z", completed_at: "2026-11-02T10:01:30Z",
      result: "shipped https://github.com/Lazynext-AI/accessibility-checker/pull/12",
    },
    { task_id: "def", agent_id: "qa", status: "failed", attempts: 1, created_at: "2026-11-02T10:00:00Z", completed_at: "2026-11-02T10:00:05Z" },
    { task_id: "ghi", agent_id: "qa", status: "escalated", attempts: 4 },
    { task_id: "jkl", agent_id: "qa", status: "pending", attempts: 0 },
  ], "@cf/meta/llama-3.3-70b-instruct-fp8-fast");

  assert.equal(rows.length, 3, "pending rows are not outcomes");
  assert.equal(rows[0].duration_ms, 90_000);
  assert.equal(rows[0].retries, 2, "attempts - 1");
  assert.equal(rows[0].acceptance, "passed");
  assert.equal(rows[0].provider, "workers-ai");
  assert.equal(rows[0].model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.match(rows[0].downstream_note, /pull\/12/);
  assert.equal(rows[0].dedupe_key, "task:abc");

  assert.equal(rows[1].acceptance, "failed");
  assert.equal(rows[1].duration_ms, 5_000);
  assert.equal(rows[1].downstream_note, null);
  assert.equal(rows[2].acceptance, "n/a", "escalation needs a human, it is not a failure");
  assert.equal(rows[2].retries, 3);
  assert.equal(rows[2].duration_ms, null);
});

test("an unparseable timestamp yields no duration instead of a negative one", () => {
  const [row] = mod.taskLedgerRows([
    { task_id: "x", status: "completed", started_at: "nonsense", completed_at: "2026-11-02T10:00:00Z" },
  ]);
  assert.equal(row.duration_ms, null);
});

// --- campaign mapping ------------------------------------------------------
test("campaign rows join engagement by tag and cost by recipients", () => {
  const rows = mod.campaignLedgerRows(
    [
      { id: 7, name: "warm", status: "sent", sent_count: 9, sent_at: "2026-11-02T00:00:00Z" },
      { id: 8, name: "draft", status: "draft", sent_count: 0 },
      { id: 9, name: "empty", status: "sent", sent_count: 0 },
    ],
    { "campaign:7": { opens: 6, clicks: 2 } },
  );
  assert.equal(rows.length, 2, "drafts are not outcomes");
  assert.equal(rows[0].est_cost_cents, 9);
  assert.equal(rows[0].acceptance, "passed");
  assert.match(rows[0].downstream_note, /sent 9; opens 6; clicks 2/);
  assert.equal(rows[0].dedupe_key, "campaign:7");
  assert.equal(rows[1].acceptance, "failed", "a send that reached nobody is not a pass");
});

test("missing engagement degrades to zeros, not an error", () => {
  const [row] = mod.campaignLedgerRows([{ id: 3, status: "sent", sent_count: 4 }]);
  assert.match(row.downstream_note, /opens 0; clicks 0/);
});

// --- persistence -----------------------------------------------------------
test("appendLedger inserts with a dedupe key and reports duplicates", async () => {
  let first = true;
  const db = fakeDb([
    {
      match: /INSERT OR IGNORE INTO outcome_ledger/,
      handle: () => {
        const changes = first ? 1 : 0;
        first = false;
        return { meta: { changes } };
      },
    },
  ]);
  const a = await mod.appendLedger({ DB: db }, { ref_type: "task", ref_id: "t1", dedupe_key: "task:t1", acceptance: "passed" });
  assert.deepEqual(a, { ok: true, inserted: true });
  const b = await mod.appendLedger({ DB: db }, { ref_type: "task", ref_id: "t1", dedupe_key: "task:t1", acceptance: "passed" });
  assert.deepEqual(b, { ok: true, inserted: false });
});

test("appendLedger rejects an invalid row before touching D1", async () => {
  const db = fakeDb();
  const out = await mod.appendLedger({ DB: db }, { ref_type: "nope", ref_id: "" });
  assert.equal(out.ok, false);
  assert.equal(db.calls.length, 0);
});

test("a live dispatch row is recorded best-effort and never throws", async () => {
  const db = fakeDb();
  await mod.recordDispatchLedger({ DB: db }, "brevo", { ok: true, duration_ms: 42, source: "direct" });
  const insert = db.calls.find((c) => /INSERT OR IGNORE INTO outcome_ledger/.test(c.sql));
  assert.ok(insert);
  assert.equal(insert.params[0], "connector");
  assert.equal(insert.params[1], "brevo");
  assert.equal(insert.params[8], "passed");
  // A D1 failure is swallowed: the send already happened.
  await mod.recordDispatchLedger({ DB: { prepare() { throw new Error("boom"); } } }, "brevo", { ok: false });
});

test("the daily build is idempotent through dedupe_key", async () => {
  const seen = new Set();
  const db = fakeDb([
    { match: /FROM task_log/, handle: () => ({ results: [{ task_id: "t1", status: "completed", attempts: 1 }] }) },
    { match: /FROM email_campaigns/, handle: () => ({ results: [{ id: 5, status: "sent", sent_count: 3 }] }) },
    { match: /FROM email_events/, handle: () => ({ results: [{ tag: "campaign:5", event: "uniqueOpened", c: 2 }, { tag: "campaign:5", event: "click", c: 1 }] }) },
    {
      match: /INSERT OR IGNORE INTO outcome_ledger/,
      handle: (_sql, params) => {
        const key = params[10];
        const fresh = !seen.has(key);
        seen.add(key);
        return { meta: { changes: fresh ? 1 : 0 } };
      },
    },
  ]);
  const env = { DB: db };
  const one = await mod.buildOutcomeLedger(env);
  assert.deepEqual({ tasks: one.tasks, campaigns: one.campaigns, inserted: one.inserted }, { tasks: 1, campaigns: 1, inserted: 2 });
  const two = await mod.buildOutcomeLedger(env);
  assert.equal(two.inserted, 0, "a second build adds nothing");
});

test("engagement events are bucketed case- and separator-insensitively", async () => {
  const db = fakeDb([
    { match: /FROM task_log/, handle: () => ({ results: [] }) },
    { match: /FROM email_campaigns/, handle: () => ({ results: [{ id: 6, status: "sent", sent_count: 2 }] }) },
    { match: /FROM email_events/, handle: () => ({ results: [{ tag: "campaign:6", event: "unique_opened", c: 2 }, { tag: "campaign:6", event: "clicks", c: 1 }, { tag: "campaign:6", event: "delivered", c: 2 }] }) },
    { match: /INSERT OR IGNORE INTO outcome_ledger/, handle: (_s, p) => ({ meta: { changes: 1 }, note: p[9] }) },
  ]);
  const out = await mod.buildOutcomeLedger({ DB: db });
  assert.equal(out.campaigns, 1);
  const row = db.calls.find((c) => /INSERT OR IGNORE INTO outcome_ledger/.test(c.sql));
  assert.match(String(row.params[9]), /opens 2; clicks 1/, "delivered is not engagement");
});

// --- roll-up ---------------------------------------------------------------
test("summarize groups by ref_type + provider with a pass rate", () => {
  const groups = mod.summarizeLedger([
    { ref_type: "task", provider: "workers-ai", est_cost_cents: 0, acceptance: "passed" },
    { ref_type: "task", provider: "workers-ai", est_cost_cents: 0, acceptance: "failed" },
    { ref_type: "connector", provider: "brevo", est_cost_cents: 3, acceptance: "passed" },
    { ref_type: "connector", provider: null, est_cost_cents: 1, acceptance: null },
  ]);
  assert.equal(groups.length, 3);
  const tasks = groups.find((g) => g.ref_type === "task");
  assert.equal(tasks.total, 2);
  assert.equal(tasks.pass_rate, 0.5);
  const brevo = groups.find((g) => g.provider === "brevo");
  assert.equal(brevo.est_cost_cents, 3);
  assert.equal(brevo.pass_rate, 1);
  const none = groups.find((g) => g.provider === null);
  assert.equal(none.na, 1, "a null acceptance counts as n/a");
});

test("ledgerSummary clamps the window and returns totals", async () => {
  const db = fakeDb([
    {
      match: /FROM outcome_ledger/,
      handle: () => ({
        results: [
          { ref_type: "task", provider: "workers-ai", total: 4, est_cost_cents: 0, passed: 3, failed: 1, na: 0 },
          { ref_type: "connector", provider: "brevo", total: 2, est_cost_cents: 6, passed: 2, failed: 0, na: 0 },
        ],
      }),
    },
  ]);
  const res = await mod.ledgerSummary({ DB: db }, new URL("https://x.test/ledger/summary?days=9999"));
  const body = await readJson(res);
  assert.equal(body.days, 365);
  assert.equal(body.totals.total, 6);
  assert.equal(body.totals.est_cost_cents, 6);
  assert.equal(body.groups[0].pass_rate, 0.75);
});

// --- route ----------------------------------------------------------------
test("the append route derives cost from the provider", async () => {
  const db = fakeDb();
  const res = await mod.handleLedgerRoutes({ DB: db }, "/ledger/append", {
    ref_type: "connector", ref_id: "brevo", provider: "brevo", units: 5, acceptance: "passed",
  });
  assert.equal(res.status, 201);
  const insert = db.calls.find((c) => /INSERT OR IGNORE/.test(c.sql));
  assert.equal(insert.params[7], 5, "estimated from units, not asserted");
});

test("an invalid append is a 400 and the route ignores other paths", async () => {
  const db = fakeDb();
  const bad = await mod.handleLedgerRoutes({ DB: db }, "/ledger/append", { ref_type: "invoice", ref_id: "x" });
  assert.equal(bad.status, 400);
  assert.equal(await mod.handleLedgerRoutes({ DB: db }, "/ledger/other", {}), null);
});
