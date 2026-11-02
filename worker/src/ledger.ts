/**
 * Outcome and cost ledger — append-only join keys over audit surfaces that
 * already exist (task_log, episodic_events scope 'connector', email_campaigns
 * + email_events engagement). Not an analytics system, not a datastore:
 * migration 011 adds one additive table, and the daily maintenance sweep that
 * already exists (`runDailyMaintenance`) builds task/campaign rows.
 */
import { Env, json } from "./gateway";

export type LedgerRefType = "task" | "connector" | "campaign" | "scan";
export type Acceptance = "passed" | "failed" | "n/a";

export const LEDGER_REF_TYPES: LedgerRefType[] = ["task", "connector", "campaign", "scan"];
export const ACCEPTANCE_VALUES: Acceptance[] = ["passed", "failed", "n/a"];

// Informational estimates only — the platform does not bill the fleet. Workers
// AI runs on the free-tier Llama model; email/API providers are plan-included,
// so most rows cost 0 and the number exists to make volume legible.
const COST_CENTS_BY_PROVIDER: Record<string, number> = {
  "workers-ai": 0,
  brevo: 1,
  listmonk: 0,
  beehiiv: 0,
  twilio: 2,
  whatsapp: 2,
  ayrshare: 1,
  postiz: 0,
  buffer: 0,
};

export function estimateCostCents(provider: unknown, units = 1): number {
  const key = String(provider ?? "").toLowerCase();
  const perUnit = COST_CENTS_BY_PROVIDER[key] ?? 0;
  const n = Number.isFinite(units) && units > 0 ? Math.floor(units) : 1;
  return perUnit * n;
}

export interface LedgerRow {
  ref_type: LedgerRefType;
  ref_id: string;
  agent_id?: string | null;
  provider?: string | null;
  model?: string | null;
  duration_ms?: number | null;
  retries?: number | null;
  est_cost_cents?: number | null;
  acceptance?: Acceptance | null;
  downstream_note?: string | null;
  dedupe_key?: string | null;
}

export interface NormalizedLedgerRow {
  ref_type: LedgerRefType;
  ref_id: string;
  agent_id: string | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  retries: number;
  est_cost_cents: number;
  acceptance: Acceptance;
  downstream_note: string | null;
  dedupe_key: string | null;
}

const trunc = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const nonNegInt = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export function normalizeLedgerRow(row: LedgerRow): { ok: boolean; row: NormalizedLedgerRow | null; errors: string[] } {
  const errors: string[] = [];
  const refType = String(row?.ref_type ?? "") as LedgerRefType;
  if (!LEDGER_REF_TYPES.includes(refType)) errors.push(`ref_type must be one of ${LEDGER_REF_TYPES.join("|")}`);
  const refId = trunc(row?.ref_id, 200);
  if (!refId) errors.push("ref_id is required");
  const acceptance = (row?.acceptance == null ? "n/a" : String(row.acceptance)) as Acceptance;
  if (!ACCEPTANCE_VALUES.includes(acceptance)) errors.push("acceptance must be passed|failed|n/a");
  if (errors.length) return { ok: false, row: null, errors };
  return {
    ok: true,
    errors: [],
    row: {
      ref_type: refType,
      ref_id: refId as string,
      agent_id: trunc(row.agent_id, 60),
      provider: trunc(row.provider, 60),
      model: trunc(row.model, 120),
      duration_ms: row.duration_ms == null ? null : nonNegInt(row.duration_ms, 0),
      retries: nonNegInt(row.retries, 0),
      est_cost_cents: nonNegInt(row.est_cost_cents, 0),
      acceptance,
      downstream_note: trunc(row.downstream_note, 1000),
      dedupe_key: trunc(row.dedupe_key, 200),
    },
  };
}

let ledgerSchemaReady = false;

