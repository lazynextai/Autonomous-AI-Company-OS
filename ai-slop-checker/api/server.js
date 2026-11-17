"use strict";
/**
 * Lazynext AI Slop Checker — plain Node HTTP API (zero dependencies).
 *
 * Routes:
 *   GET  /            JSON service descriptor
 *   GET  /health      liveness probe
 *   GET  /rules       JSON manifest of the full pattern corpus
 *   POST /scan        { text | html | url } -> scan report
 *   POST /judge       { text | html | project? } -> judgement checklist report
 *   GET  /            serves ../web/index.html when the web/ dir exists
 *
 * URL scanning: fetches the target with a 10s timeout, extracts visible text
 * and raw HTML, and runs both scanners.
 *
 * Run:  node api/server.js            (default port 8787)
 *        PORT=3000 node api/server.js
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { scanProject } = require("../src/project-scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { loadRules } = require("../src/rules-loader.js");
const corpus = require("../data/slop-patterns.js");
const agentSurfaces = require("./agent-surfaces.js");

const PORT = Number(process.env.PORT || 8787);
const WEB_DIR = path.join(__dirname, "..", "web");
const PRODUCT_ROOT = path.join(__dirname, "..");
const URL_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 1_000_000;
const RULES_URL_TIMEOUT_MS = 10000;

const version = corpus.version;

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function notFound(res) {
  json(res, 404, { error: "not found", endpoints: ["/", "/health", "/rules", "/scan", "/judge", "/scan-project", "/render-scan", "/mcp", "/a2a", "/.well-known/agent.json", "/widget.js", "/openapi.json", "/llms.txt"] });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error("body too large (limit 1MB)"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Fetch a URL with a hard timeout. Returns { text, html } where text is the
 * visible text and html the raw response body. With { jsonOnly: true } the
 * content-type check requires JSON (used for rules_url) and no HTML
 * extraction happens.
 */
async function fetchRemote(urlString, opts = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("invalid url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("url must be http(s)");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);
  try {
    const res = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        // Real UA: Cloudflare and many sites reject bare script UAs.
        "User-Agent": "LazynextSlopChecker/1.2 (+https://lazynext.com)",
        Accept: opts.jsonOnly ? "application/json,text/json,text/plain" : "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`upstream http ${res.status}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (opts.jsonOnly) {
      if (!contentType.includes("json") && !contentType.startsWith("text/")) {
        throw new Error(`unsupported content-type: ${contentType}`);
      }
    } else if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.startsWith("text/")) {
      throw new Error(`unsupported content-type: ${contentType}`);
    }
    const html = await res.text();
    if (html.length > 2_000_000) {
      throw new Error("upstream document too large (limit 2MB)");
    }
    return opts.jsonOnly ? { html, url: urlString } : { html, text: extractText(html), url: urlString };
  } finally {
    clearTimeout(timer);
  }
}

function ruleManifest() {
  return {
    engine: "lazynext-ai-slop-checker",
    version,
    count: corpus.patterns.length,
    categories: corpus.categories.map((c) => ({ id: c.id, name: c.name, desc: c.desc })),
    rules: corpus.patterns.map((p) => ({
      id: p.id,
      category: p.category,
      severity: p.severity,
      kind: p.kind,
      match: p.match,
      desc: p.desc,
      fix: p.fix,
    })),
  };
}

