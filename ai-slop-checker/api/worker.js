"use strict";
/**
 * Lazynext AI Slop Checker — Cloudflare Workers entry (drop-in alt to
 * api/server.js). Deployed as `lazynext-ai-slop-checker` (see
 * docs/DEPLOYMENT.md); runs the same deterministic scanner on the edge.
 *
 * Deploy:
 *   cd ai-slop-checker
 *   wrangler deploy   (CLOUDFLARE_API_TOKEN=$CLOUDFLARE_DEPLOY_TOKEN)
 *
 * The worker has zero node:* imports anywhere in its loaded module graph —
 * workerd (Service Worker format) has no node:fs/node:path/node:url, and
 * wrangler refuses external node:* imports in this format. File-backed
 * discovery routes (/llms.txt, /openapi.json) are served through the
 * [assets] binding when present, with embedded constant fallbacks
 * (api/embedded-assets.js); Node-only filesystem features live behind
 * src/node-bridge.js and short-circuit (400/501) on the edge.
 *
 * Routes (same contract as api/server.js):
 *   GET  /                 web checker page (when the [assets] binding is
 *                          present) — JSON service descriptor otherwise
 *   GET  /health           liveness
 *   GET  /rules            corpus manifest
 *   POST /scan             { text | html | url | rules_url }
 *   POST /judge            { text | html } (project root: local filesystem only -> 400)
 *   POST /scan-project     -> 400 (local filesystem only)
 *   POST /mcp              JSON-RPC 2.0 (initialize/ping/tools/list/tools/call)
 *   POST /a2a              JSON-RPC 2.0 (message/send, tasks/send, tasks/get)
 *   GET  /a2a/tasks/:id    replay a task result (Durable Object room when
 *                          A2A_TASKS is bound, else KV when RECENT is bound,
 *                          else the in-memory bounded store)
 *   GET  /.well-known/agent.json   agent card
 *   GET  /widget.js        embeddable in-browser widget
 *   GET  /openapi.json     OpenAPI 3.1 contract
 *   GET  /llms.txt         LLM discovery file
 *   GET  static map        /(index.html|style.css|app.js|sw.js|register-sw.js|
 *                          manifest.webmanifest) -> web/, /icons/* -> web/icons/
 *                          /data/* /src/* /assets/* /web/* -> same path
 *                          (curated GET/HEAD passthrough to env.ASSETS)
 */

const { scanText, scanHtml, extractText } = require("../src/scanner.js");
const { rewriteText } = require("../src/rewriter.js");
const { loadRules } = require("../src/rules-loader.js");
const corpus = require("../data/slop-patterns.js");
const agentSurfaces = require("./agent-surfaces.js");
const { LLMS_TXT, OPENAPI_JSON } = require("./embedded-assets.js");

const version = corpus.version;
const MAX_BODY_BYTES = 1_000_000;
const URL_TIMEOUT_MS = 10000;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

/** Read-only surfaces answer GET and HEAD (house HEAD-parity convention). */
function readOnly(req) {
  return req.method === "GET" || req.method === "HEAD";
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
      scan: { method: "POST", path: "/scan", body: { text: "string", html: "string", url: "http(s) URL", rewrite: "boolean (text only)", rules_url: "http(s) URL to a JSON custom-rules file", profile: '"default" | "strict" | "lenient"' } },
      judge: { method: "POST", path: "/judge", body: { text: "string", html: "string", project: "directory path (local filesystem only — not available on Workers)" }, note: "exactly one of text | html | project; 5-question review + craft-floor gate + refusal scaffolds + machine PASS | REVIEW | REFUSE verdict" },
      projectScan: { method: "POST", path: "/scan-project", note: "local filesystem only — not available on Workers; use the local Node server" },
      renderScan: { method: "POST", path: "/render-scan", body: { snapshot: "computed snapshot object ({elements:[...]}) — pure checks, no browser needed", url: "http(s) URL to collect + check (needs the optional playwright collector)", profile: '"default" | "strict" | "lenient"' }, note: "exactly one of snapshot|url; snapshot runs anywhere, url needs the local collector" },
      mcp: { method: "POST", path: "/mcp", note: "JSON-RPC 2.0 (initialize/ping/tools/list/tools/call); GET is 405 (no SSE)" },
      a2a: { method: "POST", path: "/a2a", note: "JSON-RPC 2.0 (message/send, tasks/send, tasks/get); GET /a2a/tasks/:id replays" },
      agentCard: { method: "GET", path: "/.well-known/agent.json" },
      widget: { method: "GET", path: "/widget.js" },
      openapi: { method: "GET", path: "/openapi.json" },
      llms: { method: "GET", path: "/llms.txt" },
    },
  };
}

