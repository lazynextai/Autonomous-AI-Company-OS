// Governance decision packages (roadmap P1) — the record shape, the authority
// classification, the lifecycle transition table, and the fail-closed opener
// the dispatch paths use. Lifts the shipped TypeScript so the test cannot drift.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const mod = loadModule(
  "decisions.ts",
  { json: jsonFn },
  [
    "AUTHORITY_CLASSES", "DECISION_OUTCOMES", "classifyAuthority", "buildDecisionRecord",
    "normalizeEvidence", "parseExpiry", "canTransition", "createDecisionPackage",
    "decideDecisionPackage", "openDispatchDecision", "closeDispatchDecision",
    "expireDecisionPackages", "decisionGate", "handleDecisionRoutes", "listDecisionPackages", "evidenceForLead",
  ],
);

const evidenceTable = (rows = []) => [{ match: /FROM crm_lead_evidence/, handle: () => ({ results: rows }) }];

// --- authority classification ---------------------------------------------
test("authority classification follows the house rules", () => {
  const cases = [
    [{ type: "connector.dispatch", connector: "x" }, "approval"],
    [{ type: "connector.dispatch", connector: "linkedin" }, "approval"],
    [{ type: "connector.dispatch", connector: "slack" }, "auto"],
    [{ type: "connector.dispatch", connector: "discord" }, "auto"],
    [{ type: "connector.dispatch", connector: "signwell" }, "human_only"],
    [{ type: "billing.live_flip" }, "human_only"],
    [{ type: "payment.refund" }, "human_only"],
    [{ type: "identity.verify" }, "human_only"],
    [{ type: "manifest.activate" }, "approval"],
    [{ type: "ledger.append" }, "auto"],
    [{ type: "something.brand_new" }, "approval"],
  ];
  for (const [action, expected] of cases) {
    assert.equal(mod.classifyAuthority(action).authority, expected, JSON.stringify(action));
  }
});

test("an explicit human_only flag wins over the type rules", () => {
  assert.equal(mod.classifyAuthority({ type: "ledger.append", human_only: true }).authority, "human_only");
});

test("classification always carries a rationale", () => {
  const { authority, rationale } = mod.classifyAuthority({ type: "connector.dispatch", connector: "x" });
  assert.ok(rationale.length > 5, "a decision record needs a why");
  assert.equal(authority, "approval");
});

// --- record building -------------------------------------------------------
test("a valid record carries every governance field", () => {
  const built = mod.buildDecisionRecord(
    {
      title: "Ship the launch post",
      objective: "Announce the Pro tier",
      proposed_action: "POST x with the launch copy",
      authority: "approval",
      target: "x",
      cost_projection_cents: 12,
      expiry_at: "2030-01-01T00:00:00Z",
      rollback: "Delete the post",
      evidence: [
        { claim: "Pro tier is live", disposition: "verified", package_id: 4 },
        { claim: "Pricing is $9/mo", disposition: "inferred" },
      ],
    },
    { type: "connector.dispatch", connector: "x" },
  );
  assert.equal(built.ok, true);
  assert.deepEqual(built.errors, []);
  assert.equal(built.record.authority, "approval");
  assert.equal(built.record.cost_projection_cents, 12);
  assert.equal(built.record.expiry_at, "2030-01-01T00:00:00.000Z");
  assert.equal(built.record.evidence.length, 2);
  assert.equal(built.record.evidence[0].package_id, 4);
});

test("a record without a title or action is rejected, not stored", () => {
  const noTitle = mod.buildDecisionRecord({ proposed_action: "do a thing" }, {});
  assert.equal(noTitle.ok, false);
  assert.match(noTitle.errors.join(" "), /title/);
  const noAction = mod.buildDecisionRecord({ title: "A thing" }, {});
  assert.equal(noAction.ok, false);
  assert.match(noAction.errors.join(" "), /proposed_action/);
});

test("an unknown authority or bad evidence disposition is rejected", () => {
  const badAuthority = mod.buildDecisionRecord({ title: "t", proposed_action: "a", authority: "trust-me" }, {});
  assert.equal(badAuthority.ok, false);
  assert.match(badAuthority.errors.join(" "), /authority must be/);

  const badEvidence = mod.buildDecisionRecord(
    { title: "t", proposed_action: "a", evidence: [{ claim: "x", disposition: "probably" }] },
    {},
  );
  assert.equal(badEvidence.ok, false);
  assert.match(badEvidence.errors.join(" "), /verified\|inferred\|unknown/);
});

