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
 * Zero-side-effect GET probes only. Anything that would post, send mail, or
 * mint a credential is deliberately absent — it stays "configured, unprobed".
 */
export function probeFor(connector: string, cred: string): ProbeTarget | null {
  switch (connector) {
    case "x":
      return { url: "https://api.x.com/2/users/by/username/Lazynextai", headers: { authorization: `Bearer ${cred}` } };
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
    const target = configured ? probeFor(id, String(cred)) : null;
    if (configured && !target) unsupported++;
    let probeOk: number | null = null;
    let error: string | null = null;
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
         last_probe_at = COALESCE(excluded.last_probe_at, capability_readiness.last_probe_at),
         last_probe_ok = COALESCE(excluded.last_probe_ok, capability_readiness.last_probe_ok),
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
    const facts: CapabilityFacts = {
      configured: Boolean(cred),
      documented: true, // every id here is in the connector library
      probe_supported: probeFor(id, "probe") != null,
      last_probe_ok: row?.last_probe_ok ?? null,
      last_probe_at: row?.last_probe_at ?? null,
    };
    rows.push({
      capability: id,
      documented: true,
      configured: facts.configured,
      probe_supported: facts.probe_supported,
      last_probe_at: row?.last_probe_at ?? null,
      last_probe_ok: row?.last_probe_ok ?? null,
      last_error: row?.last_error ?? null,
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
