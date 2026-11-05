// marketing.lazynext.com → apex host redirect (2026-11-06).
//
// `_redirects` cannot express a host-qualified rule (Workers static assets do
// not support domain-level redirects), so the redirect lives in the shipped
// Worker script. These tests lift the SHIPPED source (same "lift the shipped
// code" pattern as worker/test/helpers/lift.mjs) so the host logic cannot
// drift back to a state that redirects the apex or drops the query string.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "index.js");
const src = readFileSync(SRC, "utf8");
const toml = readFileSync(join(HERE, "..", "wrangler.toml"), "utf8");

// `export default` is illegal inside a Function body — swap it for `return`
// and build the handler from the real file text.
const worker = new Function(`${src.replace(/export\s+default/, "return")}`)();

// The assets binding is the pass-through; record what it was asked to serve.
const makeEnv = () => {
  const served = [];
  return {
    served,
    env: {
      ASSETS: {
        async fetch(request) {
          const url = new URL(request.url);
          served.push(`${request.method} ${url.pathname}${url.search}`);
          return new Response(`asset:${url.pathname}`, { status: 200 });
        },
      },
    },
  };
};

const get = (url, method = "GET") => new Request(url, { method });

const redirectOf = async (url, method) => {
  const { env, served } = makeEnv();
  const res = await worker.fetch(get(url, method), env);
  return { res, served, location: res.headers.get("Location") };
};

// --- the marketing host is redirected ------------------------------------
test("marketing host: 301 to the apex, path and query preserved", async () => {
  const { res, location } = await redirectOf("https://marketing.lazynext.com/docs?x=1");
  assert.equal(res.status, 301);
  assert.equal(location, "https://lazynext.com/docs?x=1");
  assert.equal(await res.text(), "", "a 301 carries no body");
});

test("marketing host: root redirects to the apex root", async () => {
  const { res, location } = await redirectOf("https://marketing.lazynext.com/");
  assert.equal(res.status, 301);
  assert.equal(location, "https://lazynext.com/");
});

test("marketing host: HEAD also 301s", async () => {
  const { res, location } = await redirectOf("https://marketing.lazynext.com/pricing", "HEAD");
  assert.equal(res.status, 301);
  assert.equal(location, "https://lazynext.com/pricing");
});

test("marketing host: nested paths and complex queries survive byte-for-byte", async () => {
  const { location } = await redirectOf(
    "https://marketing.lazynext.com/legal?utm_source=x&q=two%20words&empty=",
  );
  assert.equal(location, "https://lazynext.com/legal?utm_source=x&q=two%20words&empty=");
});

test("marketing host: host comparison is case-insensitive (URL parser normalises)", async () => {
  const { res, location } = await redirectOf("https://MARKETING.LAZYNEXT.COM/docs");
  assert.equal(res.status, 301);
  assert.equal(location, "https://lazynext.com/docs");
});

test("marketing host: non-GET requests are passed through, never redirected", async () => {
  const { res, served, location } = await redirectOf("https://marketing.lazynext.com/docs", "POST");
  assert.equal(res.status, 200);
  assert.equal(location, null, "a POST is never turned into a 301");
  assert.deepEqual(served, ["POST /docs"]);
});

// --- the apex and www hosts are untouched --------------------------------
test("apex host: assets pass through with no redirect", async () => {
  const { res, served, location } = await redirectOf("https://lazynext.com/docs?x=1");
  assert.equal(res.status, 200);
  assert.equal(location, null);
  assert.deepEqual(served, ["GET /docs?x=1"], "the original request reaches the assets binding");
});

test("www host: assets pass through with no redirect", async () => {
  const { res, served, location } = await redirectOf("https://www.lazynext.com/");
  assert.equal(res.status, 200);
  assert.equal(location, null);
  assert.deepEqual(served, ["GET /"]);
});

test("no redirect loop: the redirect target host passes straight through", async () => {
  const first = await redirectOf("https://marketing.lazynext.com/docs?x=1");
  const target = new URL(first.location);
  assert.equal(target.hostname, "lazynext.com");
  const second = await redirectOf(target.toString());
  assert.equal(second.res.status, 200, "the canonical host serves the asset, not another redirect");
  assert.equal(second.location, null);
});

test("other hosts are not redirected (exact hostname match, no suffix trick)", async () => {
  for (const host of ["lazynext.com.evil.example", "marketing.lazynext.com.evil.example", "checker.lazynext.com"]) {
    const { res, location } = await redirectOf(`https://${host}/docs`);
    assert.equal(res.status, 200, `${host} must pass through`);
    assert.equal(location, null, `${host} must not redirect`);
  }
});

// --- config drift guard ---------------------------------------------------
test("wrangler.toml wires the script to the assets binding and runs it first", () => {
  assert.match(toml, /^main\s*=\s*"\.\/src\/index\.js"/m, "main must point at the redirect script");
  assert.match(toml, /^\s*binding\s*=\s*"ASSETS"/m, "the pass-through needs the ASSETS binding");
  assert.match(toml, /^\s*run_worker_first\s*=\s*true/m, "the Worker must run before asset matching");
  assert.match(toml, /^\s*directory\s*=\s*"\.\/public"/m, "the asset directory is unchanged");
});
