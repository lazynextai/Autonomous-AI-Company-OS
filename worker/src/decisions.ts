/**
 * Governance decision packages — one auditable record per high-impact action.
 *
 * Reuses D1 (additive table, migration 011) and the existing audit trail
 * (`episodic_events` scope `decision`, the same write-audit pattern `/query`
 * uses). No new governance framework and no second control plane: this module
 * renders the record and owns its small lifecycle; enforcement stays opt-in
 * (`config:decision_enforce`) so existing agent execution semantics are
 * unchanged until an operator turns the gate on.
 */
import { Env, json } from "./gateway";

export type AuthorityClass = "auto" | "approval" | "human_only";
export type DecisionScope = "off" | "human_only" | "approval" | "all";
export type DecisionOutcome =
  | "draft" | "approved" | "rejected" | "executed" | "failed" | "voided" | "expired";

export const AUTHORITY_CLASSES: AuthorityClass[] = ["auto", "approval", "human_only"];
export const DECISION_OUTCOMES: DecisionOutcome[] = [
  "draft", "approved", "rejected", "executed", "failed", "voided", "expired",
];

// Connectors that only post into a workspace we own — reversible, internal.
const INTERNAL_MESSAGING = new Set([
  "discord", "slack", "mattermost", "teams", "zulip", "telegram", "matrix", "webhook",
]);

// Anything that mints/sends a legal instrument or moves money is not an
// approval-class action — a human does it.
const HUMAN_ONLY_CONNECTORS = new Set(["signwell"]);

export interface DecisionEvidence {
  claim: string;
  disposition: "verified" | "inferred" | "unknown";
  package_id?: number | null;
}

export interface DecisionRecordInput {
  title?: unknown;
  objective?: unknown;
  proposed_action?: unknown;
  authority?: unknown;
  evidence?: unknown;
  cost_projection_cents?: unknown;
  target?: unknown;
  expiry_at?: unknown;
  rollback?: unknown;
  executed_task_id?: unknown;
}

export interface DecisionRecord {
  title: string;
  objective: string | null;
  proposed_action: string;
  authority: AuthorityClass;
  evidence: DecisionEvidence[];
  cost_projection_cents: number;
  target: string | null;
  expiry_at: string | null;
  rollback: string | null;
  executed_task_id: string | null;
}

export interface ActionRef {
  type?: string;
  connector?: string;
  target?: string;
  [key: string]: unknown;
}

const text = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

function intOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** ISO-8601 or unix-ms; null means "no expiry" (a caller error is reported). */
export function parseExpiry(value: unknown): { ok: boolean; value: string | null } {
  if (value == null || value === "") return { ok: true, value: null };
  const raw = String(value).trim();
  const ms = /^\d{10,}$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(ms)) return { ok: false, value: null };
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { ok: false, value: null };
  return { ok: true, value: d.toISOString() };
}

/**
 * Authority classification — the same concepts the platform already acts on:
 * admin scope for company-acting dispatch, human sign-off for money/legal,
 * automatic for reversible internal effects. Unknown actions default to
 * `approval`: a new action never silently inherits "automatic".
 */
export function classifyAuthority(action: ActionRef): { authority: AuthorityClass; rationale: string } {
  if (action?.human_only === true) {
    return { authority: "human_only", rationale: "caller marked human-only" };
  }
  const type = String(action?.type ?? "").toLowerCase();
  const connector = String(action?.connector ?? "").toLowerCase();

  if (type.startsWith("billing") || type.startsWith("payment") || type === "identity.verify" || type === "legal.sign") {
    return { authority: "human_only", rationale: "money, identity or a legal instrument" };
  }
  if (type === "connector.dispatch" || type === "social.post" || type === "email.send") {
    if (HUMAN_ONLY_CONNECTORS.has(connector)) {
      return { authority: "human_only", rationale: `${connector} sends a legally binding document` };
    }
    if (INTERNAL_MESSAGING.has(connector)) {
      return { authority: "auto", rationale: `${connector} posts into a workspace we own (reversible)` };
    }
    return { authority: "approval", rationale: "external side effect on a company-owned surface" };
  }
  if (type === "manifest.activate" || type === "breaker.policy" || type === "campaign.send" || type === "ticket.reply") {
    return { authority: "approval", rationale: "changes operating policy or contacts a customer" };
  }
  if (type === "task.execute") {
    return { authority: "approval", rationale: "task may mutate managed repositories" };
  }
  if (type === "evidence.record" || type === "ledger.append" || type === "scan.run" || type === "decision.draft") {
    return { authority: "auto", rationale: "reversible internal record" };
  }
  return { authority: "approval", rationale: "unclassified action defaults to approval" };
}

