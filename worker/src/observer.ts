/**
 * Independent observer pass — a BOUNDED, deterministic review of a proposed
 * plan or external side effect. It returns a recommendation and evidence gaps;
 * it never executes, never calls a connector, and never writes task_log. The
 * deterministic gates (protected files, kill-lists, phantom-completion,
 * breakers) remain the enforcement layer; this is an additive checkpoint an
 * operator or a future caller can consult.
 */
import { Env, json } from "./gateway";

export const OBSERVER_LIMITS = {
  plan_chars: 4000,
  evidence_items: 25,
  plan_steps: 50,
} as const;

export interface ObserverInput {
  plan?: unknown;
  action?: { type?: string; connector?: string; target?: string } | null;
  evidence?: { claim?: unknown; disposition?: unknown }[] | null;
  authority?: string | null;
}

export type ObserverRecommendation = "safe" | "evidence_gap" | "policy_concern";

export interface ObserverFinding {
  code: string;
  detail: string;
}

export interface ObserverReview {
  recommendation: ObserverRecommendation;
  gaps: ObserverFinding[];
  policy_flags: ObserverFinding[];
  checks: string[];
  bounded: { plan_chars: number; evidence_items: number; truncated: boolean; steps_inspected: number };
}

const INJECTION: [string, RegExp][] = [
  ["prompt_injection", /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i],
  ["prompt_injection", /disregard\s+(the\s+)?(policy|policies|rules|guardrails)/i],
  ["prompt_injection", /(reveal|print|output)\s+(the\s+)?system\s+prompt/i],
  ["role_hijack", /you\s+are\s+now\s+(a|an|the)\s+/i],
];

// House non-goals from AGENTS.md — a plan that proposes them is out of scope.
const OUT_OF_SCOPE: [string, RegExp][] = [
  ["out_of_scope", /\bblockchain\b|\busdc\b|\bsolana\b|\bcrypto\s+payment/i],
  ["out_of_scope", /linkedin\s+(automation|auto-?post)/i],
  ["out_of_scope", /\berpnext\b/i],
  ["out_of_scope", /desktop\s+(runtime|app|application)/i],
  ["out_of_scope", /second\s+(postgres|docker)\s+(control\s+plane|cluster)/i],
  ["out_of_scope", /new\s+(scheduler|framework)\b/i],
];

const DESTRUCTIVE: [string, RegExp][] = [
  ["destructive_sql", /\bdrop\s+table\b/i],
  ["destructive_sql", /\bdelete\s+from\s+[a-z_]+\s*(;|$)/i],
  ["destructive_sql", /\btruncate\s+table\b/i],
  ["destructive_shell", /\brm\s+-rf\b/i],
];

const SECRET_HANDLING: [string, RegExp][] = [
  ["secret_exfiltration", /(send|post|upload|email|exfiltrate).{0,40}\b(api[\s_-]?key|secret|password|token)\b/i],
  ["secret_exfiltration", /\bcat\s+\.env\b|\bprint\s+\.env\b/i],
];

