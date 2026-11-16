"use strict";
/**
 * Lazynext AI Slop Checker — Cloudflare Workers entry (drop-in alt to
 * api/server.js). Not deployed; kept dependency-light so the same scanner
 * runs on the edge.
 *
 * Deploy (documented in README.md + docs/DEPLOYMENT.md, not executed here):
 *   cd ai-slop-checker
 *   wrangler deploy --name lazynext-ai-slop-checker
 *
 * Routes (same contract as api/server.js):
 *   GET  /                 JSON descriptor
 *   GET  /health           liveness
 *   GET  /rules            corpus manifest
 *   POST /scan             { text | html | url | rules_url }
 *   POST /scan-project     -> 400 (local filesystem only)
 *   POST /mcp              JSON-RPC 2.0 (initialize/ping/tools/list/tools/call)
 *   POST /a2a              JSON-RPC 2.0 (message/send, tasks/send, tasks/get)
 *   GET  /a2a/tasks/:id    replay a task result from the in-memory store
 *   GET  /.well-known/agent.json   agent card
 *   GET  /widget.js        embeddable in-browser widget
 *   GET  /openapi.json     OpenAPI 3.1 contract
 *   GET  /llms.txt         LLM discovery file
 */

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { loadRules } = require("../src/rules-loader.js");
const corpus = require("../data/slop-patterns.js");
const agentSurfaces = require("./agent-surfaces.js");

const version = corpus.version;
const MAX_BODY_BYTES = 1_000_000;
const URL_TIMEOUT_MS = 10000;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
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
      "Deterministic scanner for AI writing tells and AI-default visual design tics, " +
      "inspired by no-ai-slop, stop-slop, impeccable, hallmark and kill-ai-slop.",
    version,
    company: "UNITED GLOBAL VENTURES PRIVATE LIMITED (Lazynext)",
    contact: "support@lazynext.com",
    endpoints: {
      health: { method: "GET", path: "/health" },
      rules: { method: "GET", path: "/rules" },
      scan: { method: "POST", path: "/scan", body: { text: "string", html: "string", url: "http(s) URL", rewrite: "boolean (text only)", rules_url: "http(s) URL to a JSON custom-rules file" } },
      projectScan: { method: "POST", path: "/scan-project", note: "local filesystem only — not available on Workers; use the local Node server" },
      mcp: { method: "POST", path: "/mcp", note: "JSON-RPC 2.0 (initialize/ping/tools/list/tools/call); GET is 405 (no SSE)" },
      a2a: { method: "POST", path: "/a2a", note: "JSON-RPC 2.0 (message/send, tasks/send, tasks/get); GET /a2a/tasks/:id replays" },
      agentCard: { method: "GET", path: "/.well-known/agent.json" },
      widget: { method: "GET", path: "/widget.js" },
      openapi: { method: "GET", path: "/openapi.json" },
      llms: { method: "GET", path: "/llms.txt" },
    },
  };
}