test("an unparseable expiry is a 400-class error, not a silent drop", () => {
  assert.equal(mod.parseExpiry("not-a-date").ok, false);
  assert.equal(mod.parseExpiry(null).value, null);
  assert.equal(mod.parseExpiry("1793649615840").ok, true);
  const built = mod.buildDecisionRecord({ title: "t", proposed_action: "a", expiry_at: "soon" }, {});
  assert.equal(built.ok, false);
  assert.match(built.errors.join(" "), /expiry_at/);
});

test("evidence is capped and normalized", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ claim: `c${i}`, disposition: "verified" }));
  const norm = mod.normalizeEvidence(many);
  assert.equal(norm.evidence.length, 25);
  assert.match(norm.errors.join(" "), /limited to 25/);
  assert.deepEqual(mod.normalizeEvidence("nope").errors, ["evidence must be an array"]);
});

// --- lifecycle -------------------------------------------------------------
test("the transition table never lets a terminal package move", () => {
  assert.equal(mod.canTransition("draft", "approved"), true);
  assert.equal(mod.canTransition("draft", "rejected"), true);
  assert.equal(mod.canTransition("approved", "executed"), true);
  assert.equal(mod.canTransition("approved", "expired"), true);
  assert.equal(mod.canTransition("executed", "voided"), true);
  assert.equal(mod.canTransition("rejected", "approved"), false);
  assert.equal(mod.canTransition("voided", "executed"), false);
  assert.equal(mod.canTransition("expired", "approved"), false);
});

