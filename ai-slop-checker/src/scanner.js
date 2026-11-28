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

// ---------------------------------------------------------------------------
// Suppression directives
// ---------------------------------------------------------------------------
// A scan can be told to keep a deliberate tell: a comment-style directive in
// the scanned text names the rule and WHY.
//
//   slop-ignore-next-line: d-gradient-text — the brand mark is a gradient
//   slop-ignore: w-utilize -- quoted from the customer's own copy
//   slop-ignore-file: e-em-dash | house style, signed off 2026-11-27
//
// Rules of the mechanism, in order of importance:
//
//   1. A suppressed finding is NEVER dropped. It stays in `matches` flagged
//      `suppressed: true` with the reason attached, and is excluded from the
//      score only. A report you can read is the whole point.
//   2. A directive without a reason suppresses nothing. "Ignore this" is not
//      a decision; the directive is recorded as invalid so the omission is
//      visible instead of silently inert.
//   3. `*` (or `all`) names every rule. A comma/space list names several.
//
// Directives are line-scoped in the scanned text. `next-line` covers the line
// after the directive, bare `slop-ignore` covers its own line, `-file` covers
// everything.

const DIRECTIVE_RE = /\bslop-ignore(-next-line|-file)?\b\s*:?\s*(.*)$/i;
// Reason separators. A bare "-" is deliberately absent: rule ids contain
// hyphens (`w-utilize`), so splitting on it would eat the id.
const REASON_SEP_RE = /\s*(?:—|–|\s--\s|::|\|)\s*/;
const MIN_REASON_CHARS = 3;

/** Split a directive tail into { ids, reason }. reason === "" means no reason. */
function parseDirectiveTail(tail) {
  const text = String(tail || "").trim();
  if (!text) return { ids: null, reason: "" };
  const parts = text.split(REASON_SEP_RE);
  const head = parts.length > 1 ? parts[0] : text;
  const reason = parts.length > 1 ? parts.slice(1).join(" ").trim() : "";
  const ids = [];
  let all = false;
  for (const tok of head.match(/[A-Za-z0-9_*][A-Za-z0-9_.*-]*/g) || []) {
    if (tok === "*" || /^all$/i.test(tok)) all = true;
    else ids.push(tok.toLowerCase());
  }
  if (all) return { ids: null, reason };
  return { ids: ids.length ? ids : null, reason };
}

