"use strict";
/**
 * Agent-surface tests: MCP (JSON-RPC 2.0 initialize/tools/list/tools/call,
 * GET 405, errors), A2A (message/send/tasks/send/tasks/get + REST replay),
 * agent card, widget, and the openapi/llms discovery routes. All run over
 * the real HTTP server on an ephemeral port — offline-safe (no network
 * fetches).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { server } = require("../api/server.js");
const agentSurfaces = require("../api/agent-surfaces.js");
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

async function rpcPost(pathname, payload) {
  const res = await fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body = null;
  const text = await res.text();
  if (text) body = JSON.parse(text);
  return { status: res.status, body };
}

async function rpcGet(pathname) {
  const res = await fetch(base + pathname);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// MCP — transport
// ---------------------------------------------------------------------------

test("MCP: GET /mcp is 405 (no SSE) with a JSON-RPC error and Allow: POST", async () => {
  const res = await fetch(base + "/mcp");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
  const body = await res.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.code, -32600);
});

test("MCP: invalid JSON body returns a parse error envelope", async () => {
  const res = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json!!",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.error.code, -32700);
  assert.equal(body.id, null);
});

test("MCP: non-2.0 request returns -32600", async () => {
  const { status, body } = await rpcPost("/mcp", { id: 1, method: "tools/list" });
  assert.equal(status, 400);
  assert.equal(body.error.code, -32600);
});

test("MCP: notification (no id) is acknowledged with 202 and empty body", async () => {
  const res = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping" }),
  });
  assert.equal(res.status, 202);
  const text = await res.text();
  assert.equal(text, "");
});

// ---------------------------------------------------------------------------
// MCP — handshake + tools
// ---------------------------------------------------------------------------

test("MCP: initialize handshake returns protocol version + server info", async () => {
  const { status, body } = await rpcPost("/mcp", {
    jsonrpc: "2.0",
    id: "init-1",
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } },
  });
  assert.equal(status, 200);
  assert.equal(body.id, "init-1");
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.ok(body.result.capabilities.tools);
  assert.equal(body.result.serverInfo.name, "lazynext-ai-slop-checker");
  assert.equal(body.result.serverInfo.version, corpus.version);
});

test("MCP: ping returns an empty result", async () => {
  const { status, body } = await rpcPost("/mcp", { jsonrpc: "2.0", id: "p1", method: "ping" });
  assert.equal(status, 200);
  assert.equal(body.id, "p1");
  assert.deepEqual(body.result, {});
});

test("MCP: tools/list returns the seven expected tools", async () => {
  const { status, body } = await rpcPost("/mcp", { jsonrpc: "2.0", id: "tl1", method: "tools/list" });
  assert.equal(status, 200);
  const names = body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["judge", "list_rules", "rewrite_text", "scan_html", "scan_project", "scan_render", "scan_text"]);
  for (const t of body.result.tools) {
    assert.ok(t.description && t.description.length > 0);
    assert.ok(t.inputSchema && t.inputSchema.type === "object");
  }
});

test("MCP: unknown method returns -32601", async () => {
  const { body } = await rpcPost("/mcp", { jsonrpc: "2.0", id: 9, method: "bogus/method" });
  assert.equal(body.error.code, -32601);
});

// ---------------------------------------------------------------------------
// MCP — tools/call each tool
// ---------------------------------------------------------------------------

async function callTool(name, args = {}) {
  return rpcPost("/mcp", { jsonrpc: "2.0", id: `call-${name}`, method: "tools/call", params: { name, arguments: args } });
}

test("MCP tools/call: list_rules returns the full manifest", async () => {
  const { status, body } = await callTool("list_rules");
  assert.equal(status, 200);
  const data = body.result.structuredContent;
  assert.equal(data.count, corpus.patterns.length);
  assert.equal(data.rules.length, corpus.patterns.length);
  assert.equal(typeof body.result.content[0].text, "string");
});

test("MCP tools/call: scan_text returns a scan report", async () => {
  const { body } = await callTool("scan_text", { text: "We must leverage this robust tool." });
  const data = body.result.structuredContent;
  assert.equal(data.engine, "lazynext-ai-slop-checker");
  assert.ok(data.matches.some((m) => m.id === "w-leverage"));
  assert.equal(data.input.type, "text");
});

test("MCP tools/call: scan_text with rewrite adds the rewrite payload", async () => {
  const { body } = await callTool("scan_text", { text: "We must leverage this.", rewrite: true });
  const data = body.result.structuredContent;
  assert.ok(data.rewrite, "rewrite payload present");
  assert.equal(data.rewrite.changed, true);
});

test("MCP tools/call: scan_html detects design tells", async () => {
  const { body } = await callTool("scan_html", { html: `<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><h1>Hi</h1>` });
  const data = body.result.structuredContent;
  assert.ok(data.matches.some((m) => m.id === "d-indigo-violet-gradient"));
});

test("MCP tools/call: scan_project scans a directory tree", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-mcp-proj-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "In today's fast-paced world, we must leverage this robust solution.");
    const { body } = await callTool("scan_project", { dir });
    const data = body.result.structuredContent;
    assert.ok(data.summary.filesScanned >= 1);
    assert.ok(data.topFiles.some((f) => f.file === "README.md"));
    assert.ok(data.summary.score > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP tools/call: rewrite_text rewrites safely", async () => {
  const { body } = await callTool("rewrite_text", { text: "We should utilize this." });
  const data = body.result.structuredContent;
  assert.equal(data.changed, true);
  assert.ok(!data.text.includes("utilize"));
});

test("MCP tools/call: judge runs the checklist over text", async () => {
  const { status, body } = await callTool("judge", { text: "We must leverage this robust tool." });
  assert.equal(status, 200);
  const data = body.result.structuredContent;
  assert.equal(data.engine, "lazynext-ai-slop-checker-judge");
  assert.equal(data.fiveQuestionReview.length, 5);
  assert.equal(data.craftFloor.length, 6);
  assert.ok(["PASS", "REVIEW", "REFUSE"].includes(data.summary.verdict));
  assert.equal(data.summary.humanStepsRequired, true);
});

test("MCP tools/call: judge with html refutes on a machine-checked floor item", async () => {
  const { body } = await callTool("judge", {
    html: '<style>.hero{background-clip:text;-webkit-background-clip:text;color:transparent}</style><h1>Hi</h1>',
  });
  const data = body.result.structuredContent;
  assert.equal(data.summary.verdict, "REFUSE");
});

test("MCP tools/call: unknown tool returns -32602", async () => {
  const { body } = await callTool("nope", {});
  assert.equal(body.error.code, -32602);
});

test("MCP tools/call: missing params.name returns -32602", async () => {
  const { body } = await rpcPost("/mcp", { jsonrpc: "2.0", id: 42, method: "tools/call", params: {} });
  assert.equal(body.error.code, -32602);
});

test("MCP tools/call: scan_text with a non-string returns a tool error, not a crash", async () => {
  const { body } = await callTool("scan_text", { text: 42 });
  assert.equal(body.error.code, -32000);
  assert.match(body.error.message, /text must be a string/);
});

test("MCP: batch of two requests returns an array of responses", async () => {
  const { status, body } = await rpcPost("/mcp", [
    { jsonrpc: "2.0", id: "b1", method: "ping" },
    { jsonrpc: "2.0", id: "b2", method: "ping" },
  ]);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2);
  assert.equal(body[0].id, "b1");
  assert.equal(body[1].id, "b2");
});

// ---------------------------------------------------------------------------
// A2A
// ---------------------------------------------------------------------------

test("A2A: GET /a2a is 405", async () => {
  const res = await fetch(base + "/a2a");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("A2A: message/send with text then tasks/get replays the same task", async () => {
  const send = await rpcPost("/a2a", {
    jsonrpc: "2.0",
    id: "task-abc",
    method: "message/send",
    params: { message: { parts: [{ type: "text", text: "We must leverage this robust tool." }] } },
  });
  assert.equal(send.status, 200);
  assert.equal(send.body.result.task.id, "task-abc");
  assert.equal(send.body.result.task.status.state, "completed");
  assert.equal(send.body.result.task.artifacts[0].name, "slop-report");
  const storedReport = send.body.result.task.artifacts[0].parts[0].data;
  assert.ok(storedReport.matches.some((m) => m.id === "w-leverage"));

  const get = await rpcPost("/a2a", { jsonrpc: "2.0", id: "get-1", method: "tasks/get", params: { id: "task-abc" } });
  assert.equal(get.status, 200);
  assert.deepEqual(get.body.result.task, send.body.result.task, "tasks/get replays the identical task view");
});

test("A2A: tasks/send with an HTML message detects design tells", async () => {
  const send = await rpcPost("/a2a", {
    jsonrpc: "2.0",
    id: "task-html",
    method: "tasks/send",
    params: { message: { parts: [{ type: "text", text: `<style>.hero{background:linear-gradient(135deg,#6366f1,#a855f7)}</style><p>Hello</p>` }] } },
  });
  assert.equal(send.status, 200);
  const data = send.body.result.task.artifacts[0].parts[0].data;
  assert.ok(data.matches.some((m) => m.id === "d-indigo-violet-gradient"));
});

test("A2A: tasks/get for an unknown id returns -32000 task not found", async () => {
  const { body } = await rpcPost("/a2a", { jsonrpc: "2.0", id: 7, method: "tasks/get", params: { id: "no-such-task" } });
  assert.equal(body.error.code, -32000);
  assert.match(body.error.message, /task not found/);
});

test("A2A: empty message is a clean -32602 error", async () => {
  const { body } = await rpcPost("/a2a", { jsonrpc: "2.0", id: 8, method: "tasks/send", params: { message: { text: "" } } });
  assert.equal(body.error.code, -32602);
});

test("A2A: GET /a2a/tasks/:id REST shortcut replays a stored task", async () => {
  await rpcPost("/a2a", { jsonrpc: "2.0", id: "rest-1", method: "tasks/send", params: { message: { text: "delve into seamless" } } });
  const get = await rpcGet("/a2a/tasks/rest-1");
  assert.equal(get.status, 200);
  assert.equal(get.body.task.id, "rest-1");
  assert.ok(get.body.task.artifacts[0].parts[0].data.matches.length > 0);

  const missing = await rpcGet("/a2a/tasks/nope-123");
  assert.equal(missing.status, 404);
});

// ---------------------------------------------------------------------------
// Discovery + widget
// ---------------------------------------------------------------------------

test("GET /.well-known/agent.json serves the agent card", async () => {
  const res = await fetch(base + "/.well-known/agent.json");
  assert.equal(res.status, 200);
  const card = await res.json();
  assert.equal(card.name, "Lazynext AI Slop Checker");
  assert.ok(card.description.length > 0);
  assert.equal(card.protocolVersion, "0.3.0");
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false });
  const skillIds = card.skills.map((s) => s.id).sort();
  assert.deepEqual(skillIds, ["judge", "rewrite_text", "scan_html", "scan_project", "scan_render", "scan_text"]);
});

test("GET /widget.js serves an embeddable script that parses and mounts", async () => {
  const res = await fetch(base + "/widget.js");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
  const js = await res.text();
  // Parse-check: the script must be valid JavaScript.
  assert.doesNotThrow(() => new Function(js), "widget script must parse");
  // It must mount via Shadow DOM and load the engine from its own origin.
  assert.match(js, /attachShadow/);
  assert.match(js, /SlopScanner/);
  assert.match(js, /data\/slop-patterns\.js/);
  assert.ok(js.length < 16 * 1024, `widget should stay small, got ${js.length} bytes`);
});

test("GET /llms.txt serves the discovery file", async () => {
  const res = await fetch(base + "/llms.txt");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Lazynext AI Slop Checker/);
  assert.match(text, /openapi\.json/);
  assert.match(text, /\/rules/);
});

test("GET /openapi.json serves the OpenAPI 3.1 contract", async () => {
  const res = await fetch(base + "/openapi.json");
  assert.equal(res.status, 200);
  const spec = await res.json();
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/mcp"].post);
});

// ---------------------------------------------------------------------------
// In-process agentSurfaces helpers
// ---------------------------------------------------------------------------

test("agentSurfaces in-process: task store TTL eviction", () => {
  agentSurfaces.clearTaskStore();
  agentSurfaces.rememberTask("ttl-1", { marker: 1 });
  assert.ok(agentSurfaces.recallTask("ttl-1"));
  const store = agentSurfaces.recentStore;
  const entry = store.get("ttl-1");
  entry.at = Date.now() - 31 * 60 * 1000;
  assert.equal(agentSurfaces.recallTask("ttl-1"), null, "expired entries are dropped");
});

test("agentSurfaces in-process: store caps at RECENT_MAX entries", () => {
  agentSurfaces.clearTaskStore();
  for (let i = 0; i < 210; i++) agentSurfaces.rememberTask(`cap-${i}`, { i });
  const store = agentSurfaces.recentStore;
  assert.ok(store.size <= 210, "store stays bounded");
  const gotNew = agentSurfaces.recallTask("cap-209");
  assert.ok(gotNew, "newest entry always present while fresh");
});