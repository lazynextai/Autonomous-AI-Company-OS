// Company template packs (C5, roadmap §5) — starter manifests authored as
// data in templates/*.json, validated by the SHIPPED validator and served by
// the internal GET /templates catalogue. The packs are read from the real
// files (never a copy), so a pack that stops validating fails here, not in
// production. The connector catalog and the agent roster are lifted from the
// shipped sources too — a pack cannot name a connector that no longer exists
// or a persona the fleet does not actually run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, readJson } from "./helpers/lift.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(dir, "..", "..");

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Real connector catalog (same lift technique as connect-oauth.test.mjs).
const svc = readFileSync(join(ROOT, "worker", "src", "services.ts"), "utf8");
const catalog = svc.match(/const CONNECTOR_IDS = \[([\s\S]*?)\];/);
assert.ok(catalog, "CONNECTOR_IDS not found in services.ts");
const CONNECTOR_IDS = [...catalog[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

// Real fleet roster — (AgentClass, "id_1", "role") tuples in run_agents.py.
const fleet = readFileSync(join(ROOT, "scripts", "run_agents.py"), "utf8");
const AGENT_ROLES = [...fleet.matchAll(/\(\w+Agent,\s*"[a-z0-9_]+",\s*"([a-z_]+)"\)/g)].map((m) => m[1]);
assert.ok(AGENT_ROLES.length >= 10, "agent roster not found in run_agents.py");

const PACK_FILES = ["lean-startup.json", "agency-accessibility.json"];
const PACKS = PACK_FILES.map((f) => [f, JSON.parse(readFileSync(join(ROOT, "templates", f), "utf8"))]);

const manifests = loadModule(
  "manifests.ts",
  { json: jsonFn, CONNECTOR_IDS, AUTHORITY_CLASSES: ["auto", "approval", "human_only"] },
  ["validateManifest"],
);
const templates = loadModule(
  "templates.ts",
  { json: jsonFn, leanStartup: PACKS[0][1], agencyAccessibility: PACKS[1][1] },
  ["TEMPLATE_PACKS", "listTemplatePacks"],
);

// --- packs validate ---------------------------------------------------------
test("every starter pack passes the shipped manifest validator", () => {
  for (const [file, pack] of PACKS) {
    const result = manifests.validateManifest(pack);
    assert.equal(result.ok, true, `${file}: ${result.errors.join("; ")}`);
    assert.deepEqual(result.errors, []);
    assert.equal(result.manifest.version, 1);
    assert.match(result.manifest.name, /^[a-z][a-z0-9-]{0,39}$/);
  }
});

test("packs stay honest: no admin permission, no invented personas", () => {
  for (const [file, pack] of PACKS) {
    for (const [id, perm] of Object.entries(pack.connector_permissions)) {
      assert.notEqual(perm, "admin", `${file}: connector '${id}' must not default to admin`);
    }
    for (const role of pack.roles) {
      assert.ok(AGENT_ROLES.includes(role.id), `${file}: role '${role.id}' is not an agent the fleet runs`);
    }
  }
});

test("the two packs describe genuinely different company shapes", () => {
  const [lean, agency] = PACKS.map(([, p]) => p);
  assert.notEqual(lean.name, agency.name);
  assert.notDeepEqual(lean.goals, agency.goals);
  // The agency pack is stricter on all three client-facing thresholds.
  assert.ok(agency.review_thresholds.cost_cents < lean.review_thresholds.cost_cents);
  assert.ok(agency.review_thresholds.min_evidence > lean.review_thresholds.min_evidence);
  assert.equal(agency.review_thresholds.risk, "high");
});

test("the validator rejects a tampered pack", () => {
  const base = PACKS[0][1];
  const tampered = [
    { label: "no goals", body: { ...base, goals: [] } },
    { label: "unknown connector", body: { ...base, connector_permissions: { mysterium: "dispatch" } } },
    { label: "bad autonomy", body: { ...base, roles: [{ id: "ceo", title: "T", mission: "M", autonomy: "god" }] } },
    { label: "bad cron", body: { ...base, schedules: [{ id: "tick", cron: "0 0 * *" }] } },
    { label: "empty description", body: { ...base, description: "" } },
    { label: "invented manifest key", body: { ...base, optimizer_count: 5 } },
  ];
  for (const { label, body } of tampered) {
    assert.equal(manifests.validateManifest(body).ok, false, label);
  }
});

// --- catalogue endpoint -----------------------------------------------------
test("GET /templates lists both packs with name, description and version", async () => {
  const res = templates.listTemplatePacks(new URL("https://x.test/templates"));
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.packs.length, 2);
  assert.deepEqual(body.packs.map((p) => p.name), PACKS.map(([, p]) => p.name));
  for (const p of body.packs) {
    assert.match(p.description, /\S/);
    assert.equal(p.version, 1);
    assert.equal(p.body, undefined, "bodies are opt-in");
  }
});

test("?include_body=1 returns the exact pack body for the validate path", async () => {
  const body = await readJson(templates.listTemplatePacks(new URL("https://x.test/templates?include_body=1")));
  for (const [file, pack] of PACKS) {
    const listed = body.packs.find((p) => p.name === pack.name);
    assert.ok(listed, `${file} is listed`);
    assert.deepEqual(listed.body, pack, file);
  }
});

test("the bundled catalogue is the pack files, not a drifting copy", () => {
  assert.equal(templates.TEMPLATE_PACKS.length, 2);
  templates.TEMPLATE_PACKS.forEach((p, i) => assert.deepEqual(p, PACKS[i][1], PACKS[i][0]));
});

test("the internal route table exposes GET /templates", () => {
  const idx = readFileSync(join(ROOT, "worker", "src", "index.ts"), "utf8");
  assert.match(idx, /import \{ listTemplatePacks \} from "\.\/templates"/);
  assert.match(idx, /path === "\/templates"\) return listTemplatePacks/);
});