/**
 * Serve a static file from the [assets] binding. Returns null when the
 * binding is absent (unit tests / local), so callers fall back.
 * Always builds a fresh Request for the asset path (the assets runtime
 * canonicalizes some paths, e.g. /web/index.html -> 307 /web/, and a
 * fresh Request lets fetch follow the redirect to the final 200). GET and
 * HEAD are both supported by the assets runtime (HEAD-parity house
 * convention).
 */
function serveAsset(req, env, assetPath) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") return null;
  try {
    const target = new URL(assetPath, req.url).toString();
    return env.ASSETS.fetch(new Request(target, { method: req.method, headers: req.headers }));
  } catch {
    return null;
  }
}

/**
 * Curated static web surface (mirror of api/server.js resolveStatic for the
 * edge). web/index.html loads the engine and brand assets via parent- and
 * self-relative refs that the WHATWG URL parser normalises to site-root
 * paths; the worker maps exactly those paths onto the [assets] directory:
 *
 *   /                      -> web/index.html
 *   /index.html            -> web/index.html
 *   /style.css /app.js /sw.js /register-sw.js /manifest.webmanifest
 *                          -> web/<file>             (index.html self-relative)
 *   /icons/*               -> web/icons/*            (manifest icons)
 *   /web/* /data/* /src/*  -> same path              (engine + app data)
 *   /assets/*              -> same path              (logo / favicon)
 *
 * Everything else stays 404 — test/, docs/, bench/, scripts/, .cursor and
 * the rest of the product tree are NOT exposed even though the whole tree
 * is bound as assets (run_worker_first = true keeps the worker in front).
 * Only GET/HEAD pass through; other methods 404.
 */
const STATIC_PREFIX_ROUTES = [
  ["/web/", "/web/"],
  ["/data/", "/data/"],
  ["/src/", "/src/"],
  ["/assets/", "/assets/"],
  ["/icons/", "/web/icons/"],
];

const STATIC_EXACT_ROUTES = new Map([
  ["/style.css", "/web/style.css"],
  ["/app.js", "/web/app.js"],
  ["/sw.js", "/web/sw.js"],
  ["/register-sw.js", "/web/register-sw.js"],
  ["/manifest.webmanifest", "/web/manifest.webmanifest"],
]);

function resolveStaticAssetPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "/web/index.html";
  if (STATIC_EXACT_ROUTES.has(pathname)) return STATIC_EXACT_ROUTES.get(pathname);
  for (const [prefix, mapped] of STATIC_PREFIX_ROUTES) {
    if (pathname.startsWith(prefix)) return mapped + pathname.slice(prefix.length);
  }
  return null;
}

/**
 * SSRF host-block guard on outbound URL fetches (sibling-product
 * isSafeDocUrl spirit): rejects localhost, *.local / *.internal names, and
 * literal IPs in private, loopback, link-local, CGNAT, multicast or
 * broadcast space — including IPv6 loopback/link-local/ULA/multicast and
 * IPv4-mapped IPv6 (e.g. [::ffff:169.254.169.254] cloud metadata).
 * WHATWG URL parsing rewrites that metadata literal to [::ffff:a9fe:a9fe]
 * before fetchRemote sees it, so the hex form, the deprecated
 * IPv4-compatible form [::a9fe:a9fe], 6to4 (2002:) and NAT64 (64:ff9b::/96)
 * embeddings are checked too. Ordinary DNS names that resolve to private
 * ranges cannot be detected without a resolver on the edge (resolution
 * happens in Cloudflare's network, where fetch already enforces platform
 * policy); literal hosts are checked directly.
 */