export async function ensureLedgerSchema(env: Env): Promise<void> {
  if (ledgerSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS outcome_ledger (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ref_type TEXT NOT NULL CHECK (ref_type IN ('task', 'connector', 'campaign', 'scan')),
       ref_id TEXT NOT NULL,
       agent_id TEXT,
       provider TEXT,
       model TEXT,
       duration_ms INTEGER,
       retries INTEGER NOT NULL DEFAULT 0,
       est_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (est_cost_cents >= 0),
       acceptance TEXT NOT NULL DEFAULT 'n/a' CHECK (acceptance IN ('passed', 'failed', 'n/a')),
       downstream_note TEXT,
       dedupe_key TEXT UNIQUE,
       created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_outcome_ledger_ref ON outcome_ledger(ref_type, ref_id)",
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_outcome_ledger_provider ON outcome_ledger(provider)",
  ).run();
  ledgerSchemaReady = true;
}

const INSERT_SQL =
  `INSERT OR IGNORE INTO outcome_ledger
     (ref_type, ref_id, agent_id, provider, model, duration_ms, retries, est_cost_cents, acceptance, downstream_note, dedupe_key)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function appendLedger(env: Env, row: LedgerRow): Promise<{ ok: boolean; inserted: boolean; errors?: string[] }> {
  const norm = normalizeLedgerRow(row);
  if (!norm.ok || !norm.row) return { ok: false, inserted: false, errors: norm.errors };
  const r = norm.row;
  await ensureLedgerSchema(env);
  const res = await env.DB.prepare(INSERT_SQL).bind(
    r.ref_type, r.ref_id, r.agent_id, r.provider, r.model, r.duration_ms,
    r.retries, r.est_cost_cents, r.acceptance, r.downstream_note, r.dedupe_key,
  ).run();
  return { ok: true, inserted: (res.meta.changes ?? 0) > 0 };
}

/** Best-effort append used on live dispatch — observability must not fail a send. */
export async function recordDispatchLedger(
  env: Env,
  connector: string,
  input: { ok: boolean; duration_ms?: number; retries?: number; source?: string },
): Promise<void> {
  try {
    await appendLedger(env, {
      ref_type: "connector",
      ref_id: connector,
      provider: connector,
      duration_ms: input.duration_ms ?? null,
      retries: input.retries ?? 0,
      est_cost_cents: estimateCostCents(connector),
      acceptance: input.ok ? "passed" : "failed",
      downstream_note: input.source ? `source: ${input.source}` : null,
    });
  } catch {
    /* ledger is a read model over the audit trail, never a gate */
  }
}

export interface TaskRow {
  task_id: string;
  agent_id?: string | null;
  status?: string | null;
  attempts?: number | null;
  result?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

function durationMs(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

const PR_URL = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/;

/** Pure mapper: task_log rows -> ledger rows (dedupe key makes the sweep idempotent). */
export function taskLedgerRows(tasks: TaskRow[], model: string | null = null): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const t of tasks ?? []) {
    if (!t?.task_id) continue;
    const status = String(t.status ?? "");
    if (!["completed", "failed", "escalated"].includes(status)) continue;
    const pr = t.result ? (t.result.match(PR_URL)?.[0] ?? null) : null;
    rows.push({
      ref_type: "task",
      ref_id: String(t.task_id),
      agent_id: t.agent_id ?? null,
      provider: "workers-ai",
      model,
      duration_ms: durationMs(t.started_at ?? t.created_at, t.completed_at),
      retries: Math.max(nonNegInt(t.attempts, 0) - 1, 0),
      est_cost_cents: estimateCostCents("workers-ai"),
      acceptance: status === "completed" ? "passed" : status === "failed" ? "failed" : "n/a",
      downstream_note: pr ? `pr: ${pr}` : null,
      dedupe_key: `task:${t.task_id}`,
    });
  }
  return rows;
}

export interface CampaignRow {
  id: number;
  name?: string | null;
  status?: string | null;
  sent_count?: number | null;
  sent_at?: string | null;
}

export interface CampaignEngagement { opens: number; clicks: number }

export function campaignLedgerRows(
  campaigns: CampaignRow[],
  engagement: Record<string, CampaignEngagement> = {},
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const c of campaigns ?? []) {
    if (!c || !Number.isFinite(Number(c.id))) continue;
    if (String(c.status ?? "") !== "sent") continue;
    const sent = Math.max(nonNegInt(c.sent_count, 0), 0);
    const e = engagement[`campaign:${c.id}`] ?? { opens: 0, clicks: 0 };
    rows.push({
      ref_type: "campaign",
      ref_id: String(c.id),
      provider: "brevo",
      retries: 0,
      est_cost_cents: estimateCostCents("brevo", sent),
      acceptance: sent > 0 ? "passed" : "failed",
      downstream_note: `sent ${sent}; opens ${e.opens}; clicks ${e.clicks}`,
      dedupe_key: `campaign:${c.id}`,
    });
  }
  return rows;
}

/** Daily build over the existing audit surfaces. Idempotent via dedupe_key. */
export async function buildOutcomeLedger(env: Env): Promise<{ tasks: number; campaigns: number; inserted: number }> {
  await ensureLedgerSchema(env);
  let inserted = 0, tasks = 0, campaigns = 0;

  const taskRes = await env.DB.prepare(
    `SELECT task_id, agent_id, status, attempts, result, started_at, completed_at, created_at
       FROM task_log
      WHERE datetime(COALESCE(completed_at, created_at)) >= datetime('now','-1 day')
      LIMIT 500`,
  ).all<TaskRow>().catch(() => ({ results: [] as TaskRow[] }));
  for (const row of taskLedgerRows(taskRes.results ?? [])) {
    const r = await appendLedger(env, row).catch(() => null);
    tasks++;
    if (r?.inserted) inserted++;
  }

  const campRes = await env.DB.prepare(
    `SELECT id, name, status, sent_count, sent_at FROM email_campaigns
      WHERE status = 'sent' AND datetime(sent_at) >= datetime('now','-1 day') LIMIT 100`,
  ).all<CampaignRow>().catch(() => ({ results: [] as CampaignRow[] }));
  const engagement: Record<string, CampaignEngagement> = {};
  if ((campRes.results ?? []).length) {
    const evRes = await env.DB.prepare(
      `SELECT tag, event, COUNT(DISTINCT email) c FROM email_events
        WHERE tag LIKE 'campaign:%' GROUP BY tag, event`,
    ).all<{ tag: string; event: string; c: number }>().catch(() => ({ results: [] as { tag: string; event: string; c: number }[] }));
    for (const ev of evRes.results ?? []) {
      const norm = String(ev.event ?? "").toLowerCase().replace(/[_-]/g, "");
      const bucket = norm === "opened" || norm === "uniqueopened" || norm === "open" ? "opens"
        : norm === "click" || norm === "clicks" || norm === "uniqueclick" ? "clicks" : null;
      if (!bucket) continue;
      const cur = engagement[ev.tag] ?? { opens: 0, clicks: 0 };
      cur[bucket] += ev.c ?? 0;
      engagement[ev.tag] = cur;
    }
  }
  for (const row of campaignLedgerRows(campRes.results ?? [], engagement)) {
    const r = await appendLedger(env, row).catch(() => null);
    campaigns++;
    if (r?.inserted) inserted++;
  }

  for (const refType of ["task", "campaign"] as const) {
    // Old sweep rows age out with the rest of the observability tables; the
    // ledger keeps the same 90-day horizon as episodic_events.
    await env.DB.prepare(
      "DELETE FROM outcome_ledger WHERE ref_type = ? AND datetime(created_at) < datetime('now','-90 days')",
    ).bind(refType).run().catch(() => {});
  }
  return { tasks, campaigns, inserted };
}

export interface LedgerGroup {
  ref_type: string;
  provider: string | null;
  total: number;
  est_cost_cents: number;
  passed: number;
  failed: number;
  na: number;
  pass_rate: number;
}

/** Pure aggregation — used by the route and directly by tests. */
export function summarizeLedger(rows: { ref_type: string; provider?: string | null; est_cost_cents?: number | null; acceptance?: string | null }[]): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>();
  for (const r of rows ?? []) {
    const provider = r.provider ?? "(none)";
    const key = `${r.ref_type}|${provider}`;
    const g = groups.get(key) ?? {
      ref_type: r.ref_type, provider: r.provider ?? null, total: 0,
      est_cost_cents: 0, passed: 0, failed: 0, na: 0, pass_rate: 0,
    };
    g.total += 1;
    g.est_cost_cents += Number(r.est_cost_cents ?? 0) || 0;
    if (r.acceptance === "passed") g.passed += 1;
    else if (r.acceptance === "failed") g.failed += 1;
    else g.na += 1;
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) {
    const judged = g.passed + g.failed;
    g.pass_rate = judged ? Math.round((g.passed / judged) * 1000) / 1000 : 0;
  }
  return out.sort((a, b) => a.ref_type.localeCompare(b.ref_type) || String(a.provider).localeCompare(String(b.provider)));
}

export async function ledgerSummary(env: Env, url: URL): Promise<Response> {
  await ensureLedgerSchema(env);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7), 1), 365);
  const { results } = await env.DB.prepare(
    `SELECT ref_type, provider, COUNT(*) total, SUM(est_cost_cents) est_cost_cents,
            SUM(CASE WHEN acceptance = 'passed' THEN 1 ELSE 0 END) passed,
            SUM(CASE WHEN acceptance = 'failed' THEN 1 ELSE 0 END) failed,
            SUM(CASE WHEN acceptance = 'n/a' THEN 1 ELSE 0 END) na
       FROM outcome_ledger WHERE datetime(created_at) >= datetime('now', ?)
      GROUP BY ref_type, provider`,
  ).bind(`-${days} days`).all<{ ref_type: string; provider: string | null; total: number; est_cost_cents: number; passed: number; failed: number; na: number }>();
  const groups = (results ?? []).map((g) => {
    const judged = (g.passed ?? 0) + (g.failed ?? 0);
    return { ...g, pass_rate: judged ? Math.round(((g.passed ?? 0) / judged) * 1000) / 1000 : 0 };
  });
  const totals = groups.reduce(
    (acc, g) => ({
      total: acc.total + (g.total ?? 0),
      est_cost_cents: acc.est_cost_cents + (g.est_cost_cents ?? 0),
    }),
    { total: 0, est_cost_cents: 0 },
  );
  return json({ days, totals, groups });
}

export async function handleLedgerRoutes(env: Env, path: string, body: Record<string, unknown>): Promise<Response | null> {
  if (path !== "/ledger/append") return null;
  // The route never trusts a caller-provided cost over the provider estimate
  // when the provider is known — estimates stay derived, not asserted.
  const provider = body.provider == null ? null : String(body.provider);
  const est = body.est_cost_cents == null && provider
    ? estimateCostCents(provider, Number(body.units ?? 1))
    : body.est_cost_cents;
  const out = await appendLedger(env, { ...(body as unknown as LedgerRow), est_cost_cents: est as number })
    .catch((err: unknown) => ({ ok: false, inserted: false, errors: [err instanceof Error ? err.message : String(err)] }));
  if (!out.ok) return json({ error: "invalid ledger row", errors: out.errors }, 400);
  return json({ ok: true, inserted: out.inserted }, out.inserted ? 201 : 200);
}
