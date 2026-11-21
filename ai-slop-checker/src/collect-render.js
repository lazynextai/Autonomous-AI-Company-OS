"use strict";
/**
 * Lazynext AI Slop Checker — optional rendered-page COLLECTOR.
 *
 * This module is OPTIONAL: it is never loaded by the core engine at
 * require-time. Prod code imports it lazily (api/server.js, api/cli.js)
 * only when a URL render-scan is requested; the pure checks themselves
 * (src/render-checks.js) run over hand-crafted or collected snapshots with
 * no browser anywhere in the dependency chain.
 *
 * The browser part is exactly one thing: it turns a rendered page into the
 * computed snapshot contract that src/render-checks.js consumes. Everything
 * else is pure.
 *
 * Opt-in: the collector needs the optional `playwright` dev dependency.
 * Without it, every invocation throws a clear error:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * Then:  node api/cli.js --render https://example.com
 *
 * The snapshot shape produced here (matches src/render-checks.js):
 *
 *   {
 *     url,                                  // the collected page
 *     viewport: { width, height },
 *     documentStyle: { backgroundColor },
 *     elements: [ { tag, role, text, classes, ariaHidden, ariaValuenow,
 *                   style: { fontSizePx, fontWeight, lineHeightPx, color,
 *                            backgroundColor, backgroundImage,
 *                            backgroundClip, position, topPx, bottomPx,
 *                            rect: { x, y, w, h, viewportY },
 *                            animation, display, visibility, opacity,
 *                            textTransform, letterSpacingEm },
 *                   parents: [..], depth } ],
 *     screens: []                           // left empty (see below)
 *   }
 *
 * Note on screens (r-screen-budget): slides/windows are commonly declarable
 * only in the page's own structure; the collector ships a stable default
 * (whole viewport as one screen) and the API accepts an overridable
 * `screens` array on POST /render-scan for hosts that know their slide DOM.
 */

let _playwright = null;
let _playwrightChecked = false;

function playwrightClient() {
  if (_playwrightChecked) return _playwright;
  _playwrightChecked = true;
  try {
    _playwright = require("playwright");
  } catch (err) {
    _playwright = null;
  }
  return _playwright;
}

const OPT_IN_MSG =
  "the render collector needs the optional playwright dependency. Opt in (dev-only, no runtime dependency):\n" +
  "  cd ai-slop-checker\n  npm i -D playwright\n  npx playwright install chromium\n" +
  "then call collectRender(url) again. The checks themselves never need a browser — only this collector does.";

/**
 * The in-page collector: walks the rendered DOM and produces the computed
 * snapshot. Classic function-string so it can be serialized to the page and
 * evaluated there; pure DOM work, no special API.
 */
