// Company template manifests (roadmap P5) — declarative data validated before
// activation, with no runtime side effects. The validator is pure; the route
// tests pin that activation only writes the KV intent pointer and never touches
// the live company_brain row the fleet reads.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// A fixed catalog the validator must test against — unknown ids are rejected.
const KNOWN = ["x", "brevo", "bluesky", "telegram"];

const mod = loadModule(
  "manifests.ts",
  { json: jsonFn, CONNECTOR_IDS: KNOWN, AUTHORITY_CLASSES: ["auto", "approval", "human_only"] },
  [
    "MANIFEST_NAME_RE", "MANIFEST_MAX_BYTES", "CONNECTOR_PERMISSIONS", "RISK_LEVELS",
    "cronShapeValid", "validateManifest", "validateAndStoreManifest", "activateManifest",
    "listManifests", "latestManifest", "handleManifestRoutes",
  ],
);

const VALID = {
  name: "company",
  version: 1,
  goals: ["Make the checker pass on 100 sites", "Keep the funnel tight"],
  roles: [
    { id: "cto", title: "Chief Technology Officer", mission: "Ship the product safely", autonomy: "approval" },
  ],
  connector_permissions: { x: "dispatch", brevo: "read" },
  review_thresholds: { cost_cents: 1000, min_evidence: 2, risk: "medium" },
  schedules: [
    { id: "daily_maintenance", cron: "0 3 * * *", enabled: true },
    { id: "probe", cron: "*/10 * * * *", enabled: true },
  ],
  notes: "Baseline template",
};

// --- cron shape ------------------------------------------------------------
test("five-field cron shapes are validated with bounds", () => {
  for (const ok of ["*/10 * * * *", "0 3 * * *", "15,45 9-17 1-15 * 1-5", "0 0 31 12 7", "* * * * *"]) {
    assert.equal(mod.cronShapeValid(ok), true, ok);
  }
  for (const bad of [
    "*/10 * * *",         // four fields
    "*/10 * * * * *",     // six fields
    "61 * * * *",         // minute out of range
    "* 24 * * *",         // hour out of range
    "0 0 32 * *",         // day of month
    "0 0 * 13 *",         // month
    "0 0 * * 8",          // dow
    "* * * * */**",       // malformed step
    "not a cron",         // no
  ]) {
    assert.equal(mod.cronShapeValid(bad), false, bad);
  }
});

// --- validator -------------------------------------------------------------
test("a well-formed manifest passes every check", () => {
  const result = mod.validateManifest(VALID);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.manifest.version, 1);
});

test("goals are required, 1-20 entries of 3-200 chars", () => {
  const noGoals = mod.validateManifest({ ...VALID, goals: [] });
  assert.equal(noGoals.ok, false);
  assert.match(noGoals.errors.join(" "), /goals must be an array of 1-20/);
  const tiny = mod.validateManifest({ ...VALID, goals: ["x"] });
  assert.equal(tiny.ok, false);
  assert.match(tiny.errors.join(" "), /goals\[0\]/);
});

test("unknown top-level keys and bad names are rejected", () => {
  const extra = mod.validateManifest({ ...VALID, optimizer_count: 5 });
  assert.equal(extra.ok, false);
  assert.match(extra.errors.join(" "), /unknown top-level key 'optimizer_count'/);
  const name = mod.validateManifest({ ...VALID, name: "Bad Name!" });
  assert.equal(name.ok, false);
  assert.match(name.errors.join(" "), /name must match/);
});

test("roles are data: unique slugs, bounded text, allowed autonomy", () => {
  const dupes = mod.validateManifest({
    ...VALID,
    roles: [
      { id: "cto", title: "T", mission: "M", autonomy: "auto" },
      { id: "cto", title: "T2", mission: "M2", autonomy: "approval" },
    ],
  });
  assert.equal(dupes.ok, false);
  assert.match(dupes.errors.join(" "), /is duplicated/);

  const badAutonomy = mod.validateManifest({
    ...VALID,
    roles: [{ id: "cto", title: "T", mission: "M", autonomy: "god" }],
  });
  assert.equal(badAutonomy.ok, false);
  assert.match(badAutonomy.errors.join(" "), /autonomy must be auto\|approval\|human_only/);

  const noMission = mod.validateManifest({ ...VALID, roles: [{ id: "ceo", title: "CEO" }] });
  assert.equal(noMission.ok, false);
});

test("connector permissions must reference known connectors and known levels", () => {
  const unknown = mod.validateManifest({ ...VALID, connector_permissions: { shimmer: "dispatch" } });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join(" "), /'shimmer' is not a known connector/);

  const badLevel = mod.validateManifest({ ...VALID, connector_permissions: { x: "fire-and-forget" } });
  assert.equal(badLevel.ok, false);
  assert.match(badLevel.errors.join(" "), /must be none\|read\|dispatch\|admin/);

  const ok = mod.validateManifest({ ...VALID, connector_permissions: { x: "admin", brevo: "none" } });
  assert.equal(ok.ok, true);
});

test("review thresholds are bounded", () => {
  const bigCost = mod.validateManifest({ ...VALID, review_thresholds: { cost_cents: -1 } });
  assert.equal(bigCost.ok, false);
  const tooMany = mod.validateManifest({ ...VALID, review_thresholds: { min_evidence: 99 } });
  assert.equal(tooMany.ok, false);
  const risk = mod.validateManifest({ ...VALID, review_thresholds: { risk: "extreme" } });
  assert.equal(risk.ok, false);
});

