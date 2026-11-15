// Blast-radius guards for dashboard /api/query|/kv|exec|email|publish|tick.
// Lifts the shipped TypeScript source so the suite cannot drift from routes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "lib/blast_radius.ts"), "utf8");

function stripTypes(ts) {
  return ts
    // Drop type-only declarations first.
    .replace(/^export type [\s\S]*?;\n/gm, "")
    .replace(/^\/\*\*[\s\S]*?\*\/\n/gm, "")
    .replace(/^export /gm, "")
    .replace(/as const/g, "")
    // Function param object types → bare name.
    .replace(
      /hasMutateConfirm\(headers: \{\n  get\(name: string\): string \| null;\n\}\): boolean/g,
      "hasMutateConfirm(headers)",
    )
    .replace(/: string\[]/g, "")
    .replace(/: string \| null/g, "")
    .replace(/: SqlKind/g, "")
    .replace(/: unknown/g, "")
    .replace(/: string/g, "")
    .replace(/: number/g, "")
    .replace(/: boolean/g, "")
    .replace(/\): SqlKind \{/g, ") {")
    .replace(/\): boolean \{/g, ") {")
    .replace(/\): number \{/g, ") {");
}

const cleaned = stripTypes(src);
const factory = new Function(
  `${cleaned}\nreturn { classifySql, hasMutateConfirm, kvKeyAllowed, busChannelAllowed, clampExecTimeout, emailRecipientAllowed, CONFIRM_HEADER, CONFIRM_VALUE, EXEC_CODE_MAX };`,
);
const {
  classifySql,
  hasMutateConfirm,
  kvKeyAllowed,
  busChannelAllowed,
  clampExecTimeout,
  emailRecipientAllowed,
  CONFIRM_HEADER,
  CONFIRM_VALUE,
  EXEC_CODE_MAX,
} = factory();

test("SELECT is read", () => {
  assert.equal(classifySql("SELECT * FROM task_log LIMIT 10"), "read");
  assert.equal(
    classifySql("WITH x AS (SELECT 1) SELECT * FROM x"),
    "read",
  );
});

test("mutating SQL needs WHERE for UPDATE/DELETE", () => {
  assert.equal(
    classifySql("DELETE FROM agent_memories WHERE id IS NOT NULL"),
    "mutate",
  );
  assert.equal(classifySql("DELETE FROM agent_memories"), "forbidden");
  assert.equal(
    classifySql("UPDATE task_log SET status = 'pending' WHERE task_id = ?"),
    "mutate",
  );
  assert.equal(
    classifySql("UPDATE task_log SET status = 'pending'"),
    "forbidden",
  );
  assert.equal(
    classifySql(
      "INSERT INTO knowledge_chunks (id, filename, category, chunk_index, content) VALUES (1, ?, ?, 0, ?)",
    ),
    "mutate",
  );
});

test("DDL and multi-statement are forbidden", () => {
  assert.equal(classifySql("DROP TABLE task_log"), "forbidden");
  assert.equal(classifySql("ALTER TABLE task_log ADD COLUMN x TEXT"), "forbidden");
  assert.equal(
    classifySql("SELECT 1; DELETE FROM task_log WHERE 1=1"),
    "forbidden",
  );
  assert.equal(classifySql("PRAGMA table_info(task_log)"), "forbidden");
});

test("confirm header gate", () => {
  const hdrs = (v) => ({ get: (n) => (n === CONFIRM_HEADER ? v : null) });
  assert.equal(hasMutateConfirm(hdrs(CONFIRM_VALUE)), true);
  assert.equal(hasMutateConfirm(hdrs("MUTATE")), true);
  assert.equal(hasMutateConfirm(hdrs(null)), false);
  assert.equal(hasMutateConfirm(hdrs("yes")), false);
});

test("KV allowlist blocks 2fa and arbitrary keys", () => {
  assert.equal(kvKeyAllowed("flag:maintenance", "get"), true);
  assert.equal(kvKeyAllowed("conn:brevo", "put"), true);
  assert.equal(kvKeyAllowed("conn:x:app", "put"), true);
  assert.equal(kvKeyAllowed("plan", "put"), true);
  assert.equal(kvKeyAllowed("agent_config:ceo_agent", "put"), true);
  assert.equal(kvKeyAllowed("flag:two_factor", "get"), true);
  assert.equal(kvKeyAllowed("flag:two_factor", "put"), false);
  assert.equal(kvKeyAllowed("2fa:secret", "get"), false);
  assert.equal(kvKeyAllowed("2fa:secret", "delete"), false);
  assert.equal(kvKeyAllowed("session:abc", "get"), false);
  assert.equal(kvKeyAllowed("license:support@lazynext.com", "put"), false);
});

test("bus channel allowlist", () => {
  assert.equal(busChannelAllowed("tasks"), true);
  assert.equal(busChannelAllowed("copilot"), true);
  assert.equal(busChannelAllowed("*"), true);
  assert.equal(busChannelAllowed("cto.tasks.builder"), true);
  assert.equal(busChannelAllowed("../../etc/passwd"), false);
  assert.equal(busChannelAllowed(""), false);
});

test("exec timeout clamp + email domain", () => {
  assert.equal(clampExecTimeout(999), 60);
  assert.equal(clampExecTimeout(0), 1);
  assert.equal(clampExecTimeout("30"), 30);
  assert.ok(EXEC_CODE_MAX >= 10_000);
  assert.equal(emailRecipientAllowed("support@lazynext.com"), true);
  assert.equal(emailRecipientAllowed("evil@example.com"), false);
});

test("routes import and call the guards", () => {
  const routes = [
    ["app/api/query/route.ts", "classifySql"],
    ["app/api/kv/route.ts", "kvKeyAllowed"],
    ["app/api/sandbox/exec/route.ts", "hasMutateConfirm"],
    ["app/api/email/route.ts", "emailRecipientAllowed"],
    ["app/api/publish/route.ts", "busChannelAllowed"],
    ["app/api/tick/route.ts", "hasMutateConfirm"],
  ];
  for (const [file, sym] of routes) {
    const body = readFileSync(join(root, file), "utf8");
    assert.match(body, /from "@\/lib\/blast_radius"/);
    assert.match(body, new RegExp(sym));
  }
});
