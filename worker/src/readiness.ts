/**
 * Capability / readiness matrix — configured vs live-probed vs stale vs merely
 * documented. Extends the existing `/api/v1/connectors` credential map and the
 * health-check KV breadcrumbs; it does not duplicate them. Honest by design:
 * `probe-ok` only ever means a zero-side-effect read probe actually succeeded.
 */
import { Env, json } from "./gateway";
import { CONNECTOR_IDS, connCred, brevoCred } from "./services";

export const STALE_MS = 7 * 86_400_000;

export interface ProbeTarget { url: string; headers: Record<string, string> }

/**
 * X's credential is EITHER an OAuth2 user bearer OR a durable OAuth1 user quad
 * `ck|cs|at|ats` (consumer key|secret + access token|secret) — exactly what the
 * dispatcher in `services.ts` / `core/tools/connectors.py` accepts. Only the
 * bearer form can go in an `authorization: Bearer …` header; feeding the quad
 * to that header is what produced the false `probe-failed HTTP 401` (X answers
 * `Bearer ck|cs|at|ats` with 401 Unauthorized while the very same quad posts
 * fine through OAuth1 HMAC-SHA1 signing).
 */
export function isXAuth1Quad(cred: string): boolean {
  const parts = String(cred ?? "").split("|");
  return parts.length >= 4 && parts.slice(0, 4).every((p) => p.trim().length > 0);
}

/** Why an OAuth1-quad X credential cannot be probed, recorded verbatim in `last_error`. */
export const X_AUTH1_PROBE_REASON =
  "x probe skipped: credential is an OAuth1 user quad (ck|cs|at|ats), which needs an OAuth1-signed request — " +
  "the readiness pass only sends a bearer header, so probing it would report a false 401; " +
  "dispatch is verified separately through the gated connector path";

/**
 * Zero-side-effect GET probes only. Anything that would post, send mail, or
 * mint a credential is deliberately absent — it stays "configured, unprobed".
 * `null` means "this credential shape cannot be probed here" (never "unhealthy").
 */
export function probeFor(connector: string, cred: string): ProbeTarget | null {
  switch (connector) {
    case "x":
      // A quad is not a bearer token — sending it as one is a guaranteed 401.
      if (isXAuth1Quad(cred)) return null;
      // `/2/users/me` (not a hardcoded handle): reads back the authenticated
      // user, the same credential+endpoint family the dispatcher posts with.
      return { url: "https://api.x.com/2/users/me", headers: { authorization: `Bearer ${cred}` } };
    case "brevo":
      return { url: "https://api.brevo.com/v3/account", headers: { "api-key": cred, accept: "application/json" } };
    case "github":
      return { url: "https://api.github.com/user", headers: { authorization: `Bearer ${cred}`, "user-agent": "lazynext-readiness-probe" } };
    case "gitlab":
      return { url: "https://gitlab.com/api/v4/user", headers: { "private-token": cred } };
    case "telegram": {
      const token = cred.split(":")[0];
      if (!token) return null;
      return { url: `https://api.telegram.org/bot${token}/getMe`, headers: {} };
    }
    default:
      // Webhook-shaped and OAuth-write connectors would need a POST to prove
      // themselves; a POST is an external side effect, so we never do it here.
      return null;
  }
}

export interface ProbeSupport {
  /** Can the credential we actually hold be probed at all? */
  supported: boolean;
  /** Truthful operator-facing reason when it cannot (null when it can). */
  reason: string | null;
}

/**
 * `probeFor` alone cannot answer "is this probeable?" — it only sees the shape
 * of the string handed to it, and the readiness pass must decide per the REAL
 * stored credential. This keeps the unsupportable cases explicit instead of
 * letting them run and record a misleading `HTTP 401`.
 */
export function probeSupport(connector: string, cred: string | null): ProbeSupport {
  if (!cred) return { supported: false, reason: null };
  if (connector === "x" && isXAuth1Quad(cred)) return { supported: false, reason: X_AUTH1_PROBE_REASON };
  return { supported: probeFor(connector, cred) != null, reason: null };
}

export type CapabilityState =
  | "probe-ok" | "probe-failed" | "stale" | "configured-unprobed" | "documented-only" | "absent";

