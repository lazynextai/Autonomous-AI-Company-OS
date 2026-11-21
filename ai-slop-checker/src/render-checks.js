"use strict";
/**
 * Lazynext AI Slop Checker — rendered-tier checks (src/render-checks.js).
 *
 * The rendered tier of v1.3.0: PURE functions over an immutable "computed
 * snapshot" — a serialized array of elements with computed styles, as a
 * real browser would measure them. No browser, no DOM, no dependencies:
 * the checks run anywhere Node runs, and the web checker's "Design
 * reviews" page runs the same module in the browser (UMD browser global
 * window.SlopRenderChecks).
 *
 * Snapshot schema (the CONTRACT between the optional collector and the
 * checks — see src/collect-render.js for the producer):
 *
 *   {
 *     viewport: { width?: 1280, height?: 800 },   // optional; defaults 1280x800
 *     documentStyle: { backgroundColor?: "#ffffff" },  // optional root bg
 *     elements: [                                    // document order
 *       {
 *         tag: "h2",                     // tag name, lowercase
 *         role: "heading",               // computed ARIA role (optional)
 *         text: "…",                     // trimmed visible text (optional)
 *         classes: ["eyebrow"],          // class list (optional)
 *         ariaHidden: false,             // aria-hidden="true"
 *         ariaValuenow: null,            // aria-valuenow (progressbars)
 *         style: {
 *           fontSizePx, fontWeight, lineHeightPx,
 *           color, backgroundColor, backgroundImage, backgroundClip,
 *           position, topPx, bottomPx,
 *           rect: { x, y, w, h, viewportY },  // viewportY = y rel. viewport
 *           animation, display, visibility, opacity,
 *           textTransform, letterSpacingEm
 *         },
 *         parents: [4, 1, 0],            // chain of ancestor element indices (nearest first)
 *         depth: 2
 *       }
 *     ],
 *     screens: [[0, 1, 2]],              // optional element-index groups for
 *                                        // r-screen-budget (a "screen" = slide/window)
 *   }
 *
 * Determinism: same snapshot in, same matches out — element order is the
 * index order, matches are sorted by index then id, and every threshold is
 * a constant documented per check.
 *
 * Report shape mirrors the base scanner: engine/version/input/score/
 * verdict/clean/totalPoints/matches/categories, with the same exponential
 * decay scoring and per-pattern point caps. The checks themselves are the
 * manifest RENDER_CHECKS below.
 */

