"use strict";
/**
 * A2A Durable Object room: strong consistency across two isolates.
 *
 * The room handler is the same function the worker class calls. Tests use
 * a fake storage object and a stub with fetch(), so nothing here contacts
 * Cloudflare. A lagging KV (puts invisible until flush) is the previous
 * cross-isolate gap; the shared room closes it without a flush.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const agentSurfaces = require("../api/agent-surfaces.js");
const { handleTaskRoomRequest, TASK_ROOM_TTL_MS } = require("../api/a2a-task-room.js");
const worker = require("../api/worker.js");

const ROOT = path.join(__dirname, "..");

function fakeStorage() {
  const map = new Map();
  return {
    map,
    async put(key, value) {
      map.set(key, value);
    },
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

function taskFixture(id, iso, marker) {
  return {
    id: String(id),
    status: { state: "completed", timestamp: iso },
    artifacts: [{ name: "slop-report", parts: [{ type: "data", data: { marker } }] }],
  };
}

function makeRoom() {
  const storage = fakeStorage();
  return {
    storage,
    fetch(request) {
      return handleTaskRoomRequest(storage, request);
    },
  };
}

/** KV whose puts stay invisible until flush() — the other isolate's stale read. */
function makeLagKv() {
  const visible = new Map();
  const pending = new Map();
  return {
    async put(key, value, options) {
      pending.set(key, { value: String(value), options });
    },
    async get(key) {
      return visible.has(key) ? visible.get(key) : null;
    },
    flush() {
      for (const [key, entry] of pending) visible.set(key, entry.value);
      pending.clear();
    },
  };
}

test.afterEach(() => {
  agentSurfaces.clearKvStore();
  agentSurfaces.clearDurableNamespace();
  agentSurfaces.clearTaskStore();
});

test("task room: put then get returns the same view; expired rows miss", async () => {
  const storage = fakeStorage();
  const view = taskFixture("room-1", "2026-11-21T03:00:00.000Z", "kept");
  const put = await handleTaskRoomRequest(
    storage,
    new Request("https://a2a-task-room/task/room-1", { method: "PUT", body: JSON.stringify(view) }),
    1_000
  );
  assert.equal(put.status, 200);
  const got = await handleTaskRoomRequest(storage, new Request("https://a2a-task-room/task/room-1"), 1_000);
  assert.equal(got.status, 200);
  assert.deepEqual(JSON.parse(await got.text()), view);

  const expired = await handleTaskRoomRequest(
    storage,
    new Request("https://a2a-task-room/task/room-1"),
    1_000 + TASK_ROOM_TTL_MS
  );
  assert.equal(expired.status, 404);
  assert.equal(storage.map.has("task:room-1"), false, "expired row is deleted");
});

test("task room: bad json and a non-view are 400; unknown paths are 404", async () => {
  const storage = fakeStorage();
  const bad = await handleTaskRoomRequest(
    storage,
    new Request("https://a2a-task-room/task/x", { method: "PUT", body: "{" })
  );
  assert.equal(bad.status, 400);
  const nonView = await handleTaskRoomRequest(
    storage,
    new Request("https://a2a-task-room/task/x", { method: "PUT", body: JSON.stringify({ marker: 1 }) })
  );
  assert.equal(nonView.status, 400);
  const missing = await handleTaskRoomRequest(storage, new Request("https://a2a-task-room/nope"));
  assert.equal(missing.status, 404);
});

test("A2A room: two isolates share the room while KV is still lagging", async () => {
  const room = makeRoom();
  const kv = makeLagKv();
  const workerA = agentSurfaces.createTaskStore();
  const workerB = agentSurfaces.createTaskStore();
  workerA.setDoStub(room);
  workerB.setDoStub(room);
  workerA.setKvStore(kv);
  workerB.setKvStore(kv);

  const first = taskFixture("iso-do-1", "2026-11-21T04:00:00.000Z", "first");
  await workerA.rememberTask("iso-do-1", first);

  assert.deepEqual(
    await workerB.recallTaskDurable("iso-do-1"),
    first,
    "B replays A's put from the room before KV is visible"
  );
  assert.equal(await kv.get("a2atask:iso-do-1"), null, "KV has not flushed");

  const second = taskFixture("iso-do-1", "2026-11-21T04:00:02.000Z", "second");
  await workerA.rememberTask("iso-do-1", second);
  assert.deepEqual(await workerA.recallTaskDurable("iso-do-1"), second, "A keeps its newer local view");
  assert.deepEqual(await workerB.recallTaskDurable("iso-do-1"), second, "B sees the rewrite without a KV flush");
});