export interface CapabilityFacts {
  configured: boolean;
  documented: boolean;
  probe_supported: boolean;
  last_probe_ok: number | null;
  last_probe_at: string | null;
}

export function classifyCapability(facts: CapabilityFacts, nowMs = Date.now(), staleMs = STALE_MS): CapabilityState {
  if (!facts.configured && !facts.documented) return "absent";
  if (!facts.configured) return "documented-only";
  if (facts.last_probe_at == null) {
    return facts.probe_supported ? "configured-unprobed" : "configured-unprobed";
  }
  const age = nowMs - Date.parse(facts.last_probe_at);
  if (!Number.isFinite(age) || age > staleMs) return "stale";
  if (facts.last_probe_ok === 1) return "probe-ok";
  if (facts.last_probe_ok === 0) return "probe-failed";
  return "configured-unprobed";
}

export interface MatrixRow {
  capability: string;
  documented: boolean;
  configured: boolean;
  probe_supported: boolean;
  last_probe_at: string | null;
  last_probe_ok: number | null;
  last_error: string | null;
  keystore: string | null;
  state: CapabilityState;
}

export function matrixSummary(rows: MatrixRow[]): Record<string, number> {
  const out: Record<string, number> = {
    total: rows.length, "probe-ok": 0, "probe-failed": 0, stale: 0,
    "configured-unprobed": 0, "documented-only": 0, absent: 0,
  };
  for (const r of rows ?? []) out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
}

const BREADCRUMBS: { key: string; label: string; stale_ms: number }[] = [
  { key: "cron:last_tick", label: "cron tick", stale_ms: 25 * 60_000 },
  { key: "maint:last_run", label: "daily maintenance", stale_ms: 26 * 3_600_000 },
  { key: "mon:last_sweep", label: "monitor sweep", stale_ms: 26 * 3_600_000 },
  { key: "seq:last_run", label: "lead sequence", stale_ms: 26 * 3_600_000 },
  { key: "billing:last_reconcile", label: "billing reconcile", stale_ms: 26 * 3_600_000 },
  { key: "ledger:last_build", label: "ledger build", stale_ms: 26 * 3_600_000 },
  { key: "cap:last_probe", label: "capability probe", stale_ms: 12 * 3_600_000 },
];

function breadcrumbTime(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const at = Number(parsed.at ?? parsed);
    if (Number.isFinite(at)) return at;
  } catch {
    /* bare number / timestamp string */
  }
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readinessBreadcrumbs(env: Env, nowMs = Date.now()): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const b of BREADCRUMBS) {
    const raw = await env.EPHEMERAL.get(b.key).catch(() => null);
    const at = breadcrumbTime(raw);
    out.push({
      key: b.key,
      label: b.label,
      at: at == null ? null : new Date(at).toISOString(),
      age_ms: at == null ? null : Math.max(nowMs - at, 0),
      stale: at == null ? true : nowMs - at > b.stale_ms,
      present: raw != null,
    });
  }
  return out;
}

let readinessSchemaReady = false;