export function normalizeEvidence(value: unknown): { evidence: DecisionEvidence[]; errors: string[] } {
  const errors: string[] = [];
  if (value == null) return { evidence: [], errors };
  if (!Array.isArray(value)) return { evidence: [], errors: ["evidence must be an array"] };
  if (value.length > 25) errors.push("evidence is limited to 25 claims");
  const evidence: DecisionEvidence[] = [];
  for (const raw of value.slice(0, 25)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const claim = text(item.claim, 500);
    if (!claim) { errors.push("every evidence claim needs text"); continue; }
    const disposition = String(item.disposition ?? "unknown") as DecisionEvidence["disposition"];
    if (!["verified", "inferred", "unknown"].includes(disposition)) {
      errors.push(`evidence disposition '${disposition}' is not verified|inferred|unknown`);
      continue;
    }
    const packageId = item.package_id == null ? null : Number(item.package_id);
    evidence.push({
      claim,
      disposition,
      package_id: Number.isInteger(packageId) && (packageId as number) > 0 ? (packageId as number) : null,
    });
  }
  return { evidence, errors };
}

export function buildDecisionRecord(
  input: DecisionRecordInput,
  action: ActionRef = {},
): { ok: boolean; record: DecisionRecord | null; errors: string[] } {
  const errors: string[] = [];
  const title = text(input.title, 200);
  if (!title || title.length < 3) errors.push("title (3-200 chars) is required");

  const proposed = input.proposed_action == null
    ? null
    : typeof input.proposed_action === "string"
      ? text(input.proposed_action, 2000)
      : JSON.stringify(input.proposed_action).slice(0, 2000);
  if (!proposed) errors.push("proposed_action is required");

  let authority: AuthorityClass;
  if (input.authority == null) {
    authority = classifyAuthority(action).authority;
  } else {
    authority = String(input.authority) as AuthorityClass;
    if (!AUTHORITY_CLASSES.includes(authority)) {
      errors.push("authority must be auto|approval|human_only");
    }
  }

  const evidence = normalizeEvidence(input.evidence);
  errors.push(...evidence.errors);

  const expiry = parseExpiry(input.expiry_at);
  if (!expiry.ok) errors.push("expiry_at must be an ISO-8601 timestamp");

  if (errors.length) return { ok: false, record: null, errors };

  return {
    ok: true,
    errors: [],
    record: {
      title: title as string,
      objective: text(input.objective, 2000),
      proposed_action: proposed as string,
      authority,
      evidence: evidence.evidence,
      cost_projection_cents: intOr(input.cost_projection_cents, 0),
      target: text(input.target, 500),
      expiry_at: expiry.value,
      rollback: text(input.rollback, 1000),
      executed_task_id: text(input.executed_task_id, 120),
    },
  };
}

// Self-heal — migration 011 owns the schema; this covers a deploy that lands
// before it runs. One DDL check per isolate.
let decisionSchemaReady = false;

export async function ensureDecisionSchema(env: Env): Promise<void> {
  if (decisionSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS decision_packages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       objective TEXT,
       proposed_action TEXT,
       authority TEXT NOT NULL DEFAULT 'auto' CHECK (authority IN ('auto', 'approval', 'human_only')),
       evidence TEXT DEFAULT '[]',
       cost_projection_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_projection_cents >= 0),
       target TEXT,
       expiry_at TEXT,
       decided_by TEXT,
       outcome TEXT NOT NULL DEFAULT 'draft' CHECK (outcome IN ('draft', 'approved', 'rejected', 'executed', 'failed', 'voided', 'expired')),
       rollback TEXT,
       executed_task_id TEXT,
       voided_reason TEXT,
       created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       updated_at TEXT
     )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_decision_packages_outcome ON decision_packages(outcome, created_at)",
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_decision_packages_target ON decision_packages(target)",
  ).run();
  decisionSchemaReady = true;
}

