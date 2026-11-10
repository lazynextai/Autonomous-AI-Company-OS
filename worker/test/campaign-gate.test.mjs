// Campaign-send decision gate (2026-11-05).
//
// The gate covered a single connector dispatch and a single scheduled social
// post, but NOT the campaign send loop — the one path that emails every address
// in a segment. `classifyAuthority()` already classified `campaign.send` as
// approval-class; the send handler simply never consulted it. That is backwards:
// a tweet is gated, a blast of tens-to-hundreds of real people was not.
//
// These tests lift the SHIPPED `handleServices` and the SHIPPED `decisionGate`
// (same pattern as governance-routes.test.mjs), so the route cannot drift back
// to "ungated" without failing here, and the "a block never sends" contract is
// asserted against real code rather than a stub.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, fakeCtx, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";
import { copygate } from "./helpers/copygate.mjs";
import { brief } from "./helpers/brief.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "..", "src", "services.ts"), "utf8");

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const decisions = loadModule(
  "decisions.ts",
  { json: jsonFn },
  ["decisionGate", "classifyAuthority", "scopeCovers"],
);

const services = () =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "read,write" } }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      // The real gate, not a stub — the route must consult the shipped impl.
      decisionGate: decisions.decisionGate,
      openDispatchDecision: async () => ({ id: 1, authority: "approval" }),
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
      // The real copy-quality gate — the send route must consult it, and the
      // fixture campaign copy is clean so these gate tests stay single-purpose.
      lintCopy: copygate.lintCopy,
      blockingFindings: copygate.blockingFindings,
      describeCopyFindings: copygate.describeCopyFindings,
      // Brief helpers: the fixture campaign has no brief, so the send path
      // resolves null and the gate call stays brief-free (asserted below).
      normalizeBrief: brief.normalizeBrief,
      canonicalBrief: brief.canonicalBrief,
      hashBrief: brief.hashBrief,
      parseStoredBrief: brief.parseStoredBrief,
    },
    ["handleServices"],
  );

const SEND = "/api/v1/marketing/campaigns/9/send";
const CAMP = {
  id: 9,
  name: "outreach-shipped-stack-2026-11-03",
  subject: "A note about your accessibility stack",
  html: "<p>hello</p>",
  segment: "subscribed",
  consent_basis: "opt_in",
};

// Every statement the send handler can reach, routed by table. `pkg` is what
// the gate's approval lookup returns: null = no approved package, else a row.
const sendEnv = ({ kv = {}, contacts = [{ email: "a@example.com" }], pkg = null } = {}) => {
  const db = fakeDb([
    { match: /PRAGMA table_info/, handle: () => ({ results: [{ name: "consent_basis" }] }) },
    { match: /FROM email_campaigns WHERE id/, handle: () => CAMP },
    { match: /FROM decision_packages/, handle: () => pkg },
    { match: /FROM email_contacts/, handle: () => ({ results: contacts }) },
    { match: /FROM crm_leads/, handle: () => ({ results: contacts }) },
  ]);
  return {
    db,
    env: {
      DB: db,
      EPHEMERAL: fakeKv({ "conn:brevo": "support@lazynext.com:brevo-key", ...kv }),
      API_TOKEN: "test-secret",
      COMPANY_ADDRESS: "NO. 472/7 BALAJI ARCADE, Bengaluru 560095, India",
    },
  };
};