const PROTECTED_FILES: [string, RegExp][] = [
  ["protected_file", /\bworker\.js\b/i],
  ["protected_file", /\bindex\.html\b/i],
  ["protected_file", /\bsrc\/scanner\.js\b/i],
  ["protected_file", /\bpackage\.json\b/i],
  ["protected_file", /\btest\/scanner\.test\.mjs\b/i],
  ["protected_file", /\.github\//i],
];

const EXTERNAL_EFFECT = /\b(post|publish|send|dispatch|deploy|email|tweet|reply)\b/i;

function scan(text: string, table: [string, RegExp][]): ObserverFinding[] {
  const out: ObserverFinding[] = [];
  for (const [code, re] of table) {
    const m = text.match(re);
    if (m) out.push({ code, detail: `matched '${m[0].slice(0, 80)}'` });
  }
  return out;
}

function planText(plan: unknown): string {
  if (plan == null) return "";
  if (typeof plan === "string") return plan;
  try {
    return JSON.stringify(plan);
  } catch {
    return String(plan);
  }
}

/** Pure, deterministic review — the whole point is that it is inspectable. */
export function reviewPlan(input: ObserverInput): ObserverReview {
  const full = planText(input.plan);
  const truncated = full.length > OBSERVER_LIMITS.plan_chars;
  const text = truncated ? full.slice(0, OBSERVER_LIMITS.plan_chars) : full;
  const evidence = Array.isArray(input.evidence) ? input.evidence.slice(0, OBSERVER_LIMITS.evidence_items) : [];

  const policy_flags: ObserverFinding[] = [
    ...scan(text, INJECTION),
    ...scan(text, OUT_OF_SCOPE),
    ...scan(text, DESTRUCTIVE),
    ...scan(text, SECRET_HANDLING),
    ...scan(text, PROTECTED_FILES),
  ];

  const gaps: ObserverFinding[] = [];
  for (const e of evidence) {
    const claim = String(e?.claim ?? "").trim().slice(0, 200);
    const disposition = String(e?.disposition ?? "unknown");
    if (!claim) continue;
    if (disposition === "unknown") gaps.push({ code: "unanchored_claim", detail: claim });
    else if (disposition === "inferred") gaps.push({ code: "inferred_claim", detail: claim });
  }
  if (EXTERNAL_EFFECT.test(text) && evidence.length === 0) {
    gaps.push({ code: "no_evidence", detail: "the plan proposes an external side effect with no evidence attached" });
  }
  const steps = Array.isArray((input.plan as { steps?: unknown })?.steps)
    ? ((input.plan as { steps?: unknown[] }).steps ?? []).length
    : 0;
  if (steps > OBSERVER_LIMITS.plan_steps) {
    gaps.push({ code: "plan_too_large", detail: `plan has ${steps} steps (limit ${OBSERVER_LIMITS.plan_steps})` });
  }

  const recommendation: ObserverRecommendation = policy_flags.length
    ? "policy_concern"
    : gaps.length
      ? "evidence_gap"
      : "safe";

  return {
    recommendation,
    gaps,
    policy_flags,
    checks: ["prompt_injection", "house_non_goals", "destructive_ops", "secret_handling", "protected_files", "evidence_anchors", "size_bounds"],
    bounded: { plan_chars: text.length, evidence_items: evidence.length, truncated, steps_inspected: steps },
  };
}

async function digest(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Caller-supplied context that rides the audit row (never the plan body). */
export interface ObserverAuditMeta {
  task_id?: string | null;
  source?: string;
}

/**
 * Review + one audit row (scope `observer`). The single write format for every
 * caller — the operator route and the observe-only task-dispatch hook share it,
 * so there is exactly one `observer` row shape to read.
 */
export async function recordObserverVerdict(
  env: Env,
  input: ObserverInput,
  meta: ObserverAuditMeta = {},
): Promise<{ id: number | null; review: ObserverReview }> {
  const review = reviewPlan(input);
  let payload: string;
  try {
    payload = JSON.stringify({
      recommendation: review.recommendation,
      gaps: review.gaps.length,
      gap_codes: review.gaps.map((g) => g.code),
      flags: review.policy_flags.map((f) => f.code),
      digest: await digest(planText(input.plan)),
      action: input.action ?? null,
      authority: input.authority ?? null,
      task_id: meta.task_id ?? null,
      source: meta.source ?? "review",
      at: Date.now(),
    }).slice(0, 4000);
  } catch {
    payload = JSON.stringify({ recommendation: "unknown", source: meta.source ?? "review", at: Date.now() });
  }
  const id = await (async () => {
    try {
      const res = await env.DB.prepare(
        "INSERT INTO episodic_events (scope, payload) VALUES ('observer', ?)",
      ).bind(payload).run();
      return Number(res.meta.last_row_id);
    } catch {
      return null;
    }
  })();
  return { id, review };
}

/** Review + one audit row (scope `observer`). Never executes the plan. */
export async function observerReview(env: Env, input: ObserverInput): Promise<Response> {
  const { id, review } = await recordObserverVerdict(env, input);
  return json({ id, ...review, executes: false }, 200);
}

/**
 * OBSERVE-ONLY mode gate. `config:observer_mode` defaults to `on` — the pass
 * records a verdict and nothing else. `off` writes no row. A future
 * enforcement mode would need its own decision; this module never blocks.
 */
export async function observerModeEnabled(env: Env): Promise<boolean> {
  let mode: string | null | undefined;
  try {
    mode = await env.EPHEMERAL.get("config:observer_mode");
  } catch (err) {
    // KV unreadable: the pass is logging-only, so keep logging rather than
    // silently going dark. This can never block or delay a task.
    console.error(`[observer] config read failed; defaulting to on: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
  return String(mode ?? "on").trim().toLowerCase() !== "off";
}

export interface DispatchTaskRef {
  task_id?: unknown;
  agent_id?: unknown;
  description?: unknown;
}

/**
 * Task-dispatch boundary hook (GAP A). Fire-and-forget: registered with
 * `ctx.waitUntil` so a slow review can never stall the tick, and every failure
 * is swallowed — it must never block, delay, alter `task_log.status`, or write
 * a task result. Its only effect is one `episodic_events` row, scope `observer`.
 */
export function observeTaskDispatch(
  env: Env,
  ctx: ExecutionContext | undefined,
  task: DispatchTaskRef,
): Promise<number | null> {
  const run = (async (): Promise<number | null> => {
    try {
      if (!(await observerModeEnabled(env))) return null;
      const taskId = task?.task_id == null ? null : String(task.task_id);
      const { id } = await recordObserverVerdict(
        env,
        {
          plan: {
            task_id: taskId,
            agent_id: task?.agent_id == null ? null : String(task.agent_id),
            description: task?.description == null ? "" : String(task.description),
          },
          action: { type: "task.execute", target: taskId ?? "task" },
          authority: "approval",
        },
        { task_id: taskId, source: "task_dispatch" },
      );
      return id;
    } catch (err) {
      // Observation must never become a failure mode of dispatch.
      console.error(`[observer] task-dispatch review swallowed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  })();
  try {
    ctx?.waitUntil(run);
  } catch {
    /* a test double without waitUntil must not break the hook */
  }
  return run;
}

export async function listObserverReviews(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const { results } = await env.DB.prepare(
    "SELECT id, payload, created_at FROM episodic_events WHERE scope = 'observer' ORDER BY id DESC LIMIT ?",
  ).bind(limit).all().catch(() => ({ results: [] }));
  return json({ reviews: results ?? [] });
}

export async function handleObserverRoutes(env: Env, path: string, body: Record<string, unknown>): Promise<Response | null> {
  if (path !== "/observer/review") return null;
  return observerReview(env, body as ObserverInput);
}