async function fetchRemote(urlString, opts = {}) {
  const parsed = new URL(urlString);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("url must be http(s)");
  const res = await fetch(urlString, {
    signal: AbortSignal.timeout(URL_TIMEOUT_MS),
    headers: { "User-Agent": "LazynextSlopChecker/1.2 (+https://lazynext.com)", Accept: opts.jsonOnly ? "application/json,text/json,text/plain" : "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`upstream http ${res.status}`);
  const html = await res.text();
  if (html.length > 2_000_000) throw new Error("upstream document too large");
  return opts.jsonOnly ? { html } : { html, text: extractText(html) };
}

/**
 * Engines object for the JSON-RPC handlers. On Workers, scan_project is
 * unavailable (no local filesystem) and returns a clear tool error; the
 * tool still exists so clients get a clean message instead of a 404.
 */
function enginesForWorker() {
  return {
    version,
    scanText,
    scanHtml,
    rewriteText,
    ruleManifest,
    scanUrl: async (urlString) => {
      const remote = await fetchRemote(urlString);
      return { report: scanHtml(remote.html), remote };
    },
  };
}

async function handleScan(req) {
  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
    if (raw) body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { text, html, url, rewrite, rules_url } = body;
  const kinds = [text !== undefined, html !== undefined, url !== undefined].filter(Boolean).length;
  if (kinds === 0) return json({ error: "provide one of: text, html, url" }, 400);
  if (kinds > 1) return json({ error: "provide exactly one of: text, html, url" }, 400);

  let engine = { scanText, scanHtml, rewriteText, ruleManifest, version };
  if (rules_url !== undefined) {
    if (typeof rules_url !== "string" || !/^https?:\/\//i.test(rules_url)) {
      return json({ error: "rules_url must be an http(s) URL serving a JSON rules file" }, 400);
    }
    let remote;
    try {
      remote = await fetchRemote(rules_url, { jsonOnly: true });
    } catch (err) {
      return json({ error: `could not fetch rules_url: ${err.message}` }, 502);
    }
    let payload;
    try {
      payload = JSON.parse(remote.html);
    } catch {
      return json({ error: "rules_url must serve valid JSON (array or {patterns})" }, 400);
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
        }),
      };
    } catch (err) {
      return json({ error: `rules_url rules invalid: ${err.message}` }, 400);
    }
  }

  try {
    let report;
    let source;
    if (text !== undefined) {
      if (typeof text !== "string") return json({ error: "text must be a string" }, 400);
      report = engine.scanText(text);
      source = { type: "text", length: text.length };
      if (rewrite === true) {
        report = { ...report, rewrite: engine.rewriteText(text) };
      }
    } else if (html !== undefined) {
      if (typeof html !== "string") return json({ error: "html must be a string" }, 400);
      report = engine.scanHtml(html);
      source = { type: "html", length: html.length };
    } else {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
        return json({ error: "url must be an http(s) URL" }, 400);
      }
      let remote;
      try {
        remote = await fetchRemote(url);
      } catch (err) {
        return json({ error: `could not fetch url: ${err.message}` }, 502);
      }
      report = engine.scanHtml(remote.html);
      source = { type: "url", url };
    }
    return json({ ...report, source });
  } catch (err) {
    return json({ error: `scan failed: ${err.message}` }, 500);
  }
}

module.exports = {
  version,
  fetch: async (req, env, ctx) => {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/") return json(serviceDescriptor());
    if (req.method === "GET" && pathname === "/health") return json({ ok: true, engine: "lazynext-ai-slop-checker", version });
    if (req.method === "GET" && pathname === "/rules") return json(ruleManifest());
    if (req.method === "POST" && pathname === "/scan") return handleScan(req);
    if (req.method === "POST" && pathname === "/scan-project") {
      return json({ error: "project scan needs local filesystem access — run the local Node server (node api/server.js) instead" }, 400);
    }

    // ── Agent surfaces ────────────────────────────────────────────────
    if (pathname === "/mcp") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required — this endpoint does not offer SSE" } }), { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } });
      }
      try {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
        const out = await agentSurfaces.handleMcpBody(raw, enginesForWorker());
        if (out.body === null) return new Response(null, { status: 202 });
        return json(out.body, out.status);
      } catch (err) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `parse error: ${err.message}` } }, 400);
      }
    }
    if (pathname === "/a2a") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required" } }), { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } });
      }
      try {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
        const out = await agentSurfaces.handleA2aBody(raw, enginesForWorker());
        if (out.body === null) return new Response(null, { status: 202 });
        return json(out.body, out.status);
      } catch (err) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `parse error: ${err.message}` } }, 400);
      }
    }
    const a2aTaskMatch = pathname.match(/^\/a2a\/tasks\/([^/]+)$/);
    if (req.method === "GET" && a2aTaskMatch) {
      const out = agentSurfaces.a2aTaskGet(a2aTaskMatch[1]);
      return json(out.body, out.status);
    }
    if (req.method === "GET" && pathname === "/.well-known/agent.json") return json(agentSurfaces.AGENT_CARD);
    if (req.method === "GET" && pathname === "/widget.js") {
      return new Response(agentSurfaces.WIDGET_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }
    if (req.method === "GET" && pathname === "/llms.txt") {
      const { readFileSync } = require("node:fs");
      const path = require("node:path");
      try {
        const content = readFileSync(path.join(__dirname, "..", "llms.txt"), "utf8");
        return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      } catch {
        return json({ error: "not found" }, 404);
      }
    }
    if (req.method === "GET" && pathname === "/openapi.json") {
      const { readFileSync } = require("node:fs");
      const path = require("node:path");
      try {
        const content = readFileSync(path.join(__dirname, "openapi.json"), "utf8");
        return new Response(content, { headers: { "Content-Type": "application/json; charset=utf-8" } });
      } catch {
        return json({ error: "not found" }, 404);
      }
    }

    return json({ error: "not found", endpoints: ["/", "/health", "/rules", "/scan", "/scan-project", "/mcp", "/a2a", "/.well-known/agent.json", "/widget.js", "/openapi.json", "/llms.txt"] }, 404);
  },
};