async function audit(env: Env, payload: Record<string, unknown>): Promise<void> {
  // The row already exists; a failed audit write must not undo a decision
  // record — but every write path still attempts exactly one audit row.
  try {
    await env.DB.prepare(
      "INSERT INTO episodic_events (scope, payload) VALUES ('decision', ?)",
    ).bind(JSON.stringify(payload).slice(0, 4000)).run();
  } catch {
    /* observability, not the record itself */
  }
}

export async function createDecisionPackage(env: Env, body: DecisionRecordInput): Promise<Response> {
  const action = (body as { action?: ActionRef }).action ?? (body as ActionRef);
  const built = buildDecisionRecord(body, action ?? {});
  if (!built.ok || !built.record) return json({ error: "invalid decision package", errors: built.errors }, 400);
  const r = built.record;
  await ensureDecisionSchema(env);
  const res = await env.DB.prepare(
    `INSERT INTO decision_packages
       (title, objective, proposed_action, authority, evidence, cost_projection_cents, target, expiry_at, rollback, executed_task_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    r.title, r.objective, r.proposed_action, r.authority, JSON.stringify(r.evidence),
    r.cost_projection_cents, r.target, r.expiry_at, r.rollback, r.executed_task_id,
  ).run();
  const id = Number(res.meta.last_row_id);
  await audit(env, { action: "created", id, authority: r.authority, target: r.target, title: r.title });
  return json({ id, outcome: "draft", ...r }, 201);
}

/**
 * Fail-closed opener used by dispatch paths: an external side effect must have
 * a decision record, so a write failure throws and the caller blocks.
 */
export async function openDispatchDecision(
  env: Env,
  input: { connector: string; action: string; target?: string; cost_cents?: number; source?: string; evidence?: DecisionEvidence[] },
): Promise<{ id: number; authority: AuthorityClass }> {
  const built = buildDecisionRecord(
    {
      title: `${input.action}: ${input.connector}`.slice(0, 200),
      objective: `Dispatch to ${input.connector} from the ${input.source ?? "platform"} path`,
      proposed_action: `${input.action} via connector '${input.connector}'`,
      target: input.target ?? input.connector,
      cost_projection_cents: input.cost_cents ?? 0,
      rollback: "Void/delete the provider-side artifact; no local state to restore (the dispatch audit row is the record).",
      evidence: input.evidence ?? [],
    },
    { type: "connector.dispatch", connector: input.connector, target: input.target },
  );
  if (!built.ok || !built.record) throw new Error(`decision_invalid: ${built.errors.join("; ")}`);
  const r = built.record;
  await ensureDecisionSchema(env);
  const res = await env.DB.prepare(
    `INSERT INTO decision_packages
       (title, objective, proposed_action, authority, evidence, cost_projection_cents, target, expiry_at, rollback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    r.title, r.objective, r.proposed_action, r.authority, JSON.stringify(r.evidence),
    r.cost_projection_cents, r.target, r.expiry_at, r.rollback,
  ).run();
  const id = Number(res.meta.last_row_id);
  await audit(env, { action: "opened", id, authority: r.authority, target: r.target, source: input.source ?? null });
  return { id, authority: r.authority };
}

/**
 * Close a dispatch-opened package with the real outcome. Best-effort.
 *
 * `taskId` is the task that caused this dispatch, and this is the only moment
 * that can honestly stamp it: the column names "the task this package
 * executed", which is true exactly when the package becomes `executed`.
 * The stamp rides the SAME UPDATE (no extra round trip) and only fires on
 * `ok` — a failed dispatch describes an attempt, not an execution, so it must
 * not claim a task. `COALESCE(executed_task_id, ?)` makes it idempotent: the
 * first real execution wins, and a retry (same task) or a different task
 * closing the same package can never silently rewrite the lineage the C2
 * mission report reads.
 *
 * A caller with no task lineage passes nothing (cron-swept scheduled posts,
 * operator-initiated dispatch) and the column stays NULL — honest "no task",
 * never a fabricated id. See `dispatchSocialPost` in services.ts.
 */
export async function closeDispatchDecision(
  env: Env, id: number, ok: boolean, note?: string, taskId?: string | null,
): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  // Only an execution carries lineage; `text()` trims and caps at the column's
  // practical width so a caller-supplied value can never be a schema surprise.
  const stamp = ok ? text(taskId, 120) : null;
  try {
    await env.DB.prepare(
      `UPDATE decision_packages
          SET outcome = ?, decided_by = ?,
              executed_task_id = COALESCE(executed_task_id, ?),
              voided_reason = COALESCE(?, voided_reason),
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND outcome = 'draft'`,
    ).bind(ok ? "executed" : "failed", "dispatch", stamp, note ? note.slice(0, 500) : null, id).run();
  } catch {
    /* the package already records the proposal; the outcome is best-effort */
  }
}