function serviceDescriptor() {
  return {
    name: "Lazynext AI Slop Checker",
    description:
      "Deterministic scanner for AI writing tells and AI-default visual design tics. " +
      "Inspired by no-ai-slop, stop-slop, impeccable, hallmark and kill-ai-slop (see ATTRIBUTIONS.md).",
    version,
    company: "UNITED GLOBAL VENTURES PRIVATE LIMITED (Lazynext)",
    contact: "support@lazynext.com",
    endpoints: {
      health: { method: "GET", path: "/health" },
      rules: { method: "GET", path: "/rules" },
      scan: {
        method: "POST",
        path: "/scan",
        body: {
          text: "plain text to scan",
          html: "HTML document to scan (text + design tells)",
          url: "URL to fetch and scan (10s timeout)",
          rewrite: "optional boolean: include auto-rewrite suggestions",
        },
      },
      judge: {
        method: "POST",
        path: "/judge",
        body: {
          text: "plain text to judge",
          html: "HTML document to judge",
          project: "directory path to judge (local filesystem)",
        },
        note: "exactly one of text | html | project. Returns the 5-question review, craft-floor gate, refusal scaffolds, and a machine-computed PASS | REVIEW | REFUSE verdict.",
      },
      projectScan: {
        method: "POST",
        path: "/scan-project",
        body: {
          dir: "path to a directory tree (prose/markup/styles/code) to scan",
          topFiles: "optional integer: how many top files to report (default 10)",
          profile: 'optional severity profile: "default" | "strict" | "lenient"',
        },
        note: "local filesystem access; not available on the Cloudflare Workers entry",
      },
      renderScan: {
        method: "POST",
        path: "/render-scan",
        body: {
          snapshot: "a computed snapshot object ({ elements: [...] }) — pure rendered-tier checks, no browser",
          url: "an http(s) URL to collect then check (requires the optional playwright collector)",
          profile: 'optional severity profile: "default" | "strict" | "lenient"',
        },
        note: 'exactly one of snapshot | url. The checks are pure; only {url} needs `npm i -D playwright` (501 when absent)',
      },
      mcp: {
        method: "POST",
        path: "/mcp",
        body: "JSON-RPC 2.0: initialize | ping | tools/list | tools/call",
        note: "tools: list_rules, scan_text, scan_html, scan_project, scan_render, rewrite_text, judge; GET is 405 (no SSE)",
      },
      a2a: {
        method: "POST",
        path: "/a2a",
        body: "JSON-RPC 2.0: message/send | tasks/send | tasks/get",
        note: "task id == request id; GET /a2a/tasks/:id replays a task",
      },
      agentCard: { method: "GET", path: "/.well-known/agent.json" },
      widget: { method: "GET", path: "/widget.js", note: "shadow-DOM embeddable widget (in-browser engine)" },
      openapi: { method: "GET", path: "/openapi.json" },
      llms: { method: "GET", path: "/llms.txt" },
    },
    scoring: {
      range: "0 (clean) to 100 (maximal slop)",
      cleanThreshold: 9,
      verdicts: ["clean", "light", "moderate", "heavy"],
      profiles: [
        { id: "default", cleanThreshold: 9, note: "all severities count (current behaviour)" },
        { id: "strict", cleanThreshold: 6, note: "warn-class findings count harder (×1.5), lower clean bar" },
        { id: "lenient", cleanThreshold: 14, note: "ignores severity-1 (warn-class) findings, higher clean bar" },
      ],
    },
  };
}

