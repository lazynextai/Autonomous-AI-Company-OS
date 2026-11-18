"use strict";
/**
 * A2A KV-backed recent-task store tests (v1.4.2).
 *
 * The A2A recent-task store is pluggable: the in-memory bounded store is
 * the local/unbound fallback, and a KV store (shape: put/get, like a
 * Workers KVNamespace) optionally backs it. These tests inject a mock KV
 * and verify, in-process over the real handler functions:
 *
 *   - KV write-through: tasks/send stores a2atask:{id} = the SAME view
 *     object's JSON, with the 30-min TTL captured
 *   - KV read: tasks/get + REST /a2a/tasks/:id replay an identical view
 *     from KV (deep-equal, timestamp included)
 *   - KV miss -> graceful fallback to the memory store
 *   - corrupt/invalid KV JSON -> graceful miss (memory fallback; task-not-
 *     found when the memory store misses too)
 *   - unbound path (no KV): unchanged — sync memory remember/recall and
 *     the full send->get->REST contract still work
 *
 * No network, no real KV: engines come from the exported server factory
 * (text paths only), the KV is a fake, and the module-level binding is
 * reset in afterEach so no state leaks between tests.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const agentSurfaces = require("../api/agent-surfaces.js");
const { enginesForServer } = require("../api/server.js");

const engines = enginesForServer();

/** Fake KVNamespace-shaped store: records puts (incl. TTL) and serves gets. */
function makeMockKv(seed = {}) {
  const entries = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  const writes = [];
  return {
    entries,
    writes,
    async put(key, value, options) {
      writes.push({ key, value: String(value), options });
      entries.set(key, String(value));
    },
    async get(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
  };
}

function kvKey(id) {
  return `a2atask:${String(id)}`;
}

async function a2aSend(id, text) {
  return agentSurfaces.handleA2aBody(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "message/send",
      params: { message: { parts: [{ type: "text", text }] } },
    }),
    engines
  );
}

async function a2aGet(id) {
  return agentSurfaces.handleA2aBody(
    JSON.stringify({ jsonrpc: "2.0", id: "get-" + id, method: "tasks/get", params: { id } }),
    engines
  );
}

test.afterEach(() => {
  agentSurfaces.clearKvStore();
  agentSurfaces.clearTaskStore();
});

test("A2A KV: send writes the SAME view through to KV (a2atask:{id}, 30-min TTL)", async () => {
  const kv = makeMockKv();
  agentSurfaces.setKvStore(kv);

  const send = await a2aSend("kv-write-1", "We must leverage this robust tool.");
  assert.equal(send.status, 200);
  const view = send.body.result.task;

  // Write-through: exactly one put for this task, correct key, TTL captured.
  const put = kv.writes.find((w) => w.key === kvKey("kv-write-1"));
  assert.ok(put, "a put for a2atask:kv-write-1 was recorded");
  assert.equal(put.options.expirationTtl, 30 * 60, "TTL is 30 minutes in seconds");

  // The stored value is exactly the SAME view object's JSON: parsing it
  // back must deep-equal the response task (timestamp included).
  const stored = JSON.parse(kv.entries.get(kvKey("kv-write-1")));
  assert.deepEqual(stored, view, "KV holds the identical task view");
});

test("A2A KV: tasks/get replays the identical view from KV", async () => {
  const kv = makeMockKv();
  agentSurfaces.setKvStore(kv);

  const send = await a2aSend("kv-replay-1", "delve into seamless integration");
  const view = send.body.result.task;

  // Drop the memory entry so a successful replay MUST come from KV.
  const memoryEntry = agentSurfaces.recentStore.get("kv-replay-1");
  assert.ok(memoryEntry);
  agentSurfaces.recentStore.delete("kv-replay-1");
  assert.equal(agentSurfaces.recallTask("kv-replay-1"), null, "memory store no longer holds the task");

  const get = await a2aGet("kv-replay-1");
  assert.equal(get.status, 200);
  assert.deepEqual(get.body.result.task, view, "tasks/get replays the identical view from KV");
});

test("A2A KV: REST GET /a2a/tasks/:id replays the identical view from KV", async () => {
  const kv = makeMockKv();
  agentSurfaces.setKvStore(kv);

  const send = await a2aSend("kv-rest-1", "In today's fast-paced world, leverage this");
  const view = send.body.result.task;
  agentSurfaces.recentStore.delete("kv-rest-1"); // force the KV read

  const rest = await agentSurfaces.a2aTaskGet("kv-rest-1");
  assert.equal(rest.status, 200);
  assert.deepEqual(rest.body.task, view, "REST replay is identical and KV-sourced");
});