(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports
      ? require("../data/slop-patterns.js")
      : root.SlopPatterns,
    typeof module !== "undefined" && module.exports
      ? require("../data/profiles.js")
      : root.SlopProfiles
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopRenderChecks = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (corpus, profilesModule) {

const ENGINE_NAME = "lazynext-ai-slop-checker-render";
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const MAX_ELEMENTS = 5000;

// Optimistic scale floor for "large text" per WCAG 2.x (1.5 bold / 24px).
const LARGE_TEXT_PX = 24;
const LARGE_TEXT_BOLD_PX = 18.66;
const LARGE_TEXT_BOLD_WEIGHT = 700;

// ---------------------------------------------------------------------------
// Check manifest
// ---------------------------------------------------------------------------

const RENDER_CATEGORIES = {
  "render-type": { name: "Rendered type", desc: "Computed-style type tells: flat kickers, wayward tracking, gradient text." },
  "render-color": { name: "Rendered color", desc: "Computed-style colour tells: AI gradient headlines and purple-blue defaults." },
  "render-copy": { name: "Rendered copy", desc: "Rendered-copy tells: glued arrow endings and decorative repeats." },
  "render-motion": { name: "Rendered motion", desc: "Computed-animation tells: marquees and infinite translateX loops." },
  "render-component": { name: "Rendered component", desc: "Computed-component tells: hover-revealed content, fake progress, decorative duplication." },
  "render-layout": { name: "Rendered layout", desc: "Computed-layout tells: the 1280x800 fold budget, word-per-screen budget, uniform grids." },
  "render-a11y": { name: "Rendered a11y", desc: "Computed contrast floor: WCAG contrast for rendered text over its real background." },
};

// ---------------------------------------------------------------------------
// Snapshot sanitization
// ---------------------------------------------------------------------------
// The checks read style fields with arithmetic (.toFixed, /, comparisons),
// so a hostile snapshot (string px values, object backgroundImage, string
// rects) can crash them. The contract says style values are numbers, but the
// pure checks must be robust to ANY serializable input: sanitize each
// element's typed fields deterministically (invalid numeric fields -> null,
// invalid string fields -> "", non-finite rects -> null) so every check is
// safe. Conforming snapshots take the zero-copy fast path (original array
// is returned unchanged), so the normal path is untouched.

function finiteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

const NUM_STYLE_FIELDS = ["fontSizePx", "lineHeightPx", "topPx", "bottomPx", "letterSpacingEm", "fontWeight", "opacity"];
const STR_STYLE_FIELDS = ["color", "backgroundColor", "backgroundImage", "backgroundClip", "position", "display", "visibility", "textTransform", "animation"];

function sanitizeElement(el, idx) {
  if (!el || typeof el !== "object") {
    return { tag: "", role: "", text: "", classes: [], ariaHidden: false, ariaValuenow: null, style: {}, parents: [], depth: 0 };
  }
  let dirty = 0;
  const out = { ...el };
  if (typeof out.tag !== "string") { out.tag = ""; dirty++; }
  if (typeof out.role !== "string") { out.role = ""; dirty++; }
  if (typeof out.text !== "string") { out.text = ""; dirty++; }
  if (!Array.isArray(out.classes)) { out.classes = []; dirty++; }
  if (!Array.isArray(out.parents)) { out.parents = []; dirty++; }
  if (out.depth !== undefined && !finiteNum(out.depth)) { out.depth = null; dirty++; }
  if (out.ariaHidden !== undefined && typeof out.ariaHidden !== "boolean") { out.ariaHidden = Boolean(out.ariaHidden); dirty++; }
  // ariaValuenow passes through any type — the checks only compare != null.
  const s = el.style && typeof el.style === "object" ? el.style : {};
  if (s !== el.style) { dirty++; }
  const ns = { ...s };
  for (const f of NUM_STYLE_FIELDS) {
    if (ns[f] !== undefined && !finiteNum(ns[f])) { ns[f] = null; dirty++; }
  }
  for (const f of STR_STYLE_FIELDS) {
    if (ns[f] !== undefined && typeof ns[f] !== "string") { ns[f] = ""; dirty++; }
  }
  if (ns.rect !== undefined) {
    const r = ns.rect;
    const ok =
      r && typeof r === "object" &&
      finiteNum(r.x) && finiteNum(r.y) && finiteNum(r.w) && finiteNum(r.h) && finiteNum(r.viewportY);
    if (!ok) { ns.rect = null; dirty++; }
  }
  if (dirty === 0) return el; // fast path: original element, zero-copy
  out.style = ns;
  return out;
}

/** Sanitize a snapshot for the checks. Returns { elements, viewport, screens, documentStyle }. */
function sanitizeSnapshot(snapshot) {
  const src = snapshot || {};
  const rawElements = Array.isArray(src.elements) ? src.elements : [];
  let changed = false;
  const elements = new Array(rawElements.length);
  for (let i = 0; i < rawElements.length; i++) {
    const el = sanitizeElement(rawElements[i], i);
    if (el !== rawElements[i]) changed = true;
    elements[i] = el;
  }
  const vp = src.viewport && typeof src.viewport === "object" ? src.viewport : {};
  const viewport = {
    width: finiteNum(vp.width) ? vp.width : DEFAULT_VIEWPORT.width,
    height: finiteNum(vp.height) ? vp.height : DEFAULT_VIEWPORT.height,
  };
  let screens = null;
  if (Array.isArray(src.screens) && src.screens.length) {
    const out = [];
    for (const g of src.screens) {
      if (!Array.isArray(g)) continue;
      const filtered = [];
      for (const idx of g) {
        if (Number.isInteger(idx) && idx >= 0 && idx < elements.length) filtered.push(idx);
      }
      if (filtered.length) out.push(filtered);
    }
    screens = out.length ? out : null;
  }
  let documentStyle = null;
  const ds = src.documentStyle && typeof src.documentStyle === "object" ? src.documentStyle : null;
  if (ds && typeof ds.backgroundColor === "string") {
    documentStyle = { backgroundColor: ds.backgroundColor };
  }
  return changed || (screens !== (Array.isArray(src.screens) && src.screens.length ? src.screens : null))
    ? { elements, viewport, screens, documentStyle }
    : {
        elements,
        viewport,
        screens: Array.isArray(src.screens) && src.screens.length ? src.screens : null,
        documentStyle,
      };
}

const RENDER_CHECKS = [
  { id: "r-kicker-size", category: "render-type", severity: 2, name: "Kicker / eyebrow size", desc: "Kickers read as body text (Flat Type) when they sit at 0.8-1.6x the section body size, or shout past 1.6x." },
  { id: "r-gradient-text", category: "render-color", severity: 2, name: "Gradient text", desc: "The classic AI gradient headline: text clipped to a purple-blue gradient, or a text element carrying the default blue/violet stop pairs." },
  { id: "r-tracked-caps", category: "render-type", severity: 2, name: "Tracked all-caps", desc: "All-caps labels at caption size with almost no or absurd tracking — the hallmark tracked-caps signal." },
  { id: "r-glued-arrow", category: "render-copy", severity: 1, name: "Glued arrow", desc: "Text ending in an arrow glyph glued to the word (no space) — the classic 'learn more→' tell." },
  { id: "r-marquee", category: "render-motion", severity: 1, name: "Marquee / ticker", desc: "A marquee-like animation (translateX/scroll loop) or a literal <marquee>." },
  { id: "r-hidden-reveal", category: "render-component", severity: 1, name: "Hidden / duplicate reveal", desc: "Content hidden at rest that reveals on hover, or aria-hidden text duplicated in the visible DOM." },
  { id: "r-fold-budget", category: "render-layout", severity: 2, name: "Fold budget", desc: "More than 2 distinct section headers above the 1280x800 fold, or a header straddling the fold edge." },
  { id: "r-screen-budget", category: "render-layout", severity: 1, name: "Screen word budget", desc: "More than ~80 words of visible text on one screen (slide/window)." },
  { id: "r-section-rhythm", category: "render-layout", severity: 1, name: "Section rhythm", desc: "6+ sibling cards with identical heights AND identical gaps, or 3+ sections with identical gaps and heights — the uniform grid." },
  { id: "r-fake-progress", category: "render-component", severity: 1, name: "Fake progress", desc: "A progressbar with no aria-valuenow and no animation — decorative progress with no update mechanism." },
  { id: "r-contrast", category: "render-a11y", severity: 3, name: "Text contrast", desc: "WCAG relative-luminance contrast under 3:1 for large / 4.5:1 for normal text over the computed background." },
];

const CHECK_BY_ID = Object.fromEntries(RENDER_CHECKS.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function parseColor(str) {
  // #rgb / #rrggbb / #rgba / #rrggbbaa
  if (typeof str === "string") {
    const hex = str.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(hex)) {
      const r = parseInt(hex[1] + hex[1], 16);
      const g = parseInt(hex[2] + hex[2], 16);
      const b = parseInt(hex[3] + hex[3], 16);
      return { r, g, b, a: 1 };
    }
    if (/^#[0-9a-f]{6}$/.test(hex)) {
      return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: 1 };
    }
    if (/^#[0-9a-f]{4}$/.test(hex)) {
      return { r: parseInt(hex[1] + hex[1], 16), g: parseInt(hex[2] + hex[2], 16), b: parseInt(hex[3] + hex[3], 16), a: parseInt(hex[4] + hex[4], 16) / 255 };
    }
    if (/^#[0-9a-f]{8}$/.test(hex)) {
      return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: parseInt(hex.slice(7, 9), 16) / 255 };
    }
    const rgb = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (rgb) {
      const a = rgb[4] === undefined ? 1 : Number(rgb[4]);
      if (a >= 1) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: 1 };
      return null; // semi-transparent: composite unknown without the backdrop
    }
  }
  return null;
}

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color) {
  return 0.2126 * channelToLinear(color.r) + 0.7152 * channelToLinear(color.g) + 0.0722 * channelToLinear(color.b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function isVisible(el) {
  const s = el.style || {};
  if (s.display === "none") return false;
  if (s.visibility === "hidden" || s.visibility === "collapse") return false;
  if (s.opacity === 0) return false;
  const r = s.rect;
  if (r && (r.w <= 0 || r.h <= 0)) return false;
  return true;
}

function hasText(el, min = 1) {
  return typeof el.text === "string" && el.text.trim().replace(/\s+/g, " ").length >= min;
}

function normText(el) {
  return typeof el.text === "string" ? el.text.replace(/\s+/g, " ").trim() : "";
}

function wordCount(text) {
  if (typeof text !== "string") return 0;
  const m = text.trim().match(/\b[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*\b/gu);
  return m ? m.length : 0;
}

function elsWithRole(elements, roles) {
  const out = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const role = (el.role || "").toLowerCase();
    if (roles.some((r) => role === r || (el.tag || "").toLowerCase() === r)) out.push(i);
  }
  return out;
}

/** Nearest non-transparent ancestor background: walk the parents chain (already visible-filtered by the caller), fall back to the document style. */
function resolveBackground(el, elements, documentStyle) {
  const own = el.style && el.style.backgroundColor;
  if (own) {
    const c = parseColor(own);
    if (c) return c;
  }
  const chain = Array.isArray(el.parents) ? el.parents : [];
  for (const pIdx of chain) {
    const p = elements[pIdx];
    if (!p) continue;
    const bg = p.style && p.style.backgroundColor;
    if (bg) {
      const c = parseColor(bg);
      if (c) return c;
    }
  }
  if (documentStyle && documentStyle.backgroundColor) {
    const c = parseColor(documentStyle.backgroundColor);
    if (c) return c;
  }
  return null;
}

/** Mode (most common) of a list of numbers; falls back to median; null when empty. */
function modeOf(numbers) {
  if (numbers.length === 0) return null;
  const counts = new Map();
  for (const n of numbers) counts.set(n, (counts.get(n) || 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [n, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && n < best)) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

function ancestorsOf(el, elements) {
  const chain = Array.isArray(el.parents) ? el.parents : [];
  const out = [];
  for (const idx of chain) {
    const p = elements[idx];
    if (p) out.push(p);
  }
  return out;
}

function hasAncestorRole(el, elements, roles) {
  for (const a of ancestorsOf(el, elements)) {
    const role = (a.role || "").toLowerCase();
    if (roles.includes(role)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The checks (each returns [] | [match, ...])
// ---------------------------------------------------------------------------

/** r-kicker-size — Flat Type / shouting kicker, per the section body size. */
function checkKickerSize(elements, opts, out) {
  // Paragraph sizes per parent group (section-relative body size).
  const paragraphSizesByParent = new Map();
  for (const el of elements) {
    if (!el.style || !el.style.fontSizePx) continue;
    const tag = (el.tag || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    if (tag !== "p" && role !== "paragraph") continue;
    const parent = Array.isArray(el.parents) && el.parents.length ? el.parents[0] : "global";
    const list = paragraphSizesByParent.get(parent) || [];
    list.push(el.style.fontSizePx);
    paragraphSizesByParent.set(parent, list);
  }
  const globalParagraphs = [];
  for (const list of paragraphSizesByParent.values()) globalParagraphs.push(...list);
  const bodySizeFor = (el) => {
    if (Array.isArray(el.parents) && el.parents.length) {
      // Try each ancestor as a group key (deepest first).
      for (const pIdx of el.parents) {
        const list = paragraphSizesByParent.get(pIdx);
        if (list && list.length) return modeOf(list);
      }
    }
    const globalMode = modeOf(globalParagraphs);
    return globalMode;
  };

  const KICKER_CLASS_RE = /(^|[\s_-])(kicker|eyebrow|eyebrow|overline|overline|subhead|section-label|overline-label|eyebrow-text)([\s_-]|$)/i;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el.style || !el.style.fontSizePx) continue;
    if (!hasText(el, 1)) continue;
    const classes = Array.isArray(el.classes) ? el.classes.join(" ") : "";
    const looksLikeKicker =
      KICKER_CLASS_RE.test(classes) ||
      (normText(el).length <= 24 &&
        (el.tag === "p" || el.tag === "span" || el.tag === "div") &&
        // immediately precedes a heading (document order: next element in the same parent)
        (() => {
          const next = elements[i + 1];
          if (!next) return false;
          const nextRole = (next.role || "").toLowerCase();
          const nextTag = (next.tag || "").toLowerCase();
          return /^h[1-6]$/.test(nextTag) || nextRole === "heading";
        })());
    if (!looksLikeKicker) continue;
    const bodyPx = bodySizeFor(el);
    if (!bodyPx) continue;
    const px = el.style.fontSizePx;
    const ratio = px / bodyPx;
    if (ratio > 1.6) {
      out.push({
        id: "r-kicker-size",
        category: "render-type",
        severity: 2,
        index: i,
        snippet: normText(el).slice(0, 60),
        detail: `kicker at ${px.toFixed(1)}px is ${ratio.toFixed(2)}x the ${bodyPx.toFixed(1)}px body — it competes with the heading instead of labelling it.`,
        fix: "A kicker is a label: keep it clearly smaller than body text (under 0.8x) and clearly smaller than the heading.",
      });
    } else if (ratio >= 0.8) {
      out.push({
        id: "r-kicker-size",
        category: "render-type",
        severity: 1,
        index: i,
        snippet: normText(el).slice(0, 60),
        detail: `kicker at ${px.toFixed(1)}px is ${ratio.toFixed(2)}x the ${bodyPx.toFixed(1)}px body — reads as body text (Flat Type).`,
        fix: "Give the kicker a real size step down (under 0.8x body) so it reads as a label, not a paragraph opener.",
      });
    }
  }
}

/** r-gradient-text — the AI gradient headline / blue-violet stop pairs. */
const GRADIENT_STOP_RE = /(?:#|0x)?(?:6366f1|8b5cf6|a855f7|7c3aed|9333ea|60a5fa|3b82f6|818cf8|6d28d9|c084fc|38bdf8|0ea5e9|2563eb|4f46e5|a78bfa|a5b4fc|1d4ed8|6366ff|7c3aed|9333ea)/i;
function checkGradientText(elements, opts, out) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!hasText(el, 1)) continue;
    const img = (el.style && el.style.backgroundImage) || "";
    if (!/gradient/i.test(img)) continue;
    const clipText = /text/i.test((el.style && el.style.backgroundClip) || "");
    const commonStops = GRADIENT_STOP_RE.test(img);
    if (!clipText && !commonStops) continue;
    out.push({
      id: "r-gradient-text",
      category: "render-color",
      severity: 2,
      index: i,
      snippet: normText(el).slice(0, 60),
      detail: `text rendered${
        clipText ? " as a background-clip gradient" : ""
      } over${clipText ? "" : " a blue/violet"} gradient (${img.slice(0, 90)}).`,
      fix: "Use a single solid color for headline text; reserve gradients for real data viz, not decoration.",
    });
  }
}

/** r-tracked-caps — all-caps labels at caption size with wrong tracking. */
function checkTrackedCaps(elements, opts, out) {
  const isAllCaps = (el) => {
    if ((el.style && el.style.textTransform === "uppercase")) return true;
    const t = normText(el);
    if (!t) return false;
    const letters = t.match(/\p{L}/gu) || [];
    if (letters.length < 2) return false;
    const lower = t.match(/\p{Ll}/gu) || [];
    return lower.length === 0 && /[\p{Lu}]/u.test(t);
  };
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el.style || !el.style.fontSizePx) continue;
    if (!hasText(el, 1)) continue;
    if (!isAllCaps(el)) continue;
    const px = el.style.fontSizePx;
    if (px > 16) continue; // caption/eyebrow sizes only
    const ls = el.style.letterSpacingEm;
    const spacing = typeof ls === "number" ? ls : 0;
    if (spacing < 0.02 || spacing > 0.35) {
      out.push({
        id: "r-tracked-caps",
        category: "render-type",
        severity: 2,
        index: i,
        snippet: normText(el).slice(0, 60),
        detail: `ALL-CAPS at ${px.toFixed(1)}px with letter-spacing ${spacing.toFixed(2)}em — ${
          spacing < 0.02 ? "no tracking at all (words feel jammed)" : `${spacing.toFixed(2)}em — the over-tracked label cliché`
        }.`,
        fix: "For caption-size caps use a deliberate 0.02-0.35em tracking; better, switch the label to sentence case.",
      });
    }
  }
}

/** r-glued-arrow — arrow glyph glued to the last word. */
const GLUED_ARROW_RE = /[^\s\u00A0](\u2190\uFE0F?|\u2192\uFE0F?|\u2194\uFE0F?|\u27A1\uFE0F?|\u27F6|\u2794|\u279C|\u203A|\u00BB|\u2B62|\u2B95|\u2705?->|&(?:rarr|raquo|rsaquo|rArr|rightarrow|RightArrow);)\s*$/u;
function checkGluedArrow(elements, opts, out) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const t = normText(el);
    if (!t) continue;
    if (!GLUED_ARROW_RE.test(t)) continue;
    out.push({
      id: "r-glued-arrow",
      category: "render-copy",
      severity: 1,
      index: i,
      snippet: t.slice(-24),
      detail: `arrow glued to the last word: “${t.slice(-24).trim()}”.`,
      fix: "Either drop the arrow or set it off with a real space (or better, say what the link does).",
    });
  }
}