// draft -> approved | rejected | voided; approved -> executed | failed | voided | expired;
// executed -> voided (compensating rollback); failed -> voided. Terminal: rejected, voided, expired.
const TRANSITIONS: Record<DecisionOutcome, DecisionOutcome[]> = {
  draft: ["approved", "rejected", "voided"],
  approved: ["executed", "failed", "voided", "expired"],
  executed: ["voided"],
  failed: ["voided"],
  rejected: [],
  voided: [],
  expired: [],
};

export function canTransition(from: DecisionOutcome, to: DecisionOutcome): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export async function decideDecisionPackage(env: Env, id: number, body: Record<string, unknown>): Promise<Response> {
  await ensureDecisionSchema(env);
  const row = await env.DB.prepare(
    "SELECT id, outcome, authority FROM decision_packages WHERE id = ?",
  ).bind(id).first<{ id: number; outcome: DecisionOutcome; authority: AuthorityClass }>();
  if (!row) return json({ error: "decision package not found" }, 404);

  const next = String(body.outcome ?? "").trim() as DecisionOutcome;
  if (!DECISION_OUTCOMES.includes(next)) return json({ error: "outcome required (approved|rejected|executed|failed|voided|expired)" }, 400);
  if (!canTransition(row.outcome, next)) {
    return json({ error: `illegal transition ${row.outcome} -> ${next}` }, 409);
  }
  const decidedBy = String(body.decided_by ?? "operator").slice(0, 120);
  const reason = body.reason == null ? null : String(body.reason).slice(0, 500);
  // Execution stamp — the operator path can name the task that ran the action
  // (`executed_task_id` in the body). Only an `executed` transition may carry
  // lineage (approve/reject/void never ran anything), and COALESCE keeps the
  // first execution's id, so replaying the decide call or voiding afterwards
  // cannot repoint or clear it.
  const execTask = next === "executed" ? text(body.executed_task_id, 120) : null;
  await env.DB.prepare(
    `UPDATE decision_packages
        SET outcome = ?, decided_by = ?, voided_reason = COALESCE(?, voided_reason),
            executed_task_id = COALESCE(executed_task_id, ?),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`,
  ).bind(next, decidedBy, reason, execTask, id).run();
  await audit(env, {
    action: "decided", id, from: row.outcome, to: next, decided_by: decidedBy,
    ...(execTask ? { executed_task_id: execTask } : {}),
  });
  return json({ ok: true, id, outcome: next, decided_by: decidedBy });
}

export async function expireDecisionPackages(env: Env): Promise<number> {
  await ensureDecisionSchema(env);
  const res = await env.DB.prepare(
    `UPDATE decision_packages
        SET outcome = 'expired', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE outcome IN ('draft','approved')
        AND expiry_at IS NOT NULL
        AND datetime(expiry_at) < datetime('now')`,
  ).run();
  return res.meta.changes ?? 0;
}

/** Render a lead's claims as evidence — read-only, never mutates provenance. */
export async function evidenceForLead(env: Env, leadId: number): Promise<DecisionEvidence[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, claim, disposition FROM crm_lead_evidence WHERE lead_id = ? ORDER BY id DESC LIMIT 25",
  ).bind(leadId).all<{ id: number; claim: string; disposition: DecisionEvidence["disposition"] }>();
  return (results ?? []).map((r) => ({ claim: r.claim, disposition: r.disposition, package_id: r.id }));
}

