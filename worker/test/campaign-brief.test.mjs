// Campaign creative brief (2026-11-10).
//
// The brief is additive metadata, so the tests pin BOTH directions:
//   * absent  ⇒ create/send behaviour is byte-identical to before (no column
//               value, no `brief` key in the response, no extra audit row);
//   * present ⇒ it is validated, stored canonically, echoed at send, and its
//               SHA-256 is written into the decision audit row so an approval
//               can be tied to the exact brief that was approved.
//
// `handleServices` and `decisionGate` are lifted from src/, so a refactor that
// moves the hash out of the gate path fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, fakeCtx, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";
import { copygate } from "./helpers/copygate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(HERE, "../../db/migrations/014_campaign_brief.sql"), "utf8");

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const brief = loadModule("brief.ts", {}, [
  "BRIEF_FIELDS",
  "BRIEF_MAX_CHARS",
  "normalizeBrief",
  "canonicalBrief",
  "hashBrief",
  "parseStoredBrief",
]);

const decisions = loadModule(
  "decisions.ts",
  { json: jsonFn },
  ["decisionGate", "classifyAuthority"],
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
      decisionGate: decisions.decisionGate,
      openDispatchDecision: async () => ({ id: 1, authority: "approval" }),
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
      lintCopy: copygate.lintCopy,
      blockingFindings: copygate.blockingFindings,
      describeCopyFindings: copygate.describeCopyFindings,
      normalizeBrief: brief.normalizeBrief,
      canonicalBrief: brief.canonicalBrief,
      hashBrief: brief.hashBrief,
      parseStoredBrief: brief.parseStoredBrief,
    },
    ["handleServices"],
  );

const THE_BRIEF = {
  angle: "A missing alt attribute is a missing customer",
  hook: "One scan shows what a screen reader hears",
  audience: "Seed-stage SaaS founders with a marketing site",
  proof: "75 deterministic rules, free tier, no signup",
  compliance_note: "No conformance claim — the report states findings, not compliance",
};

const CAMP = {
  id: 9,
  name: "outreach-shipped-stack-2026-11-03",
  subject: "A note about your accessibility stack",
  html: "<p>hello</p>",
  segment: "subscribed",
  consent_basis: "opt_in",
  brief: JSON.stringify(brief.normalizeBrief(THE_BRIEF).brief),
};