/** r-marquee — marquee-style animation or a literal <marquee>. */
const MARQUEE_ANIM_RE = /(marquee|scroll)[a-z-]*[\s,]|translateX\s*\([^)]*\)\s+[^;]*(?:infinite|linear)/i;
function checkMarquee(elements, opts, out) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = (el.tag || "").toLowerCase();
    if (tag === "marquee") {
      out.push({ id: "r-marquee", category: "render-motion", severity: 1, index: i, snippet: tag, detail: "a literal <marquee> element is running.", fix: "Replace with a deliberate, pauseable motion or a static live region." });
      continue;
    }
    const anim = (el.style && el.style.animation) || "";
    if (anim && MARQUEE_ANIM_RE.test(anim)) {
      out.push({
        id: "r-marquee",
        category: "render-motion",
        severity: 1,
        index: i,
        snippet: normText(el).slice(0, 60) || anim.slice(0, 60),
        detail: `animation ${anim.slice(0, 90)} — a marquee/ticker loop.`,
        fix: "Scrolling text hijacks reading; if the list is real, let people scroll it themselves.",
      });
    }
  }
}

/** r-hidden-reveal — static-provable subset: hover-reveal classes + aria-hidden duplication. */
const REVEAL_TOKEN_RE = /(hover|focus|focus-within|group-hover|peer-hover|scroll|active)[:\/](block|flex|grid|inline|inline-block|visible|opacity-[1-9]\d*|opacity-100|max-h|translate-[xy])/i;
function checkHiddenReveal(elements, opts, out) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const s = el.style || {};
    const hiddenAtRest = s.display === "none" || s.visibility === "hidden" || s.opacity === 0;
    if (!hiddenAtRest) continue;
    const classes = Array.isArray(el.classes) ? el.classes.join(" ") : "";
    if (!REVEAL_TOKEN_RE.test(classes)) continue;
    // Keep the signal low-false-positive: skip menus/dialogs and icon-only bits.
    if (hasAncestorRole(el, elements, ["menu", "menuitem", "listbox", "tablist", "dialog", "navigation"])) continue;
    if (!hasText(el, 8)) continue;
    out.push({
      id: "r-hidden-reveal",
      category: "render-component",
      severity: 1,
      index: i,
      snippet: normText(el).slice(0, 60),
      detail: "content hidden at rest, revealed on hover/focus (“hover:block” pattern) — critical text is invisible to one-shot visitors.",
      fix: "If the content matters, show it. If it is a menu, make it keyboard- and touch-reachable from the start.",
    });
  }

  // aria-hidden duplication: the same >=24-char text in >=2 elements where
  // at least one is aria-hidden and another is visible.
  const normToVisible = new Map(); // normalized text -> [indices...] (visible, not aria-hidden)
  const ariaHiddenWithText = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!hasText(el, 24)) continue;
    const n = normText(el);
    if (el.ariaHidden === true) {
      ariaHiddenWithText.push([i, n]);
    } else if (isVisible(el)) {
      const list = normToVisible.get(n) || [];
      list.push(i);
      normToVisible.set(n, list);
    }
  }
  for (const [i, n] of ariaHiddenWithText) {
    const visibleTwins = normToVisible.get(n) || [];
    if (visibleTwins.length === 0) continue;
    out.push({
      id: "r-hidden-reveal",
      category: "render-component",
      severity: 1,
      index: i,
      snippet: n.slice(0, 60),
      detail: `aria-hidden text (${n.length} chars) duplicated by a visible element — decorative repetition hidden from screen readers.`,
      fix: "Show the text once; if the duplication is decorative, remove one copy instead of hiding it from assistive tech.",
    });
  }
}

