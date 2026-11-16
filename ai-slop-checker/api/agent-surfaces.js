"use strict";
/**
 * Lazynext AI Slop Checker — agent-facing surfaces.
 *
 * MCP (JSON-RPC 2.0 over POST /mcp): initialize, ping, tools/list,
 * tools/call. Tools: list_rules, scan_text, scan_html, scan_project,
 * rewrite_text. GET /mcp is 405 (this server does not offer SSE).
 *
 * A2A (lightweight): POST /a2a with JSON-RPC methods message/send,
 * tasks/send, tasks/get. The task id IS the request id; results are
 * replayed from an in-memory recent store (no KV, no files) via
 * tasks/get and the REST shortcut GET /a2a/tasks/:id.
 *
 * Discovery: GET /.well-known/agent.json (the AGENT_CARD) and widget.js
 * (WIDGET_JS, a shadow-DOM embeddable widget that runs the engine
 * in-browser).
 *
 * The JSON-RPC logic is engine-agnostic: callers (api/server.js and
 * api/worker.js) inject an `engines` object with the exact handlers they
 * can actually run, so the local server can offer scan_project while the
 * Workers entry returns a clear error for it. Zero dependencies.
 */

const { URL } = require("node:url");

const PROTOCOL_VERSION = "2025-03-26";

const MCP_TOOLS = [
  {
    name: "list_rules",
    description:
      "List the full pattern corpus (categories + every rule with id, severity, kind, match, fix). Use this to know what the scanner flags.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "scan_text",
    description:
      "Scan plain text for AI-slop writing tells. Returns score (0-100), verdict, per-category breakdown, and every match with a fix suggestion.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "plain text to scan" },
        rewrite: { type: "boolean", description: "include safe auto-rewrites (text only)" },
        profile: { type: "string", enum: ["default", "strict", "lenient"], description: "severity profile (default | strict | lenient)" },
      },
      required: ["text"],
    },
  },
  {
    name: "scan_html",
    description:
      "Scan HTML markup for AI-slop writing AND visual design tells (gradients, kickers, glassmorphism, stat rows, ...).",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "HTML document to scan" },
        profile: { type: "string", enum: ["default", "strict", "lenient"], description: "severity profile (default | strict | lenient)" },
      },
      required: ["html"],
    },
  },
  {
    name: "scan_project",
    description:
      "Scan a local directory tree (prose/markup/styles/code lenses) and return a pooled report: score, top offending files, category breakdown. Local filesystem access only.",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "path to a directory" },
        topFiles: { type: "integer", description: "how many top files to report (default 10)" },
        profile: { type: "string", enum: ["default", "strict", "lenient"], description: "severity profile (default | strict | lenient)" },
      },
      required: ["dir"],
    },
  },
  {
    name: "scan_render",
    description:
      "Run the rendered-tier design checks (r-*): kicker size, gradient text, tracked caps, glued arrows, marquee, hidden reveal, fold budget, screen word budget, section rhythm, fake progress, and WCAG contrast — all pure functions over a computed snapshot ({elements:[...]}, see src/render-checks.js). Pass an object snapshot; no browser needed.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot: { type: "object", description: "computed snapshot: { viewport?, documentStyle?, elements: [...], screens? }" },
        url: { type: "string", description: "http(s) URL to collect then check (requires the optional playwright collector)" },
        profile: { type: "string", enum: ["default", "strict", "lenient"], description: "severity profile (default | strict | lenient)" },
      },
    },
  },
  {
    name: "rewrite_text",
    description:
      "Apply conservative safe rewrites (whole-word synonym swaps and phrase deletions only) to a text. Returns the rewritten text plus the change list.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "text to rewrite" } },
      required: ["text"],
    },
  },
];

const AGENT_CARD = {
  name: "Lazynext AI Slop Checker",
  description:
    "Deterministic scanner for AI writing tells and AI-default visual design tics — text, HTML, whole-project, and rendered-snapshot scans with score, verdict, category breakdown, fixes, and safe rewrites.",
  url: "https://slop-checker.lazynext.com/a2a",
  version: "1.3.0",
  protocolVersion: "0.3.0",
  preferredTransport: "JSONRPC",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text"],
  defaultOutputModes: ["data"],
  skills: [
    { id: "scan_text", name: "Scan text", description: "Detect AI-slop writing tells in plain text and get a deterministic score with fixes.", tags: ["slop", "prose", "editor"] },
    { id: "scan_html", name: "Scan HTML", description: "Detect AI-slop writing and visual design tells in HTML markup.", tags: ["slop", "design", "html"] },
    { id: "scan_project", name: "Scan project", description: "Scan a whole directory tree for slop in prose, markup, styles, and code.", tags: ["slop", "project", "codebase"] },
    { id: "scan_render", name: "Scan rendered snapshot", description: "Run the rendered-tier design checks (r-*) over a computed snapshot — pure functions, no browser.", tags: ["slop", "design", "render", "a11y"] },
    { id: "rewrite_text", name: "Rewrite text", description: "Apply conservative safe rewrites to a text flagged by the scanner.", tags: ["rewrite", "edit"] },
  ],
};

