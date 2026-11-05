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
  const confidence = clampConfidence(body.confidence);
  const provider = body.provider ? String(body.provider).slice(0, 200) : null;
  const result = await env.DB.prepare(
    `INSERT INTO crm_lead_evidence (lead_id, claim, source_url, fetched_at, evidence_excerpt, evidence_hash, verification_method, confidence, provider, disposition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(leadId, claim, sourceUrl || null, fetchedAt, excerpt || null, evidenceHash, method, confidence, provider, disposition).run();
  // Corroboration is a computed view over the claim's other observations. The
  // freshly inserted row is passed in explicitly — it now exists, but the
  // bounded scan below may predate this write (and in tests the fake table may
  // not contain it yet). One row can never corroborate itself: it contributes
  // a single source identity, so a first record always reads corroborated:false.
  const corroboration = corroborationFor(
    [
      { id: result.meta.last_row_id, claim, source_url: sourceUrl || null, provider },
      ...(await loadCorroborationRows(env)),
    ],
    claim,
  );
  return json({ id: result.meta.last_row_id, lead_id: leadId, claim, disposition, verification_method: method, confidence, corroboration }, 201);
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
  // Additive: the existing disposition counts stay byte-identical; the
  // corroboration block is the new claim-level view over the same rows.
  const corroboration = buildCorroborationReport(await loadCorroborationRows(env));
  return json({ summary: results ?? [], corroboration });
}

/** Focused read-only corroboration view — the same block the summary carries. */
export async function evidenceCorroborations(env: Env): Promise<Response> {
  await ensureEvidenceSchema(env);
  return json({ corroboration: buildCorroborationReport(await loadCorroborationRows(env)) });
}

// --- Evidence corroboration (C4) -------------------------------------------
//
// A claim is corroborated when the SAME claim — after normalization — was
// recorded from at least two INDEPENDENT sources. Independence is decided by
// source identity: the source URL's hostname when one is present, otherwise
// the provider name. Two pages on the same site are one publisher, so they do
// NOT corroborate each other (C4 acceptance criterion); a row that names
// neither a URL nor a provider is anonymous and can never pair.
//
// This is a computed view over rows that already exist — no column, no
// migration, no backfill. Nothing is ever inferred: a claim with one
// observation always reports `corroborated: false` and `corroboration_count: 1`.

/** The matching rows never carry more than this many characters of key. */
export const CLAIM_NORMALIZE_LIMIT = 160;

/**
 * Normalization rule, applied in this order (stated here because the whole
 * comparator depends on it):
 *   1. lowercase
 *   2. strip punctuation and whitespace — keep only Unicode letters/numbers
 *   3. truncate to the first 160 characters of the normalized form
 *
 * Two claims are "the same claim" iff their normalized forms are identical.
 * The 160-char boundary means claims that agree for 160 characters and then
 * diverge compare as the same claim — deliberate: enrichment claims are short
 * sentences, so their distinguishing content lands early.
 */
export function normalizeClaim(claim: unknown): string {
  return String(claim ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, CLAIM_NORMALIZE_LIMIT);
}

/** Shape of a stored evidence row, as far as corroboration cares. */
export type CorroborationRow = {
  id?: number | null;
  claim?: unknown;
  source_url?: unknown;
  provider?: unknown;
};

/**
 * Source identity for corroboration.
 *   - `domain:<host>` when source_url parses — `www.` is stripped so
 *     `www.acme.com` and `acme.com` are one publisher; other subdomains stay
 *     distinct hosts (no public-suffix list is available here).
 *   - `provider:<name>` when no usable URL but a provider is named.
 *   - `null` when neither exists — an anonymous observation proves no channel.
 */
export function sourceKey(row: CorroborationRow): string | null {
  const raw = typeof row.source_url === "string" ? row.source_url.trim() : "";
  if (raw) {
    try {
      const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
      if (host) return `domain:${host.replace(/^www\./, "")}`;
    } catch {
      /* unparseable URL — fall back to the provider below */
    }
  }
  const provider = typeof row.provider === "string" ? row.provider.trim().toLowerCase() : "";
  return provider ? `provider:${provider}` : null;
}

export type CorroborationView = {
  /** the first-observed surface form of the claim (trimmed original text) */
  claim: string;
  /** the normalization key the comparison used */
  normalized_claim: string;
  corroborated: boolean;
  /** distinct independent sources, floored at 1 for any recorded claim */
  corroboration_count: number;
  distinct_sources: string[];
  evidence_row_ids: number[];
};

export type CorroborationReport = {
  total_claims: number;
  corroborated_claims: number;
  claims: CorroborationView[];
};

const rowId = (row: CorroborationRow): number | null =>
  typeof row.id === "number" && Number.isFinite(row.id) ? row.id : null;

function viewFor(normalized: string, rows: CorroborationRow[]): CorroborationView {
  const ordered = [...rows].sort((a, b) => (rowId(a) ?? 0) - (rowId(b) ?? 0));
  const sources = new Set<string>();
  const ids: number[] = [];
  for (const row of ordered) {
    const key = sourceKey(row);
    if (key) sources.add(key);
    const id = rowId(row);
    if (id != null && !ids.includes(id)) ids.push(id);
  }
  const distinct = [...sources].sort();
  return {
    claim: String(ordered[0]?.claim ?? "").trim(),
    normalized_claim: normalized,
    corroborated: distinct.length >= 2,
    // A recorded claim always has at least one observation; the floor keeps
    // an anonymous single row at 1 so the count never reads as zero evidence.
    corroboration_count: Math.max(distinct.length, ordered.length ? 1 : 0),
    distinct_sources: distinct,
    evidence_row_ids: ids.sort((a, b) => a - b),
  };
}

/** Pure comparator: every row that records the same normalized claim. */
export function findCorroborations(rows: CorroborationRow[], claim: unknown): CorroborationRow[] {
  const target = normalizeClaim(claim);
  if (!target) return [];
  return rows.filter((row) => normalizeClaim(row.claim) === target);
}

/** Corroboration view for one claim across a set of rows (pure). */
export function corroborationFor(rows: CorroborationRow[], claim: unknown): CorroborationView | null {
  const normalized = normalizeClaim(claim);
  if (!normalized) return null;
  const matches = findCorroborations(rows, claim);
  if (!matches.length) return null;
  return viewFor(normalized, matches);
}

/** Group every recorded claim and report each group's corroboration (pure). */
export function buildCorroborationReport(rows: CorroborationRow[]): CorroborationReport {
  const groups = new Map<string, CorroborationRow[]>();
  for (const row of rows) {
    const key = normalizeClaim(row.claim);
    if (!key) continue; // an unreadable claim is not evidence of anything
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const claims = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([normalized, group]) => viewFor(normalized, group));
  return {
    total_claims: claims.length,
    corroborated_claims: claims.filter((c) => c.corroborated).length,
    claims,
  };
}

/**
 * The one bounded scan behind every corroboration read. Evidence capture is
 * sparse (enrichment is only partially live), so a single statement is
 * cheaper than a per-claim query. The limit is a safety bound, not a page
 * size: past it, the newest 5,000 observations are compared.
 */
const CORROBORATION_SCAN_LIMIT = 5000;

async function loadCorroborationRows(env: Env): Promise<CorroborationRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, claim, source_url, provider FROM crm_lead_evidence ORDER BY id DESC LIMIT ${CORROBORATION_SCAN_LIMIT}`,
  ).all();
  return (results ?? []) as CorroborationRow[];
}
