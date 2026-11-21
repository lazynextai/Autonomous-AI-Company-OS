import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { Lazynext } from "./index.js";

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      resolve(raw ? JSON.parse(raw) : null);
    });
    req.on("error", reject);
  });
}

test("joinWaitlist returns the success body", async () => {
  let seen;
  const srv = await listen(async (req, res) => {
    seen = { method: req.method, url: req.url, auth: req.headers.authorization, body: await readBody(req) };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, seq_sent: false }));
  });
  try {
    const client = new Lazynext({ baseUrl: srv.baseUrl });
    const out = await client.joinWaitlist("a@b.co");
    assert.deepEqual(out, { ok: true, seq_sent: false });
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/api/v1/waitlist");
    assert.equal(seen.auth, undefined);
    assert.equal(seen.body.email, "a@b.co");
  } finally {
    await srv.close();
  }
});

test("searchKnowledge returns the result list and createTask sends criteria", async () => {
  const hits = [];
  const srv = await listen(async (req, res) => {
    const body = await readBody(req);
    hits.push({ url: req.url, body, mcp: req.headers["mcp-protocol-version"] });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/knowledge/search") {
      res.end(JSON.stringify({ results: [{ filename: "a.md", content: "hello" }] }));
      return;
    }
    if (req.url === "/api/v1/tasks") {
      res.end(JSON.stringify({ task_id: "t1", channel: "cto.tasks", message_id: "m1" }));
      return;
    }
    if (req.url === "/mcp") {
      const method = body.method;
      const result = method === "tools/list"
        ? { tools: [{ name: "company_status" }] }
        : { content: [{ type: "text", text: "ok" }] };
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  try {
    const client = new Lazynext({ apiKey: "lzk_test", baseUrl: srv.baseUrl });
    const rows = await client.searchKnowledge("hello", 2, [0.1, 0.2]);
    assert.equal(Array.isArray(rows), true);
    assert.equal(rows[0].filename, "a.md");
    assert.deepEqual(hits[0].body, { query: "hello", topK: 2, vector: [0.1, 0.2] });

    const task = await client.createTask("ship the fix", {
      channel: "cto.tasks",
      priority: 1,
      acceptanceCriteria: ["tests pass"],
    });
    assert.equal(task.task_id, "t1");
    assert.deepEqual(hits[1].body.acceptance_criteria, ["tests pass"]);

    const tools = await client.mcpTools();
    assert.equal(tools[0].name, "company_status");
    assert.equal(hits[2].mcp, "2026-07-28");
    const result = await client.mcpToolCall("company_status", {});
    assert.equal(result.content[0].text, "ok");
    assert.equal(hits[3].mcp, "2026-07-28");
  } finally {
    await srv.close();
  }
});

test("searchKnowledge rejects an envelope with no results list", async () => {
  const srv = await listen(async (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const client = new Lazynext({ baseUrl: srv.baseUrl });
    await assert.rejects(() => client.searchKnowledge("x"), /missing results/);
  } finally {
    await srv.close();
  }
});