function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;

  // IPv6 literal (strip [brackets] and any %zone).
  let v6 = h;
  if (v6.startsWith("[") && v6.endsWith("]")) v6 = v6.slice(1, -1);
  const zoneAt = v6.indexOf("%");
  if (zoneAt !== -1) v6 = v6.slice(0, zoneAt);
  if (v6.includes(":")) return isBlockedIpv6(v6);

  // IPv4 literal?
  const octs = h.split(".");
  if (octs.length === 4 && octs.every((o) => /^\d{1,3}$/.test(o))) {
    const n = octs.map(Number);
    if (n.some((o) => o > 255)) return false; // not a valid literal; DNS name
    return isBlockedIpv4(n);
  }
  return false; // ordinary DNS name — resolved at the edge
}

function isBlockedIpv4([a, b, c, d]) {
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a >= 224 && a <= 239) return true; // multicast
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  return false;
}

function expandIpv6(addr) {
  // Dotted-decimal forms are classified before this. Anything still
  // containing a dot, or more than one "::", is not a hex literal we can
  // trust — the caller fails closed.
  if (addr.includes(".") || addr.split("::").length > 2) return null;
  const sides = addr.split("::");
  const parseSide = (side) => {
    if (side === "") return [];
    const groups = side.split(":");
    const out = [];
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const left = parseSide(sides[0]);
  if (!left) return null;
  if (sides.length === 1) return left.length === 8 ? left : null;
  const right = parseSide(sides[1]);
  if (!right) return null;
  if (left.length + right.length > 8) return null;
  const zeros = new Array(8 - left.length - right.length).fill(0);
  return left.concat(zeros, right);
}

function ipv4FromPair(hi, lo) {
  const n = ((hi << 16) | lo) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function isBlockedIpv6(addr) {
  // IPv4-mapped / compatible written with dotted decimals
  // ([::ffff:a.b.c.d], [::a.b.c.d]) — check the embedded v4.
  const mapped = addr.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped && mapped[1].split(".").every((o) => /^\d{1,3}$/.test(o))) {
    const n = mapped[1].split(".").map(Number);
    if (!n.some((o) => o > 255)) return isBlockedIpv4(n);
    return true; // octet out of range — not a public host
  }
  const h = expandIpv6(addr);
  if (!h) return true;
  const prefixZero = (n) => h.slice(0, n).every((part) => part === 0);
  if (h.every((part) => part === 0) || (prefixZero(7) && h[7] === 1)) return true; // :: / ::1
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // ::ffff:0:0/96 — WHATWG normalizes [::ffff:169.254.169.254] to this hex form.
  if (prefixZero(5) && h[5] === 0xffff) return isBlockedIpv4(ipv4FromPair(h[6], h[7]));
  // Deprecated IPv4-compatible ::/96 ([::169.254.169.254] → [::a9fe:a9fe]).
  if (prefixZero(6)) return true;
  // 6to4 (2002::/16) and well-known NAT64 (64:ff9b::/96) embed an IPv4.
  if (h[0] === 0x2002) return isBlockedIpv4(ipv4FromPair(h[1], h[2]));
  if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isBlockedIpv4(ipv4FromPair(h[6], h[7]));
  }
  return false;
}

/**
 * Per-IP scan cap: in-memory sliding window (60 scans / 60s) on this
 * isolate. Honest caveat: per-isolate, not global (the free-tier abuse
 * bound, not a hard quota). Cloudflare sets CF-Connecting-IP at the edge
 * (client-supplied values are overwritten), so the key can be trusted.
 */
const SCAN_LIMIT_PER_WINDOW = 60;
const SCAN_WINDOW_MS = 60_000;
const scanBuckets = new Map(); // ip -> { windowStart, count }

function requestClientIp(req) {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return String(fwd).split(",")[0].trim();
  return "unknown";
}

function scanRateLimited(ip) {
  const now = Date.now();
  let bucket = scanBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= SCAN_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    scanBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  // Opportunistic prune keeps the map bounded.
  if (scanBuckets.size > 5000) {
    for (const [key, b] of scanBuckets) {
      if (now - b.windowStart >= SCAN_WINDOW_MS) scanBuckets.delete(key);
    }
  }
  return bucket.count > SCAN_LIMIT_PER_WINDOW;
}

