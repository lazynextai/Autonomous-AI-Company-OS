/**
 * Outbound circuit breakers — policy-level stop conditions around connector
 * and social dispatch. Reuses the existing dispatch audit (episodic_events
 * scope 'connector') and the email_events deliverability record; no new
 * scheduler or control plane is introduced. A tripped breaker fails closed:
 * the send is blocked and the reason is recorded for admins.
 */
import { Env, json } from "./gateway";

export interface BreakerPolicy {
  enabled: number;
  volume_limit: number;
  volume_window_ms: number;
  failure_limit: number;
  failure_window_ms: number;
  error_rate_limit: number;
  error_rate_window_ms: number;
  deliverability_limit: number;
  deliverability_window_ms: number;
  tripped_reason: string | null;
  tripped_at: string | null;
}

export interface BreakerStats {
  dispatch_total: number;
  dispatch_failed: number;
  email_total: number;
  email_degraded: number;
}

export interface BreakerDecision {
  allow: boolean;
  reason?: string;
  stats: BreakerStats;
}

const DEFAULT_POLICY: Omit<BreakerPolicy, "tripped_reason" | "tripped_at"> = {
  enabled: 1,
  volume_limit: 100,
  volume_window_ms: 3_600_000,
  failure_limit: 5,
  failure_window_ms: 600_000,
  error_rate_limit: 0.5,
  error_rate_window_ms: 600_000,
  deliverability_limit: 0.2,
  deliverability_window_ms: 86_400_000,
};

// Connectors whose outbound is email — only these are subject to the
// deliverability breaker (a bounce rate says nothing about a tweet).
export const EMAIL_CONNECTORS = new Set(["brevo", "listmonk", "beehiiv"]);

const MIN_ERROR_SAMPLE = 5;
const MIN_EMAIL_SAMPLE = 10;
const DEGRADED_EVENTS = ["spam", "complaint", "hardbounce", "invalidemail", "invalid", "blocked"];

function normalizeEvent(name: unknown): string {
  return String(name ?? "").toLowerCase().replace(/[_-]/g, "");
}

export function degradedEmailEvent(name: unknown): boolean {
  return DEGRADED_EVENTS.includes(normalizeEvent(name));
}

/** Pure policy evaluation — no I/O, so the trip rules are directly testable. */
export function evaluatePolicy(policy: BreakerPolicy, stats: BreakerStats, connector: string): BreakerDecision {
  if (!policy.enabled) return { allow: true, stats };
  if (stats.dispatch_total >= policy.volume_limit) {
    return { allow: false, reason: `volume: ${stats.dispatch_total} dispatches in ${Math.round(policy.volume_window_ms / 60000)}m (limit ${policy.volume_limit})`, stats };
  }
  if (stats.dispatch_failed >= policy.failure_limit) {
    return { allow: false, reason: `provider failures: ${stats.dispatch_failed} in ${Math.round(policy.failure_window_ms / 60000)}m (limit ${policy.failure_limit})`, stats };
  }
  if (stats.dispatch_total >= MIN_ERROR_SAMPLE && stats.dispatch_failed / stats.dispatch_total >= policy.error_rate_limit) {
    return { allow: false, reason: `error rate: ${Math.round((stats.dispatch_failed / stats.dispatch_total) * 100)}% (limit ${Math.round(policy.error_rate_limit * 100)}%)`, stats };
  }
  if (EMAIL_CONNECTORS.has(connector) && stats.email_total >= MIN_EMAIL_SAMPLE && stats.email_degraded / stats.email_total >= policy.deliverability_limit) {
    return { allow: false, reason: `deliverability: ${Math.round((stats.email_degraded / stats.email_total) * 100)}% degraded events (limit ${Math.round(policy.deliverability_limit * 100)}%)`, stats };
  }
  return { allow: true, stats };
}

// Self-heal guard — the DDL is idempotent, but paying for it on every
// dispatch is not. One check per isolate; a failed check retries next call.
let breakerSchemaReady = false;

