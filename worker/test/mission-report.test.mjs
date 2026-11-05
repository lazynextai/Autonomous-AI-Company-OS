// Mission → plan → outcome → cost report (roadmap C2). The route must be an
// honest read-only view over the existing ledger: exact where the schema has a
// join key, labelled `derived` where it does not, and never a fabricated zero.
// Same lift pattern as outcome-ledger.test.mjs, plus source assertions on the
// shipped wiring (route placement behind the API_TOKEN gate + OpenAPI entry).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, fakeDb, readJson } from "./helpers/lift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const mod = loadModule(
  "mission.ts",
  { json: jsonFn },
  [
    "missionReport", "missionTotals", "ledgerQueryFor", "GROUPING",
    "COST_KIND", "COST_DERIVATION",
  ],
);

const TASK = {
  task_id: "556ed705", agent_id: "customer_success_1",
  description: "Develop a strategy to increase customer retention and reduce churn",
  status: "completed", attempts: 1,
  started_at: "2026-11-04T23:23:23.781580+00:00",
  completed_at: "2026-11-04T23:23:39.210808+00:00",
  created_at: "2026-11-04T23:23:20.773002+00:00",
};

const TASK_ROW = {
  id: 45, ref_type: "task", ref_id: "556ed705", agent_id: "customer_success_1",
  provider: "workers-ai", model: null, duration_ms: 15429, retries: 0,
  est_cost_cents: 0, acceptance: "passed", downstream_note: null,
  dedupe_key: "task:556ed705", created_at: "2026-11-05T12:40:27.945Z",
};

const CONN_ROW = {
  id: 60, ref_type: "connector", ref_id: "brevo", agent_id: null,
  provider: "brevo", model: null, duration_ms: 42, retries: 1,
  est_cost_cents: 4, acceptance: "passed", downstream_note: "source: direct",
  dedupe_key: null, created_at: "2026-11-05T13:00:00.000Z",
};

const PKG = {
  id: 36, title: "email.send: brevo", objective: "object",
  proposed_action: "send via brevo", authority: "approval", outcome: "approved",
  decided_by: "founder", target: "brevo", expiry_at: "2026-12-31T00:00:00.000Z",
  cost_projection_cents: 1, executed_task_id: "556ed705",
  created_at: "2026-11-03T16:35:21.198Z", updated_at: "2026-11-03T16:36:00.000Z",
};

// --- grouping derivation ---------------------------------------------------
test("the grouping is derived, never stored — and says so", () => {
  assert.equal(mod.GROUPING.method, "derived");
  assert.equal(mod.GROUPING.lineage.available, false);
  assert.equal(mod.GROUPING.lineage.column, null);
  assert.match(mod.GROUPING.lineage.reason, /no parent_task_id \/ mission column/);
  assert.ok(mod.GROUPING.rules.length >= 4);
});

test("ledgerQueryFor uses the exact task join plus package targets", () => {
  const q = mod.ledgerQueryFor("t1", [
    { ...PKG, target: "brevo" },
    { ...PKG, target: "campaign:12" },
    { ...PKG, target: "" }, // no target -> nothing contributed
  ]);
  assert.match(q.sql, /ref_type = 'task' AND ref_id = \?/);
  assert.match(q.sql, /ref_type = 'connector' AND ref_id IN \(\?\)/);
  assert.match(q.sql, /ref_type = 'campaign' AND ref_id IN \(\?\)/);
  assert.deepEqual(q.params, ["t1", "brevo", "12"]);
});

// --- totals ----------------------------------------------------------------
test("totals sum duration, retries and est cost over measured rows with a pass rate", () => {
  const t = mod.missionTotals([
    { duration_ms: 15429, retries: 0, est_cost_cents: 0, acceptance: "passed" },
    { duration_ms: 42, retries: 1, est_cost_cents: 4, acceptance: "passed" },
    { duration_ms: null, retries: 0, est_cost_cents: 1, acceptance: "failed" },
  ]);
  assert.equal(t.row_count, 3);
  assert.equal(t.duration_ms, 15471);
  assert.equal(t.retries, 1);
  assert.equal(t.est_cost_cents, 5);
  assert.deepEqual(t.acceptance, { passed: 2, failed: 1, na: 0, pass_rate: 0.667 });
  assert.equal(t.cost_kind, "estimated");
  assert.match(t.cost_derivation, /estimateCostCents/);
});