async function handleScan(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return json(res, 413, { error: err.message });
  }

  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }

  const { text, html, url, rewrite, rules_url, profile } = body;
  const kinds = [text !== undefined, html !== undefined, url !== undefined].filter(Boolean).length;

  if (kinds === 0) {
    return json(res, 400, { error: "provide one of: text, html, url" });
  }
  if (kinds > 1) {
    return json(res, 400, { error: "provide exactly one of: text, html, url" });
  }
  const scanOpts = profile !== undefined && profile !== null ? { profile } : undefined;

  // External rules: fetch a JSON custom-rules file (http(s) only, 10s
  // timeout) and deep-merge it via the same loader the CLI uses. JSON is
  // the only accepted format over the network — remote JS execution is
  // deliberately not offered (see docs/DEPLOYMENT.md).
  let engine = { scanText, scanHtml, scanProject, rewriteText, ruleManifest, version };
  if (rules_url !== undefined) {
    if (typeof rules_url !== "string" || !/^https?:\/\//i.test(rules_url)) {
      return json(res, 400, { error: "rules_url must be an http(s) URL serving a JSON rules file" });
    }
    let remote;
    try {
      remote = await fetchRemote(rules_url, { jsonOnly: true });
    } catch (err) {
      return json(res, 502, { error: `could not fetch rules_url: ${err.message}` });
    }
    let payload;
    try {
      payload = JSON.parse(remote.html);
    } catch {
      return json(res, 400, { error: "rules_url must serve valid JSON (array or {patterns})" });
    }
    try {
      const merged = loadRules(payload);
      const scanner = require("../src/scanner.js").createEngine(merged);
      const rewriter = require("../src/rewriter.js").createRewriter(merged, scanner);
      engine = {
        ...scanner,
        rewriteText: rewriter.rewriteText,
        ruleManifest: () => ({
        engine: "lazynext-ai-slop-checker",
        version: merged.version,
        count: merged.patterns.length,
        categories: merged.categories.map((c) => ({ id: c.id, name: c.name, desc: c.desc })),
        rules: merged.patterns.map((p) => ({
          id: p.id,
          category: p.category,
          severity: p.severity,
          kind: p.kind,
          match: p.match,
          desc: p.desc,
          fix: p.fix,
        })),
      }) };
    } catch (err) {
      return json(res, 400, { error: `rules_url rules invalid: ${err.message}` });
    }
  }

  try {
    let report;
    let source = null;

    if (text !== undefined) {
      if (typeof text !== "string") return json(res, 400, { error: "text must be a string" });
      report = engine.scanText(text, scanOpts);
      source = { type: "text", length: text.length };
    } else if (html !== undefined) {
      if (typeof html !== "string") return json(res, 400, { error: "html must be a string" });
      report = engine.scanHtml(html, scanOpts);
      source = { type: "html", length: html.length };
    } else {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
        return json(res, 400, { error: "url must be an http(s) URL" });
      }
      let remote;
      try {
        remote = await fetchRemote(url);
      } catch (err) {
        return json(res, 502, { error: `could not fetch url: ${err.message}` });
      }
      report = engine.scanHtml(remote.html, scanOpts);
      source = { type: "url", url, ...remote };
    }

    const payload = { ...report, source };

    if (rewrite === true && source.type === "text") {
      const result = engine.rewriteText(text);
      payload.rewrite = result;
    }

    return json(res, 200, payload);
  } catch (err) {
    return json(res, 500, { error: `scan failed: ${err.message}` });
  }
}

async function handleJudge(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return json(res, 413, { error: err.message });
  }
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }

  const { text, html, project } = body;
  const kinds = [text !== undefined, html !== undefined, project !== undefined].filter(Boolean).length;
  if (kinds === 0) {
    return json(res, 400, { error: "provide one of: text, html, project" });
  }
  if (kinds > 1) {
    return json(res, 400, { error: "provide exactly one of: text, html, project" });
  }
  if (text !== undefined && typeof text !== "string") {
    return json(res, 400, { error: "text must be a string" });
  }
  if (html !== undefined && typeof html !== "string") {
    return json(res, 400, { error: "html must be a string" });
  }
  if (project !== undefined && (typeof project !== "string" || project.length === 0)) {
    return json(res, 400, { error: "project must be a non-empty directory path" });
  }

  try {
    const { judgeReport } = require("../src/judge.js");
    const report = judgeReport({ text, html, project });
    return json(res, 200, report);
  } catch (err) {
    return json(res, 400, { error: `judge failed: ${err.message}` });
  }
}

async function handleScanProject(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return json(res, 413, { error: err.message });
  }
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  const { dir, topFiles, profile } = body;
  if (typeof dir !== "string" || dir.length === 0) {
    return json(res, 400, { error: "provide a directory path in 'dir'" });
  }
  try {
    const project = scanProject(dir, {
      topFiles: Number.isInteger(topFiles) ? Math.min(Math.max(topFiles, 1), 25) : 10,
      ...(profile !== undefined && profile !== null ? { profile } : {}),
    });
    return json(res, 200, project);
  } catch (err) {
    return json(res, 400, { error: `could not scan project: ${err.message}` });
  }
}