const post = (body) =>
  new Request(`https://ai-company.lazynext.test${SEND}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

// Brevo is reached through the module's own `brevoSend`, i.e. global fetch.
// Counting the sends this way is the honest assertion: a blocked campaign must
// never put a single request on the wire, whoever calls it.
const runSend = async (envBody, body) => {
  const mod = services();
  const ctx = fakeCtx();
  const realFetch = globalThis.fetch;
  const sends = [];
  globalThis.fetch = async (url) => {
    sends.push(String(url));
    return new Response(JSON.stringify({ messageId: "msg-1" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const res = await mod.handleServices(post(body), envBody.env, ctx, SEND);
    await ctx.flush();
    return { res, sends, db: envBody.db, body: await readJson(res) };
  } finally {
    globalThis.fetch = realFetch;
  }
};

const writeTo = (db, needle) => db.calls.filter((c) => c.kind === "run" && c.sql.includes(needle));
const readOf = (db, needle) => db.calls.filter((c) => c.kind !== "run" && c.sql.includes(needle));

// --- the gate is consulted ------------------------------------------------
test("scope off: a campaign send proceeds and actually sends", async () => {
  const envBody = sendEnv();
  const { res, body, sends } = await runSend(envBody, {});
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.sent, 1);
  assert.equal(body.segment, "subscribed");
  assert.equal(sends.length, 1, "an ungated send reaches Brevo exactly once");
  assert.match(sends[0], /api\.brevo\.com/);
  assert.equal(readOf(envBody.db, "FROM decision_packages").length, 0, "gate off never queries approvals");
});

test("approval scope, no approved package: blocked 503 and the sender is NEVER called", async () => {
  const envBody = sendEnv({ kv: { "config:decision_enforce": "approval" } });
  const { res, body, sends, db } = await runSend(envBody, {});

  // Same response shape as the two pre-existing call sites.
  assert.equal(res.status, 503);
  assert.equal(body.error, "blocked by decision gate — missing approval");
  assert.match(body.reason, /no approved decision package for 'campaign:9'/);
  assert.equal(body.scope, "approval");

  // THE critical assertion: no message left the building.
  assert.equal(sends.length, 0, "a blocked campaign must never call brevoSend");

  // And nothing was mutated on the way to the block.
  assert.equal(
    db.calls.some((c) => c.kind === "run" && (c.params ?? []).includes("sending")),
    false,
    "a blocked campaign is never flipped to status='sending'",
  );
  assert.equal(writeTo(db, "status='sent'").length, 0, "a blocked campaign is never marked sent");
});

test("the gate runs before the audience is read at all", async () => {
  const envBody = sendEnv({ kv: { "config:decision_enforce": "approval" }, contacts: [] });
  const { res, db } = await runSend(envBody, {});
  assert.equal(res.status, 503);

  const gateAt = db.calls.findIndex((c) => c.sql.includes("FROM decision_packages"));
  assert.ok(gateAt >= 0, "the gate must consult decision_packages");
  assert.equal(db.calls.findIndex((c) => c.sql.includes("FROM email_contacts")), -1,
    "the recipient list is not even queried behind a block");
});

test("approval scope with an approved, unexpired package: the send proceeds", async () => {
  const envBody = sendEnv({
    kv: { "config:decision_enforce": "approval" },
    pkg: { id: 5 },
  });
  const { res, body, sends, db } = await runSend(envBody, {});
  assert.equal(res.status, 200);
  assert.equal(body.sent, 1);
  assert.equal(sends.length, 1);

  // The approval lookup must itself require approved + unexpired — an expired
  // package is not an approval (the query is the enforcement, not a JS filter).
  const lookup = readOf(db, "FROM decision_packages")[0];
  assert.match(lookup.sql, /outcome = 'approved'/);
  assert.match(lookup.sql, /expiry_at IS NULL OR datetime\(expiry_at\) >= datetime\('now'\)/);
  assert.deepEqual(lookup.params, ["campaign:9"], "the approval is scoped to this campaign");
});

test("a body segment override is gated too — widening the audience can't dodge approval", async () => {
  const blocked = await runSend(
    sendEnv({ kv: { "config:decision_enforce": "approval" } }),
    { segment: "engaged" },
  );
  assert.equal(blocked.res.status, 503);
  assert.equal(blocked.sends.length, 0, "the override branch is gated before any send");
  assert.equal(blocked.db.calls.some((c) => c.sql.includes("FROM crm_leads")), false,
    "the widened audience is not queried behind a block");

  const allowed = await runSend(
    sendEnv({ kv: { "config:decision_enforce": "approval" }, pkg: { id: 5 } }),
    { segment: "engaged" },
  );
  assert.equal(allowed.res.status, 200);
  assert.equal(allowed.body.segment, "engaged");
  assert.equal(allowed.sends.length, 1);
});

test("an invalid segment is still a 400, not a gate block", async () => {
  const envBody = sendEnv({ kv: { "config:decision_enforce": "approval" } });
  const { res, body, db } = await runSend(envBody, { segment: "everyone" });
  assert.equal(res.status, 400);
  assert.match(body.error, /unknown segment/);
  assert.equal(readOf(db, "FROM decision_packages").length, 0, "validation precedes the gate, so no block row is written");
});

// --- rank coverage is unchanged ------------------------------------------
// The scope ladder is human_only (1) < approval (2) < all (3) and a scope
// covers its own class and anything NARROWER. `campaign.send` is approval-class,
// so `human_only` does not reach it — while `approval` still also covers
// human_only-class actions. Both halves pinned so a "fix" can't quietly
// re-rank the ladder.
test("human_only scope does not reach approval-class campaign sends (rank unchanged)", async () => {
  assert.equal(decisions.scopeCovers("human_only", "approval"), false);
  assert.equal(decisions.scopeCovers("approval", "human_only"), true, "approval still covers the narrower class");
  assert.equal(decisions.scopeCovers("all", "approval"), true);
  assert.equal(decisions.scopeCovers("off", "approval"), false);

  const envBody = sendEnv({ kv: { "config:decision_enforce": "human_only" } });
  const { res, sends, db } = await runSend(envBody, {});
  assert.equal(res.status, 200, "an approval-class send is outside human_only scope");
  assert.equal(sends.length, 1);
  assert.equal(readOf(db, "FROM decision_packages").length, 0);
});

test("campaign.send is approval-class in the shipped classifier", () => {
  assert.equal(decisions.classifyAuthority({ type: "campaign.send", target: "campaign:9" }).authority, "approval");
});

test("the block is visible as one decision_gate episodic row, not only a 503 body", async () => {
  const envBody = sendEnv({ kv: { "config:decision_enforce": "approval" } });
  await runSend(envBody, {});
  const rows = envBody.db.calls.filter((c) => (c.params ?? []).some((p) => String(p).includes('"decision_gate_blocked"')));
  assert.equal(rows.length, 1, "exactly one audit row per blocked send");
  const payload = JSON.parse(String(rows[0].params[0]));
  assert.equal(payload.type, "campaign.send");
  assert.equal(payload.target, "campaign:9");
  assert.equal(payload.authority, "approval");
  assert.equal(payload.scope, "approval");
});

// --- source drift guard ---------------------------------------------------
// Lifting proves behaviour; this proves the call sits in the send handler and
// ahead of both the status mutation and the send loop, so a future refactor
// that moves it below `brevoSend` fails even if a stubbed gate would pass.
test("the gate call sits inside the send handler, before status and before the loop", () => {
  const start = src.indexOf('/^\\/api\\/v1\\/marketing\\/campaigns\\/\\d+\\/send$/');
  const end = src.indexOf('if (path === "/api/v1/marketing/stats"', start);
  assert.ok(start > 0 && end > start, "send handler slice not found");
  const handler = src.slice(start, end);

  const gateAt = handler.indexOf("decisionGate(env, {");
  assert.ok(gateAt > 0, "the send handler must call decisionGate");
  // The call carries the campaign target (and, when the campaign has a brief,
  // its hash) — assert both halves of the action rather than one literal line.
  const gateCall = handler.slice(gateAt, gateAt + 400);
  assert.match(gateCall, /type: "campaign\.send"/);
  assert.match(gateCall, /target: `campaign:\$\{id\}`/);

  const loopAt = handler.indexOf("for (const c of contacts");
  const sendAt = handler.indexOf("await brevoSend(");
  const statusAt = handler.indexOf('{ status: "sending" }');
  assert.ok(loopAt > 0 && sendAt > 0 && statusAt > 0, "send-handler anchors not found");
  assert.ok(gateAt < loopAt, "the gate must precede the contact loop");
  assert.ok(gateAt < sendAt, "the gate must precede every brevoSend");
  assert.ok(gateAt < statusAt, "the gate must precede the status='sending' mutation");
});