async function fetchRemote(urlString, opts = {}) {
  // redirect:follow would re-check only the first host. A public URL that
  // 302s to a metadata literal must be stopped on the Location, not fetched.
  let current = urlString;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(current);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("url must be http(s)");
    if (isBlockedHost(parsed.hostname)) {
      throw new Error("url host is not allowed (private/local/link-local/multicast hosts are blocked)");
    }
    const res = await fetch(current, {
      signal: AbortSignal.timeout(URL_TIMEOUT_MS),
      headers: { "User-Agent": "LazynextSlopChecker/1.2 (+https://lazynext.com)", Accept: opts.jsonOnly ? "application/json,text/json,text/plain" : "text/html,application/xhtml+xml" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect missing location");
      current = new URL(loc, parsed).toString();
      continue;
    }
    if (!res.ok) throw new Error(`upstream http ${res.status}`);
    const html = await res.text();
    if (html.length > 2_000_000) throw new Error("upstream document too large");
    return opts.jsonOnly ? { html } : { html, text: extractText(html) };
  }
  throw new Error("url redirected too many times");
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
    renderScan: (snapshotOrUrl, opts) => {
      // Snapshot scans are pure and run on the edge; URL collection needs
      // the local playwright collector.
      const { scanRender } = require("../src/render-checks.js");
      if (snapshotOrUrl && typeof snapshotOrUrl === "object") return scanRender(snapshotOrUrl, opts);
      throw new Error("url render-scan needs the optional local playwright collector — POST {snapshot} instead");
    },
    scanUrl: async (urlString) => {
      const remote = await fetchRemote(urlString);
      return { report: scanHtml(remote.html), remote };
    },
    judge: (input) => {
      if (input && input.project !== undefined) {
        throw new Error("project judge needs local filesystem access — run the local Node server (node api/server.js) instead");
      }
      const { judgeReport } = require("../src/judge.js");
      return judgeReport(input);
    },
  };
}

async function handleScan(req) {
  if (scanRateLimited(requestClientIp(req))) {
    return json({ error: `too many scan requests (limit ${SCAN_LIMIT_PER_WINDOW}/min per IP) — retry shortly` }, 429);
  }
  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
    if (raw) body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { text, html, url, rewrite, rules_url, profile } = body;
  const kinds = [text !== undefined, html !== undefined, url !== undefined].filter(Boolean).length;
  if (kinds === 0) return json({ error: "provide one of: text, html, url" }, 400);
  if (kinds > 1) return json({ error: "provide exactly one of: text, html, url" }, 400);
  const scanOpts = profile !== undefined && profile !== null ? { profile } : undefined;

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
      report = engine.scanText(text, scanOpts);
      source = { type: "text", length: text.length };
      if (rewrite === true) {
        report = { ...report, rewrite: engine.rewriteText(text) };
      }
    } else if (html !== undefined) {
      if (typeof html !== "string") return json({ error: "html must be a string" }, 400);
      report = engine.scanHtml(html, scanOpts);
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
      report = engine.scanHtml(remote.html, scanOpts);
      source = { type: "url", url };
    }
    return json({ ...report, source });
  } catch (err) {
    return json({ error: `scan failed: ${err.message}` }, 500);
  }
}

async function handleJudge(req) {
  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
    if (raw) body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { text, html, project } = body;
  const kinds = [text !== undefined, html !== undefined, project !== undefined].filter(Boolean).length;
  if (kinds === 0) return json({ error: "provide one of: text, html, project" }, 400);
  if (kinds > 1) return json({ error: "provide exactly one of: text, html, project" }, 400);
  if (text !== undefined && typeof text !== "string") return json({ error: "text must be a string" }, 400);
  if (html !== undefined && typeof html !== "string") return json({ error: "html must be a string" }, 400);
  if (project !== undefined && (typeof project !== "string" || project.length === 0)) {
    return json({ error: "project must be a non-empty directory path" }, 400);
  }
  if (project !== undefined) {
    return json({ error: "project judge needs local filesystem access — run the local Node server (node api/server.js) instead" }, 400);
  }

  try {
    const { judgeReport } = require("../src/judge.js");
    const report = judgeReport({ text, html });
    return json(report, 200);
  } catch (err) {
    return json({ error: `judge failed: ${err.message}` }, 400);
  }
}