export async function ensureReadinessSchema(env: Env): Promise<void> {
  if (readinessSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS capability_readiness (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       capability TEXT NOT NULL UNIQUE,
       last_probe_at TEXT,
       last_probe_ok INTEGER,
       last_error TEXT,
       documented INTEGER NOT NULL DEFAULT 0 CHECK (documented IN (0, 1)),
       probe_supported INTEGER NOT NULL DEFAULT 1 CHECK (probe_supported IN (0, 1)),
       keystore TEXT,
       created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       updated_at TEXT
     )`,
  ).run();
  readinessSchemaReady = true;
}

/** 6h gate — the probe sweep rides the existing every-10-min cron tick, not a new scheduler. */
export async function refreshCapabilityReadiness(env: Env): Promise<{ skipped?: string; probed: number; ok: number; failed: number; unsupported: number }> {
  const last = await env.EPHEMERAL.get("cap:last_probe").catch(() => null);
  const lastAt = breadcrumbTime(last);
  if (lastAt && Date.now() - lastAt < 6 * 3_600_000) return { skipped: "recent", probed: 0, ok: 0, failed: 0, unsupported: 0 };
  await ensureReadinessSchema(env);

  let probed = 0, ok = 0, failed = 0, unsupported = 0;
  for (const id of CONNECTOR_IDS) {
    const cred = id === "brevo"
      ? ((await brevoCred(env))?.key ?? null)
      : await connCred(env, id);
    const configured = Boolean(cred);
    const support = probeSupport(id, configured ? String(cred) : null);
    const target = configured && support.supported ? probeFor(id, String(cred)) : null;
    if (configured && !support.supported) unsupported++;
    let probeOk: number | null = null;
    let error: string | null = support.supported ? null : support.reason;
    let probedAt: string | null = null;
    if (target) {
      probedAt = new Date().toISOString();
      try {
        const res = await fetch(target.url, {
          method: "GET",
          headers: target.headers,
          signal: AbortSignal.timeout(6000),
        });
        probeOk = res.ok ? 1 : 0;
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (err) {
        probeOk = 0;
        error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      }
      probed++;
      if (probeOk === 1) ok++; else failed++;
    }
    const keystore = configured ? ((await env.EPHEMERAL.get(`conn:${id}`).catch(() => null)) ? "kv" : "secret") : "none";
    await env.DB.prepare(
      `INSERT INTO capability_readiness
         (capability, last_probe_at, last_probe_ok, last_error, documented, probe_supported, keystore, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(capability) DO UPDATE SET
         last_probe_at = CASE WHEN excluded.probe_supported = 0 THEN NULL
                              ELSE COALESCE(excluded.last_probe_at, capability_readiness.last_probe_at) END,
         last_probe_ok = CASE WHEN excluded.probe_supported = 0 THEN NULL
                              ELSE COALESCE(excluded.last_probe_ok, capability_readiness.last_probe_ok) END,
         last_error = excluded.last_error,
         probe_supported = excluded.probe_supported,
         keystore = excluded.keystore,
         updated_at = excluded.updated_at`,
    ).bind(id, probedAt, probeOk, error, target ? 1 : 0, keystore).run().catch(() => undefined);
  }
  await env.EPHEMERAL.put("cap:last_probe", JSON.stringify({ at: Date.now(), probed, ok, failed, unsupported }))
    .catch(() => undefined);
  return { probed, ok, failed, unsupported };
}

export async function capabilityMatrix(env: Env): Promise<Response> {
  await ensureReadinessSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT capability, last_probe_at, last_probe_ok, last_error, documented, probe_supported, keystore FROM capability_readiness",
  ).all<{
    capability: string; last_probe_at: string | null; last_probe_ok: number | null;
    last_error: string | null; documented: number; probe_supported: number; keystore: string | null;
  }>();
  const stored = new Map((results ?? []).map((r) => [r.capability, r]));

  const rows: MatrixRow[] = [];
  for (const id of CONNECTOR_IDS) {
    const cred = id === "brevo" ? (await brevoCred(env))?.key : await connCred(env, id);
    const row = stored.get(id);
    const support = probeSupport(id, cred ? String(cred) : null);
    // A stored verdict only counts while the credential shape is still probeable:
    // the pre-fix X row carries a `HTTP 401` from a probe that could never work,
    // and that must not outlive the deploy that fixed it.
    const lastProbeOk = support.supported ? (row?.last_probe_ok ?? null) : null;
    const lastProbeAt = support.supported ? (row?.last_probe_at ?? null) : null;
    const lastError = support.supported ? (row?.last_error ?? null) : support.reason;
    const facts: CapabilityFacts = {
      configured: Boolean(cred),
      documented: true, // every id here is in the connector library
      probe_supported: support.supported,
      last_probe_ok: lastProbeOk,
      last_probe_at: lastProbeAt,
    };
    rows.push({
      capability: id,
      documented: true,
      configured: facts.configured,
      probe_supported: facts.probe_supported,
      last_probe_at: lastProbeAt,
      last_probe_ok: lastProbeOk,
      last_error: lastError,
      keystore: facts.configured ? (row?.keystore ?? "unknown") : "none",
      state: classifyCapability(facts),
    });
  }
  return json({
    generated_at: new Date().toISOString(),
    summary: matrixSummary(rows),
    connectors: rows,
    services: await readinessBreadcrumbs(env),
  });
}