/** r-fold-budget — >2 distinct section headers above the 1280x800 fold; headers within 40px of the edge. */
function sectionKeyFor(el, elements) {
  // A section is a distinct block: use the nearest ancestor with tag section
  // / role region, else the heading itself.
  for (const a of ancestorsOf(el, elements)) {
    const tag = (a.tag || "").toLowerCase();
    const role = (a.role || "").toLowerCase();
    if (tag === "section" || role === "region") return a;
  }
  if ((el.tag || "").toLowerCase() === "section" || (el.role || "").toLowerCase() === "region") return el;
  return el;
}

function checkFoldBudget(elements, opts, out) {
  const vp = (opts.viewport && opts.viewport.width) ? opts.viewport : DEFAULT_VIEWPORT;
  const fold = (opts.viewport && opts.viewport.height) ? opts.viewport.height : DEFAULT_VIEWPORT.height;
  const headings = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = (el.tag || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    if (!(/^h[1-6]$/.test(tag) || role === "heading")) continue;
    if (!hasText(el, 1)) continue;
    if (!isVisible(el)) continue;
    const pos = (el.style && el.style.position) || "";
    if (pos === "fixed" || pos === "sticky") continue; // nav/hero chrome
    if (hasAncestorRole(el, elements, ["navigation", "banner"])) continue;
    const r = el.style && el.style.rect;
    if (!r) continue;
    headings.push({ el, index: i, rect: r });
  }
  // Distinct sections = unique sectionKey elements.
  const aboveFold = new Map(); // key index -> { index }
  const edgeWarn = [];
  for (const h of headings) {
    const top = h.rect.viewportY;
    const bottom = top + h.rect.h;
    const sec = sectionKeyFor(h.el, elements);
    const secKey = elements.indexOf(sec);
    if (bottom <= fold) {
      aboveFold.set(secKey, h.index);
    }
    if (bottom > fold - 40 && top < fold) {
      // header sits within 40px of the fold edge (or straddles it)
      edgeWarn.push({ index: h.index, top, bottom, snippet: normText(h.el).slice(0, 60) });
    }
  }
  if (aboveFold.size > 2) {
    out.push({
      id: "r-fold-budget",
      category: "render-layout",
      severity: 2,
      index: [...aboveFold.values()].sort((a, b) => a - b)[0],
      snippet: `fold (${vp.width}x${fold})`,
      detail: `${aboveFold.size} distinct section headers sit above the fold — the budget is 2. The page front-loads every section's claim.`,
      fix: "Pick the ONE promise the first screen must make; move the rest below the fold with real hierarchy.",
    });
  }
  for (const w of edgeWarn) {
    out.push({
      id: "r-fold-budget",
      category: "render-layout",
      severity: 1,
      index: w.index,
      snippet: w.snippet,
      detail: `header bottom (${w.bottom.toFixed(0)}px) is within 40px of the ${fold}px fold — mobile users land mid-hat.`,
      fix: "Give the first section a comfortable margin below the fold so the header can't straddle it.",
    });
  }
}

