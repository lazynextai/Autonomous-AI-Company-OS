"use strict";
/**
 * API rules_url tests: POST /scan with a custom-rules JSON file served over
 * http(s) (deep-merge, duplicate-id rejection, JSON-only, timeout safety).
 * Offline-safe: fixtures are served by a local Node http server, never an
 * external host.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { server } = require("../api/server.js");

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

// ── local fixture rules server ──────────────────────────────────────────
let fixtureServer;
let fixturePort;

const FIXTURE_RULES = {
  version: "fixture-1",
  categories: [{ id: "fix-cat", name: "Fixture category" }],
  patterns: [
    { id: "fix-word", category: "fix-cat", severity: 2, kind: "word", match: "fixedslop", desc: "A fixture tell.", fix: "Remove it." },
  ],
};

test.before(async () => {
  fixtureServer = http.createServer((req, res) => {
    if (req.url === "/good.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(FIXTURE_RULES));
    }
    if (req.url === "/bad.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("{not valid json!!");
    }
    if (req.url === "/dup.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ patterns: [{ id: "w-delve", category: "word-ban", severity: 2, kind: "word", match: "delve", desc: "dup", fix: "dup" }] }));
    }
    if (req.url === "/slow") {
      // Hang long enough to trip the client's 10s timeout in a test would be
      // too slow; instead respond after a short delay to prove async fetch.
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(FIXTURE_RULES));
      }, 50);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => fixtureServer.listen(0, resolve));
  fixturePort = fixtureServer.address().port;
});

test.after(() => {
  fixtureServer.close();
});

async function postScan(body) {
  const res = await fetch(base + "/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("rules_url: merges custom rules and fires them on text", async () => {
  const { status, body } = await postScan({ text: "This is fixedslop indeed.", rules_url: `http://127.0.0.1:${fixturePort}/good.json` });
  assert.equal(status, 200);
  assert.equal(body.version, "fixture-1", "merged corpus version wins");
  assert.ok(body.matches.some((m) => m.id === "fix-word"), "custom pattern fires");
});

test("rules_url: base corpus still fires alongside custom rules", async () => {
  const { status, body } = await postScan({ text: "We must leverage this robust tool.", rules_url: `http://127.0.0.1:${fixturePort}/good.json` });
  assert.equal(status, 200);
  assert.ok(body.matches.some((m) => m.id === "w-leverage"), "base pattern still fires on the merged engine");
  assert.ok(body.matches.some((m) => m.id === "w-robust"));
});

test("rules_url: rewrite still works on the merged engine", async () => {
  const { status, body } = await postScan({ text: "We must utilize this.", rewrite: true, rules_url: `http://127.0.0.1:${fixturePort}/good.json` });
  assert.equal(status, 200);
  assert.ok(body.rewrite, "rewrite payload present");
  assert.equal(body.rewrite.changed, true);
  assert.ok(!body.rewrite.text.includes("utilize"));
});

test("rules_url: duplicate id in the fetched file is rejected (400)", async () => {
  const { status, body } = await postScan({ text: "delve", rules_url: `http://127.0.0.1:${fixturePort}/dup.json` });
  assert.equal(status, 400);
  assert.match(body.error, /duplicate pattern id "w-delve"/);
});

test("rules_url: non-JSON content from the URL is rejected (400)", async () => {
  const { status, body } = await postScan({ text: "x", rules_url: `http://127.0.0.1:${fixturePort}/bad.json` });
  assert.equal(status, 400);
  assert.match(body.error, /valid JSON/);
});

test("rules_url: unreachable host returns 502", async () => {
  const { status, body } = await postScan({ text: "x", rules_url: "http://127.0.0.1:1/rules.json" });
  assert.equal(status, 502);
  assert.match(body.error, /could not fetch rules_url/);
});

test("rules_url: non-http(s) rules_url is rejected (400)", async () => {
  const { status, body } = await postScan({ text: "x", rules_url: "file:///etc/passwd" });
  assert.equal(status, 400);
  assert.match(body.error, /rules_url must be an http\(s\) URL/);
});

test("rules_url: works with a delayed fixture (async fetch)", async () => {
  const { status, body } = await postScan({ text: "fixedslop", rules_url: `http://127.0.0.1:${fixturePort}/slow` });
  assert.equal(status, 200);
  assert.ok(body.matches.some((m) => m.id === "fix-word"));
});

// Sanity: the earlier test helper was removed; replace with a direct probe.
test("rules_url: fixture server itself behaves (guards against silent fixture rot)", async () => {
  const res = await fetch(`http://127.0.0.1:${fixturePort}/good.json`);
  assert.equal(res.status, 200);
  const parsed = await res.json();
  assert.equal(parsed.version, "fixture-1");
});