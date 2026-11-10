// Evidence-backed CRM enrichment — claim-level provenance on top of the
// existing crm_leads table. The shipped functions are lifted from
// worker/src/evidence.ts, so these tests pin the real behaviour (disposition
// derivation, validation, hashing) rather than a copy of it.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadModule, fakeDb, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const mod = loadModule(
  "evidence.ts",
  { json: jsonFn },
  [
    "deriveDisposition", "clampConfidence", "parseFetchedAt",
    "recordLeadEvidence", "listLeadEvidence", "evidenceSummary",
    // C4 — corroboration view layer
    "normalizeClaim", "sourceKey", "findCorroborations", "corroborationFor",
    "buildCorroborationReport", "evidenceCorroborations", "CLAIM_NORMALIZE_LIMIT",
  ],
);

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Fake clinical-enough D1 for the evidence table. */
function envWith({ leadExists = true, rows = [], corroborationRows = null } = {}) {
  const inserts = [];
  const db = fakeDb([
    {
      match: /CREATE TABLE IF NOT EXISTS crm_lead_evidence|CREATE INDEX IF NOT EXISTS idx_crm_lead_evidence/,
      handle: () => ({ success: true, meta: { changes: 0 } }),
    },
    {
      match: /SELECT id FROM crm_leads WHERE id = \?/,
      handle: () => (leadExists ? { id: 7 } : null),
    },
    {
      match: /INSERT INTO crm_lead_evidence/,
      handle: (_sql, params) => {
        inserts.push(params);
        return { success: true, meta: { changes: 1, last_row_id: inserts.length } };
      },
    },
    {
      match: /SELECT id, claim, source_url, provider FROM crm_lead_evidence/,
      // Closure over the array, so a test can mutate it between calls.
      handle: () => ({ results: corroborationRows ?? rows }),
    },
    {
      match: /SELECT \* FROM crm_lead_evidence WHERE lead_id = \?/,
      handle: () => ({ results: rows }),
    },
    {
      match: /SELECT disposition, COUNT\(\*\) AS count FROM crm_lead_evidence/,
      handle: () => ({ results: [{ disposition: "verified", count: 2 }] }),
    },
  ]);
  return { env: { DB: db }, db, inserts };
}

test("exact method with an excerpt records verified provenance and hashes the evidence", async () => {
  const { env, inserts } = envWith();
  const res = await mod.recordLeadEvidence(env, 7, {
    claim: "Company runs an accessibility program",
    source_url: "https://example.com/about",
    evidence_excerpt: "Our WCAG 2.2 audit runs every quarter.",
    verification_method: "exact",
    confidence: 0.9,
    provider: "firecrawl",
    fetched_at: "2026-11-02T10:00:00Z",
  });
  assert.equal(res.status, 201);
  const body = await readJson(res);
  assert.equal(body.disposition, "verified");
  assert.equal(body.lead_id, 7);
  assert.equal(body.verification_method, "exact");

  const [params] = inserts;
  const [leadId, claim, sourceUrl, fetchedAt, excerpt, hash, method, confidence, provider, disposition] = params;
  assert.equal(leadId, 7);
  assert.equal(claim, "Company runs an accessibility program");
  assert.equal(sourceUrl, "https://example.com/about");
  assert.equal(fetchedAt, "2026-11-02T10:00:00.000Z");
  assert.equal(excerpt, "Our WCAG 2.2 audit runs every quarter.");
  assert.equal(hash, sha256(excerpt), "hash is derived from the stored excerpt");
  assert.equal(method, "exact");
  assert.equal(confidence, 0.9);
  assert.equal(provider, "firecrawl");
  assert.equal(disposition, "verified");
});

test("normalized with only a caller-supplied hash is verified, not re-hashed", async () => {
  const { env, inserts } = envWith();
  const hash = sha256("normalized-evidence");
  const res = await mod.recordLeadEvidence(env, 7, {
    claim: "Uses Cloudflare Workers",
    source_url: "https://example.com/stack",
    evidence_hash: hash.toUpperCase(),
    verification_method: "normalized",
  });
  assert.equal(res.status, 201);
  assert.equal((await readJson(res)).disposition, "verified");
  assert.equal(inserts[0][5], hash);
});