async function handleRenderScan(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return json(res, 413, { error: err.message });
  }
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }

  const { snapshot, url, profile } = body;
  const hasSnapshot = snapshot !== undefined;
  const hasUrl = url !== undefined;
  if (hasSnapshot === hasUrl) {
    return json(res, 400, { error: "provide exactly one of: snapshot, url" });
  }

  const { scanRender } = require("../src/render-checks.js");
  const opts = profile !== undefined && profile !== null ? { profile } : {};

  try {
    if (hasSnapshot) {
      if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.elements)) {
        return json(res, 400, { error: "snapshot must be an object with an elements array (see src/render-checks.js)" });
      }
      const report = scanRender(snapshot, opts);
      return json(res, 200, { ...report, source: { type: "render-snapshot" } });
    }
    // URL: use the optional playwright collector (clear 501 when absent).
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return json(res, 400, { error: "url must be an http(s) URL" });
    }
    let collector;
    try {
      collector = require("../src/collect-render.js");
    } catch {
      return json(res, 500, { error: "collector module missing" });
    }
    if (!collector.isCollectorAvailable()) {
      return json(res, 501, { error: collector.OPT_IN_MSG });
    }
    const collected = await collector.collectRender(url);
    const report = scanRender(collected, opts);
    return json(res, 200, { ...report, source: { type: "render-url", url, collected: { elements: collected.elements.length } } });
  } catch (err) {
    return json(res, 400, { error: `render scan failed: ${err.message}` });
  }
}

function serveFile(res, absFile) {
  fs.readFile(absFile, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(absFile).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function resolveStatic(pathname) {
  // web/ assets are the primary static root.
  const rel = pathname.replace(/^\/+/, "").replace(/^(\.\.[/\\])+/, "");
  const webFile = path.join(WEB_DIR, rel);
  if (webFile.startsWith(WEB_DIR) && fs.existsSync(webFile)) return webFile;
  // Allow the checker page to load the engine and brand assets from the
  // product tree via relative paths (../data, ../src, ../assets), which the
  // WHATWG URL parser normalises (/data/..., /src/..., /assets/...).
  if (pathname.startsWith("/data/") || pathname.startsWith("/src/") || pathname.startsWith("/assets/")) {
    return path.join(PRODUCT_ROOT, rel);
  }
  return null;
}

/**
 * The engines object injected into the JSON-RPC handlers. The local server
 * can offer everything; the Workers entry passes a subset (no scanProject,
 * no url fetch via this route — it has its own fetchRemote).
 */
function enginesForServer() {
  return {
    version,
    scanText,
    scanHtml,
    scanProject: (dir, opts) => scanProject(dir, opts),
    rewriteText,
    ruleManifest,
    renderScan: (snapshotOrUrl, opts) => {
      const { scanRender } = require("../src/render-checks.js");
      if (snapshotOrUrl && typeof snapshotOrUrl === "object") return scanRender(snapshotOrUrl, opts);
      const { collectRender, isCollectorAvailable, OPT_IN_MSG } = require("../src/collect-render.js");
      if (!isCollectorAvailable()) throw new Error(OPT_IN_MSG);
      return collectRender(String(snapshotOrUrl)).then((snap) => scanRender(snap, opts));
    },
    judge: (input) => {
      const { judgeReport } = require("../src/judge.js");
      return judgeReport(input);
    },
    scanUrl: async (urlString) => {
      const remote = await fetchRemote(urlString);
      return { report: scanHtml(remote.html), remote };
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      // Serve the web checker if present; otherwise the JSON descriptor.
      if (fs.existsSync(path.join(WEB_DIR, "index.html"))) {
        return serveFile(res, path.join(WEB_DIR, "index.html"));
      }
      return json(res, 200, serviceDescriptor());
    }
    if (req.method === "GET" && pathname === "/health") {
      return json(res, 200, { ok: true, engine: "lazynext-ai-slop-checker", version });
    }
    if (req.method === "GET" && pathname === "/rules") {
      return json(res, 200, ruleManifest());
    }
    if (req.method === "POST" && pathname === "/scan") {
      return handleScan(req, res);
    }
    if (req.method === "POST" && pathname === "/judge") {
      return handleJudge(req, res);
    }
    if (req.method === "POST" && pathname === "/scan-project") {
      return handleScanProject(req, res);
    }
    if (req.method === "POST" && pathname === "/render-scan") {
      return handleRenderScan(req, res);
    }

    // ── Agent surfaces ────────────────────────────────────────────────
    if (pathname === "/mcp") {
      if (req.method === "GET" || req.method === "HEAD") {
        // No SSE stream is offered: GET is 405 per the MCP spec subset.
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "POST" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required — this endpoint does not offer SSE" } }));
      }
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "POST" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required" } }));
      }
      let raw;
      try {
        raw = await readBody(req);
      } catch (err) {
        return json(res, 413, { error: err.message });
      }
      const out = await agentSurfaces.handleMcpBody(raw, enginesForServer());
      if (out.body === null) return res.writeHead(202).end();
      return json(res, out.status, out.body);
    }
    if (pathname === "/a2a") {
      if (req.method === "GET" || req.method === "HEAD") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "POST" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required" } }));
      }
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "POST" });
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required" } }));
      }
      let raw;
      try {
        raw = await readBody(req);
      } catch (err) {
        return json(res, 413, { error: err.message });
      }
      const out = await agentSurfaces.handleA2aBody(raw, enginesForServer());
      if (out.body === null) return res.writeHead(202).end();
      return json(res, out.status, out.body);
    }
    const a2aTaskMatch = pathname.match(/^\/a2a\/tasks\/([^/]+)$/);
    if (req.method === "GET" && a2aTaskMatch) {
      const out = agentSurfaces.a2aTaskGet(a2aTaskMatch[1]);
      return json(res, out.status, out.body);
    }
    if (req.method === "GET" && pathname === "/.well-known/agent.json") {
      return json(res, 200, agentSurfaces.AGENT_CARD);
    }
    if (req.method === "GET" && pathname === "/widget.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      return res.end(agentSurfaces.WIDGET_JS);
    }
    if (req.method === "GET" && pathname === "/openapi.json") {
      const abs = path.join(PRODUCT_ROOT, "api", "openapi.json");
      if (fs.existsSync(abs)) return serveFile(res, abs);
      return notFound(res);
    }
    if (req.method === "GET" && pathname === "/llms.txt") {
      const abs = path.join(PRODUCT_ROOT, "llms.txt");
      if (fs.existsSync(abs)) return serveFile(res, abs);
      return notFound(res);
    }

    if (req.method === "GET") {
      const abs = resolveStatic(pathname);
      if (abs) return serveFile(res, abs);
    }
    return notFound(res);
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

