// Execution lineage — `decision_packages.executed_task_id` (roadmap C2's link).
//
// C2 built the mission report over `executed_task_id`, but nothing ever wrote
// that column (a live read: all 39 production packages NULL), so the
// approval → execution → cost chain was structurally dormant. This pins the
// seam that fixes it: the transition to `executed` is the only moment that can
// honestly stamp a task id, and the stamp is first-wins.
//
// Unlike the other governance tests these run the SHIPPED SQL against a real
// in-memory SQLite (node:sqlite) instead of a fake-DB spy, because the
// idempotency guarantee lives in the SQL itself (`COALESCE(executed_task_id,?)`)
// — an assertion on parameter order would pass for a broken statement.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, fakeKv, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Mirrors db/migrations/011 + the self-heal DDL in decisions.ts; task_log and
// outcome_ledger are the minimum columns missionReport reads.
const SCHEMA = `
CREATE TABLE decision_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  objective TEXT,
  proposed_action TEXT,
  authority TEXT NOT NULL DEFAULT 'auto',
  evidence TEXT DEFAULT '[]',
  cost_projection_cents INTEGER NOT NULL DEFAULT 0,
  target TEXT,
  expiry_at TEXT,
  decided_by TEXT,
  outcome TEXT NOT NULL DEFAULT 'draft',
  rollback TEXT,
  executed_task_id TEXT,
  voided_reason TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE TABLE episodic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT, payload TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE task_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT, agent_id TEXT, description TEXT, status TEXT, attempts INTEGER,
  result TEXT, error_log TEXT, performance_score REAL,
  started_at TEXT, completed_at TEXT, created_at TEXT
);
CREATE TABLE outcome_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT, ref_id TEXT, agent_id TEXT, provider TEXT, model TEXT,
  duration_ms INTEGER, retries INTEGER, est_cost_cents INTEGER, acceptance TEXT,
  downstream_note TEXT, dedupe_key TEXT, created_at TEXT
);
`;

