"use strict";
/**
 * Lazynext AI Slop Checker — Cloudflare Workers entry (drop-in alt to
 * api/server.js). Not deployed; kept dependency-light so the same scanner
 * runs on the edge.
 *
 * Deploy (documented in README.md, not executed here):
 *   cd ai-slop-checker
 *   wrangler deploy --name lazynext-ai-slop-checker
 *
 * Routes (same contract as api/server.js):
 *   GET  /            JSON descriptor
 *   GET  /health      liveness
 *   GET  /rules       corpus manifest
 *   POST /scan        { text | html | url }
 */

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const corpus = require("../data/slop-patterns.js");

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
      scan: { method: "POST", path: "/scan", body: { text: "string", html: "string", url: "http(s) URL", rewrite: "boolean (text only)" } },
      projectScan: { method: "POST", path: "/scan-project", note: "local filesystem only — not available on Workers; use the local Node server" },
    },
  };
}

async function fetchRemote(urlString) {
  const parsed = new URL(urlString);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("url must be http(s)");
  const res = await fetch(urlString, {
    signal: AbortSignal.timeout(URL_TIMEOUT_MS),
    headers: { "User-Agent": "LazynextSlopChecker/1.0 (+https://lazynext.com)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`upstream http ${res.status}`);
  const html = await res.text();
  if (html.length > 2_000_000) throw new Error("upstream document too large");
  return { html, text: extractText(html) };
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

  const { text, html, url, rewrite } = body;
  const kinds = [text !== undefined, html !== undefined, url !== undefined].filter(Boolean).length;
  if (kinds === 0) return json({ error: "provide one of: text, html, url" }, 400);
  if (kinds > 1) return json({ error: "provide exactly one of: text, html, url" }, 400);

  try {
    let report;
    let source;
    if (text !== undefined) {
      if (typeof text !== "string") return json({ error: "text must be a string" }, 400);
      report = scanText(text);
      source = { type: "text", length: text.length };
      if (rewrite === true) {
        report = { ...report, rewrite: rewriteText(text) };
      }
    } else if (html !== undefined) {
      if (typeof html !== "string") return json({ error: "html must be a string" }, 400);
      report = scanHtml(html);
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
      report = scanHtml(remote.html);
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
    return json({ error: "not found", endpoints: ["/", "/health", "/rules", "/scan"] }, 404);
  },
};