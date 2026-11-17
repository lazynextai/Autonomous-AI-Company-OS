"use strict";
/**
 * Edge-compatibility tests for the deployed Worker (api/worker.js):
 *
 *   - embedded-assets drift guard: api/embedded-assets.js must equal the
 *     on-disk llms.txt + api/openapi.json (regenerate when either changes)
 *   - /llms.txt + /openapi.json pass through to env.ASSETS when the binding
 *     is present, embedded constants otherwise (no node:fs on the edge)
 *   - the curated static web map: /, /index.html, /app.js, /style.css,
 *     /manifest.webmanifest, /register-sw.js, /sw.js, /icons/*, /data/*,
 *     /src/*, /assets/*, /web/* (GET/HEAD only) resolve onto the assets
 *     directory; everything outside the map (test/, docs/, ...) stays 404
 *   - SSRF host guard: private/loopback/link-local/CGNAT/multicast IPv4,
 *     IPv6 loopback/link-local/ULA/multicast, IPv4-mapped IPv6,
 *     localhost/*.local/*.internal are blocked on the URL-scan path
 *   - per-IP scan cap: 60 scans / 60s window -> 429 on the 61st
 *   - the node-bridge returns the real node:fs / node:path under Node
 *
 * For asset passthrough assertions a fake ASSETS binding records the URL it
 * is asked to fetch, so the route map can be verified without a network.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const worker = require("../api/worker.js");
const embedded = require("../api/embedded-assets.js");
const { nodeFs, nodePath, isNode } = require("../src/node-bridge.js");

const base = "https://slop-checker.test";
const ROOT = path.join(__dirname, "..");

async function call(pathname, { method = "GET", body, headers = {} } = {}) {
  const req = new Request(base + pathname, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, {}, {});
}

/** Fake ASSETS binding: records requested URL/path, answers 200. */
function fakeAssets(log) {
  return {
    fetch: async (reqOrUrl) => {
      const url = typeof reqOrUrl === "string" ? reqOrUrl : reqOrUrl.url;
      log.push(url);
      return new Response(`asset:${url}`, { status: 200, headers: { "Content-Type": "text/plain" } });
    },
  };
}

// ── embedded-assets drift guard ─────────────────────────────────────────
test("edge: embedded-assets match the on-disk files (drift guard)", () => {
  assert.equal(embedded.LLMS_TXT, fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8"));
  assert.equal(embedded.OPENAPI_JSON, fs.readFileSync(path.join(ROOT, "api", "openapi.json"), "utf8"));
});

test("edge: /llms.txt + /openapi.json pass through env.ASSETS when bound", async () => {
  const log = [];
  const req = new Request(base + "/llms.txt");
  const res = await worker.fetch(req, { ASSETS: fakeAssets(log) }, {});
  assert.equal(res.status, 200);
  assert.equal(await res.text(), `asset:${base}/llms.txt`);
  const req2 = new Request(base + "/openapi.json");
  const res2 = await worker.fetch(req2, { ASSETS: fakeAssets(log) }, {});
  assert.equal(res2.status, 200);
  assert.equal(await res2.text(), `asset:${base}/api/openapi.json`);
});

// ── curated static map ──────────────────────────────────────────────────
test("edge: static map serves the web checker through ASSETS (same-origin)", async () => {
  const cases = [
    ["/", "/web/index.html"],
    ["/index.html", "/web/index.html"],
    ["/style.css", "/web/style.css"],
    ["/app.js", "/web/app.js"],
    ["/manifest.webmanifest", "/web/manifest.webmanifest"],
    ["/register-sw.js", "/web/register-sw.js"],
    ["/sw.js", "/web/sw.js"],
    ["/icons/icon-192.png", "/web/icons/icon-192.png"],
    ["/data/slop-patterns.js", "/data/slop-patterns.js"],
    ["/data/profiles.js", "/data/profiles.js"],
    ["/src/scanner.js", "/src/scanner.js"],
    ["/src/rewriter.js", "/src/rewriter.js"],
    ["/src/project-scanner-browser.js", "/src/project-scanner-browser.js"],
    ["/assets/favicon.png", "/assets/favicon.png"],
    ["/assets/lazynext-logo.jpg", "/assets/lazynext-logo.jpg"],
    ["/web/some-unknown-file.js", "/web/some-unknown-file.js"],
  ];
  for (const [pathname, assetPath] of cases) {
    const log = [];
    const req = new Request(base + pathname);
    const res = await worker.fetch(req, { ASSETS: fakeAssets(log) }, {});
    assert.equal(res.status, 200, `${pathname} should be served`);
    assert.equal(log.length, 1, `${pathname} should hit assets once`);
    assert.match(log[0], new RegExp(assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), `${pathname} -> ${assetPath}`);
  }
});

test("edge: static map answers HEAD (house HEAD-parity)", async () => {
  const log = [];
  const req = new Request(base + "/app.js", { method: "HEAD" });
  const res = await worker.fetch(req, { ASSETS: fakeAssets(log) }, {});
  assert.equal(res.status, 200);
  assert.ok(log.length === 1 && log[0].endsWith("/web/app.js"));
});

test("edge: read-only API surfaces answer HEAD (house HEAD-parity)", async () => {
  // /health, /rules, /openapi.json, /llms.txt, agent card, widget (no ASSETS
  // needed — embedded/constant fallback path) must not 404 on HEAD. The
  // HEAD status is what matters; workerd/curl -I report it without a body.
  for (const p of ["/health", "/rules", "/openapi.json", "/llms.txt", "/.well-known/agent.json", "/widget.js"]) {
    const req = new Request(base + p, { method: "HEAD" });
    const res = await worker.fetch(req, {}, {});
    assert.equal(res.status, 200, `HEAD ${p} should be 200`);
  }
});

test("edge: / without ASSETS keeps the JSON descriptor (no 404 on the API root)", async () => {
  const res = await call("/");
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.name, "Lazynext AI Slop Checker");
  assert.ok(d.endpoints && d.endpoints.health);
});