/** D1-shaped adapter over a real SQLite database (prepare/bind/run/first/all). */
function sqliteDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  const calls = [];
  return {
    sqlite,
    calls,
    prepare(sql) {
      const params = [];
      const stmt = {
        sql,
        params,
        bind(...p) {
          params.push(...p);
          return stmt;
        },
        async run() {
          calls.push({ sql, params });
          const info = sqlite.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        },
        async first() {
          calls.push({ sql, params });
          return sqlite.prepare(sql).get(...params) ?? null;
        },
        async all() {
          calls.push({ sql, params });
          return { results: sqlite.prepare(sql).all(...params) };
        },
      };
      return stmt;
    },
    row(id) {
      return sqlite.prepare("SELECT * FROM decision_packages WHERE id = ?").get(id);
    },
    seedPackage(fields = {}) {
      const values = {
        title: "email.send: brevo", proposed_action: "send via brevo", authority: "approval",
        target: "brevo", cost_projection_cents: 1, outcome: "draft", ...fields,
      };
      const cols = Object.keys(values);
      const info = sqlite
        .prepare(`INSERT INTO decision_packages (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .run(...cols.map((c) => values[c]));
      return Number(info.lastInsertRowid);
    },
  };
}

const decisionsModule = () =>
  loadModule(
    "decisions.ts",
    { json: jsonFn },
    [
      "closeDispatchDecision", "decideDecisionPackage", "createDecisionPackage",
      "openDispatchDecision", "DECISION_OUTCOMES",
    ],
  );

const missionModule = () => loadModule("mission.ts", { json: jsonFn }, ["missionReport"]);

// --- the seam: closing a dispatch as executed ------------------------------
test("closing as executed WITH a task id stamps it in the same UPDATE", async () => {
  const db = sqliteDb();
  const id = db.seedPackage();
  const mod = decisionsModule();

  await mod.closeDispatchDecision({ DB: db }, id, true, undefined, "task-abc123");

  const row = db.row(id);
  assert.equal(row.outcome, "executed");
  assert.equal(row.decided_by, "dispatch");
  assert.equal(row.executed_task_id, "task-abc123");
  const updates = db.calls.filter((c) => /UPDATE decision_packages/.test(c.sql));
  assert.equal(updates.length, 1, "one statement, no extra round trip");
});

test("closing as executed WITHOUT a task id leaves the column NULL", async () => {
  const db = sqliteDb();
  const id = db.seedPackage();
  const mod = decisionsModule();

  await mod.closeDispatchDecision({ DB: db }, id, true);

  const row = db.row(id);
  assert.equal(row.outcome, "executed");
  assert.equal(row.executed_task_id, null, "no task lineage means NULL, never an invented id");
});

test("a failed dispatch never stamps a task, even when one was supplied", async () => {
  const db = sqliteDb();
  const id = db.seedPackage();
  const mod = decisionsModule();

  await mod.closeDispatchDecision({ DB: db }, id, false, "provider 500", "task-abc123");

  const row = db.row(id);
  assert.equal(row.outcome, "failed", "the outcome is kept");
  assert.equal(row.executed_task_id, null, "an attempt is not an execution");
});

test("re-execution never overwrites the first stamp (COALESCE, first wins)", async () => {
  const db = sqliteDb();
  const id = db.seedPackage();
  const mod = decisionsModule();

  await mod.closeDispatchDecision({ DB: db }, id, true, undefined, "task-first");
  // The dispatch guard (AND outcome = 'draft') makes an immediate second close a
  // no-op; put the row back in draft to model a genuine re-execution of the
  // same package and prove the column itself is write-once.
  db.sqlite.prepare("UPDATE decision_packages SET outcome = 'draft' WHERE id = ?").run(id);
  await mod.closeDispatchDecision({ DB: db }, id, true, undefined, "task-second");

  assert.equal(db.row(id).executed_task_id, "task-first", "the first real execution owns the lineage");
});

test("the executed_task_id is capped and trimmed like every other text field", async () => {
  const db = sqliteDb();
  const id = db.seedPackage();
  const mod = decisionsModule();

  await mod.closeDispatchDecision({ DB: db }, id, true, undefined, `  ${"t".repeat(300)}  `);

  const stamp = db.row(id).executed_task_id;
  assert.equal(stamp.length, 120);
  assert.equal(stamp.trim(), stamp);
});

// --- the operator seam: decide -> executed ---------------------------------
test("the decide route stamps executed_task_id it is given, on the executed transition", async () => {
  const db = sqliteDb();
  const id = db.seedPackage({ outcome: "approved" });
  const mod = decisionsModule();

  const res = await mod.decideDecisionPackage(
    { DB: db },
    id,
    { outcome: "executed", decided_by: "founder", executed_task_id: "task-op-1" },
  );
  assert.equal(res.status, 200);
  assert.equal(db.row(id).executed_task_id, "task-op-1");

  const audit = db.sqlite.prepare("SELECT payload FROM episodic_events WHERE scope = 'decision'").get();
  assert.match(String(audit.payload), /"executed_task_id":"task-op-1"/, "the audit row names the task too");
});

test("an executed_task_id supplied on a non-executed transition is ignored", async () => {
  const db = sqliteDb();
  const id = db.seedPackage({ outcome: "draft" });
  const mod = decisionsModule();

  await mod.decideDecisionPackage({ DB: db }, id, { outcome: "approved", executed_task_id: "task-nope" });

  const row = db.row(id);
  assert.equal(row.outcome, "approved");
  assert.equal(row.executed_task_id, null, "approval runs nothing, so it cannot claim a task");
});

test("voiding an executed package keeps its stamp (rollback is not amnesia)", async () => {
  const db = sqliteDb();
  const id = db.seedPackage({ outcome: "approved" });
  const mod = decisionsModule();

  await mod.decideDecisionPackage({ DB: db }, id, { outcome: "executed", executed_task_id: "task-keep" });
  await mod.decideDecisionPackage({ DB: db }, id, { outcome: "voided", reason: "rolled back" });

  const row = db.row(id);
  assert.equal(row.outcome, "voided");
  assert.equal(row.executed_task_id, "task-keep");
});

// --- the consumer: C2's mission report -------------------------------------
test("missionReport returns the stamped package with link_confidence exact", async () => {
  const db = sqliteDb();
  const mod = decisionsModule();
  const mission = missionModule();
  const env = { DB: db, EPHEMERAL: fakeKv() };

  const created = await mod.createDecisionPackage(env, {
    title: "x: launch post", proposed_action: "post via x", target: "x",
  });
  const { id } = await readJson(created);
  await mod.closeDispatchDecision(env, id, true, undefined, "task-mission-1");

  db.sqlite.prepare(
    "INSERT INTO task_log (task_id, agent_id, description, status, attempts) VALUES (?,?,?,?,?)",
  ).run("task-mission-1", "marketing_1", "post the launch copy", "completed", 1);

  const res = await mission.missionReport(env, "task-mission-1");
  assert.equal(res.status, 200);
  const body = await readJson(res);

  assert.equal(body.decision_packages.length, 1);
  const pkg = body.decision_packages[0];
  assert.equal(pkg.id, id);
  assert.equal(pkg.executed_task_id, "task-mission-1");
  assert.equal(pkg.link, "package_direct");
  assert.equal(pkg.link_confidence, "exact", "an exact join key must not be reported as derived");
  assert.equal(pkg.outcome, "executed");
});

test("an unstamped package never appears in a task's mission", async () => {
  const db = sqliteDb();
  const mod = decisionsModule();
  const mission = missionModule();
  const env = { DB: db, EPHEMERAL: fakeKv() };

  // Executed with no lineage, plus one stamped with a different task.
  const unattributed = db.seedPackage();
  await mod.closeDispatchDecision(env, unattributed, true);
  const other = db.seedPackage();
  await mod.closeDispatchDecision(env, other, true, undefined, "task-somebody-else");

  db.sqlite.prepare(
    "INSERT INTO task_log (task_id, agent_id, description, status, attempts) VALUES (?,?,?,?,?)",
  ).run("task-lonely", "cto_1", "nothing dispatched", "completed", 1);

  const body = await readJson(await mission.missionReport(env, "task-lonely"));
  assert.equal(body.decision_packages, null, "no link is null, not an empty list and not another task's row");
});

// --- wiring: which dispatch callers can supply a task id -------------------
const servicesSource = readFileSync(join(HERE, "..", "src", "services.ts"), "utf8");
const missionSource = readFileSync(join(HERE, "..", "src", "mission.ts"), "utf8");
const specSource = readFileSync(join(HERE, "..", "src", "openapi.ts"), "utf8");

test("the direct dispatch path forwards a caller-supplied task_id and strips it from the payload", () => {
  assert.match(servicesSource, /typeof b\.task_id === "string"/, "the id must come from the caller, never be derived");
  assert.match(servicesSource, /delete payload\.task_id/, "it must not leak into the provider payload");
  assert.match(servicesSource, /callConnector\(env, id, cred \?\? "", payload\)/);
  assert.match(
    servicesSource,
    /closeDispatchDecision\(env, decisionId, out\.ok, out\.error, taskRef \|\| null\)/,
    "the stamp must ride the close call that sets outcome=executed",
  );
});

test("a real dispatch through handleServices stamps the task and never sends the id to the provider", async () => {
  const closed = [];
  const mod = loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "admin" }, res: null }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => ({ allow: true, enforced: false, scope: "off" }),
      openDispatchDecision: async () => ({ id: 22, authority: "approval" }),
      closeDispatchDecision: async (_e, id, ok, note, taskId) => closed.push({ id, ok, note, taskId }),
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["handleServices"],
  );

  const realFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (_url, init) => {
    sentBody = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify({ data: { id: "1" } }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const res = await mod.handleServices(
      new Request("https://x.test/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "launch post", task_id: "task-from-body" }),
      }),
      { DB: sqliteDb(), EPHEMERAL: { get: async () => "cred", delete: async () => {} } },
      { waitUntil() {}, passThroughOnException() {} },
      "/api/v1/connectors/x",
    );
    assert.equal(res.status, 200);
    assert.deepEqual(closed, [{ id: 22, ok: true, note: undefined, taskId: "task-from-body" }]);
    assert.deepEqual(sentBody, { text: "launch post" }, "task_id must not reach the provider");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the same dispatch without a task id closes the package unstamped", async () => {
  const closed = [];
  const mod = loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "admin" }, res: null }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => ({ allow: true, enforced: false, scope: "off" }),
      openDispatchDecision: async () => ({ id: 23, authority: "approval" }),
      closeDispatchDecision: async (_e, id, ok, note, taskId) => closed.push({ id, ok, note, taskId }),
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["handleServices"],
  );

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { id: "1" } }), { status: 201, headers: { "content-type": "application/json" } });
  try {
    const res = await mod.handleServices(
      new Request("https://x.test/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "ad-hoc post" }),
      }),
      { DB: sqliteDb(), EPHEMERAL: { get: async () => "cred", delete: async () => {} } },
      { waitUntil() {}, passThroughOnException() {} },
      "/api/v1/connectors/x",
    );
    assert.equal(res.status, 200);
    assert.equal(closed[0].taskId, null, "no task in scope means a NULL stamp");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the scheduled path passes no task id and says why", () => {
  // A cron/queue-claimed row has no task lineage column to read it from.
  const close = servicesSource.match(/await closeDispatchDecision\(env, decisionId, true\)/);
  assert.ok(close, "the scheduled success close carries no task id");
  assert.match(servicesSource, /social_posts\s*`?\s*carries no task lineage column|carries no task lineage column/);
});

test("missionReport labels the package join exact, not derived", () => {
  assert.match(missionSource, /link: "package_direct"/);
  assert.match(missionSource, /link_confidence: "exact"/);
  assert.match(missionSource, /WHERE executed_task_id = \?/, "the join key is the stamp itself");
});

test("both stamping seams and the accepted field are documented in the API table", () => {
  const decide = specSource.slice(
    specSource.indexOf('"/decision/packages/{id}/decide": {'),
    specSource.indexOf('"/decision/packages/{id}/void": {'),
  );
  assert.match(decide, /executed_task_id/, "the decide body documents the stamp");
  const dispatch = specSource.slice(
    specSource.indexOf('"/api/v1/connectors/{id}": {'),
    specSource.indexOf('"/api/v1/social/posts": {'),
  );
  assert.match(dispatch, /task_id/, "the dispatch body documents the optional lineage field");
  assert.match(dispatch, /stripped before the provider call/);
});