const envFor = ({ kv = {}, contacts = [{ email: "a@example.com" }], pkg = null, camp = CAMP } = {}) => {
  const db = fakeDb([
    { match: /PRAGMA table_info/, handle: () => ({ results: [{ name: "consent_basis" }, { name: "brief" }] }) },
    { match: /FROM email_campaigns WHERE id/, handle: () => camp },
    { match: /FROM decision_packages/, handle: () => pkg },
    { match: /FROM email_contacts/, handle: () => ({ results: contacts }) },
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

const req = (path, body) =>
  new Request(`https://ai-company.lazynext.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const run = async (envBody, path, body) => {
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
    const res = await mod.handleServices(req(path, body), envBody.env, ctx, path);
    await ctx.flush();
    return { res, sends, db: envBody.db, body: await readJson(res) };
  } finally {
    globalThis.fetch = realFetch;
  }
};

const SEND = "/api/v1/marketing/campaigns/9/send";
const CREATE = "/api/v1/marketing/campaigns";
const insertCall = (db) => db.calls.find((c) => c.kind === "run" && c.sql.includes("INSERT INTO email_campaigns"));
const auditRows = (db, needle) =>
  db.calls.filter((c) => c.kind === "run" && c.sql.includes("INSERT INTO episodic_events")
    && (c.params ?? []).some((p) => String(p).includes(needle)));

// --- C2: brief validation -------------------------------------------------
test("a partial brief is accepted and canonicalised in field order", () => {
  const r = brief.normalizeBrief({ hook: "  Hook  ", angle: "Angle" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.brief, { angle: "Angle", hook: "Hook" });
  assert.equal(brief.canonicalBrief(r.brief), '{"angle":"Angle","hook":"Hook"}');
});

test("an absent or empty brief means 'no brief', not an error", () => {
  assert.equal(brief.normalizeBrief(undefined).brief, null);
  assert.equal(brief.normalizeBrief(null).brief, null);
  assert.equal(brief.normalizeBrief({}).brief, null);
  assert.equal(brief.normalizeBrief({ angle: "   " }).brief, null);
});

test("malformed briefs are rejected, never silently dropped", () => {
  assert.match(brief.normalizeBrief("not an object").errors[0], /must be an object/);
  assert.match(brief.normalizeBrief({ typo_field: "x" }).errors[0], /unknown brief field/);
  assert.match(brief.normalizeBrief({ hook: 42 }).errors[0], /must be a string/);
  assert.match(
    brief.normalizeBrief({ angle: "x".repeat(401) }).errors[0],
    /exceeds 400 characters/,
  );
});

test("the hash is stable across key order and surrounding whitespace", async () => {
  const a = await brief.hashBrief(brief.normalizeBrief({ hook: "H", angle: "A" }).brief);
  const b = await brief.hashBrief(brief.normalizeBrief({ angle: " A ", hook: "H " }).brief);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// --- C2: storage ----------------------------------------------------------
test("a brief is stored on the campaign row as canonical JSON", async () => {
  const envBody = envFor();
  const { res, db } = await run(envBody, CREATE, {
    name: "n", subject: "s", html: "<p>x</p>", brief: THE_BRIEF,
  });
  assert.equal(res.status, 201);
  const insert = insertCall(db);
  assert.ok(insert, "the campaign must be inserted");
  assert.match(insert.sql, /brief/);
  const stored = insert.params[insert.params.length - 1];
  assert.equal(stored, brief.canonicalBrief(brief.normalizeBrief(THE_BRIEF).brief));
  assert.equal(JSON.parse(stored).angle, THE_BRIEF.angle);
});

test("no brief stores NULL and keeps the pre-existing columns", async () => {
  const envBody = envFor();
  const { res, db } = await run(envBody, CREATE, { name: "n", subject: "s", html: "<p>x</p>" });
  assert.equal(res.status, 201);
  const insert = insertCall(db);
  assert.equal(insert.params[insert.params.length - 1], null);
  assert.ok(insert.sql.includes("consent_basis"), "consent behaviour is untouched");
});

test("an invalid brief is a 400 and nothing is written", async () => {
  const envBody = envFor();
  const { res, db, body } = await run(envBody, CREATE, {
    name: "n", subject: "s", html: "<p>x</p>", brief: { hook: 42 },
  });
  assert.equal(res.status, 400);
  assert.match(body.error, /invalid brief/);
  assert.equal(insertCall(db), undefined);
});

// --- C2: send echo + hash in the decision audit ---------------------------
test("the send echoes the brief and its hash", async () => {
  const envBody = envFor();
  const { res, body, sends } = await run(envBody, SEND, {});
  assert.equal(res.status, 200);
  assert.equal(sends.length, 1);
  assert.deepEqual(body.brief, brief.normalizeBrief(THE_BRIEF).brief);
  assert.equal(body.brief_sha256, await brief.hashBrief(THE_BRIEF));
});

test("with an approval, the brief hash lands in one decision audit row", async () => {
  const envBody = envFor({ kv: { "config:decision_enforce": "approval" }, pkg: { id: 5 } });
  const { res, body } = await run(envBody, SEND, {});
  assert.equal(res.status, 200);

  const rows = auditRows(envBody.db, "decision_gate_passed");
  assert.equal(rows.length, 1, "exactly one pass row per approved send");
  const payload = JSON.parse(String(rows[0].params[0]));
  assert.equal(payload.event, "decision_gate_passed");
  assert.equal(payload.target, "campaign:9");
  assert.equal(payload.package_id, 5);
  assert.equal(payload.brief_sha256, await brief.hashBrief(THE_BRIEF));
  assert.equal(payload.brief_sha256, body.brief_sha256, "the audited hash is the sent hash");

  // And the pass row is NOT a gate block — the dashboard's blocks panel reads
  // scope 'decision_gate' and a pass must never be rendered as one.
  assert.equal(String(rows[0].params[0]).includes("decision_gate_blocked"), false);
});

test("a blocked send names the brief hash in the block row and the 503 body", async () => {
  const envBody = envFor({ kv: { "config:decision_enforce": "approval" } });
  const { res, body, sends } = await run(envBody, SEND, {});
  assert.equal(res.status, 503);
  assert.equal(sends.length, 0);
  assert.equal(body.brief_sha256, await brief.hashBrief(THE_BRIEF));

  const rows = auditRows(envBody.db, "decision_gate_blocked");
  assert.equal(rows.length, 1);
  const payload = JSON.parse(String(rows[0].params[0]));
  assert.equal(payload.brief_sha256, body.brief_sha256);
});

test("a campaign without a brief echoes nothing extra and writes no pass row", async () => {
  const { brief: _omit, ...noBrief } = CAMP;
  const envBody = envFor({ kv: { "config:decision_enforce": "approval" }, pkg: { id: 5 }, camp: noBrief });
  const { res, body } = await run(envBody, SEND, {});
  assert.equal(res.status, 200);
  assert.equal("brief" in body, false);
  assert.equal("brief_sha256" in body, false, "absent brief ⇒ behaviour unchanged");
  assert.equal(auditRows(envBody.db, "decision_gate_passed").length, 0);
});

// --- C2: migration --------------------------------------------------------
test("migration 014 is additive and nullable", () => {
  assert.match(migration, /ALTER TABLE email_campaigns ADD COLUMN brief TEXT;/);
  assert.equal(/NOT NULL/.test(migration), false, "every pre-existing row has no brief");
  assert.match(migration, /014/);
});

// --- hashing implementation ----------------------------------------------
test("hashBrief is plain SHA-256 of the canonical JSON", async () => {
  const canonical = brief.canonicalBrief(brief.normalizeBrief(THE_BRIEF).brief);
  const expected = createHash("sha256").update(canonical, "utf8").digest("hex");
  assert.equal(await brief.hashBrief(THE_BRIEF), expected);
});