test("totals label cost as estimated and never fabricate a zero", () => {
  const empty = mod.missionTotals([]);
  assert.equal(empty.row_count, 0);
  assert.equal(empty.duration_ms, null);
  assert.equal(empty.retries, null);
  assert.equal(empty.est_cost_cents, null);
  assert.equal(empty.acceptance, null);
  assert.equal(empty.cost_kind, "estimated", "the label is present even with nothing measured");
  assert.match(empty.cost_derivation, /estimateCostCents/);

  const partial = mod.missionTotals([{ duration_ms: null, retries: null, est_cost_cents: null, acceptance: null }]);
  assert.equal(partial.est_cost_cents, null, "an unmeasured row contributes nothing, not 0");
  assert.equal(partial.retries, null);
  assert.equal(partial.acceptance.pass_rate, null, "no judged rows -> no pass rate, not 0");
});

// --- route: full shape -----------------------------------------------------
test("a mission with a package + ledger rows returns the full shape", async () => {
  const db = fakeDb([
    { match: /FROM task_log/, handle: (_sql, _params, kind) => (kind === "first" ? TASK : { results: [TASK] }) },
    { match: /FROM decision_packages/, handle: () => ({ results: [PKG] }) },
    { match: /FROM outcome_ledger/, handle: () => ({ results: [TASK_ROW, CONN_ROW] }) },
  ]);
  const res = await mod.missionReport({ DB: db }, "556ed705");
  assert.equal(res.status, 200);
  const body = await readJson(res);

  assert.equal(body.task_id, "556ed705");
  assert.match(body.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  // task: description, agent, status, timestamps, attempts
  assert.equal(body.task.agent_id, "customer_success_1");
  assert.equal(body.task.description, TASK.description);
  assert.equal(body.task.status, "completed");
  assert.equal(body.task.attempts, 1);
  assert.equal(body.task.started_at, TASK.started_at);
  assert.equal(body.task.completed_at, TASK.completed_at);
  assert.equal(body.task.created_at, TASK.created_at);

  // package: authority/outcome/approved-by/expiry
  assert.equal(body.decision_packages.length, 1);
  assert.equal(body.decision_packages[0].authority, "approval");
  assert.equal(body.decision_packages[0].outcome, "approved");
  assert.equal(body.decision_packages[0].decided_by, "founder");
  assert.equal(body.decision_packages[0].expiry_at, PKG.expiry_at);
  assert.equal(body.decision_packages[0].executed_task_id, "556ed705");

  // ledger rows with link labels
  assert.equal(body.ledger_rows.length, 2);
  const taskRow = body.ledger_rows.find((r) => r.ref_type === "task");
  assert.equal(taskRow.link, "task_direct");
  assert.equal(taskRow.link_confidence, "exact");
  const connRow = body.ledger_rows.find((r) => r.ref_type === "connector");
  assert.equal(connRow.link, "package_target");
  assert.equal(connRow.link_confidence, "derived");
  assert.equal(connRow.est_cost_cents, 4);

  // totals
  assert.equal(body.totals.row_count, 2);
  assert.equal(body.totals.duration_ms, 15471);
  assert.equal(body.totals.retries, 1);
  assert.equal(body.totals.est_cost_cents, 4);
  assert.deepEqual(body.totals.acceptance, { passed: 2, failed: 0, na: 0, pass_rate: 1 });
  assert.equal(body.totals.cost_kind, "estimated");
  assert.match(body.totals.cost_derivation, /estimateCostCents/);

  // grouping honesty
  assert.equal(body.grouping.lineage.available, false);
});

// --- route: empty mission --------------------------------------------------
test("a mission with no ledger rows returns empty arrays and nulls, not zeros", async () => {
  const db = fakeDb([
    { match: /FROM task_log/, handle: (_sql, _params, kind) => (kind === "first" ? TASK : { results: [TASK] }) },
    { match: /FROM decision_packages/, handle: () => ({ results: [] }) },
    { match: /FROM outcome_ledger/, handle: () => ({ results: [] }) },
  ]);
  const res = await mod.missionReport({ DB: db }, "556ed705");
  const body = await readJson(res);

  assert.equal(body.decision_packages, null, "an empty package join is null, not []");
  assert.deepEqual(body.ledger_rows, []);
  assert.equal(body.totals.row_count, 0);
  assert.equal(body.totals.duration_ms, null);
  assert.equal(body.totals.retries, null);
  assert.equal(body.totals.est_cost_cents, null, "no measured cost: null, never 0");
  assert.equal(body.totals.acceptance, null);
  assert.equal(body.totals.cost_kind, "estimated");
});

// --- route: unknown task / invalid id --------------------------------------
test("a task that does not exist is a 404, not a zero-activity report", async () => {
  const db = fakeDb(); // every read returns empty
  const res = await mod.missionReport({ DB: db }, "nonexistent");
  assert.equal(res.status, 404);
  const body = await readJson(res);
  assert.equal(body.error, "task not found");
  assert.equal(body.task_id, "nonexistent");
});

test("an empty task id is a 400", async () => {
  const res = await mod.missionReport({ DB: dbNoop() }, "");
  assert.equal(res.status, 400);
});

function dbNoop() {
  return { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) }) };
}

