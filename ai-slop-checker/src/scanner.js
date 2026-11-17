"use strict";
/**
 * Lazynext AI Slop Checker — deterministic scan engine.
 *
 * (see header above for the scan report shape)
 *
 * UMD-style module: CommonJS on Node (module.exports) and a browser global
 * (window.SlopScanner) when loaded via <script> in the no-build web checker.
 * Uses an IIFE so the three engine files can share the global scope without
 * top-level identifier collisions.
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
    window.SlopScanner = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function engine(corpus, profilesModule) {

const ENGINE_NAME = "lazynext-ai-slop-checker";

// Scoring: a text is "clean" at or below this score.
const CLEAN_THRESHOLD = 9;
const VERDICTS = [
  { max: 9, label: "clean" },
  { max: 29, label: "light" },
  { max: 59, label: "moderate" },
  { max: Infinity, label: "heavy" },
];

// Pattern-level scoring cap: a single pattern can only add severity * 3
// points, so a document with one repeated tell does not saturate the score.
const PATTERN_POINT_CAP_MULTIPLIER = 3;

// Em-dash handling: report one aggregate match for clusters of 3+ dashes
// (a single em-dash is legal; the habit is the tell).
const EM_DASH_MIN_COUNT = 3;

const IS_TEXT_PATTERN = (p) => !p.category.startsWith("design-");

const _cache = new Map();

function compiled(p) {
  if (!_cache.has(p.id)) _cache.set(p.id, corpus.patternToRegExp(p));
  return _cache.get(p.id);
}

const EMOJI_RE = /(\p{Extended_Pictographic})/gu;

/**
 * Apply a severity profile to a finished report (data/profiles.js).
 * null/undefined/`default` pass the report through untouched; a true
 * profile refilters matches and re-scores via the shared scorer so the
 * verdict/clean/categories all honour the profile's threshold.
 */
function applyProfile(report, profileOpt) {
  if (profileOpt === undefined || profileOpt === null) return report;
  if (!profilesModule) {
    throw new Error(
      "a severity profile was requested but data/profiles.js is not loaded — load it before src/scanner.js in the browser"
    );
  }
  return profilesModule.applyProfileReport(report, profileOpt);
}

/**
 * Extract visible text from an HTML string (no DOM needed).
 * Strips script/style/comments, decodes common entities, collapses space.
 */
function extractText(html) {
  if (typeof html !== "string") return "";
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|template|svg|math|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => decodeEntity(h, 16))
    .replace(/&#([0-9]+);/g, (_, d) => decodeEntity(d, 10));
  return s.replace(/\s+/g, " ").trim();
}

// Decode a numeric character reference safely: code points above U+10FFFF
// (or otherwise out of range) are replaced with U+FFFD instead of letting
// String.fromCodePoint throw a RangeError on hostile/malformed markup
// (e.g. "&#1114112;" — a crafted numeric entity crashes a naive decoder).
// Hex references (&#x1F600;) must decode base 16 — a shared base-10 parse
// would turn "1F600" into U+0001 and silently corrupt every hex entity.
function decodeEntity(digits, radix) {
  const cp = Number.parseInt(digits, radix);
  if (cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
  return "\uFFFD";
}

function contextAround(text, index, radius = 60) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end);
}

/** Count emoji code points in a string. */
function countEmoji(text) {
  const m = text.match(EMOJI_RE);
  return m ? m.length : 0;
}

/**
 * Scan plain text. Returns the full report (matches are all text-kind).
 */
function scanText(text, opts = {}) {
  if (typeof text !== "string") throw new TypeError("scanText expects a string");
  if (!opts.excerpt && text.length > 200000) text = text.slice(0, 200000);

  const matches = [];

  for (const pattern of corpus.patterns) {
    if (!IS_TEXT_PATTERN(pattern)) continue;

    // Em-dash habit is counted as an aggregate, not per occurrence.
    if (pattern.id === "e-em-dash") {
      const dashCount = (text.match(/[\u2014\u2012]/g) || []).length;
      if (dashCount >= EM_DASH_MIN_COUNT) {
        const index = text.search(/[\u2014\u2012]/);
        matches.push({
          id: pattern.id,
          category: pattern.category,
          severity: pattern.severity,
          kind: "count",
          index,
          snippet: `—`,
          context: contextAround(text, index),
          detail: `${dashCount} em/en dashes — the AI rhythm crutch.`,
          fix: pattern.fix,
          rewrite: pattern.rewrite,
        });
      }
      continue;
    }

    const re = compiled(pattern);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const matched = m[0];
      const index = m.index;
      // Avoid zero-length matches causing an infinite loop.
      if (matched.length === 0) {
        re.lastIndex += 1;
        continue;
      }
      matches.push({
        id: pattern.id,
        category: pattern.category,
        severity: pattern.severity,
        kind: pattern.kind,
        index,
        snippet: matched.trim().slice(0, 80),
        context: contextAround(text, index),
        fix: pattern.fix,
        rewrite: pattern.rewrite,
      });
      // Regex patterns without global state handling: guard runaway scans.
      if (matches.length > 2000) break;
    }
    if (matches.length > 2000) break;
  }

  return applyProfile(buildReport(matches, { type: "text", length: text.length }), opts.profile);
}

