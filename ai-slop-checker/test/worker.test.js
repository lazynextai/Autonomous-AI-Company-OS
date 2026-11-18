"use strict";
/**
 * Workers-entry tests: api/worker.js must mirror the same HTTP contract as
 * the Node server for the routes that work on the edge (/scan with
 * rules_url, MCP, A2A replay, agent card, widget, openapi, llms), and
 * return the documented 400 for /scan-project. Uses the Workers Request/
 * Response API directly — no network.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const worker = require("../api/worker.js");

const base = "https://slop-checker.test";

async function call(pathname, { method = "GET", body } = {}) {
  const req = new Request(base + pathname, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, {}, {});
}

test("worker: GET /health returns ok", async () => {
  const res = await call("/health");
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.version, "1.4.4");
});

test("worker: GET /rules returns the manifest", async () => {
  const res = await call("/rules");
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.count, 279);
});

test("worker: POST /scan text works", async () => {
  const res = await call("/scan", { method: "POST", body: { text: "We must leverage this." } });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.matches.some((m) => m.id === "w-leverage"));
});

test("worker: POST /scan-project returns the documented 400 (no filesystem)", async () => {
  const res = await call("/scan-project", { method: "POST", body: { dir: "/tmp" } });
  assert.equal(res.status, 400);
  const d = await res.json();
  assert.match(d.error, /local filesystem/);
});

test("worker: MCP initialize handshake", async () => {
  const res = await call("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.result.serverInfo.name, "lazynext-ai-slop-checker");
  assert.equal(d.result.serverInfo.version, "1.4.4");
});

test("worker: POST /judge text works on the edge entry", async () => {
  const res = await call("/judge", { method: "POST", body: { text: "We must leverage this." } });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.engine, "lazynext-ai-slop-checker-judge");
  assert.equal(d.fiveQuestionReview.length, 5);
});

test("worker: POST /judge project returns the documented 400 (no filesystem)", async () => {
  const res = await call("/judge", { method: "POST", body: { project: "/tmp" } });
  assert.equal(res.status, 400);
  const d = await res.json();
  assert.match(d.error, /local filesystem/);
});

test("worker: MCP GET is 405", async () => {
  const res = await call("/mcp");
  assert.equal(res.status, 405);
});

test("worker: MCP scan_project tool returns a clear error (no filesystem)", async () => {
  const res = await call("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "scan_project", arguments: { dir: "/tmp" } } } });
  const d = await res.json();
  assert.equal(d.error.code, -32000);
  assert.match(d.error.message, /local filesystem/);
});

test("worker: A2A tasks/send + tasks/get replay", async () => {
  const send = await call("/a2a", { method: "POST", body: { jsonrpc: "2.0", id: "w1", method: "tasks/send", params: { message: { text: "delve into seamless" } } } });
  assert.equal(send.status, 200);
  const sd = await send.json();
  assert.equal(sd.result.task.id, "w1");

  const get = await call("/a2a", { method: "POST", body: { jsonrpc: "2.0", id: 5, method: "tasks/get", params: { id: "w1" } } });
  const gd = await get.json();
  assert.equal(gd.result.task.id, "w1");
  assert.ok(gd.result.task.artifacts[0].parts[0].data.matches.length > 0);

  const rest = await call("/a2a/tasks/w1");
  assert.equal(rest.status, 200);
  const rd = await rest.json();
  assert.equal(rd.task.id, "w1");
});

test("worker: discovery — agent.json, widget.js, openapi.json, llms.txt", async () => {
  const card = await call("/.well-known/agent.json");
  assert.equal(card.status, 200);
  const cd = await card.json();
  assert.equal(cd.name, "Lazynext AI Slop Checker");

  const widget = await call("/widget.js");
  assert.equal(widget.status, 200);
  const wjs = await widget.text();
  assert.match(wjs, /attachShadow/);

  const openapi = await call("/openapi.json");
  assert.equal(openapi.status, 200);
  const spec = await openapi.json();
  assert.equal(spec.openapi, "3.1.0");

  const llms = await call("/llms.txt");
  assert.equal(llms.status, 200);
  const txt = await llms.text();
  assert.match(txt, /openapi\.json/);
});

test("worker: unknown route returns 404 with endpoint list", async () => {
  const res = await call("/nope");
  assert.equal(res.status, 404);
  const d = await res.json();
  assert.ok(Array.isArray(d.endpoints));
  assert.ok(d.endpoints.includes("/mcp"));
});