/** r-screen-budget — >80 visible words per screen (whole snapshot by default, or per declared screen). */
function checkScreenBudget(elements, opts, out) {
  const groups = Array.isArray(opts.screens) && opts.screens.length ? opts.screens : [elements.map((_, i) => i)];
  const vp = (opts.viewport && opts.viewport.height) ? opts.viewport.height : DEFAULT_VIEWPORT.height;
  for (let g = 0; g < groups.length; g++) {
    let words = 0;
    for (const idx of groups[g]) {
      const el = elements[idx];
      if (!hasText(el, 1)) continue;
      if (!isVisible(el)) continue;
      words += wordCount(normText(el));
    }
    if (words > 80) {
      out.push({
        id: "r-screen-budget",
        category: "render-layout",
        severity: 1,
        index: groups[g][0] ?? 0,
        snippet: `${words} words`,
        detail: `screen ${groups.length > 1 ? g + 1 : "1"} carries ${words} visible words — over the ~80-word screen budget.`,
        fix: "One screen, one idea; move supporting prose off the slide/hero.",
      });
    }
  }
}

/** r-section-rhythm — uniform card grid (6+ sibling cards, identical heights + gaps) or repetitive sections. */
function checkSectionRhythm(elements, opts, out) {
  // Sibling cards: same parent, class/href/tag hints, identical rect.h, identical gaps between consecutive sorted-y siblings.
  const byParent = new Map(); // parent index (or -1) -> [i...]
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!isVisible(el)) continue;
    const classes = Array.isArray(el.classes) ? el.classes.join(" ") : "";
    const tag = (el.tag || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const cardish = /(^|[\s_-])card([\s_-]|$)/i.test(classes) || tag === "article" || tag === "li" || role === "listitem" || role === "card";
    if (!cardish) continue;
    const parent = Array.isArray(el.parents) && el.parents.length ? el.parents[0] : -1;
    const list = byParent.get(parent) || [];
    list.push(i);
    byParent.set(parent, list);
  }
  for (const [parent, indices] of byParent) {
    if (indices.length < 6) continue;
    const items = indices
      .map((i) => ({ i, el: elements[i], r: elements[i].style && elements[i].style.rect }))
      .filter((x) => x.r && x.r.h > 0);
    if (items.length < 6) continue;
    items.sort((a, b) => a.r.viewportY - b.r.viewportY || a.r.x - b.r.x);
    const heights = items.map((x) => x.r.h);
    const firstH = heights[0];
    const sameHeight = heights.every((h) => Math.abs(h - firstH) <= 1);
    if (!sameHeight) continue;
    const gaps = [];
    for (let k = 1; k < items.length; k++) {
      gaps.push(items[k].r.viewportY - (items[k - 1].r.viewportY + items[k - 1].r.h));
    }
    const firstGap = gaps[0];
    const sameGap = gaps.every((g) => Math.abs(g - firstGap) <= 1);
    if (!sameGap) continue;
    out.push({
      id: "r-section-rhythm",
      category: "render-layout",
      severity: 1,
      index: items[0].i,
      snippet: `${items.length} uniform card(s)`,
      detail: `${items.length} sibling cards share identical height (${firstH.toFixed(0)}px) and identical gaps (${firstGap.toFixed(0)}px) — the uniform grid with no hierarchy.`,
      fix: "Decide the single most important card and let it lead; vary size, weight, or spacing.",
    });
  }

  // Repetitive sections: >=3 consecutive sections (tag section / role region)
  // with identical heights and identical between-gaps.
  const sections = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = (el.tag || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    if ((tag === "section" || role === "region") && isVisible(el) && el.style && el.style.rect && el.style.rect.h > 0) {
      sections.push({ i, r: el.style.rect });
    }
  }
  if (sections.length >= 3) {
    sections.sort((a, b) => a.r.viewportY - b.r.viewportY);
    const heights = sections.map((s) => s.r.h);
    let runStart = 0;
    for (let k = 1; k < sections.length; k++) {
      const sameH = Math.abs(heights[k] - heights[k - 1]) <= 1;
      const gapA = sections[k].r.viewportY - (sections[k - 1].r.viewportY + sections[k - 1].r.h);
      const sameGap = k < 2 || Math.abs(gapA - (sections[k - 1].r.viewportY - (sections[k - 2].r.viewportY + sections[k - 2].r.h))) <= 1;
      if (!sameH || !sameGap) {
        runStart = k;
        continue;
      }
      if (k - runStart + 1 >= 3) {
        out.push({
          id: "r-section-rhythm",
          category: "render-layout",
          severity: 1,
          index: sections[runStart].i,
          snippet: `${k - runStart + 2} repetitive section(s)`,
          detail: `${k - runStart + 2} consecutive sections share identical height (${heights[k].toFixed(0)}px) and identical gaps — beats as one rhythm, no visual reasons for section breaks.`,
          fix: "Let section size encode content weight; identical blocks imply identical importance.",
        });
        break;
      }
    }
  }
}

