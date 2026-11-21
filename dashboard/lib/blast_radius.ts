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
 *
 * A leading CTE does not make the statement a read. SQLite accepts
 * `WITH c AS (SELECT 1) DELETE …` and data-modifying CTEs
 * (`WITH c AS (DELETE … RETURNING *) SELECT …`). Both must take the
 * mutate path. A WHERE that appears only inside the CTE does not
 * satisfy the WHERE requirement on a later UPDATE/DELETE.
 */
export function classifySql(sql: unknown): SqlKind {
  if (typeof sql !== "string" || !sql.trim()) return "forbidden";
  const stripped = stripSqlNoise(sql).trim().replace(/;+\s*$/, "");
  // One statement only — a trailing `;` is fine; a second statement is not.
  if (!stripped || stripped.includes(";")) return "forbidden";

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

  // EXPLAIN never executes the statement it describes.
  if (/^\s*EXPLAIN\b/i.test(stripped)) return "read";

  const marks = collectWrites(stripped);
  const writes = marks.filter((m) => /^(INSERT|REPLACE|UPDATE|DELETE)\|/.test(m));
  if (writes.length) {
    // Unconstrained row wipes amplify a stolen session — require WHERE
    // on each UPDATE/DELETE, not merely somewhere in the string.
    if (writes.some((m) => /^(UPDATE|DELETE)\|0$/.test(m))) return "forbidden";
    return "mutate";
  }
  if (marks.some((m) => m.startsWith("SELECT|"))) return "read";

  return "forbidden";
}

/** Drop comments and quoted literals so keywords inside them are not verbs. */
function stripSqlNoise(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "-" && n === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? sql.length : nl;
      out += " ";
      continue;
    }
    if (c === "/" && n === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const q = c === "[" ? "]" : c;
      i++;
      while (i < sql.length) {
        if (sql[i] === q && q !== "]" && sql[i + 1] === q) {
          i += 2;
          continue;
        }
        if (sql[i] === q) {
          i++;
          break;
        }
        i++;
      }
      out += " '' ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Statement verbs that actually run.
 * Each mark is `VERB|1` when that UPDATE/DELETE has a WHERE at its own
 * depth, otherwise `VERB|0`. SELECT is recorded so a pure read still
 * classifies as read. Subquery SELECTs are ignored. INSERT/UPDATE/DELETE/
 * REPLACE at the start of a parenthesized group are data-modifying CTEs.
 * `replace()` after SELECT is a function, not a REPLACE statement.
 */
function collectWrites(sql: string): string[] {
  const tokens: string[] = [];
  const re = /[A-Za-z_][A-Za-z0-9_]*|\(|\)/g;
  let depth = 0;
  let m = re.exec(sql);
  while (m) {
    const raw = m[0];
    if (raw === "(") {
      tokens.push("P|(|" + String(depth));
      depth++;
    } else if (raw === ")") {
      depth = Math.max(0, depth - 1);
      tokens.push("P|)|" + String(depth));
    } else {
      tokens.push("W|" + raw.toUpperCase() + "|" + String(depth));
    }
    m = re.exec(sql);
  }

  const writes: string[] = [];
  let seenOuter = false;
  const stmt = new Set(["SELECT", "INSERT", "UPDATE", "DELETE", "REPLACE", "EXPLAIN"]);
  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i].split("|");
    if (cur[0] !== "W" || !stmt.has(cur[1])) continue;
    const word = cur[1];
    const atDepth = Number(cur[2]);
    const prev = i > 0 ? tokens[i - 1].split("|") : null;
    const opens = prev !== null && prev[0] === "P" && prev[1] === "(";
    if (opens && atDepth >= 1 && word !== "SELECT" && word !== "EXPLAIN") {
      writes.push(word + "|" + (whereAfter(tokens, i, atDepth) ? "1" : "0"));
      continue;
    }
    if (atDepth === 0 && !seenOuter) {
      seenOuter = true;
      const needsWhere = word === "UPDATE" || word === "DELETE";
      writes.push(
        word + "|" + (needsWhere && whereAfter(tokens, i, 0) ? "1" : "0"),
      );
    }
  }
  return writes;
}

function whereAfter(tokens: string[], start: number, atDepth: number): boolean {
  for (let j = start + 1; j < tokens.length; j++) {
    const parts = tokens[j].split("|");
    const depth = Number(parts[2]);
    if (parts[0] === "P" && parts[1] === ")" && depth < atDepth) return false;
    if (parts[0] === "W" && parts[1] === "WHERE" && depth === atDepth) return true;
  }
  return false;
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