export async function ensureBreakerSchema(env: Env): Promise<void> {
  if (breakerSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS outbound_breaker_config (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       volume_limit INTEGER NOT NULL DEFAULT 100,
       volume_window_ms INTEGER NOT NULL DEFAULT 3600000,
       failure_limit INTEGER NOT NULL DEFAULT 5,
       failure_window_ms INTEGER NOT NULL DEFAULT 600000,
       error_rate_limit REAL NOT NULL DEFAULT 0.5,
       error_rate_window_ms INTEGER NOT NULL DEFAULT 600000,
       deliverability_limit REAL NOT NULL DEFAULT 0.2,
       deliverability_window_ms INTEGER NOT NULL DEFAULT 86400000,
       enabled INTEGER NOT NULL DEFAULT 1,
       tripped_reason TEXT,
       tripped_at TEXT,
       updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`,
  ).run();
  await env.DB.prepare("INSERT OR IGNORE INTO outbound_breaker_config (id) VALUES (1)").run();
  breakerSchemaReady = true;
}

export async function loadBreakerPolicy(env: Env): Promise<BreakerPolicy> {
  await ensureBreakerSchema(env);
  const row = await env.DB.prepare("SELECT * FROM outbound_breaker_config WHERE id = 1").first<BreakerPolicy>();
  return { ...DEFAULT_POLICY, tripped_reason: null, tripped_at: null, ...(row ?? {}) };
}

async function dispatchStats(env: Env, policy: BreakerPolicy, connector: string): Promise<{ total: number; failed: number }> {
  // datetime() on both sides: episodic_events.created_at is ISO, but the
  // comparison must not depend on that — mixed formats sort wrong as strings.
  const volumeCutoff = new Date(Date.now() - policy.volume_window_ms).toISOString();
  const failureCutoff = new Date(Date.now() - policy.failure_window_ms).toISOString();
  const volume = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM episodic_events WHERE scope = 'connector' AND datetime(created_at) >= datetime(?) AND json_extract(payload, '$.id') = ?",
  ).bind(volumeCutoff, connector).first<{ c: number }>();
  const failures = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM episodic_events WHERE scope = 'connector' AND datetime(created_at) >= datetime(?) AND json_extract(payload, '$.id') = ? AND json_extract(payload, '$.ok') = 0",
  ).bind(failureCutoff, connector).first<{ c: number }>();
  return { total: volume?.c ?? 0, failed: failures?.c ?? 0 };
}

async function emailStats(env: Env, policy: BreakerPolicy): Promise<{ total: number; degraded: number }> {
  const cutoff = new Date(Date.now() - policy.deliverability_window_ms).toISOString();
  // email_events is the Brevo callback log (created out-of-band on prod, so a
  // fresh D1 may not have it yet). Deliverability is one signal of four —
  // a missing/legacy table must degrade to "no signal", never to a permanent
  // global stop, so this is the one read allowed to fail open.
  try {
    const { results } = await env.DB.prepare(
      "SELECT event, COUNT(*) AS c FROM email_events WHERE datetime(created_at) >= datetime(?) GROUP BY event",
    ).bind(cutoff).all<{ event: string; c: number }>();
    let total = 0, degraded = 0;
    for (const r of results ?? []) {
      total += r.c;
      if (degradedEmailEvent(r.event)) degraded += r.c;
    }
    return { total, degraded };
  } catch {
    return { total: 0, degraded: 0 };
  }
}

/** Evaluate the policy for one connector. Errors fail closed. */
export async function outboundDecision(env: Env, connector: string): Promise<BreakerDecision> {
  try {
    const policy = await loadBreakerPolicy(env);
    const d = await dispatchStats(env, policy, connector);
    const e = await emailStats(env, policy);
    return evaluatePolicy(policy, {
      dispatch_total: d.total,
      dispatch_failed: d.failed,
      email_total: e.total,
      email_degraded: e.degraded,
    }, connector);
  } catch (err) {
    return {
      allow: false,
      reason: `breaker_eval_failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
      stats: { dispatch_total: 0, dispatch_failed: 0, email_total: 0, email_degraded: 0 },
    };
  }
}