/** r-fake-progress — progressbar without aria-valuenow and without animation. */
function checkFakeProgress(elements, opts, out) {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const tag = (el.tag || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const isProgress = role === "progressbar" || tag === "progress";
    const classes = Array.isArray(el.classes) ? el.classes.join(" ") : "";
    const percentMarker = !isProgress && /^(?:progress|percent|score|meter)/i.test(classes) && /^\s*\d{1,3}\s*%?\s*$/.test(normText(el));
    if (!isProgress && !percentMarker) continue;
    const s = el.style || {};
    const hasValuenow = el.ariaValuenow !== null && el.ariaValuenow !== undefined;
    const hasAnimation = !!(s.animation && /(infinite|marquee|scroll|pulse|progress|bar)/i.test(s.animation));
    if (hasValuenow && !hasAnimation) continue; // real, live progress
    if (hasAnimation) continue; // animating = has an update mechanism
    out.push({
      id: "r-fake-progress",
      category: "render-component",
      severity: 1,
      index: i,
      snippet: normText(el).slice(0, 40) || tag,
      detail: isProgress
        ? "progressbar with no aria-valuenow and no animation — decorative progress with no dynamic source."
        : 'static percent-age marker ("' + normText(el).trim() + '") with no progress semantics or update mechanism.',
      fix: "Either drive it with a real value (and expose aria-valuenow) or remove the fake loading theatre.",
    });
  }
}