async function handleRenderScan(req, env, ctx) {
  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "body too large (limit 1MB)" }, 413);
    if (raw) body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { snapshot, url, profile } = body;
  const hasSnapshot = snapshot !== undefined;
  const hasUrl = url !== undefined;
  if (hasSnapshot === hasUrl) return json({ error: "provide exactly one of: snapshot, url" }, 400);

  const { scanRender } = require("../src/render-checks.js");
  const opts = profile !== undefined && profile !== null ? { profile } : {};
  try {
    if (hasSnapshot) {
      if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.elements)) {
        return json({ error: "snapshot must be an object with an elements array (see src/render-checks.js)" }, 400);
      }
      const report = scanRender(snapshot, opts);
      return json({ ...report, source: { type: "render-snapshot" } });
    }
    // URL collection needs the local playwright collector — not available on
    // the edge entry; the pure checks still run anywhere.
    return json({ error: "url render-scan needs the optional local playwright collector — POST {snapshot} here or run the local Node server (node api/server.js)" }, 501);
  } catch (err) {
    return json({ error: `render scan failed: ${err.message}` }, 400);
  }
}

module.exports = {
  version,
  fetch: async (req, env, ctx) => {
    // Optional A2A durable store. RECENT (KV) is the eventual copy.
    // A2A_TASKS is one Durable Object room shared by every isolate; a
    // missing or unusable binding clears the stub so a previous request
    // cannot leak it. Neither call touches the room until an A2A send/get.
    // See api/agent-surfaces.js. Unbound deploys keep the in-memory store.
    agentSurfaces.setKvStore(env && env.RECENT);
    agentSurfaces.setDurableNamespace(env && env.A2A_TASKS);
    const url = new URL(req.url);
    const { pathname } = url;

    if (readOnly(req) && (pathname === "/" || pathname === "/index.html")) {
      // Deployed: the branded web checker, same-origin with the API (zero
      // CORS). Without the assets binding (unit tests) keep the descriptor.
      const page = serveAsset(req, env, "/web/index.html");
      if (page) return page;
      return json(serviceDescriptor());
    }
    if (readOnly(req) && pathname === "/health") return json({ ok: true, engine: "lazynext-ai-slop-checker", version });
    if (readOnly(req) && pathname === "/rules") return json(ruleManifest());
    if (req.method === "POST" && pathname === "/scan") return handleScan(req);
    if (req.method === "POST" && pathname === "/judge") return handleJudge(req);
    if (req.method === "POST" && pathname === "/scan-project") {
      return json({ error: "project scan needs local filesystem access — run the local Node server (node api/server.js) instead" }, 400);
    }
    if (req.method === "POST" && pathname === "/render-scan") return handleRenderScan(req, env, ctx);

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
    if (readOnly(req) && a2aTaskMatch) {
      const out = await agentSurfaces.a2aTaskGet(a2aTaskMatch[1]);
      return json(out.body, out.status);
    }
    if (readOnly(req) && pathname === "/.well-known/agent.json") return json(agentSurfaces.AGENT_CARD);
    if (readOnly(req) && pathname === "/widget.js") {
      return new Response(agentSurfaces.WIDGET_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }
    if (readOnly(req) && pathname === "/llms.txt") {
      // Assets binding first (byte-exact files, no drift), embedded constant
      // fallback for env-less contexts (unit tests). No node:fs — the edge
      // has no filesystem.
      const fromAssets = serveAsset(req, env, "/llms.txt");
      if (fromAssets) return fromAssets;
      return new Response(LLMS_TXT, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (readOnly(req) && pathname === "/openapi.json") {
      const fromAssets = serveAsset(req, env, "/api/openapi.json");
      if (fromAssets) return fromAssets;
      return new Response(OPENAPI_JSON, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }

    // ── Web surface: curated static map (gate before the 404) ─────────────
    // GET/HEAD only; the worker decides which asset paths are served even
    // though the whole product tree is bound as [assets] (run_worker_first).
    if (req.method === "GET" || req.method === "HEAD") {
      const assetPath = resolveStaticAssetPath(pathname);
      if (assetPath) {
        const assetRes = serveAsset(req, env, assetPath);
        if (assetRes) return assetRes;
      }
    }

    return json({ error: "not found", endpoints: ["/", "/health", "/rules", "/scan", "/judge", "/scan-project", "/render-scan", "/mcp", "/a2a", "/.well-known/agent.json", "/widget.js", "/openapi.json", "/llms.txt"] }, 404);
  },
  isBlockedHost,
};