/** Persist a trip for admin visibility. Deduped in KV so a blocked burst writes one record. */
export async function noteBreakerTrip(env: Env, connector: string, reason: string): Promise<void> {
  try {
    // The marker's 5-minute TTL is the dedup window: a burst of blocked sends
    // records one trip, then the next one past the window records again.
    if (await env.EPHEMERAL.get("breaker:last_trip")) return;
    await env.EPHEMERAL.put("breaker:last_trip", String(Date.now()), { expirationTtl: 300 });
    await env.DB.prepare(
      "UPDATE outbound_breaker_config SET tripped_reason = ?, tripped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1",
    ).bind(`${connector}: ${reason}`.slice(0, 400)).run();
    await env.DB.prepare(
      "INSERT INTO episodic_events (scope, payload) VALUES ('breaker', ?)",
    ).bind(JSON.stringify({ connector, reason, at: Date.now() })).run();
  } catch {
    // Trip bookkeeping must never turn into a second failure mode.
  }
}

/** Shared audit write — used by both direct dispatch and the scheduled-post dispatcher. */
export async function recordDispatchAudit(env: Env, connector: string, ok: boolean, status?: number, source = "direct"): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO episodic_events (scope, payload) VALUES ('connector', ?)",
    ).bind(JSON.stringify({ id: connector, ok, status: status ?? null, source })).run();
  } catch {
    // Audit is observability, not the dispatch outcome — never fail the send.
  }
}

function num(v: unknown, fallback: number, min = 1): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export async function breakerAdmin(
  env: Env, path: string, method: string, body: Record<string, unknown>,
): Promise<Response> {
  const policy = await loadBreakerPolicy(env);
  if (method === "GET") {
    const stats: Record<string, unknown> = {};
    for (const c of new Set(["x", "linkedin", "brevo", ...EMAIL_CONNECTORS])) {
      const d = await dispatchStats(env, policy, c).catch(() => null);
      stats[c] = d ?? null;
    }
    const { results: trips } = await env.DB.prepare(
      "SELECT id, payload, created_at FROM episodic_events WHERE scope = 'breaker' ORDER BY id DESC LIMIT 20",
    ).all().catch(() => ({ results: [] }));
    return json({ policy, stats, trips: trips ?? [] });
  }
  if (path === "/api/v1/ops/breakers/reset") {
    await env.DB.prepare("UPDATE outbound_breaker_config SET tripped_reason = NULL, tripped_at = NULL WHERE id = 1").run();
    await env.EPHEMERAL.delete("breaker:last_trip").catch(() => {});
    return json({ ok: true, reset: true });
  }
  const next = {
    enabled: body.enabled === undefined ? policy.enabled : (body.enabled ? 1 : 0),
    volume_limit: num(body.volume_limit, policy.volume_limit),
    volume_window_ms: num(body.volume_window_ms, policy.volume_window_ms, 60_000),
    failure_limit: num(body.failure_limit, policy.failure_limit),
    failure_window_ms: num(body.failure_window_ms, policy.failure_window_ms, 60_000),
    error_rate_limit: num(body.error_rate_limit, policy.error_rate_limit, 0),
    error_rate_window_ms: num(body.error_rate_window_ms, policy.error_rate_window_ms, 60_000),
    deliverability_limit: num(body.deliverability_limit, policy.deliverability_limit, 0),
    deliverability_window_ms: num(body.deliverability_window_ms, policy.deliverability_window_ms, 60_000),
  };
  if (next.error_rate_limit > 1 || next.deliverability_limit > 1)
    return json({ error: "error_rate_limit and deliverability_limit must be between 0 and 1" }, 400);
  await env.DB.prepare(
    `UPDATE outbound_breaker_config SET enabled=?, volume_limit=?, volume_window_ms=?, failure_limit=?, failure_window_ms=?, error_rate_limit=?, error_rate_window_ms=?, deliverability_limit=?, deliverability_window_ms=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1`,
  ).bind(next.enabled, next.volume_limit, next.volume_window_ms, next.failure_limit, next.failure_window_ms, next.error_rate_limit, next.error_rate_window_ms, next.deliverability_limit, next.deliverability_window_ms).run();
  return json({ ok: true, policy: { ...policy, ...next } });
}