/**
 * Scan an HTML document. Text tells are detected on the extracted visible
 * text; design tells are detected as heuristics over the raw markup/CSS.
 */
function scanHtml(html, opts = {}) {
  if (typeof html !== "string") throw new TypeError("scanHtml expects a string");
  const visible = extractText(html);

  const textMatches = visible ? scanText(visible).matches : [];
  const designMatches = [];

  for (const pattern of corpus.patterns) {
    if (IS_TEXT_PATTERN(pattern)) continue; // design-* only
    const re = compiled(pattern);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const matched = m[0];
      if (matched.length === 0) {
        re.lastIndex += 1;
        continue;
      }
      designMatches.push({
        id: pattern.id,
        category: pattern.category,
        severity: pattern.severity,
        kind: pattern.kind,
        index: m.index,
        snippet: matched.trim().slice(0, 80),
        context: contextAround(html, m.index),
        fix: pattern.fix,
        rewrite: pattern.rewrite,
      });
      if (designMatches.length > 500) break;
    }
    if (designMatches.length > 500) break;
  }

  // Also count emoji in visible text: ≥3 is a slop-signal in UI copy.
  const emojiCount = countEmoji(visible);
  if (emojiCount >= 3) {
    const first = visible.search(EMOJI_RE);
    designMatches.push({
      id: "d-emoji-density",
      category: "design-copy",
      severity: 2,
      kind: "count",
      index: first >= 0 ? first : -1,
      snippet: visible.slice(first, first + 1),
      context: contextAround(visible, first),
      detail: `${emojiCount} emoji in the visible copy.`,
      fix: "Cut decorative emoji; keep one only where it carries real status.",
      rewrite: "",
    });
  }

  const matches = [...textMatches, ...designMatches].sort((a, b) => a.index - b.index);
  return applyProfile(buildReport(matches, { type: "html", length: html.length }), opts.profile);
}

/**
 * Scan raw source text (CSS, JS class strings, component markup) for
 * design-* tells only. Used by the project scanner for styles/code files
 * where the writing-tell patterns would drown in identifiers.
 */
function scanDesign(raw, opts = {}) {
  if (typeof raw !== "string") throw new TypeError("scanDesign expects a string");
  const designMatches = [];
  for (const pattern of corpus.patterns) {
    if (IS_TEXT_PATTERN(pattern)) continue; // design-* only
    const re = compiled(pattern);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const matched = m[0];
      if (matched.length === 0) {
        re.lastIndex += 1;
        continue;
      }
      designMatches.push({
        id: pattern.id,
        category: pattern.category,
        severity: pattern.severity,
        kind: pattern.kind,
        index: m.index,
        snippet: matched.trim().slice(0, 80),
        context: contextAround(raw, m.index),
        fix: pattern.fix,
        rewrite: pattern.rewrite,
      });
      if (designMatches.length > 500) break;
    }
    if (designMatches.length > 500) break;
  }
  return applyProfile(buildReport(designMatches, { type: "design", length: raw.length }), opts.profile);
}

/**
 * Build the final report from matches.
 */
function buildReport(matches, input) {
  const pointsByPattern = new Map();
  let totalPoints = 0;
  const counts = new Map(); // category -> { name, count, points }

  for (const match of matches) {
    const cap = match.severity * PATTERN_POINT_CAP_MULTIPLIER;
    const used = pointsByPattern.get(match.id) || 0;
    let add = match.severity;
    if (used + add > cap) add = Math.max(0, cap - used);
    pointsByPattern.set(match.id, used + add);
    totalPoints += add;

    const slot = counts.get(match.category) || {
      name: corpus.categoryById[match.category]?.name || match.category,
      count: 0,
      points: 0,
    };
    slot.count += 1;
    slot.points += add;
    counts.set(match.category, slot);
  }

  // Exponential decay: 0 → 0, ~28 points → ~63, ~56 → ~86, 90+ → ~96.
  const score = Math.round(100 * (1 - Math.exp(-totalPoints / 28)));
  const clamped = Math.max(0, Math.min(100, score));
  const verdict = VERDICTS.find((v) => clamped <= v.max).label;

  return {
    engine: ENGINE_NAME,
    version: corpus.version,
    input,
    score: clamped,
    verdict,
    clean: clamped <= CLEAN_THRESHOLD,
    totalPoints,
    matches,
    categories: [...counts.entries()]
      .map(([id, slot]) => ({ id, name: slot.name, count: slot.count, points: slot.points }))
      .sort((a, b) => b.points - a.points || b.count - a.count),
  };
}

const api = {
  version: corpus.version,
  scanText,
  scanHtml,
  scanDesign,
  extractText,
  countEmoji,
  patterns: corpus.patterns,
  categories: corpus.categories,
  rules: corpus,
  // Build a fresh engine over a different corpus (e.g. after loadRules
  // deep-merges custom rules). The body of this module IS the engine
  // factory, so calling it again with a merged corpus yields a completely
  // independent scanner with its own pattern-compile cache.
  createEngine: engine,
};

// Browser global for the no-build web checker.
if (typeof window !== "undefined") {
  window.SlopScanner = api;
}

return api;
});