export async function listDecisionPackages(env: Env, url: URL): Promise<Response> {
  await ensureDecisionSchema(env);
  const outcome = url.searchParams.get("outcome");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const sql = outcome
    ? "SELECT * FROM decision_packages WHERE outcome = ? ORDER BY id DESC LIMIT ?"
    : "SELECT * FROM decision_packages ORDER BY id DESC LIMIT ?";
  const stmt = outcome ? env.DB.prepare(sql).bind(outcome, limit) : env.DB.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return json({ packages: results ?? [] });
}

/**
 * Bounded read-only view of `decision_gate` audit rows. Read-only by
 * construction: it only ever selects `episodic_events` scope `decision_gate` —
 * the dashboard panel that shows "blocked, not broken".
 */
export async function listDecisionBlocks(env: Env, url: URL): Promise<Response> {
  const raw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 50) : 20;
  let results: { id: number; payload: string; created_at: string }[] = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, payload, created_at
         FROM episodic_events
        WHERE scope = 'decision_gate'
        ORDER BY id DESC
        LIMIT ?`,
    ).bind(limit).all<{ id: number; payload: string; created_at: string }>();
    results = res.results ?? [];
  } catch {
    // A read surface must render "no blocks" rather than an error page.
    results = [];
  }
  return json({ blocks: results });
}

/**
 * Opt-in enforcement. Default OFF so dispatch keeps its existing semantics.
 * `config:decision_enforce` is now scope-aware: instead of a bare on/off flag
 * it accepts `human_only` | `approval` | `all` (legacy `"1"` == `all`), so a
 * scope can cover exactly the actions it should — `human_only` alone is
 * provably non-blocking for the fleet (no agent performs a human-only action).
 * An approval/human_only action covered by the configured scope needs an
 * approved, unexpired package for the same target before it may run.
 */

// A scope enforces its own class and anything narrower: human_only is the
// least powerful, auto the most autonomous. rank(scope) >= rank(authority)
// means the scope covers the action.
const SCOPE_RANK: Record<DecisionScope, number> = { off: 0, human_only: 1, approval: 2, all: 3 };
const AUTHORITY_RANK: Record<AuthorityClass, number> = { human_only: 1, approval: 2, auto: 3 };

export function parseDecisionScope(value: unknown): DecisionScope {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "all" || s === "1") return "all"; // legacy "1" stays all-enforcing
  if (s === "human_only" || s === "human" || s === "human-only") return "human_only";
  if (s === "approval") return "approval";
  return "off"; // absent, explicit "off", or any unknown value
}

export function scopeCovers(scope: DecisionScope, authority: AuthorityClass): boolean {
  return (SCOPE_RANK[scope] ?? 0) >= (AUTHORITY_RANK[authority] ?? 2);
}

/**
 * Fire-and-forget block audit: a gated dispatch must be visible to operators
 * in `episodic_events` (scope `decision_gate`), not only in a 503 body. The
 * write must NEVER change the gate result — a failing audit write is caught
 * and logged, the block stands on its own evidence.
 */
async function recordGateBlock(env: Env, action: ActionRef, info: {
  authority: AuthorityClass;
  scope: string;
  reason: string;
}): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO episodic_events (scope, payload) VALUES ('decision_gate', ?)",
    ).bind(JSON.stringify({
      event: "decision_gate_blocked",
      type: String(action?.type ?? ""),
      connector: action?.connector == null ? null : String(action.connector),
      target: String(action?.target ?? action?.connector ?? ""),
      authority: info.authority,
      scope: info.scope,
      reason: info.reason.slice(0, 500),
      // A campaign send carries the hash of the brief it would have used, so a
      // blocked send names the exact copy thinking that was refused.
      ...(action?.brief_sha256 ? { brief_sha256: String(action.brief_sha256) } : {}),
      ts: new Date().toISOString(),
    })).run();
  } catch (err) {
    console.error(`[decision_gate] block audit write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fire-and-forget pass audit for a gated send that carried a brief hash.
 *
 * A decision package approves a *target*; the brief is the copy thinking that
 * will actually be sent. Recording the hash on the pass row is what ties an
 * approval to the exact brief rather than to a campaign id that can be edited
 * afterwards. Written to scope `decision` (the decision-package audit trail),
 * NOT `decision_gate` — the dashboard's "Gate blocks" panel reads that scope,
 * and a pass is not a block. Best-effort: a failed audit write never changes
 * the gate result.
 */
