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

/** Close a dispatch-opened package with the real outcome. Best-effort. */
export async function closeDispatchDecision(env: Env, id: number, ok: boolean, note?: string): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) return;
  try {
    await env.DB.prepare(
      "UPDATE decision_packages SET outcome = ?, decided_by = ?, voided_reason = COALESCE(?, voided_reason), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND outcome = 'draft'",
    ).bind(ok ? "executed" : "failed", "dispatch", note ? note.slice(0, 500) : null, id).run();
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
  await env.DB.prepare(
    `UPDATE decision_packages
        SET outcome = ?, decided_by = ?, voided_reason = COALESCE(?, voided_reason),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`,
  ).bind(next, decidedBy, reason, id).run();
  await audit(env, { action: "decided", id, from: row.outcome, to: next, decided_by: decidedBy });
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
 * Opt-in enforcement. Default OFF so dispatch keeps its existing semantics.
 * When `config:decision_enforce` is "1", an approval/human_only action needs an
 * approved, unexpired package for the same target before it may run.
 */
export async function decisionGate(env: Env, action: ActionRef): Promise<{ allow: boolean; enforced: boolean; reason?: string; package_id?: number }> {
  const { authority } = classifyAuthority(action);
  if (authority === "auto") return { allow: true, enforced: false };
  let flag: string | null = null;
  try {
    flag = await env.EPHEMERAL.get("config:decision_enforce");
  } catch {
    return { allow: false, enforced: true, reason: "decision_gate_unavailable: KV read failed" };
  }
  if (flag !== "1") return { allow: true, enforced: false };
  try {
    const target = String(action.target ?? action.connector ?? "");
    const row = await env.DB.prepare(
      `SELECT id FROM decision_packages
        WHERE outcome = 'approved' AND target = ?
          AND (expiry_at IS NULL OR datetime(expiry_at) >= datetime('now'))
        ORDER BY id DESC LIMIT 1`,
    ).bind(target).first<{ id: number }>();
    if (row) return { allow: true, enforced: true, package_id: row.id };
    return { allow: false, enforced: true, reason: `no approved decision package for '${target}' (authority ${authority})` };
  } catch (err) {
    return { allow: false, enforced: true, reason: `decision_gate_failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
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