const COLLECTOR_FN_SOURCE = function collectComputedSnapshot() {
  const out = [];
  const skip = new Set(["SCRIPT", "STYLE", "TEMPLATE", "META", "LINK", "TITLE", "HEAD", "NOSCRIPT", "SVG", "PATH"]);

  const roleOf = (el) => {
    const explicit = (el.getAttribute("role") || "").trim().toLowerCase();
    if (explicit) return explicit;
    const t = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t)) return "heading";
    if (t === "nav") return "navigation";
    if (t === "section") return "region";
    if (t === "header") return "banner";
    if (t === "marquee") return "marquee";
    if (t === "progress") return "progressbar";
    if (t === "li") return "listitem";
    if (t === "dialog") return "dialog";
    if (t === "main") return "main";
    return null;
  };

  const measuredStyle = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let lsEm = null;
    const lsMatch = cs.letterSpacing.match(/^([\d.]+)em$/);
    if (lsMatch) lsEm = parseFloat(lsMatch[1]);
    const fs = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight);
    const bg = cs.backgroundColor;
    return {
      fontSizePx: Number.isFinite(fs) ? fs : null,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      lineHeightPx: Number.isFinite(lh) ? lh : null,
      color: cs.color === "rgba(0, 0, 0, 0)" ? null : cs.color,
      backgroundColor: !bg || bg === "rgba(0, 0, 0, 0)" ? null : bg,
      backgroundImage: cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : null,
      backgroundClip: cs.backgroundClip && cs.backgroundClip !== "border-box" ? cs.backgroundClip : null,
      position: cs.position,
      topPx: /px$/.test(cs.top) ? parseFloat(cs.top) : null,
      bottomPx: /px$/.test(cs.bottom) ? parseFloat(cs.bottom) : null,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, viewportY: r.top },
      animation: cs.animationName && cs.animationName !== "none" ? cs.animation : null,
      display: cs.display,
      visibility: cs.visibility,
      opacity: parseFloat(cs.opacity),
      textTransform: cs.textTransform && cs.textTransform !== "none" ? cs.textTransform : null,
      letterSpacingEm: lsEm,
    };
  };

  const keepElement = (el, text) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return false;
    if (getComputedStyle(el).display === "none") return false;
    const t = tagOf(el);
    if (text && text.length > 0) return true;
    if (roleOf(el) === "heading") return true;
    if (t === "progress" || t === "marquee") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    return /^(H1|H2|H3|H4|H5|H6)$/.test(t);
  };

  const tagOf = (el) => el.tagName.toLowerCase();

  const walk = (el, parents) => {
    const t = tagOf(el);
    if (skip.has(t.toUpperCase())) return;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!keepElement(el, text)) return;
    const idx = out.length;
    out.push({
      tag: t,
      role: roleOf(el),
      text: text.slice(0, 400),
      classes: typeof el.className === "string" && el.className ? el.className.split(/\s+/).filter(Boolean) : [],
      ariaHidden: el.getAttribute("aria-hidden") === "true" ? true : undefined,
      ariaValuenow: el.hasAttribute("aria-valuenow") ? el.getAttribute("aria-valuenow") : undefined,
      style: measuredStyle(el),
      parents: parents.slice(-6),
      depth: parents.length,
    });
    const nextParents = parents.concat(idx);
    const children = Array.prototype.slice.call(el.children);
    for (const c of children) walk(c, nextParents);
  };

  const docEl = document.documentElement;
  const docCs = getComputedStyle(docEl);
  walk(document.body, []);

  const screens = [];
  const slideEls = document.querySelectorAll('[data-slide], [role="slide"], .slide');
  for (const sEl of slideEls) {
    const text = (sEl.innerText || "").replace(/\s+/g, " ").trim();
    const memberIdxs = [];
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (text && o.text && text.indexOf(o.text) !== -1) memberIdxs.push(i);
    }
    if (memberIdxs.length >= 1) screens.push(memberIdxs);
  }

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    documentStyle: { backgroundColor: docCs.backgroundColor },
    elements: out,
    screens,
  };
};

/**
 * collectRender(url, opts) — open a headless browser, capture the computed
 * snapshot of the page, and return it in the render-checks contract.
 *
 * opts: { width?, height?, browser?: "chromium"|"firefox"|"webkit", channel?, waitMs? }
 * `channel` is forwarded to Playwright's launch (for example "chrome") so a
 * machine with a system browser can run the collector without a downloaded
 * Playwright browser build.
 *
 * Throws the opt-in error when playwright is not installed. Never part of
 * the engine's dependency chain — require this module lazily.
 */
async function collectRender(urlString, opts = {}) {
  if (typeof urlString !== "string" || !/^https?:\/\//i.test(urlString)) {
    throw new Error("collectRender expects an http(s) URL");
  }
  const pw = playwrightClient();
  if (!pw) {
    throw new Error(OPT_IN_MSG);
  }
  const browserName = opts.browser || "chromium";
  const browserType = pw[browserName];
  if (!browserType) throw new Error(`playwright browser "${browserName}" not available`);
  const launchOpts = { headless: true };
  if (opts.channel) launchOpts.channel = opts.channel;
  const browser = await browserType.launch(launchOpts);
  try {
    const page = await browser.newPage({
      viewport: { width: opts.width || 1280, height: opts.height || 800 },
    });
    await page.goto(urlString, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(typeof opts.waitMs === "number" ? opts.waitMs : 500);
    const snapshot = await page.evaluate(`(${COLLECTOR_FN_SOURCE.toString()})()`);
    snapshot.url = urlString;
    return snapshot;
  } finally {
    await browser.close();
  }
}

/**
 * isCollectorAvailable() — true when the optional playwright dependency
 * can be loaded. Lets API routes return a precise "not available" instead
 * of a stack trace, while keeping the module out of the engine's requires.
 */
function isCollectorAvailable() {
  return playwrightClient() !== null;
}

module.exports = { collectRender, isCollectorAvailable, OPT_IN_MSG };