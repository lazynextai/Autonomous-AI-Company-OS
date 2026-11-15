"use strict";
/**
 * Lazynext AI Slop Checker — plain Node HTTP API (zero dependencies).
 *
 * Routes:
 *   GET  /            JSON service descriptor
 *   GET  /health      liveness probe
 *   GET  /rules       JSON manifest of the full pattern corpus
 *   POST /scan        { text | html | url } -> scan report
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
const { rewriteText } = require("../src/rewriter.js");
const corpus = require("../data/slop-patterns.js");

const PORT = Number(process.env.PORT || 8787);
const WEB_DIR = path.join(__dirname, "..", "web");
const URL_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 1_000_000;

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
  json(res, 404, { error: "not found", endpoints: ["/", "/health", "/rules", "/scan"] });
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
 * visible text and html the raw response body.
 */
async function fetchRemote(urlString) {
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
        "User-Agent": "LazynextSlopChecker/1.0 (+https://lazynext.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`upstream http ${res.status}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.startsWith("text/")) {
      throw new Error(`unsupported content-type: ${contentType}`);
    }
    const html = await res.text();
    if (html.length > 2_000_000) {
      throw new Error("upstream document too large (limit 2MB)");
    }
    return { html, text: extractText(html), url: urlString };
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
    },
    scoring: {
      range: "0 (clean) to 100 (maximal slop)",
      cleanThreshold: 9,
      verdicts: ["clean", "light", "moderate", "heavy"],
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

  const { text, html, url, rewrite } = body;
  const kinds = [text !== undefined, html !== undefined, url !== undefined].filter(Boolean).length;

  if (kinds === 0) {
    return json(res, 400, { error: "provide one of: text, html, url" });
  }
  if (kinds > 1) {
    return json(res, 400, { error: "provide exactly one of: text, html, url" });
  }

  try {
    let report;
    let source = null;

    if (text !== undefined) {
      if (typeof text !== "string") return json(res, 400, { error: "text must be a string" });
      report = scanText(text);
      source = { type: "text", length: text.length };
    } else if (html !== undefined) {
      if (typeof html !== "string") return json(res, 400, { error: "html must be a string" });
      report = scanHtml(html);
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
      report = scanHtml(remote.html);
      source = { type: "url", url, ...remote };
    }

    const payload = { ...report, source };

    if (rewrite === true && source.type === "text") {
      const result = rewriteText(text);
      payload.rewrite = result;
    }

    return json(res, 200, payload);
  } catch (err) {
    return json(res, 500, { error: `scan failed: ${err.message}` });
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

const PRODUCT_ROOT = path.join(__dirname, "..");

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
    console.log(`  GET  /        service descriptor (or web checker if web/ exists)`);
    console.log(`  GET  /health  liveness`);
    console.log(`  GET  /rules   pattern corpus manifest`);
    console.log(`  POST /scan    { text | html | url }`);
  });
}

module.exports = { server, handleScan, ruleManifest, serviceDescriptor, fetchRemote, extractText };