// --- shipped wiring (source-level, same pattern as governance-routes) ------
const indexSource = readFileSync(join(HERE, "..", "src", "index.ts"), "utf8");
const specSource = readFileSync(join(HERE, "..", "src", "openapi.ts"), "utf8");
const ledgerSource = readFileSync(join(HERE, "..", "src", "ledger.ts"), "utf8");

test("the report route is dispatched inside the internal GET block, after the bearer gate", () => {
  // The route match must sit between the GET block opening and the POST 404,
  // i.e. inside route() which the fetch wrapper only reaches past the gate.
  const gateLine = indexSource.indexOf('if (auth !== `Bearer ${env.API_TOKEN}`) return unauthorized();');
  const routeCall = indexSource.indexOf('return await route(req, env, ctx, path);');
  const getBlock = indexSource.indexOf("if (req.method === \"GET\") {");
  const postGuard = indexSource.indexOf('if (req.method !== "POST") return json({ error: "not found" }, 404);');
  assert.ok(gateLine >= 0 && routeCall > gateLine, "route() must be reachable only past the bearer gate");
  const line = indexSource.split("\n").find((l) => l.includes("\\/report\\/mission\\/"));
  assert.ok(line, "the /report/mission/:taskId match must be in index.ts");
  assert.match(line, /\\\/report\\\/mission\\\//, "the match is anchored on the literal path");
  const idx = indexSource.indexOf("missionReport(env, mission[1])");
  assert.ok(idx > getBlock && idx < postGuard, "the handler must be dispatched in the internal GET block");
});

test("the report route is documented as x-internal with internalAuth", () => {
  const start = specSource.indexOf('"/report/mission/{taskId}": {');
  const end = specSource.indexOf('"/observer/reviews": {');
  assert.ok(start >= 0 && end > start, "openapi.ts must declare the route");
  const block = specSource.slice(start, end);
  assert.match(block, /"x-internal": true/);
  assert.match(block, /security: \[\{ internalAuth: \[\] \}\]/);
  assert.equal(/bearerAuth/.test(block), false, "an internal route must not inherit lzk_ auth");
  assert.match(block, /cost_kind/);
});

test("the response's cost derivation names the real estimateCostCents helper", () => {
  assert.match(ledgerSource, /export function estimateCostCents\(/);
  assert.match(mod.COST_DERIVATION, /estimateCostCents\(provider, units\) in worker\/src\/ledger\.ts/);
});