/** r-contrast — WCAG text contrast over the computed (or nearest ancestor) background. */
function checkContrast(elements, opts, out) {
  const documentStyle = opts.documentStyle || null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!hasText(el, 2)) continue;
    if (!isVisible(el)) continue;
    const s = el.style || {};
    if (!s.color) continue;
    if (s.opacity !== undefined && s.opacity < 1) continue; // composited text: unprovable from the snapshot
    const fg = parseColor(s.color);
    if (!fg) continue;
    const bg = resolveBackground(el, elements, documentStyle);
    if (!bg) continue;
    const ratio = contrastRatio(fg, bg);
    const px = s.fontSizePx || 0;
    const bold = (s.fontWeight || 0) >= LARGE_TEXT_BOLD_WEIGHT;
    const large = px >= LARGE_TEXT_PX || (px >= LARGE_TEXT_BOLD_PX && bold);
    const threshold = large ? 3 : 4.5;
    if (ratio < threshold) {
      out.push({
        id: "r-contrast",
        category: "render-a11y",
        severity: 3,
        index: i,
        snippet: normText(el).slice(0, 60),
        detail: `contrast ${ratio.toFixed(2)}:1 (${large ? "large" : "normal"} text, threshold ${threshold}:1) over the computed background.`,
        fix: "Darken the text (or lighten the fill) until normal text is at least 4.5:1 and large text 3:1.",
      });
    }
  }
}