test("fuzzy matching is capped at inferred and a bare source URL at unknown", async () => {
  const { env, inserts } = envWith();
  assert.equal((await readJson(await mod.recordLeadEvidence(env, 7, {
    claim: "Likely hiring engineers",
    source_url: "https://example.com/jobs",
    evidence_excerpt: "We are growing the team",
    verification_method: "fuzzy",
    confidence: 0.4,
  }))).disposition, "inferred");

  assert.equal((await readJson(await mod.recordLeadEvidence(env, 7, {
    claim: "Probably uses D1",
    source_url: "https://example.com/blog",
    verification_method: "none",
  }))).disposition, "unknown");
  // No fabricated anchor: a URL alone leaves excerpt and hash empty.
  assert.equal(inserts[1][4], null);
  assert.equal(inserts[1][5], null);
});

test("a client cannot force a disposition", async () => {
  const { env, inserts } = envWith();
  const res = await mod.recordLeadEvidence(env, 7, {
    claim: "Claims verified without evidence",
    source_url: "https://example.com",
    disposition: "verified",
    verification_method: "none",
  });
  assert.equal(res.status, 201);
  assert.equal((await readJson(res)).disposition, "unknown");
  assert.equal(inserts[0][9], "unknown", "server derives the disposition column");
});

test("claims that cannot be evidenced are rejected, not recorded", async () => {
  const { env, inserts } = envWith();
  const cases = [
    [{}, "claim required"],
    [{ claim: "   " }, "claim required"],
    [{ claim: "No anchor" }, "source_url, evidence_excerpt, or evidence_hash required"],
    [{ claim: "Exact but empty", source_url: "https://x.test", verification_method: "exact" }, "exact/normalized claims require an excerpt or hash"],
    [{ claim: "Bad hash", source_url: "https://x.test", evidence_hash: "abc", verification_method: "exact" }, "evidence_hash must be a SHA-256 hex digest"],
    [{ claim: "Bad method", source_url: "https://x.test", verification_method: "vibes" }, "verification_method must be exact, normalized, fuzzy, or none"],
    [{ claim: "Bad date", source_url: "https://x.test", fetched_at: "not-a-date" }, "fetched_at must be an ISO-8601 timestamp"],
  ];
  for (const [body, expected] of cases) {
    const res = await mod.recordLeadEvidence(env, 7, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await readJson(res)).error, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(inserts.length, 0, "rejected claims never reach D1");
});

test("an unknown lead is a 404 instead of an orphan evidence row", async () => {
  const { env, inserts } = envWith({ leadExists: false });
  const res = await mod.recordLeadEvidence(env, 999, {
    claim: "Ghost lead",
    source_url: "https://x.test",
    evidence_excerpt: "text",
    verification_method: "exact",
  });
  assert.equal(res.status, 404);
  assert.equal(inserts.length, 0);
  assert.equal((await mod.listLeadEvidence(env, 999)).status, 404);
});

test("confidence is clamped to the 0..1 range on the way in", async () => {
  const { env, inserts } = envWith();
  await mod.recordLeadEvidence(env, 7, { claim: "High", source_url: "https://x.test", confidence: 7 });
  await mod.recordLeadEvidence(env, 7, { claim: "Low", source_url: "https://x.test", confidence: -3 });
  await mod.recordLeadEvidence(env, 7, { claim: "Absent", source_url: "https://x.test" });
  assert.deepEqual(inserts.map((p) => p[7]), [1, 0, 0]);
});

test("lead evidence list reports verified/inferred/unknown counts", async () => {
  const { env } = envWith({
    rows: [
      { id: 3, lead_id: 7, claim: "c3", disposition: "verified" },
      { id: 2, lead_id: 7, claim: "c2", disposition: "inferred" },
      { id: 1, lead_id: 7, claim: "c1", disposition: "unknown" },
    ],
  });
  const body = await readJson(await mod.listLeadEvidence(env, 7));
  assert.equal(body.lead_id, 7);
  assert.equal(body.evidence.length, 3);
  assert.deepEqual(body.summary, { verified: 1, inferred: 1, unknown: 1 });
  assert.deepEqual(Object.keys(body.evidence[0]).sort(), ["claim", "disposition", "id", "lead_id"]);
});

test("disposition derivation is anchored evidence, never the claimed method alone", () => {
  assert.equal(mod.deriveDisposition("exact", "text", null), "verified");
  assert.equal(mod.deriveDisposition("normalized", null, "a".repeat(64)), "verified");
  assert.equal(mod.deriveDisposition("fuzzy", "text", null), "inferred");
  assert.equal(mod.deriveDisposition("fuzzy", null, null), "unknown");
  assert.equal(mod.deriveDisposition("exact", null, null), "unknown");
  assert.equal(mod.deriveDisposition("none", "text", "b".repeat(64)), "unknown");
});

test("fetched_at accepts ISO-8601 and unix ms, rejects nonsense", () => {
  assert.equal(mod.parseFetchedAt("2026-11-02T00:00:00Z"), "2026-11-02T00:00:00.000Z");
  assert.equal(mod.parseFetchedAt(1_761_000_000_000), new Date(1_761_000_000_000).toISOString());
  const now = mod.parseFetchedAt(undefined);
  assert.match(now, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(mod.parseFetchedAt("nope"), null);
});

// ------------------------------------------------------------------------
// C4 — corroboration: the same claim observed through independent channels.
// Corroboration is computed, never stored or inferred. A single observation
// must always read corroborated:false / corroboration_count:1.
// ------------------------------------------------------------------------

test("normalizeClaim: casing, punctuation and whitespace do not change identity", () => {
  const a = mod.normalizeClaim("Company runs an accessibility program");
  const b = mod.normalizeClaim("  COMPANY runs an accessibility-program!!  ");
  const c = mod.normalizeClaim("company   RUNS\tAN accessibility program.");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, "companyrunsanaccessibilityprogram");
});

test("normalizeClaim: different claims stay distinct", () => {
  assert.notEqual(mod.normalizeClaim("Uses Cloudflare Workers"), mod.normalizeClaim("Uses Cloudflare Pages"));
  assert.notEqual(mod.normalizeClaim("Hires 20 engineers"), mod.normalizeClaim("Hires 20 designers"));
});

test("normalizeClaim: the 160-character truncation boundary is the documented one", () => {
  assert.equal(mod.CLAIM_NORMALIZE_LIMIT, 160);
  const base = "a".repeat(160);
  assert.equal(mod.normalizeClaim(base + "z"), base, "characters past the boundary are dropped");

  const rows = [
    { id: 1, claim: base },
    { id: 2, claim: base + "different tail" },
  ];
  assert.equal(mod.findCorroborations(rows, base + "another tail").length, 2,
    "claims agreeing for 160 normalized chars compare as the same claim");
  // A difference INSIDE the compared window is a different claim.
  const inside = "a".repeat(159) + "b";
  assert.equal(mod.findCorroborations(rows, inside).length, 0);
});

test("findCorroborations matches the same normalized claim only", () => {
  const rows = [
    { id: 1, claim: "Company runs an accessibility program", source_url: "https://acme.com/about", provider: "firecrawl" },
    { id: 2, claim: "Hires 20 engineers", source_url: "https://acme.com/jobs", provider: "firecrawl" },
  ];
  assert.deepEqual(
    mod.findCorroborations(rows, "COMPANY runs an accessibility PROGRAM").map((r) => r.id),
    [1],
  );
  assert.deepEqual(mod.findCorroborations(rows, "hires 20 designers"), []);
  assert.deepEqual(mod.findCorroborations(rows, "   "), [], "a blank claim matches nothing");
});

test("sourceKey: domain first (www-insensitive), provider fallback, null when anonymous", () => {
  assert.equal(mod.sourceKey({ source_url: "https://www.Acme.com/about" }), "domain:acme.com");
  assert.equal(mod.sourceKey({ source_url: "https://acme.com" }), "domain:acme.com");
  assert.equal(mod.sourceKey({ source_url: "https://blog.acme.com/x", provider: "firecrawl" }), "domain:blog.acme.com");
  assert.equal(mod.sourceKey({ source_url: "not a url", provider: "Firecrawl" }), "provider:firecrawl");
  assert.equal(mod.sourceKey({ provider: "Firecrawl" }), "provider:firecrawl");
  assert.equal(mod.sourceKey({}), null);
});

test("a single observation is never reported as corroborated", () => {
  const report = mod.buildCorroborationReport([
    { id: 4, claim: "Company runs an accessibility program", source_url: "https://acme.com/about", provider: "firecrawl" },
  ]);
  assert.equal(report.total_claims, 1);
  assert.equal(report.corroborated_claims, 0);
  const view = report.claims[0];
  assert.equal(view.corroborated, false);
  assert.equal(view.corroboration_count, 1);
  assert.deepEqual(view.distinct_sources, ["domain:acme.com"]);
  assert.deepEqual(view.evidence_row_ids, [4]);
});

test("two independent sources corroborate a claim and cite both row ids", () => {
  const report = mod.buildCorroborationReport([
    { id: 4, claim: "Company runs an accessibility program", source_url: "https://acme.com/about", provider: "firecrawl" },
    { id: 9, claim: "company RUNS an accessibility-program", source_url: "https://press.example.org/acme", provider: "serper" },
  ]);
  assert.equal(report.corroborated_claims, 1);
  const view = report.claims[0];
  assert.equal(view.corroborated, true);
  assert.equal(view.corroboration_count, 2);
  assert.deepEqual(view.distinct_sources, ["domain:acme.com", "domain:press.example.org"]);
  assert.deepEqual(view.evidence_row_ids, [4, 9]);
  assert.equal(view.normalized_claim, mod.normalizeClaim(view.claim));
});

test("two rows on the same domain do NOT corroborate — one publisher, one source", () => {
  const view = mod.buildCorroborationReport([
    { id: 4, claim: "Runs an accessibility program", source_url: "https://acme.com/about" },
    { id: 5, claim: "runs an accessibility program", source_url: "https://www.acme.com/jobs" },
  ]).claims[0];
  assert.equal(view.corroborated, false);
  assert.equal(view.corroboration_count, 1);
  assert.deepEqual(view.distinct_sources, ["domain:acme.com"]);
  assert.deepEqual(view.evidence_row_ids, [4, 5], "both observations are still listed");
});

test("provider is the source identity when a row carries no usable URL", () => {
  const view = mod.buildCorroborationReport([
    { id: 1, claim: "Claim", source_url: "https://acme.com", provider: "firecrawl" },
    { id: 2, claim: "claim", provider: "serper" },
  ]).claims[0];
  assert.equal(view.corroborated, true);
  assert.deepEqual(view.distinct_sources, ["domain:acme.com", "provider:serper"]);
});

test("two anonymous rows cannot corroborate each other", () => {
  const view = mod.buildCorroborationReport([
    { id: 1, claim: "Same claim" },
    { id: 2, claim: "Same claim" },
  ]).claims[0];
  assert.equal(view.corroborated, false);
  assert.equal(view.corroboration_count, 1);
  assert.deepEqual(view.distinct_sources, []);
  assert.deepEqual(view.evidence_row_ids, [1, 2]);
});

test("recording a first observation answers corroborated:false and count 1", async () => {
  const { env, inserts } = envWith({ corroborationRows: [] });
  const body = await readJson(await mod.recordLeadEvidence(env, 7, {
    claim: "Company runs an accessibility program",
    source_url: "https://acme.com/about",
    evidence_excerpt: "We audit quarterly.",
    verification_method: "exact",
    provider: "firecrawl",
  }));
  assert.equal(inserts.length, 1);
  assert.equal(body.corroboration.corroborated, false);
  assert.equal(body.corroboration.corroboration_count, 1);
  assert.deepEqual(body.corroboration.evidence_row_ids, [1]);
});

test("recording the same claim from a second source flips corroborated to true", async () => {
  const prior = [{
    id: 97, claim: "Company runs an accessibility program",
    source_url: "https://acme.com/about", provider: "firecrawl",
  }];
  const { env } = envWith({ corroborationRows: prior });
  const body = await readJson(await mod.recordLeadEvidence(env, 7, {
    claim: "company runs an accessibility-PROGRAM",
    source_url: "https://press.example.org/acme",
    evidence_excerpt: "Acme audits every quarter.",
    verification_method: "normalized",
    provider: "serper",
  }));
  assert.equal(body.corroboration.corroborated, true);
  assert.equal(body.corroboration.corroboration_count, 2);
  assert.deepEqual(body.corroboration.distinct_sources, ["domain:acme.com", "domain:press.example.org"]);
  assert.deepEqual(body.corroboration.evidence_row_ids, [1, 97]);
});

test("the evidence summary carries the corroboration block without changing disposition counts", async () => {
  const { env } = envWith({
    corroborationRows: [
      { id: 3, claim: "A claim", source_url: "https://a.example.org" },
      { id: 2, claim: "a-CLAIM", source_url: "https://b.example.org" },
      { id: 1, claim: "Solo claim", source_url: "https://c.example.org" },
    ],
  });
  const body = await readJson(await mod.evidenceSummary(env));
  assert.deepEqual(body.summary, [{ disposition: "verified", count: 2 }], "the pre-existing summary shape is untouched");
  assert.equal(body.corroboration.total_claims, 2);
  assert.equal(body.corroboration.corroborated_claims, 1);

  const multi = body.corroboration.claims.find((c) => c.corroborated);
  assert.deepEqual(multi.distinct_sources, ["domain:a.example.org", "domain:b.example.org"]);
  assert.deepEqual(multi.evidence_row_ids, [2, 3]);

  const solo = body.corroboration.claims.find((c) => !c.corroborated);
  assert.equal(solo.corroboration_count, 1);
  assert.equal(solo.corroborated, false);
});

test("evidenceCorroborations returns only the corroboration block", async () => {
  const { env } = envWith({
    corroborationRows: [{ id: 1, claim: "x", source_url: "https://a.example.org" }],
  });
  const body = await readJson(await mod.evidenceCorroborations(env));
  assert.deepEqual(Object.keys(body), ["corroboration"]);
  assert.equal(body.corroboration.total_claims, 1);
  assert.equal(body.corroboration.claims[0].corroborated, false);
});

// ------------------------------------------------------------------------
// Route wiring + gating — the lzk_ read path in services.ts and the internal
// bearer read in index.ts, plus the hand-maintained OpenAPI table.
// ------------------------------------------------------------------------
const servicesWith = (authorize, evidenceCorroborations) =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize,
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      evidenceCorroborations,
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => ({ allow: true, enforced: false, scope: "off" }),
      openDispatchDecision: async () => ({ id: 1 }),
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
    },
    ["handleServices"],
  );