async function recordGatePass(env: Env, action: ActionRef, info: {
  authority: AuthorityClass;
  scope: DecisionScope;
  package_id: number;
}): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO episodic_events (scope, payload) VALUES ('decision', ?)",
    ).bind(JSON.stringify({
      event: "decision_gate_passed",
      type: String(action?.type ?? ""),
      target: String(action?.target ?? ""),
      authority: info.authority,
      scope: info.scope,
      package_id: info.package_id,
      brief_sha256: String(action.brief_sha256),
      ts: new Date().toISOString(),
    })).run();
  } catch (err) {
    console.error(`[decision_gate] pass audit write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function decisionGate(env: Env, action: ActionRef): Promise<{ allow: boolean; enforced: boolean; scope?: DecisionScope; reason?: string; package_id?: number }> {
  const { authority } = classifyAuthority(action);
  let flag: string | null = null;
  try {
    flag = await env.EPHEMERAL.get("config:decision_enforce");
  } catch {
    // A control-plane outage must not silently unarm the gate: any enforcing
    // scope covers human_only, so approval/human_only fail closed when the
    // flag is unreadable. Automatic internal records stay exempt — only the
    // "all" scope covers auto, and a reversible record must not be held
    // hostage by KV.
    if (authority === "auto") {
      console.error("[decision_gate] config read failed; auto action allowed unchanged");
      return { allow: true, enforced: false };
    }
    console.error(`[decision_gate] config read failed; blocking ${authority} action`);
    await recordGateBlock(env, action, {
      authority,
      scope: "unavailable",
      reason: "decision_gate_unavailable: KV read failed",
    });
    return { allow: false, enforced: true, reason: "decision_gate_unavailable: KV read failed" };
  }
  const scope = parseDecisionScope(flag);
  if (scope === "off" || !scopeCovers(scope, authority)) return { allow: true, enforced: false, scope };
  try {
    const target = String(action.target ?? action.connector ?? "");
    const row = await env.DB.prepare(
      `SELECT id FROM decision_packages
        WHERE outcome = 'approved' AND target = ?
          AND (expiry_at IS NULL OR datetime(expiry_at) >= datetime('now'))
        ORDER BY id DESC LIMIT 1`,
    ).bind(target).first<{ id: number }>();
    if (row) {
      // Tie the approval to the brief that is actually being sent. Only an
      // enforced gate reaches here, so this row means "an approved package was
      // used", never "a send happened with the gate off".
      if (action.brief_sha256) {
        await recordGatePass(env, action, { authority, scope, package_id: row.id });
      }
      return { allow: true, enforced: true, scope, package_id: row.id };
    }
    const reason = `no approved decision package for '${target}' (authority ${authority}, scope ${scope})`;
    await recordGateBlock(env, action, { authority, scope, reason });
    return { allow: false, enforced: true, scope, reason };
  } catch (err) {
    const reason = `decision_gate_failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    await recordGateBlock(env, action, { authority, scope, reason });
    return { allow: false, enforced: true, scope, reason };
  }
}

export async function handleDecisionRoutes(env: Env, path: string, method: string, body: Record<string, unknown>): Promise<Response> {
  const decide = path.match(/^\/decision\/packages\/(\d+)\/decide$/);
  if (decide && method === "POST") return decideDecisionPackage(env, Number(decide[1]), body);
  const voidPkg = path.match(/^\/decision\/packages\/(\d+)\/void$/);
  if (voidPkg && method === "POST") {
    return decideDecisionPackage(env, Number(voidPkg[1]), { ...body, outcome: "voided" });
  }
  if (path === "/decision/packages" && method === "POST") return createDecisionPackage(env, body);
  return json({ error: "not found" }, 404);
}