test("create writes the row and audits it in episodic_events", async () => {
  const db = fakeDb();
  const res = await mod.createDecisionPackage(
    { DB: db, EPHEMERAL: fakeKv() },
    { title: "Approve Q4 outreach", proposed_action: "send campaign 7", target: "campaign:7" },
  );
  assert.equal(res.status, 201);
  const body = await readJson(res);
  assert.equal(body.outcome, "draft");
  assert.equal(body.authority, "approval", "unclassified action defaults to approval");
  const insert = db.calls.find((c) => /INSERT INTO decision_packages/.test(c.sql));
  assert.ok(insert, "the package must be persisted");
  const audit = db.calls.find((c) => /INSERT INTO episodic_events \(scope, payload\) VALUES \('decision'/.test(c.sql));
  assert.ok(audit, "every decision write is audited");
  assert.match(String(audit.params[0]), /"action":"created"/);
});

test("deciding an unknown package is a 404 and an illegal move is a 409", async () => {
  const missing = fakeDb([{ match: /FROM decision_packages WHERE id = \?/, handle: () => null }]);
  const nf = await mod.decideDecisionPackage({ DB: missing }, 99, { outcome: "approved" });
  assert.equal(nf.status, 404);

  const rejected = fakeDb([
    { match: /FROM decision_packages WHERE id = \?/, handle: () => ({ id: 3, outcome: "rejected", authority: "approval" }) },
  ]);
  const conflict = await mod.decideDecisionPackage({ DB: rejected }, 3, { outcome: "approved" });
  assert.equal(conflict.status, 409);
  assert.match((await readJson(conflict)).error, /illegal transition rejected -> approved/);
});

test("a valid decision persists, records the decider, and audits the change", async () => {
  const db = fakeDb([
    { match: /FROM decision_packages WHERE id = \?/, handle: () => ({ id: 5, outcome: "draft", authority: "approval" }) },
  ]);
  const res = await mod.decideDecisionPackage({ DB: db, EPHEMERAL: fakeKv() }, 5, { outcome: "approved", decided_by: "founder" });
  assert.equal(res.status, 200);
  const upd = db.calls.find((c) => /UPDATE decision_packages/.test(c.sql));
  assert.ok(upd);
  assert.deepEqual(upd.params.slice(0, 3), ["approved", "founder", null]);
  const audit = db.calls.find((c) => /VALUES \('decision'/.test(c.sql));
  assert.match(String(audit.params[0]), /"to":"approved"/);
});

test("expiry only touches draft/approved packages with a past expiry", async () => {
  const db = fakeDb([{ match: /UPDATE decision_packages/, handle: () => ({ meta: { changes: 2 } }) }]);
  assert.equal(await mod.expireDecisionPackages({ DB: db }), 2);
  const sql = db.calls[0].sql;
  assert.match(sql, /outcome IN \('draft','approved'\)/);
  assert.match(sql, /datetime\(expiry_at\) < datetime\('now'\)/);
});

// --- fail-closed dispatch opener ------------------------------------------
test("openDispatchDecision fails loudly so the caller can block the send", async () => {
  const db = fakeDb();
  const pkg = await mod.openDispatchDecision(
    { DB: db },
    { connector: "x", action: "connector.dispatch", cost_cents: 0, source: "direct" },
  );
  assert.equal(pkg.id, 1);
  assert.equal(pkg.authority, "approval");

  const broken = {
    prepare() { throw new Error("D1_ERROR: no such table"); },
  };
  await assert.rejects(
    () => mod.openDispatchDecision({ DB: broken }, { connector: "x", action: "connector.dispatch" }),
    /D1_ERROR|decision/,
  );
});

test("closeDispatchDecision is best-effort and keeps the recorded outcome", async () => {
  const db = fakeDb();
  await mod.closeDispatchDecision({ DB: db }, 4, true);
  const upd = db.calls.find((c) => /UPDATE decision_packages/.test(c.sql));
  assert.equal(upd.params[0], "executed");
  assert.equal(upd.params[3], 4);
  // A D1 failure must not throw into the dispatch path.
  await mod.closeDispatchDecision({ DB: { prepare() { throw new Error("boom"); } } }, 4, false);
});

// --- opt-in enforcement ----------------------------------------------------
test("the gate is off by default, so dispatch semantics are unchanged", async () => {
  const gate = await mod.decisionGate({ DB: fakeDb(), EPHEMERAL: fakeKv() }, { type: "connector.dispatch", connector: "x", target: "x" });
  assert.equal(gate.allow, true);
  assert.equal(gate.enforced, false);
});

test("with enforcement on, an approval action needs an approved package for its target", async () => {
  const kv = fakeKv({ "config:decision_enforce": "1" });
  const none = fakeDb([{ match: /FROM decision_packages/, handle: () => null }]);
  const blocked = await mod.decisionGate({ DB: none, EPHEMERAL: kv }, { type: "connector.dispatch", connector: "x", target: "x" });
  assert.equal(blocked.allow, false);
  assert.equal(blocked.enforced, true);
  assert.match(blocked.reason, /no approved decision package for 'x'/);

  const approved = fakeDb([{ match: /FROM decision_packages/, handle: () => ({ id: 11 }) }]);
  const allowed = await mod.decisionGate({ DB: approved, EPHEMERAL: kv }, { type: "connector.dispatch", connector: "x", target: "x" });
  assert.equal(allowed.allow, true);
  assert.equal(allowed.package_id, 11);
});

test("the gate never blocks an automatic (internal, reversible) action", async () => {
  const kv = fakeKv({ "config:decision_enforce": "1" });
  const gate = await mod.decisionGate({ DB: fakeDb(), EPHEMERAL: kv }, { type: "ledger.append", target: "x" });
  assert.equal(gate.allow, true);
});

test("an enforcement read failure fails closed", async () => {
  const kv = { get: async () => { throw new Error("KV down"); } };
  const gate = await mod.decisionGate({ DB: fakeDb(), EPHEMERAL: kv }, { type: "connector.dispatch", connector: "x" });
  assert.equal(gate.allow, false);
  assert.match(gate.reason, /decision_gate_unavailable/);
});

// --- routes ---------------------------------------------------------------
test("decision routes create, decide and void", async () => {
  const db = fakeDb();
  const env = { DB: db, EPHEMERAL: fakeKv() };
  const created = await mod.handleDecisionRoutes(env, "/decision/packages", "POST", {
    title: "Draft outreach", proposed_action: "send", target: "brevo",
  });
  assert.equal(created.status, 201);

  db.handlers.unshift({ match: /FROM decision_packages WHERE id = \?/, handle: () => ({ id: 1, outcome: "draft", authority: "approval" }) });
  const voided = await mod.handleDecisionRoutes(env, "/decision/packages/1/void", "POST", { reason: "superseded" });
  assert.equal(voided.status, 200);
  const body = await readJson(voided);
  assert.equal(body.outcome, "voided");

  const unknown = await mod.handleDecisionRoutes(env, "/decision/packages/1/nope", "POST", {});
  assert.equal(unknown.status, 404);
});

test("listing filters by outcome and clamps the limit", async () => {
  const db = fakeDb([{ match: /FROM decision_packages/, handle: () => ({ results: [] }) }]);
  const res = await mod.listDecisionPackages({ DB: db }, new URL("https://x.test/decision/packages?outcome=approved&limit=9999"));
  assert.equal(res.status, 200);
  const call = db.calls.find((c) => /FROM decision_packages/.test(c.sql));
  assert.deepEqual(call.params, ["approved", 200]);
});

test("evidence rendering reads provenance without writing it", async () => {
  const db = fakeDb(evidenceTable([{ id: 3, claim: "Uses Workers", disposition: "verified" }]));
  const rows = await mod.evidenceForLead({ DB: db }, 9);
  assert.deepEqual(rows, [{ claim: "Uses Workers", disposition: "verified", package_id: 3 }]);
  assert.equal(db.calls.some((c) => c.kind !== "all"), false, "evidenceForLead is read-only");
});
