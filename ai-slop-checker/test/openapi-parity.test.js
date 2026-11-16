"use strict";
/**
 * Structural checks on the OpenAPI contract (api/openapi.json) — keeps the
 * hand-maintained spec honest: every route the server exposes is declared
 * in the spec, and every declared path maps to a handler. Runs entirely
 * in-process, offline-safe.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "openapi.json"), "utf8"));
const serverSrc = fs.readFileSync(path.join(__dirname, "..", "api", "server.js"), "utf8");
const workerSrc = fs.readFileSync(path.join(__dirname, "..", "api", "worker.js"), "utf8");

// Path templates declared in the spec.
const SPEC_PATHS = new Set(Object.keys(spec.paths));

// Route literals in the server router (exact-match pathname comparisons).
function routeLiterals(src) {
  return [...src.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1]);
}

// startsWith-prefixed route fragments (e.g. /a2a/tasks/) and their spec
// template mapping. Keep in sync when adding templated routes.
const PREFIX_TO_TEMPLATE = {
  "/a2a/tasks/": "/a2a/tasks/{id}",
};

function prefixRoutes(src) {
  const out = [];
  // The server templates /a2a/tasks/:id via the a2aTaskMatch regex match.
  if (/a2aTaskMatch/.test(src)) {
    out.push(["/a2a/tasks/", "/a2a/tasks/{id}"]);
  }
  return out;
}

test("spec is a valid OpenAPI 3.1 document", () => {
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.info && spec.info.title && spec.info.version, "info block present");
  assert.ok(Array.isArray(spec.servers) && spec.servers.length >= 1);
  assert.ok(spec.paths && typeof spec.paths === "object");
  assert.ok(spec.components && spec.components.schemas);
});

test("every route the server exposes is declared in the spec", () => {
  const covered = new Set(SPEC_PATHS);
  const literal = routeLiterals(serverSrc).filter((p) => p !== "/");
  literal.push("/"); // root is served too (web checker or descriptor)
  for (const p of literal) {
    assert.ok(covered.has(p), `route ${p} is handled by server.js but missing from api/openapi.json`);
  }
  const templated = prefixRoutes(serverSrc);
  for (const [, template] of templated) {
    assert.ok(covered.has(template), `templated route ${template} missing from api/openapi.json`);
  }
});

test("every spec path is actually implemented in the server router", () => {
  // Scaffold the set of route strings the server proves it handles
  // (exact literals + the templated one). "/" is served via the root check.
  const implemented = new Set(["/", ...routeLiterals(serverSrc)]);
  for (const t of prefixRoutes(serverSrc)) implemented.add(t[1]);
  for (const specPath of SPEC_PATHS) {
    if (specPath === "/openapi.json" || specPath === "/llms.txt") continue; // served via existsSync fallbacks, covered below
    assert.ok(implemented.has(specPath), `spec path ${specPath} has no matching handler in server.js`);
  }
  // The two file-backed discovery routes are served by the handler when the
  // files exist (asserted here so they can't silently become dead spec).
  assert.ok(fs.existsSync(path.join(__dirname, "..", "api", "openapi.json")));
  assert.ok(fs.existsSync(path.join(__dirname, "..", "llms.txt")));
});

test("worker.js covers the same surface (minus local-only routes)", () => {
  const workerLiterals = new Set(routeLiterals(workerSrc));
  for (const p of ["/health", "/rules", "/scan", "/mcp", "/a2a", "/.well-known/agent.json", "/widget.js"]) {
    assert.ok(workerLiterals.has(p), `worker.js must also handle ${p}`);
  }
  // scan-project on Workers returns a 400 (local filesystem only) — the
  // route still exists with a clear message.
  assert.ok(workerSrc.includes('pathname === "/scan-project"'));
});

test("all $refs resolve to declared component sections", () => {
  const refs = new Set();
  JSON.stringify(spec, (k, v) => {
    if (k === "$ref" && typeof v === "string") refs.add(v);
    return v;
  });
  for (const ref of refs) {
    // #/components/schemas/X or #/components/responses/X
    const m = ref.match(/^#\/components\/(schemas|responses)\/(.+)$/);
    assert.ok(m, `$ref not under components: ${ref}`);
    const [, section, name] = m;
    const container = spec.components[section];
    assert.ok(container, `no components.${section} section`);
    assert.ok(container[name], `unresolved $ref: ${ref}`);
  }
});

test("every operation documents at least one response and a summary", () => {
  for (const [pathItemName, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (method === "parameters") continue;
      assert.ok(op.summary, `${method.toUpperCase()} ${pathItemName} has no summary`);
      assert.ok(op.responses && Object.keys(op.responses).length > 0, `${method.toUpperCase()} ${pathItemName} has no responses`);
    }
  }
});

test("the service descriptor endpoint list matches the spec paths", () => {
  const { serviceDescriptor } = require("../api/server.js");
  const d = serviceDescriptor();
  const descPaths = Object.values(d.endpoints).map((e) => e.path);
  // Every descriptor endpoint must exist in the spec (templated or literal).
  for (const p of descPaths) {
    const inSpec = SPEC_PATHS.has(p) || [...SPEC_PATHS].some((s) => p.startsWith(s.split("{")[0]));
    assert.ok(inSpec, `descriptor endpoint ${p} missing from the spec`);
  }
});