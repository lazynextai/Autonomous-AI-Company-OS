// Capability / readiness matrix (roadmap P3) — honest states, zero-side-effect
// probe targets, the 6h refresh gate, and the breadcrumb roll-up. The probe
// loop itself is only ever exercised with stubbed fetch; no live probes in CI.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const stubServices = {
  CONNECTOR_IDS: ["x", "brevo", "github", "gitlab", "telegram", "linkedin", "slack"],
  connCred: async (_env, id) => (id === "slack" ? null : `cred:${id}`),
  brevoCred: async () => ({ from: "support@lazynext.com", key: "k" }),
};

const mod = loadModule(
  "readiness.ts",
  { json: jsonFn, ...stubServices },
  [
    "STALE_MS", "probeFor", "classifyCapability", "matrixSummary", "readinessBreadcrumbs",
    "refreshCapabilityReadiness", "capabilityMatrix",
  ],
);

// --- probe targets ---------------------------------------------------------
test("probe targets are read-only GETs that never touch a credential store", () => {
  assert.ok(mod.probeFor("x", "tok").url.startsWith("https://"));
  assert.ok(mod.probeFor("brevo", "k").url.includes("api.brevo.com"));
  assert.ok(mod.probeFor("github", "t").headers["user-agent"] === "lazynext-readiness-probe");
  assert.equal(mod.probeFor("slack", ""), null, "a write-only connector has no probe");
  assert.equal(mod.probeFor("linkedin", "x"), null);
  assert.equal(mod.probeFor("telegram", ""), null, "a malformed telegram cred yields no probe");
  assert.ok(mod.probeFor("telegram", "123:abc").url.includes("/getMe"));
  for (const target of ["x", "brevo", "github", "gitlab", "telegram"].map((c) => mod.probeFor(c, "c"))) {
    assert.ok(target && !/:\/\/.*(set|post|create|send)/i.test(target.url), "probes never mutate");
  }
});

// --- classification --------------------------------------------------------
test("states distinguish configured, probed, stale and documented-only", () => {
  const base = { configured: true, documented: true, probe_supported: true };
  const now = Date.now();
  const fresh = new Date(now - 60_000).toISOString();

  assert.equal(mod.classifyCapability({ ...base, configured: false, documented: false }, now), "absent");
  assert.equal(mod.classifyCapability({ ...base, configured: false, documented: true }, now), "documented-only");
  assert.equal(mod.classifyCapability({ ...base, last_probe_at: null }, now), "configured-unprobed");
  assert.equal(mod.classifyCapability({ ...base, last_probe_at: fresh, last_probe_ok: 1 }, now), "probe-ok");
  assert.equal(mod.classifyCapability({ ...base, last_probe_at: fresh, last_probe_ok: 0 }, now), "probe-failed");
  assert.equal(mod.classifyCapability({ ...base, last_probe_at: new Date(now - 8 * 86_400_000).toISOString(), last_probe_ok: 1 }, now), "stale");
  assert.equal(mod.classifyCapability({ ...base, last_probe_at: "garbage", last_probe_ok: 1 }, now), "stale");
});

test("an unprobeable connector stays configured-unprobed, never probe-ok", () => {
  const facts = { configured: true, documented: true, probe_supported: false, last_probe_at: null, last_probe_ok: null };
  assert.equal(mod.classifyCapability(facts), "configured-unprobed");
});

test("matrixSummary counts every state", () => {
  const summary = mod.matrixSummary([
    { state: "probe-ok" }, { state: "probe-ok" }, { state: "stale" },
    { state: "documented-only" }, { state: "absent" }, { state: "configured-unprobed" },
  ]);
  assert.deepEqual(summary, {
    total: 6, "probe-ok": 2, "probe-failed": 0, stale: 1,
    "configured-unprobed": 1, "documented-only": 1, absent: 1,
  });
});

// --- breadcrumbs -----------------------------------------------------------
test("breadcrumb roll-up scores freshness and staleness", async () => {
  const now = Date.now();
  const kv = fakeKv({
    "cron:last_tick": JSON.stringify({ at: now - 60_000 }),
    "maint:last_run": JSON.stringify({ at: now - 30 * 3_600_000 }),
    "seq:last_run": "1234567890",
  });
  const crumbs = await mod.readinessBreadcrumbs({ EPHEMERAL: kv }, now);
  const cron = crumbs.find((c) => c.key === "cron:last_tick");
  assert.equal(cron.stale, false);
  const maint = crumbs.find((c) => c.key === "maint:last_run");
  assert.equal(maint.stale, true);
  const missing = crumbs.find((c) => c.key === "billing:last_reconcile");
  assert.equal(missing.present, false);
  assert.equal(missing.stale, true);
  const bare = crumbs.find((c) => c.key === "seq:last_run");
  assert.equal(bare.present, true);
});

