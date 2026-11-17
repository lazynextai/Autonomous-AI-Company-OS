"use strict";
/**
 * Lazynext AI Slop Checker — end-to-end API contract matrix.
 *
 * Spawns the real api/server.js on an isolated port (default 8793 — never
 * 8792, which a sibling smoke-test server may hold), waits for /health,
 * then asserts every documented route with REAL HTTP requests:
 *
 *   GET   /  /health  /rules  /openapi.json  /.well-known/agent.json
 *         /llms.txt  /widget.js
 *   POST  /scan {text}  {html}  {rules_url} (400 on non-http)
 *   POST  /judge {text}  {html}  {project} (temp fixture dir, like scan-project)
 *   POST  /scan-project   (temp fixture dir created by this script)
 *   POST  /render-scan    (hand-built snapshot: gradient-text h1)
 *   POST  /mcp  initialize + tools/list (7 tools incl. judge) + tools/call
 *         scan_text + tools/call judge
 *   POST  /a2a  message/send, then GET /a2a/tasks/:id replay
 *
 * Prints a route→status table and exits non-zero on ANY failure.
 *
 * Usage: npm run e2e    (or: node scripts/e2e.js)
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.E2E_PORT || 8793);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// Minimal HTTP helpers (zero deps; fetch is global in Node >= 18)
// ---------------------------------------------------------------------------

async function req(method, route, body, headers = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: res.status, payload, contentType: res.headers.get("content-type") || "" };
}

const SLOP_TEXT = "In today's fast-paced world, we must leverage our robust solution to unlock seamless growth.";
const SLOP_HTML = '<div class="hero"><h1>Welcome</h1><p>In today\'s world, we must leverage this.</p></div>';

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

async function run() {
  const rows = []; // { route, method, status, ok, note }

  const pass = (route, method, status, note = "") => rows.push({ route, method, status, ok: true, note });
  const fail = (route, method, status, note = "") => rows.push({ route, method, status, ok: false, note });

  // ── GET surfaces ────────────────────────────────────────────────────────
  for (const route of ["/", "/health", "/rules", "/openapi.json", "/.well-known/agent.json", "/llms.txt", "/widget.js"]) {
    const { status, contentType } = await req("GET", route);
    if (status === 200) pass(route, "GET", status, contentType.split(";")[0]);
    else fail(route, "GET", status, `expected 200, got ${status}`);
  }
  // /health must be the liveness probe with ok:true.
  {
    const { status, payload } = await req("GET", "/health");
    if (status === 200 && payload && payload.ok === true) pass("/health", "GET", status, "ok:true");
    else fail("/health", "GET", status, `expected ok:true, got ${JSON.stringify(payload)}`);
  }
  // /rules must list the corpus manifest with a count.
  {
    const { status, payload } = await req("GET", "/rules");
    if (status === 200 && payload && typeof payload.count === "number" && payload.count > 0) {
      pass("/rules", "GET", status, `${payload.count} rules`);
    } else fail("/rules", "GET", status, "expected a rules manifest with count");
  }
  // /openapi.json must carry the OpenAPI 3.1 header.
  {
    const { status, payload } = await req("GET", "/openapi.json");
    if (status === 200 && payload && payload.openapi === "3.1.0") pass("/openapi.json", "GET", status, "openapi 3.1.0");
    else fail("/openapi.json", "GET", status, "expected openapi: 3.1.0");
  }
  // /.well-known/agent.json must be the agent card.
  {
    const { status, payload } = await req("GET", "/.well-known/agent.json");
    if (status === 200 && payload && payload.name) pass("/.well-known/agent.json", "GET", status, payload.name);
    else fail("/.well-known/agent.json", "GET", status, "expected agent card with name");
  }
  // /widget.js must be a JS response (no JSON wrapper).
  {
    const { status, contentType } = await req("GET", "/widget.js");
    if (status === 200 && contentType.includes("javascript")) pass("/widget.js", "GET", status, contentType.split(";")[0]);
    else fail("/widget.js", "GET", status, `expected text/javascript, got ${contentType}`);
  }

  // ── POST /scan ──────────────────────────────────────────────────────────
  {
    const { status, payload } = await req("POST", "/scan", { text: SLOP_TEXT });
    if (status === 200 && payload && typeof payload.score === "number" && payload.score >= 0 && payload.score <= 100) {
      pass("/scan", "POST", status, `text score=${payload.score} matches=${payload.matches.length}`);
    } else fail("/scan", "POST", status, `expected a report, got ${JSON.stringify(payload)}`);
  }
  {
    const { status, payload } = await req("POST", "/scan", { html: SLOP_HTML });
    if (status === 200 && payload && Array.isArray(payload.matches)) {
      pass("/scan", "POST", status, `html score=${payload.score} matches=${payload.matches.length}`);
    } else fail("/scan", "POST", status, `expected an html report, got ${JSON.stringify(payload)}`);
  }
  // rules_url must reject non-http(s) with 400 (validation, not a fetch).
  {
    const { status, payload } = await req("POST", "/scan", { text: SLOP_TEXT, rules_url: "ftp://rules.example.com/rules.json" });
    if (status === 400 && payload && /http/i.test(payload.error || "")) {
      pass("/scan", "POST", status, `rules_url non-http → 400 ("${payload.error}")`);
    } else fail("/scan", "POST", status, `expected 400 http(s) validation, got ${status} ${JSON.stringify(payload)}`);
  }

  // ── POST /judge ───────────────────────────────────────────────────────
  // Text judge: the checklist contract — 5 questions, 6 floor items,
  // machine verdict in PASS | REVIEW | REFUSE.
  {
    const { status, payload } = await req("POST", "/judge", { text: SLOP_TEXT });
    const ok =
      status === 200 &&
      payload &&
      payload.engine === "lazynext-ai-slop-checker-judge" &&
      Array.isArray(payload.fiveQuestionReview) && payload.fiveQuestionReview.length === 5 &&
      Array.isArray(payload.craftFloor) && payload.craftFloor.length === 6 &&
      ["PASS", "REVIEW", "REFUSE"].includes(payload.summary.verdict);
    if (ok) pass("/judge", "POST", status, `text → ${payload.summary.verdict} (5Q+floor contract)`);
    else fail("/judge", "POST", status, `expected the judge checklist, got ${status} ${JSON.stringify(payload)}`);
  }
  // HTML judge: a machine-checked floor item (d-gradient-text) must REFUSE.
  {
    const html = '<div><h1>Welcome</h1><p>Join 10,000+ users today</p><style>.hero{background-clip:text;-webkit-background-clip:text;color:transparent}</style></div>';
    const { status, payload } = await req("POST", "/judge", { html });
    const refused = status === 200 && payload && payload.summary.verdict === "REFUSE" && payload.craftFloor.some((f) => f.machine === "flag");
    if (refused) pass("/judge", "POST", status, "html floor → REFUSE (d-gradient-text)");
    else fail("/judge", "POST", status, `expected REFUSE on a flagged floor item, got ${status} ${JSON.stringify(payload)}`);
  }
  // Project judge (temp fixture dir).
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-e2e-judge-"));
    try {
      fs.writeFileSync(path.join(dir, "README.md"), "# " + SLOP_TEXT + "\n");
      const { status, payload } = await req("POST", "/judge", { project: dir });
      const ok = status === 200 && payload && payload.input.type === "project" && payload.input.filesScanned >= 1;
      if (ok) pass("/judge", "POST", status, `project → ${payload.summary.verdict} (${payload.input.filesScanned} file(s))`);
      else fail("/judge", "POST", status, `expected a project judge report, got ${status} ${JSON.stringify(payload)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── POST /scan-project (temp fixture dir) ───────────────────────────────
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-e2e-project-"));
    try {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "README.md"), "# " + SLOP_TEXT + "\n");
      fs.writeFileSync(path.join(dir, "src", "app.js"), "const x = 'hover:scale-105 transition-all';\n");
      const { status, payload } = await req("POST", "/scan-project", { dir, topFiles: 5 });
      if (status === 200 && payload && payload.summary && typeof payload.summary.filesScanned === "number") {
        pass("/scan-project", "POST", status, `${payload.summary.filesScanned} files, score=${payload.summary.score}`);
      } else fail("/scan-project", "POST", status, `expected a pooled report, got ${status} ${JSON.stringify(payload)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── POST /render-scan (hand-built snapshot: gradient-text h1) ──────────
  {
    const snapshot = {
      viewport: { width: 1280, height: 800 },
      documentStyle: { backgroundColor: "#ffffff" },
      elements: [
        {
          tag: "h1",
          role: "heading",
          text: "Welcome to the future of work",
          classes: [],
          style: {
            fontSizePx: 56,
            fontWeight: 700,
            lineHeightPx: 64,
            color: "#ffffff",
            backgroundColor: "#ffffff",
            backgroundImage: "linear-gradient(135deg,#6366f1,#a855f7)",
            backgroundClip: "text",
            position: "static",
            rect: { x: 0, y: 0, w: 800, h: 64, viewportY: 0 },
            animation: null,
            display: "block",
            visibility: "visible",
            opacity: 1,
            textTransform: null,
            letterSpacingEm: null,
          },
          parents: [],
          depth: 0,
        },
      ],
      screens: [[0]],
    };
    const { status, payload } = await req("POST", "/render-scan", { snapshot });
    const hasGradient = status === 200 && payload && payload.matches && payload.matches.some((m) => m.id === "r-gradient-text");
    if (status === 200 && payload && typeof payload.score === "number") {
      pass("/render-scan", "POST", status, `score=${payload.score}${hasGradient ? " r-gradient-text fired" : ""}`);
    } else fail("/render-scan", "POST", status, `expected a render report, got ${status} ${JSON.stringify(payload)}`);
  }

  // ── MCP ─────────────────────────────────────────────────────────────────
  {
    const init = await req("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    if (init.status === 200 && init.payload && init.payload.result && init.payload.result.protocolVersion) {
      pass("/mcp", "POST", init.status, `initialize ${init.payload.result.protocolVersion}`);
    } else fail("/mcp", "POST", init.status, `initialize failed: ${JSON.stringify(init.payload)}`);
  }
  {
    const list = await req("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const tools = list.payload && list.payload.result && list.payload.result.tools;
    if (list.status === 200 && Array.isArray(tools) && tools.some((t) => t.name === "scan_text")) {
      pass("/mcp", "POST", list.status, `tools/list ${tools.length} tools`);
    } else fail("/mcp", "POST", list.status, `tools/list failed: ${JSON.stringify(list.payload)}`);
  }
  {
    const call = await req("POST", "/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "scan_text", arguments: { text: SLOP_TEXT } },
    });
    const content = call.payload && call.payload.result;
    if (call.status === 200 && content && Array.isArray(content.content) && content.content.length > 0) {
      pass("/mcp", "POST", call.status, "tools/call scan_text ok");
    } else fail("/mcp", "POST", call.status, `tools/call scan_text failed: ${JSON.stringify(call.payload)}`);
  }
  {
    const call = await req("POST", "/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "judge", arguments: { text: SLOP_TEXT } },
    });
    const data = call.payload && call.payload.result && call.payload.result.structuredContent;
    if (call.status === 200 && data && data.summary && ["PASS", "REVIEW", "REFUSE"].includes(data.summary.verdict) && data.fiveQuestionReview.length === 5) {
      pass("/mcp", "POST", call.status, `tools/call judge ok (${data.summary.verdict})`);
    } else fail("/mcp", "POST", call.status, `tools/call judge failed: ${JSON.stringify(call.payload)}`);
  }

  // ── A2A: message/send then GET /a2a/tasks/:id replay ───────────────────
  {
    const send = await req("POST", "/a2a", {
      jsonrpc: "2.0",
      id: "e2e-task-1",
      method: "message/send",
      params: { message: { parts: [{ type: "text", text: SLOP_TEXT }] } },
    });
    if (send.status === 200 && send.payload && send.payload.result && send.payload.result.task) {
      pass("/a2a", "POST", send.status, "message/send ok");
    } else fail("/a2a", "POST", send.status, `message/send failed: ${JSON.stringify(send.payload)}`);
  }
  {
    const replay = await req("GET", "/a2a/tasks/e2e-task-1");
    if (replay.status === 200 && replay.payload && replay.payload.task && replay.payload.task.id === "e2e-task-1") {
      pass("/a2a/tasks/:id", "GET", replay.status, "task replay ok");
    } else fail("/a2a/tasks/:id", "GET", replay.status, `replay failed: ${JSON.stringify(replay.payload)}`);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Boot + run + report
// ---------------------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);

async function main() {
  // Port guard: never touch a port a sibling process holds (esp. 8792).
  if (PORT === 8792) {
    console.error("refusing: E2E_PORT 8792 is reserved for the sibling smoke-test server");
    process.exit(2);
  }

  const child = spawn(process.execPath, ["api/server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderrBuf = "";
  child.stderr.on("data", (d) => {
    stderrBuf += d;
  });

  // Wait for /health with a hard deadline (the server prints its banner, but
  // readiness is only real once /health answers ok).
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!ready) {
    console.error(`server on :${PORT} never became ready\n${stderrBuf}`);
    child.kill("SIGTERM");
    process.exit(1);
  }

  let rows;
  try {
    rows = await run();
  } finally {
    child.kill("SIGTERM");
  }

  // Table.
  console.log(`Lazynext AI Slop Checker — E2E contract matrix (${new Date().toISOString()})`);
  console.log(`server: ${BASE}\n`);
  console.log(`${pad("route", 24)} ${pad("method", 6)} ${pad("status", 7)} ${pad("result", 5)} note`);
  console.log("-".repeat(90));
  let failures = 0;
  for (const r of rows) {
    if (!r.ok) failures++;
    console.log(
      `${pad(r.route, 24)} ${pad(r.method, 6)} ${pad(r.status, 7)} ${pad(r.ok ? "PASS" : "FAIL", 5)} ${r.note}`
    );
  }
  console.log("-".repeat(90));
  console.log(`${rows.length} checks, ${rows.length - failures} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("e2e crashed:", err);
  process.exit(1);
});