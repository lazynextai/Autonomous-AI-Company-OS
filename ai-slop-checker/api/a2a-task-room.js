"use strict";
/**
 * Storage handler for the A2A recent-task Durable Object.
 *
 * The class itself lives in api/worker-module.mjs (workerd only). This
 * file is plain CommonJS so Node tests can drive a fake storage object.
 * One room holds every recent task (`idFromName("a2a-recent")` in
 * agent-surfaces). Puts and gets are single storage operations; the
 * Workers runtime commits the put before the caller's fetch resolves,
 * which is the cross-isolate read-your-writes this product was missing
 * from KV.
 *
 * No node:* imports — the worker bundle loads this file.
 */

const TASK_ROOM_TTL_MS = 30 * 60 * 1000;

function isStoredView(view) {
  return !!(
    view &&
    typeof view === "object" &&
    !Array.isArray(view) &&
    typeof view.id === "string" &&
    Array.isArray(view.artifacts)
  );
}

function taskIdFromPath(pathname) {
  const match = /^\/task\/([^/]+)$/.exec(pathname || "");
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * @param {{ get: Function, put: Function, delete?: Function }} storage
 * @param {Request} request
 * @param {number} [now]
 */
async function handleTaskRoomRequest(storage, request, now = Date.now()) {
  const url = new URL(request.url);
  const id = taskIdFromPath(url.pathname);
  if (!id) return new Response("not found", { status: 404 });
  const key = "task:" + id;

  if (request.method === "PUT") {
    let view;
    try {
      view = JSON.parse(await request.text());
    } catch {
      return new Response("bad json", { status: 400 });
    }
    if (!isStoredView(view)) return new Response("bad view", { status: 400 });
    await storage.put(key, { view, exp: now + TASK_ROOM_TTL_MS });
    return new Response("ok", { status: 200 });
  }

  if (request.method === "GET") {
    const row = await storage.get(key);
    if (!row || typeof row !== "object" || !isStoredView(row.view) || !(row.exp > now)) {
      if (row && typeof storage.delete === "function") {
        try {
          await storage.delete(key);
        } catch {
          /* a failed delete still misses */
        }
      }
      return new Response("missing", { status: 404 });
    }
    return new Response(JSON.stringify(row.view), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("method", { status: 405, headers: { Allow: "GET, PUT" } });
}

module.exports = {
  TASK_ROOM_TTL_MS,
  handleTaskRoomRequest,
};