test("A2A KV: KV miss falls back to the memory store", async () => {
  // A fresh, empty KV namespace: get() always misses.
  agentSurfaces.setKvStore(makeMockKv());

  // Memory-only write (sync path, unaffected by the binding).
  agentSurfaces.rememberTask("mem-fallback-1", { marker: "memory", n: 42 });
  const durable = await agentSurfaces.recallTaskDurable("mem-fallback-1");
  assert.deepEqual(durable, { marker: "memory", n: 42 }, "KV miss falls back to memory");

  // And end-to-end: send -> wipe KV entries -> tasks/get still replays.
  const kv = makeMockKv();
  agentSurfaces.setKvStore(kv);
  await a2aSend("mem-fallback-2", "seamless synergy");
  kv.entries.delete(kvKey("mem-fallback-2")); // simulate KV expiry/loss
  const get = await a2aGet("mem-fallback-2");
  assert.equal(get.status, 200);
  assert.equal(get.body.result.task.id, "mem-fallback-2", "memory fallback replays after KV loss");

  const missing = await a2aGet("mem-fallback-nope");
  assert.equal(missing.body.error.code, -32000);
  assert.match(missing.body.error.message, /task not found/);
});

test("A2A KV: corrupt KV JSON is a graceful miss (memory fallback; then task-not-found)", async () => {
  // Corrupt JSON for a task that IS in memory -> memory replay, no crash.
  const kv = makeMockKv({ [kvKey("corrupt-1")]: "{not valid json!!" });
  agentSurfaces.setKvStore(kv);
  agentSurfaces.rememberTask("corrupt-1", { from: "memory" });
  const durable = await agentSurfaces.recallTaskDurable("corrupt-1");
  assert.deepEqual(durable, { from: "memory" }, "corrupt KV JSON falls back to memory");

  // Corrupt JSON, nothing in memory -> the normal task-not-found error.
  const kv2 = makeMockKv({ [kvKey("corrupt-2")]: "{not valid json!!" });
  agentSurfaces.setKvStore(kv2);
  const miss = await agentSurfaces.recallTaskDurable("corrupt-2");
  assert.equal(miss, null, "corrupt KV JSON + empty memory = miss");

  // Well-formed JSON that is NOT a task view (no artifacts array) is a
  // miss too, not a crash.
  const kv3 = makeMockKv({ [kvKey("badshape-1")]: JSON.stringify({ hello: "world" }) });
  agentSurfaces.setKvStore(kv3);
  const badshape = await agentSurfaces.recallTaskDurable("badshape-1");
  assert.equal(badshape, null, "non-task-view JSON is treated as a miss");
});

test("A2A KV: KV get throwing is swallowed and falls back to memory", async () => {
  const kv = {
    entries: new Map(),
    writes: [],
    async put(key, value, options) {
      this.writes.push({ key, value, options });
    },
    async get() {
      throw new Error("kv outage");
    },
  };
  agentSurfaces.setKvStore(kv);
  agentSurfaces.rememberTask("kv-down-1", { marker: 1 });
  const got = await agentSurfaces.recallTaskDurable("kv-down-1");
  assert.deepEqual(got, { marker: 1 }, "a throwing KV read falls back to memory");
});

test("A2A unbound path unchanged: no KV -> memory store, full send->get->REST contract", async () => {
  // Explicitly no KV binding (afterEach already cleared it, be explicit).
  agentSurfaces.clearKvStore();
  assert.equal(agentSurfaces.getKvStore(), null);

  const send = await a2aSend("mem-only-1", "We must leverage this robust tool.");
  assert.equal(send.status, 200);
  const view = send.body.result.task;

  const get = await a2aGet("mem-only-1");
  assert.equal(get.status, 200);
  assert.deepEqual(get.body.result.task, view, "unbound replay is identical from memory");

  const rest = await agentSurfaces.a2aTaskGet("mem-only-1");
  assert.equal(rest.status, 200);
  assert.deepEqual(rest.body.task, view, "unbound REST replay is identical");

  assert.equal(agentSurfaces.a2aTaskGet("mem-only-nope").constructor.name, "Promise", "a2aTaskGet stays async");
  const missing = await agentSurfaces.a2aTaskGet("mem-only-nope");
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /task not found/);

  // Sync helpers keep their exact previous semantics (used by other tests).
  agentSurfaces.rememberTask("sync-1", { marker: "sync" });
  assert.deepEqual(agentSurfaces.recallTask("sync-1"), { marker: "sync" });
});