// ── In-memory recent task store (A2A) ────────────────────────────────────
// Task id == request id; results live in process memory with a hard cap +
// TTL. The a11y sibling replays from KV; this product has no KV in the
// plain-Node server, so an in-memory recent store is the honest analogue
// for a lightweight A2A surface.
const RECENT_MAX = 200;
const RECENT_TTL_MS = 30 * 60 * 1000;
const recent = new Map(); // id -> { value, at }

function rememberTask(id, value) {
  if (recent.size >= RECENT_MAX) {
    // Evict oldest entry (Map iterates in insertion order).
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
  recent.set(String(id), { value, at: Date.now() });
}
function recallTask(id) {
  const hit = recent.get(String(id));
  if (!hit) return null;
  if (Date.now() - hit.at > RECENT_TTL_MS) {
    recent.delete(String(id));
    return null;
  }
  return hit.value;
}
function clearTaskStore() {
  recent.clear();
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcOk = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });

function toolResult(id, data) {
  return rpcOk(id, {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  });
}

/** Validate a JSON-RPC 2.0 request object. Returns a string error or null. */
function validateRpc(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return "invalid JSON-RPC 2.0 request";
  if (msg.jsonrpc !== "2.0") return "jsonrpc must be '2.0'";
  if (typeof msg.method !== "string" || msg.method.length === 0) return "method is required";
  return null;
}

// ── MCP dispatch ─────────────────────────────────────────────────────────
// engines: { scanText, scanHtml, scanProject, rewriteText, ruleManifest }
// Promise<{ status, body }> (body is the JSON-RPC envelope).
async function handleMcpMessage(msg, engines) {
  const err = validateRpc(msg);
  if (err) return { status: 400, body: rpcErr(msg && msg.id, -32600, err) };

  // Notifications carry no id — acknowledge and drop.
  if (msg.id === undefined || msg.id === null) {
    return { status: 202, body: null };
  }

  switch (msg.method) {
    case "initialize":
      return {
        status: 200,
        body: rpcOk(msg.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: "lazynext-ai-slop-checker",
            version: engines.version,
            title: "Lazynext AI Slop Checker",
          },
        }),
      };
    case "ping":
      return { status: 200, body: rpcOk(msg.id, {}) };
    case "tools/list":
      return { status: 200, body: rpcOk(msg.id, { tools: MCP_TOOLS }) };
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      if (typeof msg.params !== "object" || !msg.params || !name) {
        return { status: 200, body: rpcErr(msg.id, -32602, "tools/call requires params.name") };
      }
      if (!MCP_TOOLS.some((t) => t.name === name)) {
        return { status: 200, body: rpcErr(msg.id, -32602, `unknown tool: ${name}`) };
      }
      try {
        const data = await callTool(name, args ?? {}, engines);
        return { status: 200, body: toolResult(msg.id, data) };
      } catch (callErr) {
        return { status: 200, body: rpcErr(msg.id, -32000, `tool call failed: ${callErr.message}`) };
      }
    }
    default:
      return { status: 200, body: rpcErr(msg.id, -32601, `method not found: ${msg.method}`) };
  }
}

