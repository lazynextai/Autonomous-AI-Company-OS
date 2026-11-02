import { Env, json } from "./gateway";

export type VerificationMethod = "exact" | "normalized" | "fuzzy" | "none";
export type EvidenceDisposition = "verified" | "inferred" | "unknown";

export function deriveDisposition(method: VerificationMethod, excerpt?: string | null, hash?: string | null): EvidenceDisposition {
  const anchored = Boolean((excerpt ?? "").trim() || (hash ?? "").trim());
  if (!anchored || method === "none") return "unknown";
  if (method === "exact" || method === "normalized") return "verified";
  return "inferred";
}

export function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ISO-8601 or unix-ms; returns null on an unparseable value rather than throwing. */
export function parseFetchedAt(value: unknown): string | null {
  if (value == null || value === "") return new Date().toISOString();
  const text = String(value).trim();
  const ms = /^\d{10,}$/.test(text) ? Number(text) : Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Self-heal guard — migration 010 owns the schema; this is only for deploys
// that land before the migration runs. One DDL check per isolate.
let evidenceSchemaReady = false;

/** Self-heal the additive table (migration 010); no existing table is touched. */
export async function ensureEvidenceSchema(env: Env): Promise<void> {
  if (evidenceSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS crm_lead_evidence (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
       claim TEXT NOT NULL,
       source_url TEXT,
       fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       evidence_excerpt TEXT,
       evidence_hash TEXT,
       verification_method TEXT NOT NULL DEFAULT 'none' CHECK (verification_method IN ('exact','normalized','fuzzy','none')),
       confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
       provider TEXT,
       disposition TEXT NOT NULL DEFAULT 'unknown' CHECK (disposition IN ('verified','inferred','unknown')),
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_crm_lead_evidence_lead ON crm_lead_evidence(lead_id, id DESC)",
  ).run();
  evidenceSchemaReady = true;
}

export async function recordLeadEvidence(env: Env, leadId: number, body: Record<string, unknown>): Promise<Response> {
  await ensureEvidenceSchema(env);
  if (!body || typeof body !== "object") return json({ error: "JSON body required" }, 400);
  const claim = String(body.claim ?? "").trim().slice(0, 500);
  if (!claim) return json({ error: "claim required" }, 400);
  const sourceUrl = body.source_url == null ? null : String(body.source_url).trim().slice(0, 2000);
  const excerpt = body.evidence_excerpt == null ? null : String(body.evidence_excerpt).trim().slice(0, 4000);
  const suppliedHash = body.evidence_hash == null ? "" : String(body.evidence_hash).trim().toLowerCase();
  const method = String(body.verification_method ?? "none") as VerificationMethod;
  if (!["exact", "normalized", "fuzzy", "none"].includes(method)) return json({ error: "verification_method must be exact, normalized, fuzzy, or none" }, 400);
  if (!sourceUrl && !excerpt && !suppliedHash) return json({ error: "source_url, evidence_excerpt, or evidence_hash required" }, 400);
  if (suppliedHash && !/^[0-9a-f]{64}$/.test(suppliedHash)) return json({ error: "evidence_hash must be a SHA-256 hex digest" }, 400);
  if ((method === "exact" || method === "normalized") && !excerpt && !suppliedHash) return json({ error: "exact/normalized claims require an excerpt or hash" }, 400);
  const evidenceHash = suppliedHash || (excerpt ? await sha256Hex(excerpt) : null);
  const disposition = deriveDisposition(method, excerpt, evidenceHash);
  const lead = await env.DB.prepare("SELECT id FROM crm_leads WHERE id = ?").bind(leadId).first();
  if (!lead) return json({ error: "lead not found" }, 404);
  const fetchedAt = parseFetchedAt(body.fetched_at);
  if (!fetchedAt) return json({ error: "fetched_at must be an ISO-8601 timestamp" }, 400);
  const result = await env.DB.prepare(
    `INSERT INTO crm_lead_evidence (lead_id, claim, source_url, fetched_at, evidence_excerpt, evidence_hash, verification_method, confidence, provider, disposition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(leadId, claim, sourceUrl || null, fetchedAt, excerpt || null, evidenceHash, method, clampConfidence(body.confidence), body.provider ? String(body.provider).slice(0, 200) : null, disposition).run();
  return json({ id: result.meta.last_row_id, lead_id: leadId, claim, disposition, verification_method: method, confidence: clampConfidence(body.confidence) }, 201);
}

export async function listLeadEvidence(env: Env, leadId: number): Promise<Response> {
  await ensureEvidenceSchema(env);
  const lead = await env.DB.prepare("SELECT id FROM crm_leads WHERE id = ?").bind(leadId).first();
  if (!lead) return json({ error: "lead not found" }, 404);
  const { results } = await env.DB.prepare("SELECT * FROM crm_lead_evidence WHERE lead_id = ? ORDER BY id DESC LIMIT 200").bind(leadId).all();
  const rows = (results ?? []) as { disposition?: string }[];
  const summary = {
    verified: rows.filter((r) => r.disposition === "verified").length,
    inferred: rows.filter((r) => r.disposition === "inferred").length,
    unknown: rows.filter((r) => r.disposition === "unknown").length,
  };
  return json({ lead_id: leadId, summary, evidence: rows });
}

export async function evidenceSummary(env: Env): Promise<Response> {
  await ensureEvidenceSchema(env);
  const { results } = await env.DB.prepare("SELECT disposition, COUNT(*) AS count FROM crm_lead_evidence GROUP BY disposition ORDER BY disposition").all();
  return json({ summary: results ?? [] });
}
