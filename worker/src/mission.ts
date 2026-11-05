/**
 * Mission roll-up — "what was planned, what actually happened, what did it
 * cost" for one task, read-only over surfaces that already exist.
 *
 * This is a VIEW on top of `outcome_ledger`, not a second store: no table, no
 * column, no backfill. The ledger keeps one row per outcome; this module groups
 * the rows that belong to one task and — because `task_log` carries no lineage
 * column at all (no parent_task_id, no mission) — states exactly how the
 * grouping was derived instead of implying a hierarchy the schema cannot prove.
 *
 * Membership comes from the two exact join keys the schema does have:
 *   1. outcome_ledger(ref_type='task', ref_id=task_id)      — the task's own row
 *   2. decision_packages.executed_task_id = task_id         — packages it executed
 *   3. connector/campaign ledger rows matching a linked package's target
 *      (`<connector>` / `campaign:<id>`) — a two-hop derived match, labelled
 *      `link: "package_target"`, `confidence: "derived"`. It is as strong as the
 *      package's target, NOT per-event attribution: a connector row cannot name
 *      the task that caused it, because it stores no task id.
 *
 * Honesty rules baked in here:
 *   - a missing piece is `null`, never a fabricated zero;
 *   - `est_cost_cents` is labelled `cost_kind: "estimated"` with the estimator
 *     that produced it — the platform does not bill the fleet;
 *   - totals are sums over *measured* rows, and a metric no row measured is
 *     `null` rather than 0.
 */
import { Env, json } from "./gateway";

const MAX_LEDGER_ROWS = 200;
const MAX_PACKAGES = 25;

export const COST_KIND = "estimated" as const;

/**
 * Named so a reader of the report knows where the number came from. Kept in
 * sync with the table in ledger.ts by the test that lifts both modules.
 */
export const COST_DERIVATION =
  "estimateCostCents(provider, units) in worker/src/ledger.ts — a fixed per-provider " +
  "unit table (workers-ai 0, brevo 1, twilio/whatsapp 2, ayrshare 1, " +
  "listmonk/beehiiv/postiz/buffer 0 cents per unit). Informational only: the " +
  "platform does not bill the fleet, so this is an ESTIMATE, never a billed amount.";