test("edge: static map gates — untouched paths stay 404, non-GET/HEAD do not pass through", async () => {
  // project-scanner.js is intentionally NOT here: /src/* is inside the
  // curated map (the web checker's engine modules live there, same as
  // api/server.js's resolveStatic). The gate excludes anything OUTSIDE the
  // web surface: test/, docs/, bench/, scripts/, package.json, Dockerfile.
  const blocked = ["/test/worker.test.js", "/docs/DEPLOYMENT.md", "/bench/perf.js", "/scripts/check.js", "/package.json", "/Dockerfile", "/.cursor/rules/x.mdc"];
  for (const p of blocked) {
    const log = [];
    const req = new Request(base + p);
    const res = await worker.fetch(req, { ASSETS: fakeAssets(log) }, {});
    assert.equal(res.status, 404, `${p} must NOT be served`);
    assert.equal(log.length, 0, `${p} must not reach ASSETS`);
  }
  const postLog = [];
  const post = new Request(base + "/data/slop-patterns.js", { method: "POST", body: "x" });
  const postRes = await worker.fetch(post, { ASSETS: fakeAssets(postLog) }, {});
  assert.equal(postRes.status, 404, "POST on a static path must 404 (GET/HEAD only)");
  assert.equal(postLog.length, 0);
});

// ── SSRF guard ──────────────────────────────────────────────────────────
test("edge: SSRF guard blocks private/loopback/link-local/CGNAT/multicast + local names", () => {
  const blocked = [
    "localhost", "localhost.", "127.0.0.1", "127.8.8.8", "10.0.0.1", "10.255.255.255",
    "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "100.127.255.254", "224.0.0.1", "225.1.1.1", "239.255.255.255", "0.0.0.0",
    "255.255.255.255", "::1", "[::1]", "::", "[::]", "fe80::1", "[fe80::1]",
    "fc00::1", "[fc00::1]", "fd12:3456::1", "ff00::1", "example.local", "foo.internal",
    "host.local.", "[::ffff:127.0.0.1]", "[::ffff:169.254.169.254]",
    "::ffff:10.0.0.1", "[::FFFF:192.168.0.1]",
  ];
  for (const h of blocked) {
    assert.equal(worker.isBlockedHost(h), true, `${h} should be blocked`);
  }
  const allowed = [
    "example.com", "lazynext.com", "checker.lazynext.com", "203.0.113.5", "8.8.8.8",
    "1.1.1.1", "93.184.216.34", "EXAMPLE.COM", "[2001:4860:4860::8888]", "2606:4700::1111",
    "2001:4860:4860::8888", "myhost.example.internal-not-really", "subdomain.lazynext.com",
    // ".internal"/".local" are reserved TLDs — only names ENDING in them are
    // blocked. "my.internal.host" has the public .host TLD and is allowed.
    "my.internal.host",
  ];
  for (const h of allowed) {
    assert.equal(worker.isBlockedHost(h), false, `${h} should be allowed`);
  }
});

test("edge: /scan url against a blocked host returns 502 without any upstream call", async () => {
  for (const url of ["http://127.0.0.1:1/", "http://localhost:9/x", "http://169.254.169.254/latest/meta-data", "http://[::1]/"]) {
    const res = await call("/scan", { method: "POST", body: { url } });
    assert.equal(res.status, 502, `${url} should 502`);
    const d = await res.json();
    assert.match(d.error, /could not fetch url/);
    assert.match(d.error, /not allowed|blocked/);
  }
});

test("edge: rules_url against a blocked host returns 502 too", async () => {
  const res = await call("/scan", { method: "POST", body: { text: "x", rules_url: "http://192.168.0.1/rules.json" } });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /could not fetch rules_url/);
});

test("edge: public-host scan validation still rejects non-http(s) with 400", async () => {
  const res = await call("/scan", { method: "POST", body: { url: "file:///etc/passwd" } });
  assert.equal(res.status, 400);
});

// ── per-IP scan cap ─────────────────────────────────────────────────────
test("edge: per-IP scan cap 429s past 60 scans in the 60s window", async () => {
  const HAMMER_IP = "203.0.113.99";
  async function hammerScan() {
    const req = new Request(base + "/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": HAMMER_IP },
      body: JSON.stringify({ text: "hello" }),
    });
    return worker.fetch(req, {}, {});
  }
  for (let i = 0; i < 60; i++) {
    const res = await hammerScan();
    assert.equal(res.status, 200, `scan #${i + 1} should be allowed`);
  }
  const res = await hammerScan();
  assert.equal(res.status, 429);
  const d = await res.json();
  assert.match(d.error, /too many scan requests/);

  // A different IP is not affected by the hammered bucket.
  const other = new Request(base + "/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.7" },
    body: JSON.stringify({ text: "hello" }),
  });
  const otherRes = await worker.fetch(other, {}, {});
  assert.equal(otherRes.status, 200);
});

// ── node-bridge under real Node ─────────────────────────────────────────
test("edge: node-bridge returns the real node:fs / node:path under Node", () => {
  assert.equal(isNode(), true);
  const fsMod = nodeFs();
  const pathMod = nodePath();
  assert.ok(fsMod && typeof fsMod.readFileSync === "function");
  assert.ok(pathMod && typeof pathMod.join === "function");
});