test("A2A room: a dead stub falls open to memory and does not throw", async () => {
  const store = agentSurfaces.createTaskStore();
  store.setDoStub({
    fetch() {
      throw new Error("room down");
    },
  });
  const view = taskFixture("down-1", "2026-11-21T05:00:00.000Z", "local");
  await store.rememberTask("down-1", view);
  assert.deepEqual(await store.recallTaskDurable("down-1"), view);

  const other = agentSurfaces.createTaskStore();
  other.setDoStub({
    fetch() {
      throw new Error("room down");
    },
  });
  assert.equal(await other.recallTaskDurable("down-1"), null, "the other isolate cannot invent a view");
});

test("A2A room: a newer room view wins over this isolate's older memory", async () => {
  const room = makeRoom();
  const store = agentSurfaces.createTaskStore();
  store.setDoStub(room);
  const older = taskFixture("rw-do", "2026-11-21T06:00:00.000Z", "old");
  const newer = taskFixture("rw-do", "2026-11-21T06:00:05.000Z", "remote");
  await handleTaskRoomRequest(
    room.storage,
    new Request("https://a2a-task-room/task/rw-do", { method: "PUT", body: JSON.stringify(newer) })
  );
  await store.rememberTask("rw-do", older);
  // rememberTask wrote the older view through. Put the newer one back so
  // the room is ahead of this isolate's memory, as another isolate would be.
  await handleTaskRoomRequest(
    room.storage,
    new Request("https://a2a-task-room/task/rw-do", { method: "PUT", body: JSON.stringify(newer) })
  );
  assert.deepEqual(await store.recallTaskDurable("rw-do"), newer);
});

test("worker fetch: A2A_TASKS replays after this isolate's memory is cleared", async () => {
  const room = makeRoom();
  const ns = {
    idFromName(name) {
      assert.equal(name, "a2a-recent");
      return name;
    },
    get() {
      return room;
    },
  };
  const send = await worker.fetch(
    new Request("https://slop-checker.test/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "do-live-1",
        method: "tasks/send",
        params: { message: { text: "delve into seamless" } },
      }),
    }),
    { A2A_TASKS: ns }
  );
  assert.equal(send.status, 200);
  const sent = await send.json();
  assert.equal(sent.result.task.id, "do-live-1");

  agentSurfaces.clearTaskStore();
  const rest = await worker.fetch(new Request("https://slop-checker.test/a2a/tasks/do-live-1"), { A2A_TASKS: ns });
  assert.equal(rest.status, 200);
  const body = await rest.json();
  assert.deepEqual(body.task, sent.result.task);

  await worker.fetch(new Request("https://slop-checker.test/health"), {});
  assert.equal(agentSurfaces.getDoStub(), null, "a request without the binding clears the stub");
});

test("wrangler keeps ASSETS, RECENT, and the sqlite room migration", () => {
  const toml = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  assert.match(toml, /binding = "ASSETS"/);
  assert.match(toml, /binding = "RECENT"/);
  assert.match(toml, /id = "dd4afa72fb3d4b638e71119c42b0b830"/);
  assert.match(toml, /name = "A2A_TASKS"/);
  assert.match(toml, /class_name = "A2aTaskRoom"/);
  assert.match(toml, /new_sqlite_classes = \[ "A2aTaskRoom" \]/);
  const entry = fs.readFileSync(path.join(ROOT, "api/worker-module.mjs"), "utf8");
  assert.match(entry, /export class A2aTaskRoom/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