async function callTool(name, args, engines) {
  switch (name) {
    case "list_rules":
      return engines.ruleManifest();
    case "scan_text": {
      if (typeof args.text !== "string") throw new Error("text must be a string");
      const report = engines.scanText(args.text, args.profile !== undefined ? { profile: args.profile } : undefined);
      if (args.rewrite === true) report.rewrite = engines.rewriteText(args.text);
      return report;
    }
    case "scan_html": {
      if (typeof args.html !== "string") throw new Error("html must be a string");
      return engines.scanHtml(args.html, args.profile !== undefined ? { profile: args.profile } : undefined);
    }
    case "scan_project": {
      if (typeof args.dir !== "string" || args.dir.length === 0) throw new Error("dir must be a non-empty path");
      if (!engines.scanProject) throw new Error("project scan needs local filesystem access — not available on this entry");
      return engines.scanProject(args.dir, {
        topFiles: Number.isInteger(args.topFiles) ? Math.min(Math.max(args.topFiles, 1), 25) : 10,
        ...(args.profile !== undefined ? { profile: args.profile } : {}),
      });
    }
    case "scan_render": {
      if (!engines.renderScan) throw new Error("render scans are not available on this entry");
      const hasSnapshot = args.snapshot !== undefined;
      const hasUrl = args.url !== undefined;
      if (hasSnapshot === hasUrl) throw new Error("scan_render needs exactly one of: snapshot, url");
      const opts = args.profile !== undefined ? { profile: args.profile } : undefined;
      return engines.renderScan(hasSnapshot ? args.snapshot : args.url, opts);
    }
    case "rewrite_text": {
      if (typeof args.text !== "string") throw new Error("text must be a string");
      return engines.rewriteText(args.text);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/** Full MCP handler for a parsed body (single request or batch array). */
async function handleMcpBody(raw, engines) {
  if (raw === "") return { status: 200, body: rpcErr(null, -32700, "parse error: empty body") };
  let body;
  try {
    body = JSON.parse(raw || "null");
  } catch {
    return { status: 200, body: rpcErr(null, -32700, "parse error: invalid JSON") };
  }
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: 200, body: rpcErr(null, -32600, "invalid request: empty batch") };
    const out = [];
    for (const item of body) {
      const res = await handleMcpMessage(item, engines);
      if (res.body !== null) out.push(res.body);
    }
    return { status: 200, body: out.length ? out : null };
  }
  return handleMcpMessage(body, engines);
}

// ── A2A dispatch ─────────────────────────────────────────────────────────
function taskView(id, report) {
  return {
    id: String(id),
    status: { state: "completed", timestamp: new Date().toISOString() },
    artifacts: [
      {
        name: "slop-report",
        parts: [{ type: "data", data: report }],
      },
    ],
  };
}

function textFromMessage(message) {
  if (!message || typeof message !== "object") return "";
  const direct = message.text;
  if (typeof direct === "string") return direct;
  const parts = message.parts ?? [];
  return parts
    .map((p) => (p && (p.type === "text" || p.kind === "text") && typeof p.text === "string" ? p.text : ""))
    .join("\n");
}

async function runFromText(text, engines) {
  const trimmed = text.trim();
  const urlMatch = trimmed.match(/^https?:\/\/[^\s"'<>]+/);
  if (urlMatch) {
    if (!engines.scanUrl) throw new Error("url scans are not available on this entry");
    const remote = await engines.scanUrl(urlMatch[0]);
    return { report: remote.report, sourceNote: "url" };
  }
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed.slice(0, 5000))) {
    return { report: engines.scanHtml(trimmed), sourceNote: "html" };
  }
  return { report: engines.scanText(trimmed), sourceNote: "text" };
}

function rememberRecentTask(id, report) {
  rememberTask(id, taskView(id, report));
}

async function handleA2aMessage(msg, engines) {
  const err = validateRpc(msg);
  if (err) return { status: 400, body: rpcErr(msg && msg.id, -32600, err) };
  if (msg.id === undefined || msg.id === null) {
    // A2A tasks must be retrievable by id; a notification has none.
    return { status: 202, body: null };
  }
  switch (msg.method) {
    case "message/send":
    case "tasks/send": {
      const message = msg.params?.message ?? msg.params ?? {};
      const text = textFromMessage(message);
      if (!text.trim()) {
        return { status: 200, body: rpcErr(msg.id, -32602, "send a message containing text, HTML, or a URL to scan") };
      }
      try {
        const { report } = await runFromText(text, engines);
        rememberRecentTask(msg.id, report);
        return { status: 200, body: rpcOk(msg.id, { task: taskView(msg.id, report) }) };
      } catch (scanErr) {
        return { status: 200, body: rpcErr(msg.id, -32000, scanErr.message) };
      }
    }
    case "tasks/get": {
      const id = String(msg.params?.id ?? "");
      const task = recallTask(id);
      if (!task) return { status: 200, body: rpcErr(msg.id, -32000, `task not found: ${id}`) };
      return { status: 200, body: rpcOk(msg.id, { task }) };
    }
    default:
      return { status: 200, body: rpcErr(msg.id, -32601, `method not found: ${msg.method}`) };
  }
}

async function handleA2aBody(raw, engines) {
  let body;
  try {
    body = JSON.parse(raw || "null");
  } catch {
    return { status: 200, body: rpcErr(null, -32700, "parse error: invalid JSON") };
  }
  if (Array.isArray(body)) return { status: 200, body: rpcErr(null, -32600, "batch A2A is not supported") };
  return handleA2aMessage(body, engines);
}

/** REST shortcut: GET /a2a/tasks/:id → { task } (404 when missing/expired). */
function a2aTaskGet(id) {
  const task = recallTask(id);
  if (!task) return { status: 404, body: { error: `task not found: ${id}` } };
  return { status: 200, body: { task } };
}

// ── Embeddable widget ────────────────────────────────────────────────────
// <script src="https://<api-origin>/widget.js" data-target="#el"></script>
// mounts a slop-scan box into #el (or a fresh <div> at script position).
// Shadow DOM keeps host styles out; the engine UMD files (slop-patterns.js
// + scanner.js) are loaded on demand from the widget's own origin and the
// scan runs fully in the browser. No external dependencies.
const WIDGET_JS = `(() => {
  const me = (document.currentScript);
  const base = new URL(me.src).origin;
  const mount = me.dataset.target ? document.querySelector(me.dataset.target) : null;
  const host = mount || document.createElement('div');
  if (!mount) me.parentNode.insertBefore(host, me.nextSibling);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial;font-family:system-ui,sans-serif;font-size:14px;color:#0f172a}' +
    '.box{border:1px solid #dbe2ea;border-radius:12px;padding:14px;max-width:480px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.08)}' +
    'textarea{width:100%;box-sizing:border-box;min-height:90px;padding:8px 10px;border:1px solid #dbe2ea;border-radius:8px;font:inherit;resize:vertical}' +
    '.row{display:flex;gap:8px;margin-top:8px;align-items:center}' +
    'button{padding:8px 14px;border:0;border-radius:8px;background:#0468F8;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer}' +
    'button:disabled{opacity:.6;cursor:default}' +
    '.err{color:#b91c1c;margin-top:8px}' +
    '.score{font-size:28px;font-weight:700;margin:10px 0 6px;color:#0468F8}' +
    '.verdict{font-size:13px;color:#334155;margin-bottom:8px}' +
    'ul{padding-left:18px;margin:6px 0;max-height:200px;overflow:auto}' +
    'li{margin:3px 0}' +
    '.rule{font-family:ui-monospace,monospace;font-size:12px;color:#0468F8}' +
    '.foot{margin-top:8px;font-size:12px;color:#64748b}' +
    'a{color:#0468F8;text-decoration:none}</style>' +
    '<div class="box"><label><strong>AI slop check</strong></label>' +
    '<textarea placeholder="Paste text a model might have written..." aria-label="Text to scan for AI slop"></textarea>' +
    '<div class="row"><button>Scan for slop</button><span class="engine" style="font-size:12px;color:#64748b"></span></div>' +
    '<div class="out" aria-live="polite"></div>' +
    '<div class="foot"><a href="' + base + '" target="_blank" rel="noopener">Lazynext AI Slop Checker</a></div></div>';
  const box = root.querySelector('textarea'), btn = root.querySelector('button'), out = root.querySelector('.out'), eng = root.querySelector('.engine');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loadScript = (src) => new Promise((resolve, reject) => {
    if (window.SlopPatterns && window.SlopScanner) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  const ready = loadScript(base + '/data/slop-patterns.js')
    .then(() => loadScript(base + '/src/scanner.js'))
    .then(() => 'engine loaded');
  eng.textContent = 'engine: loading…';
  ready.then(v => eng.textContent = v).catch(e => { eng.textContent = 'engine failed: ' + e.message; });
  btn.addEventListener('click', async () => {
    const text = box.value;
    if (!text.trim()) { out.innerHTML = '<div class="err">Paste some text first.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Scanning…'; out.textContent = '';
    try {
      await ready;
      if (!window.SlopScanner) throw new Error('engine did not load');
      const r = window.SlopScanner.scanText(text);
      const color = r.clean ? '#15803d' : r.score <= 29 ? '#0a8f8f' : r.score <= 59 ? '#b27b0c' : '#c2410c';
      const cats = r.categories.slice(0, 5).map(c => esc(c.name) + ' &times;' + c.count).join(', ');
      out.innerHTML = '<div class="score" style="color:' + color + '">' + r.score + '/100 <span style="font-size:13px;color:#334155">' + esc(r.verdict) + '</span></div>' +
        '<div class="verdict">' + r.matches.length + ' tell(s) found' + (r.clean ? ' — clean' : '') + (cats ? ' · ' + cats : '') + '</div>' +
        (r.matches.length ? '<ul>' + r.matches.slice(0, 8).map(m => '<li><span class="rule">' + esc(m.id) + '</span> ' + esc(m.snippet) + '</li>').join('') + '</ul>' +
        (r.matches.length > 8 ? '<div style="font-size:12px;color:#64748b">+ ' + (r.matches.length - 8) + ' more in the full report</div>' : '') : '');
    } catch (e) { out.innerHTML = '<div class="err">Scan failed: ' + esc(e.message || e) + '</div>'; }
    finally { btn.disabled = false; btn.textContent = 'Scan for slop'; }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) btn.click(); });
})();`;

module.exports = {
  MCP_TOOLS,
  AGENT_CARD,
  WIDGET_JS,
  PROTOCOL_VERSION,
  recentStore: recent,
  handleMcpBody,
  handleMcpMessage,
  handleA2aBody,
  handleA2aMessage,
  a2aTaskGet,
  taskView,
  textFromMessage,
  rememberTask,
  recallTask,
  clearTaskStore,
  validateRpc,
};