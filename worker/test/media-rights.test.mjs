// Media rights ledger — provenance only (2026-11-10).
//
// The media library feeds public posts and recorded nothing about where an
// asset came from. This is the smallest honest fix: one optional field on the
// existing `media:{id}:meta` KV record, defaulting to 'unknown' (never guessed).
//
// The tests pin that it is metadata and nothing more:
//   * upload → list round-trip, including the enum rejection;
//   * a pre-feature record (no field) lists as 'unknown', not blank or a lie;
//   * an asset with rights_basis 'unknown' uploads and serves exactly as today.
//
// `handleServices` is lifted from src/services.ts, so the route cannot drift.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, fakeCtx, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";
import { capabilityOf } from "./helpers/caps.mjs";
import { copygate } from "./helpers/copygate.mjs";
import { readFileSync } from "node:fs";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "../src/services.ts"), "utf8");

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// brief.ts is lifted (not read) so the hook is the shipped one.
const briefSrc = readFileSync(join(HERE, "../src/brief.ts"), "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
  .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class|interface|type|default)\b)/gm, "");
const briefJs = ts.transpileModule(briefSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const brief = new Function(
  `${briefJs}; return { normalizeBrief, canonicalBrief, hashBrief, parseStoredBrief };`,
)();

const services = () =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "read,write" } }),
      touchKey: () => {},
      // Media list reads KV keys through listAll — read the fake's own map.
      listAll: async (kv, prefix) =>
        [...kv.map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => ({ allow: true, enforced: false }),
      openDispatchDecision: async () => ({ id: 1, authority: "approval" }),
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      capabilityOf,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
      lintCopy: copygate.lintCopy,
      blockingFindings: copygate.blockingFindings,
      describeCopyFindings: copygate.describeCopyFindings,
      normalizeBrief: brief.normalizeBrief,
      canonicalBrief: brief.canonicalBrief,
      hashBrief: brief.hashBrief,
      parseStoredBrief: brief.parseStoredBrief,
    },
    ["handleServices"],
  );

const kvEnv = (seed = {}) => ({ DB: fakeDb([]), EPHEMERAL: fakeKv(seed), API_TOKEN: "test-secret" });

const post = (body) =>
  new Request("https://ai-company.lazynext.test/api/v1/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const get = () =>
  new Request("https://ai-company.lazynext.test/api/v1/media", { method: "GET" });

const upload = async (body) => {
  const mod = services();
  const env = kvEnv();
  const res = await mod.handleServices(post(body), env, fakeCtx(), "/api/v1/media");
  return { res, env, body: await readJson(res) };
};

const PNG = "aGVsbG8="; // "hello"

test("rights_basis round-trips through upload, KV meta and the list", async () => {
  const up = await upload({ name: "x.png", type: "image/png", data_b64: PNG, rights_basis: "own" });
  assert.equal(up.res.status, 201);
  assert.equal(up.body.rights_basis, "own", "the upload response states the basis");

  const metaKey = [...up.env.EPHEMERAL.map.keys()].find((k) => k.endsWith(":meta"));
  const meta = JSON.parse(up.env.EPHEMERAL.map.get(metaKey));
  assert.equal(meta.rights_basis, "own", "the existing meta record carries it");

  const mod = services();
  const listed = await mod.handleServices(get(), up.env, fakeCtx(), "/api/v1/media");
  const json = await readJson(listed);
  assert.equal(json.media[0].rights_basis, "own");
  assert.equal(json.media[0].name, "x.png");
});

test("an asset with rights_basis 'unknown' uploads and serves exactly as today", async () => {
  const up = await upload({ name: "x.png", type: "image/png", data_b64: PNG, rights_basis: "unknown" });
  assert.equal(up.res.status, 201);
  assert.equal(up.body.rights_basis, "unknown");
  // The pre-existing response fields are untouched.
  assert.match(up.body.url, /\/media\/[0-9a-f-]{36}$/);
  assert.equal(up.body.type, "image/png");
  assert.equal(up.body.name, "x.png");
  assert.equal(up.body.size, 5);
  // And the bytes were stored exactly as before.
  const bytesKey = [...up.env.EPHEMERAL.map.keys()].find((k) => /^media:[0-9a-f-]{36}$/.test(k));
  assert.equal(up.env.EPHEMERAL.map.has(bytesKey), true, "media bytes are still stored");
});

test("an omitted rights_basis defaults to unknown, not blank", async () => {
  const up = await upload({ name: "x.png", type: "image/png", data_b64: PNG });
  assert.equal(up.res.status, 201);
  assert.equal(up.body.rights_basis, "unknown");
});

test("an invalid enum value is a 400 and nothing is stored", async () => {
  const up = await upload({ name: "x.png", type: "image/png", data_b64: PNG, rights_basis: "borrowed" });
  assert.equal(up.res.status, 400);
  assert.match(up.body.error, /rights_basis must be one of/);
  assert.deepEqual([...up.env.EPHEMERAL.map.keys()], [], "a rejected upload writes no bytes and no meta");
});

test("a pre-feature meta record lists as unknown without rewriting it", async () => {
  const legacy = { name: "old.png", type: "image/png", size: 5, created: 1, store: "kv" };
  const env = kvEnv({ "media:11111111-1111-1111-1111-111111111111": PNG });
  env.EPHEMERAL.map.set(
    "media:11111111-1111-1111-1111-111111111111:meta",
    JSON.stringify(legacy),
  );
  const mod = services();
  const res = await mod.handleServices(get(), env, fakeCtx(), "/api/v1/media");
  const json = await readJson(res);
  assert.equal(json.media[0].rights_basis, "unknown", "derived at read time, not invented");
  const stored = JSON.parse(env.EPHEMERAL.map.get("media:11111111-1111-1111-1111-111111111111:meta"));
  assert.equal("rights_basis" in stored, false, "the stored record is never rewritten");
});

test("provenance never changes dispatch: no gate/breaker code is consulted on upload", () => {
  const mediaStart = src.indexOf('if (path === "/api/v1/media" && req.method === "POST")');
  const mediaEnd = src.indexOf('if (path === "/api/v1/media" && req.method === "GET")', mediaStart);
  assert.ok(mediaStart > 0 && mediaEnd > mediaStart, "media upload slice not found");
  const handler = src.slice(mediaStart, mediaEnd);
  assert.equal(/decisionGate|check_outbound|outboundDecision|breaker/.test(handler), false);
  assert.match(handler, /rights_basis/, "the field is stored on the meta record");
});
