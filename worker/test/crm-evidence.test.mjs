// Evidence-backed CRM enrichment — claim-level provenance on top of the
// existing crm_leads table. The shipped functions are lifted from
// worker/src/evidence.ts, so these tests pin the real behaviour (disposition
// derivation, validation, hashing) rather than a copy of it.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadModule, fakeDb, readJson } from "./helpers/lift.mjs";

const mod = loadModule(
  "evidence.ts",
  { json: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }) },
  ["deriveDisposition", "clampConfidence", "parseFetchedAt", "recordLeadEvidence", "listLeadEvidence", "evidenceSummary"],
);

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Fake clinical-enough D1 for the evidence table. */
function envWith({ leadExists = true, rows = [] } = {}) {
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