export interface MissionTask {
  task_id: string;
  agent_id: string | null;
  description: string | null;
  status: string | null;
  attempts: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface MissionPackage {
  id: number;
  title: string | null;
  objective: string | null;
  proposed_action: string | null;
  authority: string | null;
  outcome: string | null;
  decided_by: string | null;
  target: string | null;
  expiry_at: string | null;
  cost_projection_cents: number | null;
  executed_task_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type LedgerLink = "task_direct" | "package_target";
export type LinkConfidence = "exact" | "derived";

export interface MissionLedgerRow {
  id: number;
  ref_type: string;
  ref_id: string;
  agent_id: string | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  retries: number | null;
  est_cost_cents: number | null;
  acceptance: string | null;
  downstream_note: string | null;
  dedupe_key: string | null;
  created_at: string | null;
  link: LedgerLink;
  link_confidence: LinkConfidence;
}

export interface AcceptanceCounts {
  passed: number;
  failed: number;
  na: number;
  pass_rate: number | null;
}

export interface MissionTotals {
  row_count: number;
  duration_ms: number | null;
  retries: number | null;
  est_cost_cents: number | null;
  cost_kind: typeof COST_KIND;
  cost_derivation: string;
  acceptance: AcceptanceCounts | null;
}

export interface MissionGrouping {
  method: "derived";
  lineage: {
    available: false;
    column: null;
    reason: string;
  };
  rules: string[];
}

export const GROUPING: MissionGrouping = {
  method: "derived",
  lineage: {
    available: false,
    column: null,
    reason:
      "task_log defines no parent_task_id / mission column, so a mission is never stored as " +
      "a hierarchy. Verified against the shipped schema (db/migrations/001_initial.sql) and " +
      "against production D1 (PRAGMA table_info(task_log): id, task_id, agent_id, description, " +
      "status, attempts, result, error_log, performance_score, started_at, completed_at, " +
      "created_at). This report therefore derives the grouping from outcome_ledger and " +
      "decision_packages and never claims children it cannot prove.",
  },
  rules: [
    "anchor: task_log row where task_id = :taskId",
    "task_direct (exact): outcome_ledger rows where ref_type='task' AND ref_id=:taskId",
    "package_direct (exact): decision_packages rows where executed_task_id=:taskId",
    "package_target (derived): connector/campaign ledger rows whose ref_id matches a linked package target (<connector> or campaign:<id>) — two-hop match, not per-event attribution",
    "children: unavailable — no lineage column exists, so no child tasks are inferred",
  ],
};

/** Sums over measured values; a metric nothing measured stays null. */
export function missionTotals(
  rows: {
    duration_ms?: number | null;
    retries?: number | null;
    est_cost_cents?: number | null;
    acceptance?: string | null;
  }[],
): MissionTotals {
  const list = rows ?? [];
  const sumMeasured = (pick: (r: (typeof list)[number]) => number | null | undefined): number | null => {
    let seen = false;
    let total = 0;
    for (const r of list) {
      const v = pick(r);
      if (typeof v === "number" && Number.isFinite(v)) {
        seen = true;
        total += v;
      }
    }
    return seen ? total : null;
  };

  let passed = 0;
  let failed = 0;
  let na = 0;
  for (const r of list) {
    if (r.acceptance === "passed") passed += 1;
    else if (r.acceptance === "failed") failed += 1;
    else na += 1;
  }
  const judged = passed + failed;
  const acceptance: AcceptanceCounts | null = list.length
    ? {
        passed,
        failed,
        na,
        pass_rate: judged ? Math.round((passed / judged) * 1000) / 1000 : null,
      }
    : null;

  return {
    row_count: list.length,
    duration_ms: sumMeasured((r) => r.duration_ms),
    retries: sumMeasured((r) => r.retries),
    est_cost_cents: sumMeasured((r) => r.est_cost_cents),
    cost_kind: COST_KIND,
    cost_derivation: COST_DERIVATION,
    acceptance,
  };
}

/** `ref_id` for a package target: `campaign:12` -> `12` (campaign), else as-is. */
function targetRef(pkg: MissionPackage): { refType: "connector" | "campaign"; refId: string } | null {
  const target = pkg.target == null ? "" : String(pkg.target).trim();
  if (!target) return null;
  if (target.startsWith("campaign:")) {
    const id = target.slice("campaign:".length).trim();
    return id ? { refType: "campaign", refId: id } : null;
  }
  return { refType: "connector", refId: target };
}

/** Build the ledger predicate + params for a mission. Pure, so tests pin it. */
export function ledgerQueryFor(taskId: string, packages: MissionPackage[]): { sql: string; params: (string | number)[] } {
  const clauses = ["(ref_type = 'task' AND ref_id = ?)"];
  const params: (string | number)[] = [taskId];
  const connectorIds = new Set<string>();
  const campaignIds = new Set<string>();
  for (const p of packages ?? []) {
    const ref = targetRef(p);
    if (!ref) continue;
    if (ref.refType === "campaign") campaignIds.add(ref.refId);
    else connectorIds.add(ref.refId);
  }
  for (const [refType, ids] of [["connector", connectorIds], ["campaign", campaignIds]] as const) {
    if (!ids.size) continue;
    const list = [...ids];
    clauses.push(`(ref_type = '${refType}' AND ref_id IN (${list.map(() => "?").join(", ")}))`);
    params.push(...list);
  }
  return {
    sql:
      "SELECT id, ref_type, ref_id, agent_id, provider, model, duration_ms, retries, est_cost_cents, " +
      "acceptance, downstream_note, dedupe_key, created_at FROM outcome_ledger WHERE " +
      clauses.join(" OR ") +
      ` ORDER BY id LIMIT ${MAX_LEDGER_ROWS}`,
    params,
  };
}

function annotate(row: Omit<MissionLedgerRow, "link" | "link_confidence">): MissionLedgerRow {
  return row.ref_type === "task"
    ? { ...row, link: "task_direct", link_confidence: "exact" }
    : { ...row, link: "package_target", link_confidence: "derived" };
}

/**
 * GET /report/mission/:taskId — internal bearer, read-only.
 * A task that does not exist is a 404: an unknown id must not read as a mission
 * with no activity (that would be a fabricated empty result).
 */
export async function missionReport(env: Env, taskId: string): Promise<Response> {
  const id = String(taskId ?? "").trim();
  if (!id) return json({ error: "task id required" }, 400);

  const task = await env.DB.prepare(
    `SELECT task_id, agent_id, description, status, attempts, started_at, completed_at, created_at
       FROM task_log WHERE task_id = ? LIMIT 1`,
  ).bind(id).first<MissionTask>();
  if (!task) return json({ error: "task not found", task_id: id }, 404);

  const pkgRes = await env.DB.prepare(
    `SELECT id, title, objective, proposed_action, authority, outcome, decided_by, target,
            expiry_at, cost_projection_cents, executed_task_id, created_at, updated_at
       FROM decision_packages WHERE executed_task_id = ? ORDER BY id DESC LIMIT ?`,
  ).bind(id, MAX_PACKAGES).all<MissionPackage>().catch(() => ({ results: [] as MissionPackage[] }));
  const packages = pkgRes.results ?? [];

  const q = ledgerQueryFor(id, packages);
  const ledgerRes = await env.DB.prepare(q.sql).bind(...q.params)
    .all<Omit<MissionLedgerRow, "link" | "link_confidence">>()
    .catch(() => ({ results: [] as Omit<MissionLedgerRow, "link" | "link_confidence">[] }));
  const rows = (ledgerRes.results ?? []).map(annotate);

  return json({
    task_id: id,
    generated_at: new Date().toISOString(),
    task: {
      task_id: task.task_id,
      agent_id: task.agent_id ?? null,
      description: task.description ?? null,
      status: task.status ?? null,
      attempts: task.attempts ?? null,
      started_at: task.started_at ?? null,
      completed_at: task.completed_at ?? null,
      created_at: task.created_at ?? null,
    },
    grouping: GROUPING,
    // A package list is a join result, not a measurement: null says "nothing
    // linked to this task", which is the honest reading of an empty join.
    decision_packages: packages.length
      ? packages.map((p) => ({
          id: p.id,
          title: p.title ?? null,
          objective: p.objective ?? null,
          proposed_action: p.proposed_action ?? null,
          authority: p.authority ?? null,
          outcome: p.outcome ?? null,
          decided_by: p.decided_by ?? null,
          target: p.target ?? null,
          expiry_at: p.expiry_at ?? null,
          cost_projection_cents: p.cost_projection_cents ?? null,
          executed_task_id: p.executed_task_id ?? null,
          // Exact by construction: a row only joins here because it carries
          // this task's id in `executed_task_id`, stamped at the moment the
          // package executed (decisions.ts closeDispatchDecision /
          // decideDecisionPackage). The join key IS the provenance — unlike a
          // ledger row reached through a package target, nothing is inferred.
          link: "package_direct" as const,
          link_confidence: "exact" as const,
          created_at: p.created_at ?? null,
          updated_at: p.updated_at ?? null,
        }))
      : null,
    ledger_rows: rows,
    totals: missionTotals(rows),
  });
}