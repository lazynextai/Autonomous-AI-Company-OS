"use strict";
/**
 * API layer tests: exercises api/server.js over real HTTP on an ephemeral
 * port (health, rules manifest, scan text/html/url-error, rewrite).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { server, ruleManifest, serviceDescriptor } = require("../api/server.js");
const corpus = require("../data/slop-patterns.js");

let port;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  server.close();
});

async function get(path) {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
}

async function post(path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("GET /health returns ok", async () => {
  const { status, body } = await get("/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.engine, "lazynext-ai-slop-checker");
});

test("GET /rules returns the corpus manifest", async () => {
  const { status, body } = await get("/rules");
  assert.equal(status, 200);
  assert.equal(body.version, corpus.version);
  assert.equal(body.count, corpus.patterns.length);
  assert.equal(body.categories.length, corpus.categories.length);
  assert.ok(Array.isArray(body.categories));
  assert.ok(Array.isArray(body.rules));
  const sample = body.rules.find((r) => r.id === "w-delve");
  assert.ok(sample, "w-delve must be in the manifest");
  assert.equal(sample.category, "word-ban");
  assert.equal(typeof sample.fix, "string");
});

test("GET / returns the service descriptor (or serves the web checker)", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  const type = res.headers.get("content-type") || "";
  if (type.includes("json")) {
    const body = await res.json();
    assert.equal(body.engine, "lazynext-ai-slop-checker");
  } else {
    // web/ exists -> the server serves the checker page at /
    const html = await res.text();
    assert.ok(html.includes("Lazynext"), "checker page should be served at /");
  }
});

test("POST /scan {text} returns a report", async () => {
  const { status, body } = await post("/scan", { text: "We must leverage this and utilize that." });
  assert.equal(status, 200);
  assert.equal(body.engine, "lazynext-ai-slop-checker");
  assert.ok(body.score >= 0 && body.score <= 100);
  assert.ok(body.matches.some((m) => m.id === "w-leverage"));
  assert.equal(body.source.type, "text");
});

test("POST /scan {html} detects design tells", async () => {
  const html = `<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><h1>Hello</h1><p>We must utilize this.</p>`;
  const { status, body } = await post("/scan", { html });
  assert.equal(status, 200);
  assert.equal(body.source.type, "html");
  assert.ok(body.matches.some((m) => m.id === "d-indigo-violet-gradient"), "gradient must fire");
  assert.ok(body.matches.some((m) => m.id === "w-utilize"), "text tells in html must fire");
});

test("POST /scan with rewrite=true returns safe rewrites", async () => {
  const { status, body } = await post("/scan", { text: "We should utilize this.", rewrite: true });
  assert.equal(status, 200);
  assert.ok(body.rewrite, "rewrite payload expected");
  assert.ok(body.rewrite.changed);
  assert.ok(!body.rewrite.text.includes("utilize"));
});

test("POST /scan {url} with an unreachable host returns 502", async () => {
  const { status, body } = await post("/scan", { url: "http://127.0.0.1:1/nope" });
  assert.equal(status, 502);
  assert.ok(body.error && body.error.includes("could not fetch"));
});

test("POST /scan with no input returns 400", async () => {
  const { status } = await post("/scan", {});
  assert.equal(status, 400);
});

test("POST /scan with multiple inputs returns 400", async () => {
  const { status } = await post("/scan", { text: "a", html: "<p>b</p>" });
  assert.equal(status, 400);
});

test("POST /scan with invalid json returns 400", async () => {
  const res = await fetch(base + "/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "not json" });
  assert.equal(res.status, 400);
});

// ── POST /judge ──────────────────────────────────────────────────────────

test("POST /judge {text} returns the checklist report", async () => {
  const { status, body } = await post("/judge", { text: "We must leverage this robust solution." });
  assert.equal(status, 200);
  assert.equal(body.engine, "lazynext-ai-slop-checker-judge");
  assert.equal(body.input.type, "text");
  assert.equal(body.fiveQuestionReview.length, 5);
  assert.equal(body.craftFloor.length, 6);
  assert.equal(body.summary.verdict, "REVIEW");
  assert.ok(body.summary.reasons.some((x) => /copy objections/.test(x)));
});

test("POST /judge {html} with a machine floor flag → REFUSE", async () => {
  const { status, body } = await post("/judge", {
    html: '<div><p>Join 10,000+ developers</p><p>24/7 uptime support</p></div>',
  });
  assert.equal(status, 200);
  assert.equal(body.summary.verdict, "REFUSE");
  const fake = body.craftFloor.find((f) => f.id === "no-fake-data");
  assert.equal(fake.machine, "flag");
  assert.ok(fake.evidence.includes("d-stat-row"));
});

test("POST /judge {project} judges a directory tree", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-api-judge-"));
  fs.writeFileSync(path.join(dir, "README.md"), "In today's fast-paced world, we must leverage this robust solution.");
  try {
    const { status, body } = await post("/judge", { project: dir });
    assert.equal(status, 200);
    assert.equal(body.input.type, "project");
    assert.ok(body.input.filesScanned >= 1);
    assert.ok(["PASS", "REVIEW", "REFUSE"].includes(body.summary.verdict));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /judge validation: 0 inputs, >1 inputs, bad types → 400", async () => {
  const none = await post("/judge", {});
  assert.equal(none.status, 400);
  assert.match(none.body.error, /provide one of/);

  const both = await post("/judge", { text: "a", html: "<p>b</p>" });
  assert.equal(both.status, 400);
  assert.match(both.body.error, /exactly one of/);

  const badText = await post("/judge", { text: 42 });
  assert.equal(badText.status, 400);
  assert.match(badText.body.error, /text must be a string|judge failed/);

  const badDir = await post("/judge", { project: "" });
  assert.equal(badDir.status, 400);
  assert.match(badDir.body.error, /non-empty/);
});

test("unknown route returns 404", async () => {
  const { status } = await get("/nope");
  assert.equal(status, 404);
});

test("POST /scan-project scans a directory tree", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-api-proj-"));
  fs.writeFileSync(path.join(dir, "README.md"), "In today's fast-paced world, we must leverage this robust solution.");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "app.js"), "var x = 1;");
  try {
    const { status, body } = await post("/scan-project", { dir });
    assert.equal(status, 200);
    assert.equal(body.engine, "lazynext-ai-slop-checker");
    assert.ok(Array.isArray(body.files));
    assert.ok(body.summary.filesScanned >= 1);
    assert.ok(Array.isArray(body.topFiles));
    assert.ok(body.summary.score > 0, "README with slop must score above 0");
    const readme = body.topFiles.find((f) => f.file === "README.md");
    assert.ok(readme, "README.md should be among the top files");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /scan-project with a bad path returns 400", async () => {
  const { status, body } = await post("/scan-project", { dir: "/definitely/not/a/real/dir" });
  assert.equal(status, 400);
  assert.ok(body.error && body.error.includes("could not scan project"));
});

test("POST /scan-project without a dir returns 400", async () => {
  const { status } = await post("/scan-project", {});
  assert.equal(status, 400);
});

test("ruleManifest and serviceDescriptor are self-consistent", () => {
  const manifest = ruleManifest();
  const descriptor = serviceDescriptor();
  assert.equal(manifest.version, descriptor.version);
  assert.equal(manifest.count, corpus.patterns.length);
  assert.equal(manifest.categories.length, corpus.categories.length);
});