/** 1-based line number for a character offset, via a precomputed line-start table. */
function lineForOffset(lineStarts, offset) {
  if (!Array.isArray(lineStarts) || lineStarts.length === 0) return 1;
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** Line-start offsets for a text (index 0 is line 1). */
function lineStartsOf(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/**
 * Parse every suppression directive in a text.
 * Returns { directives, invalid, lineStarts }:
 *   directives: [{ kind: "line"|"next-line"|"file", line, ids: string[]|null, reason }]
 *   invalid:    [{ line, ids, why }] — directives that suppress nothing
 */
function parseSuppressions(text) {
  const directives = [];
  const invalid = [];
  if (typeof text !== "string" || text.length === 0) return { directives, invalid, lineStarts: [0] };
  const lineStarts = lineStartsOf(text);
  for (let i = 0; i < lineStarts.length; i++) {
    const lineNo = i + 1;
    const start = lineStarts[i];
    const end = i + 1 < lineStarts.length ? lineStarts[i + 1] - 1 : text.length;
    const line = text.slice(start, end);
    if (line.indexOf("slop-ignore") === -1) continue;
    const m = line.match(DIRECTIVE_RE);
    if (!m) continue;
    const suffix = (m[1] || "").toLowerCase();
    const { ids, reason } = parseDirectiveTail(m[2]);
    const kind = suffix === "-file" ? "file" : suffix === "-next-line" ? "next-line" : "line";
    if (reason.length < MIN_REASON_CHARS) {
      invalid.push({
        line: lineNo,
        kind,
        ids,
        why:
          reason.length === 0
            ? "no reason given — a directive without a reason suppresses nothing"
            : `reason is ${reason.length} char(s); at least ${MIN_REASON_CHARS} required`,
      });
      continue;
    }
    const targets = kind === "next-line" ? [lineNo + 1] : kind === "file" ? null : [lineNo];
    directives.push({ kind, line: lineNo, targets, ids, reason });
  }
  return { directives, invalid, lineStarts };
}

/** True when a directive covers this line and names this rule id. */
function directiveCovers(directive, line, id) {
  const lineOk =
    directive.kind === "file" ||
    (Array.isArray(directive.targets) && directive.targets.indexOf(line) !== -1);
  if (!lineOk) return false;
  if (directive.ids === null) return true;
  return directive.ids.indexOf(String(id).toLowerCase()) !== -1;
}

/** The reason that suppresses `id` on `line`, or null. */
function suppressionReasonFor(directives, line, id) {
  for (const d of directives) if (directiveCovers(d, line, id)) return d.reason;
  return null;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------
// "Which rules actually ran, which fired, and what each category contributed."
// A clean scan and a scan that never evaluated the relevant rule look
// identical in a bare score; coverage is how a reader tells them apart.

function buildCoverage(evaluatedPatterns, matches, opts = {}) {
  const firedById = new Map();
  let suppressedCount = 0;
  for (const m of matches) {
    if (m.suppressed) { suppressedCount++; continue; }
    firedById.set(m.id, (firedById.get(m.id) || 0) + 1);
  }

  const perCategory = new Map();
  for (const p of evaluatedPatterns) {
    const slot = perCategory.get(p.category) || {
      id: p.category,
      name: (corpus.categoryById[p.category] && corpus.categoryById[p.category].name) || p.category,
      evaluated: 0,
      fired: 0,
    };
    slot.evaluated++;
    perCategory.set(p.category, slot);
  }
  for (const [id, n] of firedById) {
    const p = evaluatedPatterns.find((x) => x.id === id);
    const catId = p ? p.category : (matches.find((m) => m.id === id) || {}).category;
    const slot = perCategory.get(catId);
    if (slot) slot.fired += n;
  }

  const evaluatedIds = evaluatedPatterns.map((p) => p.id);
  const firedIds = [...firedById.keys()].sort();
  const coverage = {
    rulesEvaluated: evaluatedPatterns.length,
    rulesFired: firedIds.length,
    rulesSilent: evaluatedPatterns.length - firedIds.length,
    matchesSuppressed: suppressedCount,
    fired: firedIds,
    categories: [...perCategory.values()]
      .map((c) => ({ ...c, silent: Math.max(0, c.evaluated - c.fired) }))
      .sort((a, b) => b.fired - a.fired || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  if (opts.full) {
    coverage.evaluated = evaluatedIds;
    coverage.silent = evaluatedIds.filter((id) => !firedById.has(id));
  }
  return coverage;
}

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
 *
 * opts:
 *   excerpt?      truncate very long input (unchanged behaviour)
 *   profile?      severity profile id/object
 *   suppress?     false to disable suppression directives (CLI --no-suppress)
 *   coverage?     true to also include the per-rule `evaluated`/`silent` lists
 */
function scanText(text, opts = {}) {
  if (typeof text !== "string") throw new TypeError("scanText expects a string");
  if (!opts.excerpt && text.length > 200000) text = text.slice(0, 200000);

  const matches = [];
  const evaluated = [];
  const textPatterns = corpus.patterns.filter(IS_TEXT_PATTERN);
  const suppressions =
    opts.suppress === false ? { directives: [], invalid: [] } : parseSuppressions(text);
  const lineStarts = suppressions.lineStarts || lineStartsOf(text);

  for (const pattern of textPatterns) {
    evaluated.push(pattern);

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

  applySuppressions(matches, suppressions, lineStarts);
  return applyProfile(
    buildReport(matches, { type: "text", length: text.length }, { evaluated, suppressions, opts }),
    opts.profile
  );
}

/**
 * Mark matches that a suppression directive covers.
 *
 * Never removes a match: sets `suppressed: true` and `suppressionReason`, so
 * the report still shows the finding and the score is the only thing that
 * changes. A directive with no reason never reaches this function (see
 * parseSuppressions), so nothing can be suppressed silently.
 */
function applySuppressions(matches, suppressions, lineStarts) {
  if (!suppressions || !suppressions.directives || suppressions.directives.length === 0) return matches;
  for (const match of matches) {
    if (typeof match.index !== "number" || match.index < 0) continue;
    const line = lineForOffset(lineStarts, match.index);
    const reason = suppressionReasonFor(suppressions.directives, line, match.id);
    if (reason !== null) {
      match.suppressed = true;
      match.suppressionReason = reason;
      match.line = line;
    }
  }
  return matches;
}

/** Keep only the matches a predicate accepts (used to scope HTML suppressions by kind). */
function filterMatches(matches, predicate) {
  return matches.filter(predicate);
}

/**
 * Scan an HTML document. Text tells are detected on the extracted visible
 * text; design tells are detected as heuristics over the raw markup/CSS.
 *
 * Suppression directives are read from BOTH the raw markup (so an HTML
 * comment can keep a deliberate design tell) and the visible text (so the
 * page's own copy can keep a deliberate writing tell). A `-file` directive in
 * either place applies to everything.
 */
function scanHtml(html, opts = {}) {
  if (typeof html !== "string") throw new TypeError("scanHtml expects a string");
  const visible = extractText(html);
  const suppressOn = opts.suppress !== false;

  const textMatches = visible ? scanText(visible, { ...opts, suppress: suppressOn }).matches : [];
  const designMatches = [];

  const evaluated = [];
  const htmlPatterns = corpus.patterns.filter((p) => !IS_TEXT_PATTERN(p));
  for (const pattern of htmlPatterns) {
    evaluated.push(pattern);
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

  let suppressions = { directives: [], invalid: [], lineStarts: [0] };
  if (suppressOn) {
    const rawSupp = parseSuppressions(html);
    const visSupp = visible ? parseSuppressions(visible) : { directives: [], invalid: [], lineStarts: [0] };
    const merged = [...rawSupp.directives, ...visSupp.directives];
    const fileScoped = merged.filter((d) => d.kind === "file");
    suppressions = {
      directives: merged,
      invalid: [...rawSupp.invalid, ...visSupp.invalid],
      lineStarts: rawSupp.lineStarts,
    };
    applySuppressions(textMatches, { directives: [...fileScoped, ...visSupp.directives] }, visSupp.lineStarts);
    applySuppressions(designMatches, { directives: merged }, rawSupp.lineStarts);
  }

  const matches = [...textMatches, ...designMatches].sort((a, b) => a.index - b.index);
  return applyProfile(
    buildReport(matches, { type: "html", length: html.length }, { evaluated, suppressions, opts }),
    opts.profile
  );
}

/**
 * Scan raw source text (CSS, JS class strings, component markup) for
 * design-* tells only. Used by the project scanner for styles/code files
 * where the writing-tell patterns would drown in identifiers.
 */
function scanDesign(raw, opts = {}) {
  if (typeof raw !== "string") throw new TypeError("scanDesign expects a string");
  const designMatches = [];
  const evaluated = [];
  const suppressOn = opts.suppress !== false;
  const suppressions = suppressOn ? parseSuppressions(raw) : { directives: [], invalid: [], lineStarts: [0] };

  for (const pattern of corpus.patterns) {
    if (IS_TEXT_PATTERN(pattern)) continue; // design-* only
    evaluated.push(pattern);
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

  applySuppressions(designMatches, suppressions, suppressions.lineStarts);
  return applyProfile(
    buildReport(designMatches, { type: "design", length: raw.length }, { evaluated, suppressions, opts }),
    opts.profile
  );
}

/**
 * Build the final report from matches.
 *
 * Suppressed matches stay in `matches` (flagged) but contribute no points and
 * no category count — a suppression is a decision about the score, never a
 * deletion from the record.
 */
function buildReport(matches, input, extra = {}) {
  const pointsByPattern = new Map();
  let totalPoints = 0;
  const counts = new Map(); // category -> { name, count, points }

  for (const match of matches) {
    if (match.suppressed) continue;
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

  const report = {
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

  const suppressed = matches.filter((m) => m.suppressed);
  const suppressions = extra.suppressions || { directives: [], invalid: [] };
  report.suppressions = {
    applied: suppressed.map((m) => ({ id: m.id, line: m.line ?? null, reason: m.suppressionReason })),
    directives: suppressions.directives.length,
    invalid: suppressions.invalid || [],
  };

  if (Array.isArray(extra.evaluated)) {
    report.coverage = buildCoverage(extra.evaluated, matches, { full: Boolean(extra.opts && extra.opts.coverage) });
  }

  return report;
}

const api = {
  version: corpus.version,
  scanText,
  scanHtml,
  scanDesign,
  extractText,
  countEmoji,
  parseSuppressions,
  buildCoverage,
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