// --- probe sweep -----------------------------------------------------------
test("the refresh is gated at 6h and skips a recent run", async () => {
  const kv = fakeKv({ "cap:last_probe": JSON.stringify({ at: Date.now() - 60_000 }) });
  const out = await mod.refreshCapabilityReadiness({ DB: fakeDb(), EPHEMERAL: kv });
  assert.equal(out.skipped, "recent");
  assert.equal(out.probed, 0);
});

test("a fresh sweep probes configured connectors and records failures without credentials", async () => {
  const calls = [];
  const kv = fakeKv();
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers });
    if (String(url).includes("api.brevo.com")) return new Response("nope", { status: 401 });
    if (String(url).includes("telegram.org")) return new Response("{}", { status: 200 });
    return new Response("ok", { status: 200 });
  };
  const db = fakeDb();
  try {
    const out = await mod.refreshCapabilityReadiness({ DB: db, EPHEMERAL: kv });
    // x, brevo, github, gitlab probe; telegram cred "cred:telegram" → token "cred" → probe with getMe; slack unconfigured.
    assert.equal(out.probed, 5);
    assert.equal(out.ok, 4);
    assert.equal(out.failed, 1);
    assert.equal(out.unsupported, 1, "slack is configured-unprobed, not probed");
    assert.equal(calls.length, 5, "only the five probeable connectors fetch");

    const inserts = db.calls.filter((c) => /INSERT INTO capability_readiness/.test(c.sql));
    assert.equal(inserts.length, 7, "every catalogued connector gets a row");
    assert.equal(db.calls.filter((c) => /INSERT INTO capability_readiness/.test(c.sql) && c.params[0] === "linkedin").length, 1);
    const slackRow = db.calls.find((c) => /INSERT INTO capability_readiness/.test(c.sql) && c.params[0] === "slack");
    assert.equal(slackRow.params[4], 0, "an unconfigured connector is recorded as unsupported, not probed");
  } finally {
    delete globalThis.fetch;
  }
});

test("a network error is recorded as a probe failure, not a crash", async () => {
  const kv = fakeKv();
  globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
  const db = fakeDb();
  try {
    const out = await mod.refreshCapabilityReadiness({ DB: db, EPHEMERAL: kv });
    assert.equal(out.failed, 5);
    assert.equal(out.ok, 0);
    const probe = db.calls.find((c) => /INSERT INTO capability_readiness/.test(c.sql) && c.params[0] === "x");
    assert.equal(probe.params[2], 0);
    assert.match(String(probe.params[3]), /ECONNREFUSED/);
    assert.equal(probe.params[4], 1, "the capability is documented even when the probe fails");
  } finally {
    delete globalThis.fetch;
  }
});

test("the matrix joins the readiness table with live credential presence", async () => {
  const kv = fakeKv({ "conn:x": "watch-me" });
  const db = fakeDb([
    {
      match: /FROM capability_readiness/,
      handle: () => ({
        results: [
          { capability: "x", last_probe_at: new Date().toISOString(), last_probe_ok: 1, last_error: null, documented: 1, probe_supported: 1, keystore: "kv" },
          { capability: "brevo", last_probe_at: null, last_probe_ok: null, last_error: null, documented: 1, probe_supported: 1, keystore: "kv" },
        ],
      }),
    },
  ]);
  const res = await mod.capabilityMatrix({ DB: db, EPHEMERAL: kv });
  const body = await readJson(res);
  assert.equal(body.summary["probe-ok"], 1);
  const x = body.connectors.find((c) => c.capability === "x");
  assert.equal(x.state, "probe-ok");
  assert.equal(x.configured, true);
  const brevo = body.connectors.find((c) => c.capability === "brevo");
  assert.equal(brevo.state, "configured-unprobed", "configured but never probed is not a claim of readiness");
  const slack = body.connectors.find((c) => c.capability === "slack");
  assert.equal(slack.configured, false);
  assert.equal(slack.documented, true);
  assert.equal(slack.state, "documented-only");
  assert.ok(Array.isArray(body.services), "the breadcrumb surfaces ride along");
});