// Only auto-start when run directly (`node api/server.js`); tests import the
// server and listen on their own ephemeral port.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Lazynext AI Slop Checker API listening on http://localhost:${PORT}`);
    console.log(`  GET  /                       service descriptor (or web checker if web/ exists)`);
    console.log(`  GET  /health                 liveness`);
    console.log(`  GET  /rules                  pattern corpus manifest`);
    console.log(`  POST /scan                   { text | html | url | rules_url }`);
    console.log(`  POST /judge                  { text | html | project } (judgement checklist)`);
    console.log(`  POST /scan-project           { dir, topFiles } (local filesystem)`);
    console.log(`  POST /render-scan           { snapshot | url } (rendered-tier checks; url needs playwright)`);
    console.log(`  POST /mcp                    JSON-RPC 2.0 (initialize/tools/list/tools/call)`);
    console.log(`  POST /a2a                    JSON-RPC 2.0 (message/send, tasks/send, tasks/get)`);
    console.log(`  GET  /a2a/tasks/:id          replay a task result`);
    console.log(`  GET  /.well-known/agent.json agent card`);
    console.log(`  GET  /widget.js              embeddable in-browser widget`);
    console.log(`  GET  /openapi.json           OpenAPI 3.1 contract`);
    console.log(`  GET  /llms.txt               LLM discovery file`);
  });
}

module.exports = { server, handleScan, handleJudge, handleScanProject, handleRenderScan, ruleManifest, serviceDescriptor, fetchRemote, extractText, enginesForServer };