const corroborationReq = () =>
  new Request("https://ai-company.test/api/v1/crm/evidence/corroborations", { method: "GET" });
const routeCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

test("GET /api/v1/crm/evidence/corroborations is read-gated", async () => {
  let calls = 0;
  const denied = servicesWith(
    async () => ({ res: jsonFn({ error: "read scope required" }, 401) }),
    async () => { calls++; return jsonFn({}); },
  );
  const res = await denied.handleServices(corroborationReq(), {}, routeCtx, "/api/v1/crm/evidence/corroborations");
  assert.equal(res.status, 401);
  assert.equal(calls, 0, "an unauthorized read never reaches the corroboration view");

  const allowed = servicesWith(
    async () => ({ key: { id: 1, scopes: ["read"] } }),
    async () => { calls++; return jsonFn({ corroboration: { total_claims: 0 } }); },
  );
  const ok = await allowed.handleServices(corroborationReq(), {}, routeCtx, "/api/v1/crm/evidence/corroborations");
  assert.equal(ok.status, 200);
  assert.equal(calls, 1);
});

test("the corroboration routes are wired behind their gates and declared in OpenAPI", () => {
  const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const specSrc = readFileSync(new URL("../src/openapi.ts", import.meta.url), "utf8");

  const internalSurface = indexSrc.slice(indexSrc.indexOf("async function route("), indexSrc.indexOf("export default {"));
  assert.ok(
    internalSurface.includes('if (path === "/evidence/corroborations") return evidenceCorroborations(env);'),
    "the internal GET route must sit in the read block (before the POST-only guard)",
  );
  assert.match(
    indexSrc,
    /import \{ recordLeadEvidence, listLeadEvidence, evidenceSummary, evidenceCorroborations \} from "\.\/evidence";/,
    "index.ts must import the shipped view, not a copy",
  );

  assert.ok(specSrc.includes('"/api/v1/crm/evidence/corroborations": {'), "public path missing from openapi.ts");
  assert.ok(specSrc.includes('"/evidence/corroborations": {'), "internal path missing from openapi.ts");

  const start = specSrc.indexOf('"/evidence/corroborations": {');
  const end = specSrc.indexOf('"/decision/packages": {');
  const block = specSrc.slice(start, end);
  assert.match(block, /"x-internal": true/);
  assert.match(block, /security: \[\{ internalAuth: \[\] \}\]/);
});

