// Platform HEAD parity: read-only GET routes must answer HEAD the same way
// (status/headers; empty body via headEmpty). State-changing GET surfaces
// (OAuth connect, public e-sign view) stay exact-match.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModule, readJson, fakeCtx, fakeDb, fakeKv } from "./helpers/lift.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(HERE, "..", "src", "index.ts"), "utf8");
const publicSource = readFileSync(join(HERE, "..", "src", "public_api.ts"), "utf8");
const gatewaySource = readFileSync(join(HERE, "..", "src", "gateway.ts"), "utf8");
const connectSource = readFileSync(join(HERE, "..", "src", "connect_oauth.ts"), "utf8");
const signSource = readFileSync(join(HERE, "..", "src", "sign.ts"), "utf8");

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

test("gateway exports isRead + headEmpty helpers", () => {
  assert.match(gatewaySource, /export function isRead\(req: Request\): boolean/);
  assert.match(gatewaySource, /req\.method === "GET" \|\| req\.method === "HEAD"/);
  assert.match(gatewaySource, /export function headEmpty\(req: Request, res: Response\)/);
  assert.match(gatewaySource, /access-control-allow-methods": "GET, HEAD, POST, DELETE, OPTIONS"/);
});

test("fetch wraps every response in headEmpty so HEAD bodies stay empty", () => {
  assert.match(indexSource, /return headEmpty\(req, res\);/);
  assert.match(indexSource, /import \{[^}]*headEmpty[^}]*\} from "\.\/gateway"/);
});

test("internal governance reads dispatch via isRead (GET|HEAD)", () => {
  const block = indexSource.indexOf("if (isRead(req)) {");
  const postGuard = indexSource.indexOf('if (req.method !== "POST") return json({ error: "not found" }, 404);');
  assert.ok(block >= 0 && postGuard > block);
  for (const route of [
    'path === "/decision/packages"',
    'path === "/decision/blocks"',
    'path === "/capability/matrix"',
    'path === "/observer/reviews"',
    'path === "/templates"',
  ]) {
    const idx = indexSource.indexOf(route, block);
    assert.ok(idx > block && idx < postGuard, `${route} must sit in the isRead block`);
  }
  assert.match(indexSource, /path === "\/kv\/get" && isRead\(req\)/);
});

test("public_api read routes use isRead; mutations stay POST-exact", () => {
  assert.match(publicSource, /const read = isRead\(req\);/);
  assert.match(publicSource, /if \(read && path === "\/api\/v1\/status"\)/);
  assert.match(publicSource, /if \(read && path === "\/api\/v1\/tasks"\)/);
  assert.match(publicSource, /if \(read && path === "\/api\/v1\/agents"\)/);
  assert.match(publicSource, /if \(req\.method === "POST" && path === "\/api\/v1\/tasks"\)/);
  assert.match(publicSource, /if \(req\.method === "POST" && path === "\/api\/v1\/waitlist"\)/);
  assert.equal(/req\.method === "GET" && path === "\/api\/v1\/status"/.test(publicSource), false);
});

test("OAuth connect stays GET-exact (HEAD must not mint state)", () => {
  assert.match(connectSource, /if \(!m \|\| req\.method !== "GET"\) return json\(\{ error: "not found" \}, 404\);/);
});

test("public e-sign pending→viewed stays GET-exact; HEAD has a non-mutating branch", () => {
  assert.match(signSource, /if \(req\.method === "GET"\) \{/);
  assert.match(signSource, /UPDATE sign_requests SET status = 'viewed'/);
  const viewIdx = signSource.indexOf("UPDATE sign_requests SET status = 'viewed'");
  const getIdx = signSource.lastIndexOf('if (req.method === "GET") {', viewIdx);
  assert.ok(getIdx >= 0 && viewIdx > getIdx, "viewed write must sit inside the GET-exact block");
  assert.match(signSource, /\/\/ HEAD probes: same auth as GET, no pending→viewed side effect/);
  assert.match(signSource, /if \(req\.method === "HEAD"\) \{/);
});

test("headEmpty strips bodies only for HEAD", () => {
  const mod = loadModule("gateway.ts", {}, ["isRead", "headEmpty", "json"]);
  assert.equal(mod.isRead(new Request("https://x.test/", { method: "GET" })), true);
  assert.equal(mod.isRead(new Request("https://x.test/", { method: "HEAD" })), true);
  assert.equal(mod.isRead(new Request("https://x.test/", { method: "POST" })), false);

  const full = mod.json({ ok: true }, 200);
  const getOut = mod.headEmpty(new Request("https://x.test/", { method: "GET" }), full);
  assert.equal(getOut.body !== null, true);

  const headOut = mod.headEmpty(new Request("https://x.test/", { method: "HEAD" }), full);
  assert.equal(headOut.status, 200);
  assert.equal(headOut.body, null);
  assert.equal(headOut.headers.get("content-type"), "application/json");
});

test("public status answers HEAD with the same status as GET", async () => {
  const rows = { n: 3 };
  const env = {
    DB: {
      batch: async () => [
        { results: [rows] },
        { results: [rows] },
        { results: [rows] },
        { results: [rows] },
      ],
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: {} }),
        }),
        all: async () => ({ results: [] }),
      }),
    },
    EPHEMERAL: fakeKv(),
  };
  // authorize stub + OPENAPI unused for status path past auth
  const mod = loadModule(
    "public_api.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "read" } }),
      touchKey: () => {},
      extractKey: () => "lzk_test",
      sha256: async () => "x",
      generateKey: () => "lzk_x",
      OPENAPI_SPEC: {},
      DOCS_HTML: "<html></html>",
      publishToBus: async () => 1,
      enrollLead: async () => ({ seq_sent: false }),
      isRead: (req) => req.method === "GET" || req.method === "HEAD",
    },
    ["handlePublicApi"],
  );
  const ctx = fakeCtx();
  const get = await mod.handlePublicApi(
    new Request("https://ai-company.lazynext.com/api/v1/status", { method: "GET" }),
    env,
    ctx,
    "/api/v1/status",
  );
  const head = await mod.handlePublicApi(
    new Request("https://ai-company.lazynext.com/api/v1/status", { method: "HEAD" }),
    env,
    ctx,
    "/api/v1/status",
  );
  assert.equal(get.status, 200);
  assert.equal(head.status, 200);
  const body = await readJson(get);
  assert.equal(typeof body.tasks_logged, "number");
});
