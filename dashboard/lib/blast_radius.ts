/**
 * Defense-in-depth for founder-console blast radius (audit M-2/M-3).
 * Owner session still required by proxy.ts — these guards shrink what a
 * stolen cookie / XSS payload can do through /api/query|/kv|exec|email|….
 */

export const CONFIRM_HEADER = "x-lz-confirm";
export const CONFIRM_VALUE = "mutate";

export type SqlKind = "read" | "mutate" | "forbidden";

/** True when the request carries the step-up confirmation for mutating ops. */
export function hasMutateConfirm(headers: {
  get(name: string): string | null;
}): boolean {
  return headers.get(CONFIRM_HEADER)?.trim().toLowerCase() === CONFIRM_VALUE;
}

/**
 * Classify a single SQL statement for the dashboard /api/query proxy.
 * - read: SELECT / WITH…SELECT / EXPLAIN (no confirm)
 * - mutate: INSERT / UPDATE|DELETE with WHERE / REPLACE — needs confirm
 * - forbidden: DDL, multi-statement, unconstrained UPDATE/DELETE, etc.
 */
export function classifySql(sql: unknown): SqlKind {
  if (typeof sql !== "string" || !sql.trim()) return "forbidden";
  const stripped = sql.trim().replace(/;+\s*$/, "");
  // One statement only — a trailing `;` is fine; a second statement is not.
  if (stripped.includes(";")) return "forbidden";

  // DDL / dangerous SQLite ops — never via the dashboard proxy.
  if (
    /^\s*(DROP|ALTER|TRUNCATE|ATTACH|DETACH|VACUUM|REINDEX|CREATE|PRAGMA)\b/i.test(
      stripped,
    )
  ) {
    return "forbidden";
  }
  // Belt-and-suspenders: DDL keywords mid-statement (e.g. nested).
  if (/\b(DROP\s+TABLE|ALTER\s+TABLE|ATTACH\s+DATABASE)\b/i.test(stripped)) {
    return "forbidden";
  }

  if (
    /^\s*EXPLAIN\b/i.test(stripped) ||
    /^\s*(WITH\b[\s\S]+)?SELECT\b/i.test(stripped)
  ) {
    return "read";
  }

  if (/^\s*(INSERT|REPLACE)\b/i.test(stripped)) return "mutate";

  if (/^\s*(UPDATE|DELETE)\b/i.test(stripped)) {
    // Unconstrained row wipes amplify a stolen session — require WHERE.
    if (!/\bWHERE\b/i.test(stripped)) return "forbidden";
    return "mutate";
  }

  return "forbidden";
}

/**
 * KV keys the dashboard UI is allowed to touch.
 * 2FA secrets / sessions / licenses stay off this proxy (use /api/2fa etc.).
 */
const KV_ALLOWED =
  /^(conn:[a-z][a-z0-9_]*(?::app)?|flag:[a-z0-9_]+|email:[a-z0-9_]+|plan|agent_config:[a-zA-Z0-9_-]+)$/;

/** Keys that must never be written/deleted via /api/kv (even if allowlisted). */
const KV_WRITE_BLOCKED = /^(2fa:|flag:two_factor$)/;

export function kvKeyAllowed(key: unknown, action: string): boolean {
  if (typeof key !== "string" || !key || key.length > 200) return false;
  if (!KV_ALLOWED.test(key)) return false;
  if (action === "get") return true;
  // flag:two_factor and any 2fa:* mutation go through /api/2fa only.
  if (KV_WRITE_BLOCKED.test(key)) return false;
  return action === "put" || action === "delete";
}

/** Bus channels the dashboard may publish onto. */
const BUS_CHANNEL =
  /^(?:\*|copilot|tasks|approvals|task_comments|deploys|[a-z][a-z0-9_.:-]{0,80})$/i;

export function busChannelAllowed(channel: unknown): boolean {
  return typeof channel === "string" && BUS_CHANNEL.test(channel.trim());
}

/** Soft cap so an XSS payload cannot ship megabytes into the exec container. */
export const EXEC_CODE_MAX = 100_000;
export const EXEC_TIMEOUT_MIN = 1;
export const EXEC_TIMEOUT_MAX = 60;

export function clampExecTimeout(timeout: unknown): number {
  const n = Number(timeout);
  if (!Number.isFinite(n)) return 60;
  return Math.min(EXEC_TIMEOUT_MAX, Math.max(EXEC_TIMEOUT_MIN, Math.floor(n)));
}

/**
 * Optional email blast-radius: keep owner test-sends on the company domain.
 * Empty / missing domain list → skip (caller decides).
 */
export function emailRecipientAllowed(
  to: unknown,
  allowedDomains: string[] = ["lazynext.com"],
): boolean {
  if (typeof to !== "string" || !to.includes("@")) return false;
  const domain = to.trim().split("@").pop()?.toLowerCase() ?? "";
  return allowedDomains.some((d) => domain === d.toLowerCase());
}
