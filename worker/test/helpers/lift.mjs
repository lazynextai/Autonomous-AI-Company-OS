// Shared harness: lift the shipped TypeScript out of worker/src, strip the
// module imports, transpile with the repo's own typescript, and inject the
// collaborators as parameters. Tests therefore exercise the real code — the
// same pattern as connector-response.test.mjs and billing-reconcile.test.mjs —
// so an implementation change that breaks a contract fails here instead of
// drifting silently.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

export function loadModule(file, deps, exportNames) {
  let source = readFileSync(join(SRC, file), "utf8");
  // Single-line imports only (the house style in worker/src).
  source = source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "");
  source = source.replace(/^import\s+"[^"]+";\s*$/gm, "");
  // `export` is illegal inside a Function body; drop the keyword, keep the decl.
  source = source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class|interface|type|default)\b)/gm, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const depNames = Object.keys(deps);
  const factory = new Function(
    ...depNames,
    `${js}\nreturn { ${exportNames.join(", ")} };`,
  );
  return factory(...depNames.map((n) => deps[n]));
}

// --- fake D1 --------------------------------------------------------------
// Route each statement to a handler by regex/substring on the SQL text.
// Unmatched statements resolve to the caller's default (an empty read or a
// one-row write), which is what makes the harness usable for both read and
// write paths; a test that needs a write asserted registers a handler.
export function fakeDb(handlers = []) {
  const calls = [];

  async function route(sql, params, kind) {
    for (const h of handlers) {
      const hit = typeof h.match === "string" ? sql.includes(h.match) : h.match.test(sql);
      if (hit) return h.handle(sql, params, kind);
    }
    return undefined;
  }

  return {
    calls,
    handlers,
    prepare(sql) {
      const bound = [];
      const stmt = {
        sql,
        bound,
        bind(...params) {
          bound.push(...params);
          return stmt;
        },
        async run() {
          calls.push({ sql, params: bound, kind: "run" });
          return (await route(sql, bound, "run")) ?? { success: true, meta: { changes: 1, last_row_id: 1 } };
        },
        async first() {
          calls.push({ sql, params: bound, kind: "first" });
          return (await route(sql, bound, "first")) ?? null;
        },
        async all() {
          calls.push({ sql, params: bound, kind: "all" });
          return (await route(sql, bound, "all")) ?? { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      return Promise.all(stmts.map((s) => s.run()));
    },
  };
}

export function fakeKv(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, String(v));
    },
    async delete(k) {
      map.delete(k);
    },
  };
}

export async function readJson(res) {
  return JSON.parse(await res.text());
}

/** Minimal ExecutionContext — records waitUntil work so tests can await it. */
export function fakeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(p) {
      pending.push(Promise.resolve(p));
    },
    passThroughOnException() {},
    async flush() {
      await Promise.all(pending);
    },
  };
}