const CHECK_FNS = [
  checkKickerSize,
  checkGradientText,
  checkTrackedCaps,
  checkGluedArrow,
  checkMarquee,
  checkHiddenReveal,
  checkFoldBudget,
  checkScreenBudget,
  checkSectionRhythm,
  checkFakeProgress,
  checkContrast,
];

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const VERDICTS = [
  { max: 9, label: "clean" },
  { max: 29, label: "light" },
  { max: 59, label: "moderate" },
  { max: Infinity, label: "heavy" },
];
const CLEAN_THRESHOLD = 9;
const PATTERN_POINT_CAP_MULTIPLIER = 3;

function sortMatches(matches) {
  return [...matches].sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * scanRender(snapshot, opts) — run all rendered checks over a computed
 * snapshot. opts: { viewport?, documentStyle?, screens?, profile? }.
 * Returns the render report (same shape families as the base scanner).
 */
function scanRender(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== "object") throw new TypeError("scanRender expects a snapshot object");
  if (!Array.isArray(snapshot.elements)) throw new TypeError("snapshot.elements must be an array");
  const cleaned = sanitizeSnapshot(snapshot);
  const elements = cleaned.elements.slice(0, MAX_ELEMENTS);
  const runOpts = {
    viewport: cleaned.viewport,
    // cleaned.screens is ALREADY null when the raw value was empty/invalid —
    // never fall back to snapshot.screens here: a raw non-empty screens
    // array whose every index is out of bounds (e.g. [[999999]]) would be
    // reintroduced and crash checkScreenBudget (elements[idx] === undefined).
    screens: cleaned.screens,
    documentStyle: cleaned.documentStyle,
  };
  const rawMatches = [];
  for (const fn of CHECK_FNS) fn(elements, runOpts, rawMatches);
  const matches = sortMatches(rawMatches);

  // Point scoring mirrors the base scanner: per-pattern cap severity*3.
  const pointsByPattern = new Map();
  let totalPoints = 0;
  const counts = new Map();
  for (const m of matches) {
    const cap = m.severity * PATTERN_POINT_CAP_MULTIPLIER;
    const used = pointsByPattern.get(m.id) || 0;
    let add = m.severity;
    if (used + add > cap) add = Math.max(0, cap - used);
    pointsByPattern.set(m.id, used + add);
    totalPoints += add;
    const slot = counts.get(m.category) || { count: 0, points: 0 };
    slot.count += 1;
    slot.points += add;
    counts.set(m.category, slot);
  }
  const score = Math.round(100 * (1 - Math.exp(-totalPoints / 28)));
  const clamped = Math.max(0, Math.min(100, score));
  const verdict = VERDICTS.find((v) => clamped <= v.max).label;

  const report = {
    engine: ENGINE_NAME,
    version: opts.reportVersion || (corpus && corpus.version) || "unknown",
    input: {
      type: "render-snapshot",
      elements: elements.length,
      viewport: runOpts.viewport,
    },
    score: clamped,
    verdict,
    clean: clamped <= CLEAN_THRESHOLD,
    totalPoints,
    matches,
    categories: [...counts.entries()]
      .map(([id, slot]) => ({
        id,
        name: (RENDER_CATEGORIES[id] && RENDER_CATEGORIES[id].name) || id,
        count: slot.count,
        points: slot.points,
      }))
      .sort((a, b) => b.points - a.points || b.count - a.count),
    checks: RENDER_CHECKS.map((c) => ({ id: c.id, name: c.name, desc: c.desc })),
  };

  if (opts.profile !== undefined && opts.profile !== null) {
    return profilesModule ? profilesModule.applyProfileReport(report, opts.profile) : report;
  }
  return report;
}

const api = {
  scanRender,
  RENDER_CHECKS,
  RENDER_CATEGORIES,
  checkById: CHECK_BY_ID,
  version: corpus ? corpus.version : "1.4.5",
};

if (typeof window !== "undefined") {
  window.SlopRenderChecks = api;
}

return api;
});