test("schedules must fit the cron shape and stay slugs", () => {
  const badCron = mod.validateManifest({ ...VALID, schedules: [{ id: "daily", cron: "0 0 * *" }] });
  assert.equal(badCron.ok, false);
  assert.match(badCron.errors.join(" "), /cron must be a valid five-field/);
});

test("an oversized manifest is rejected outright", () => {
  const big = { ...VALID, notes: "x".repeat(mod.MANIFEST_MAX_BYTES) };
  const result = mod.validateManifest(big);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /exceeds 64KB/);
});

// --- routes ----------------------------------------------------------------
test("validate stores a valid manifest but does not activate it", async () => {
  const db = fakeDb();
  const res = await mod.validateAndStoreManifest({ DB: db }, VALID);
  const body = await readJson(res);
  assert.equal(body.ok, true);
  assert.equal(body.version, 1);
  assert.equal(body.activated, false);
  assert.match(body.note, /POST \/manifests\/activate/);
  const insert = db.calls.find((c) => /INSERT OR IGNORE INTO company_manifests/.test(c.sql));
  assert.ok(insert);
  assert.equal(insert.params[0], "company");
  assert.equal(JSON.parse(insert.params[2]).goals.length, 2, "the validated body is stored");
});

test("an invalid manifest is stored flagged invalid, so the rejection is diffable", async () => {
  const db = fakeDb();
  const res = await mod.validateAndStoreManifest({ DB: db }, { ...VALID, connector_permissions: { nope: "dispatch" } });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.ok, false);
  const insert = db.calls.find((c) => /INSERT OR IGNORE INTO company_manifests/.test(c.sql));
  assert.ok(insert, "the failed attempt is kept for the diff trail");
  assert.equal(insert.params[3], 0);
  assert.ok(JSON.parse(insert.params[4]).length > 0);
});

test("activation requires a stored, validated version and only writes the intent pointer", async () => {
  const db = fakeDb([
    {
      match: /FROM company_manifests WHERE name = \? AND version = \?/,
      handle: () => ({ id: 2, name: "company", version: 1, body: JSON.stringify(VALID), valid: 1, validation_errors: "[]" }),
    },
  ]);
  const kv = fakeKv();
  const res = await mod.activateManifest({ DB: db, EPHEMERAL: kv }, { name: "company", version: 1 });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.ok, true);
  assert.equal(body.intent_surface, "kv:config:manifest:active");
  const pointer = JSON.parse(kv.map.get("config:manifest:active"));
  assert.equal(pointer.version, 1);
  assert.equal(pointer.review_thresholds.cost_cents, 1000);
  // The fleet's live row is never touched — only the pointer write exists.
  assert.equal(db.calls.some((c) => /company_brain/.test(c.sql)), false);
});

test("an unvalidated or missing manifest cannot be activated", async () => {
  const invalid = fakeDb([
    { match: /FROM company_manifests WHERE name = \? AND version = \?/, handle: () => ({ id: 3, name: "company", version: 2, body: "{}", valid: 0, validation_errors: '["bad goals"]' }) },
  ]);
  const res = await mod.activateManifest({ DB: invalid, EPHEMERAL: fakeKv() }, { name: "company", version: 2 });
  assert.equal(res.status, 400);
  assert.match((await readJson(res)).error, /failed validation/);

  const missing = fakeDb([{ match: /FROM company_manifests/, handle: () => null }]);
  const nf = await mod.activateManifest({ DB: missing, EPHEMERAL: fakeKv() }, { name: "company", version: 9 });
  assert.equal(nf.status, 404);
});

test("activation re-activates by flipping pointers, never duplicating", async () => {
  const db = fakeDb([
    { match: /FROM company_manifests WHERE name = \? AND version = \?/, handle: () => ({ id: 5, name: "company", version: 2, body: JSON.stringify({ ...VALID, version: 2 }), valid: 1, validation_errors: "[]" }) },
  ]);
  const kv = fakeKv();
  await mod.activateManifest({ DB: db, EPHEMERAL: kv }, { name: "company", version: 2 });
  const deactivates = db.calls.filter((c) => /SET activated = 0/.test(c.sql));
  assert.equal(deactivates.length, 1, "the previous active row is cleared");
  const activates = db.calls.filter((c) => /SET activated = 1/.test(c.sql));
  assert.equal(activates.length, 1);
  assert.equal(JSON.parse(kv.map.get("config:manifest:active")).version, 2);
});

test("the route table answers validate and activate only", async () => {
  const db = fakeDb();
  const env = { DB: db, EPHEMERAL: fakeKv() };
  assert.equal((await mod.handleManifestRoutes(env, "/manifests/validate", VALID)).status, 200);
  assert.equal((await mod.handleManifestRoutes(env, "/manifests/other", {})), null);
});

test("listing hides the body unless asked and latest returns the active row", async () => {
  const db = fakeDb([{ match: /FROM company_manifests/, handle: () => ({ results: [{ id: 1, name: "company" }] }) }]);
  const res = await mod.listManifests({ DB: db }, new URL("https://x.test/manifests"));
  assert.equal(res.status, 200);
  assert.match(db.calls[0].sql, /^SELECT id, name, version, valid/);
  assert.ok(!/body/.test(db.calls[0].sql.split("FROM")[0]), "body is opt-in");

  const active = fakeDb([{ match: /FROM company_manifests WHERE activated = 1/, handle: () => ({ id: 4, name: "company", version: 2, valid: 1, activated: 1 }) }]);
  const latest = await mod.latestManifest({ DB: active });
  assert.equal((await readJson(latest)).active.version, 2);
});