"use strict";
/**
 * Lazynext AI Slop Checker — external rules loader.
 *
 * Deep-merges custom rule sets into the built-in corpus so the same engine
 * can run under user-supplied rules (new categories appended, patterns in
 * existing categories folded in, duplicate pattern ids rejected).
 *
 * UMD-style module: CommonJS on Node (module.exports) and a browser global
 * (window.SlopRules) when loaded via <script>. The merge itself is pure
 * data work, so the same code runs on both sides.
 *
 * Merged corpora are consumed with scanner.createEngine(mergedCorpus):
 *
 *   const { loadRules } = require("./src/rules-loader.js");
 *   const { createEngine } = require("./src/scanner.js");
 *   const merged = loadRules(pathOrObject);
 *   const engine = createEngine(merged);   // scanText/scanHtml/scanDesign
 *
 * Supported inputs (node):
 *   - a path to a .js module that module.exports a corpus-like object
 *     ({ categories?, patterns, version? }) or a bare array of patterns
 *   - a path to a .json file with the same shapes
 *   - a glob string ("rules/star-star/star.js") or a comma-separated list
 *     of any of the above; files are merged in sorted order
 * In the browser: a plain object (or array) — no file access.
 */
(function (root, factory) {
  const base =
    typeof module !== "undefined" && module.exports
      ? require("../data/slop-patterns.js")
      : root.SlopPatterns;
  const api = factory(base, typeof module !== "undefined" && module.exports ? require("node:fs") : null, typeof module !== "undefined" && module.exports ? require("node:path") : null);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopRules = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (BASE_CORPUS, fs, path) {

const VALID_KINDS = new Set(["word", "phrase", "regex"]);
const VALID_SEVERITIES = new Set([1, 2, 3]);

/**
 * Validate a custom pattern object. Throws a descriptive Error on any
 * malformed field so bad rule files fail loudly instead of silently
 * changing scan behaviour.
 */
function validatePattern(p, source) {
  const where = source ? ` (in ${source})` : "";
  if (!p || typeof p !== "object") throw new Error(`custom rule${where} must be an object`);
  if (typeof p.id !== "string" || p.id.length === 0) throw new Error(`custom rule${where} needs a non-empty string id`);
  if (typeof p.category !== "string" || p.category.length === 0) throw new Error(`custom rule "${p.id}"${where} needs a category`);
  if (!VALID_KINDS.has(p.kind)) throw new Error(`custom rule "${p.id}"${where} has unsupported kind "${p.kind}" (expected word|phrase|regex)`);
  if (!VALID_SEVERITIES.has(p.severity)) throw new Error(`custom rule "${p.id}"${where} has unsupported severity "${p.severity}" (expected 1|2|3)`);
  if (typeof p.match !== "string" || p.match.length === 0) throw new Error(`custom rule "${p.id}"${where} needs a non-empty match string`);
  return p;
}

function validateCategory(c, source) {
  const where = source ? ` (in ${source})` : "";
  if (!c || typeof c !== "object") throw new Error(`custom category${where} must be an object`);
  if (typeof c.id !== "string" || c.id.length === 0) throw new Error(`custom category${where} needs a non-empty string id`);
  if (typeof c.name !== "string" || c.name.length === 0) throw new Error(`custom category "${c.id}"${where} needs a name`);
  return c;
}

/**
 * Normalize a loaded custom rules payload into { categories, patterns }
 * arrays. Accepts:
 *   - { version?, categories?, patterns }   (corpus-like)
 *   - [ pattern, ... ]                      (bare pattern array)
 */
function normalizePayload(payload, source, out = { categories: [], patterns: [] }) {
  if (Array.isArray(payload)) {
    for (const p of payload) out.patterns.push(validatePattern(p, source));
    return out;
  }
  if (payload && typeof payload === "object") {
    if (payload.categories) {
      if (!Array.isArray(payload.categories)) throw new Error(`custom categories ${source ? `in ${source} ` : ""}must be an array`);
      for (const c of payload.categories) out.categories.push(validateCategory(c, source));
    }
    if (payload.patterns) {
      if (!Array.isArray(payload.patterns)) throw new Error(`custom patterns ${source ? `in ${source} ` : ""}must be an array`);
      for (const p of payload.patterns) out.patterns.push(validatePattern(p, source));
    }
    if (payload.version !== undefined) out.version = String(payload.version);
    return out;
  }
  throw new Error(`custom rules payload${source ? ` in ${source} ` : " "}must be an object or an array of patterns`);
}

// ---------------------------------------------------------------------------
// Node-only: file + glob resolution
// ---------------------------------------------------------------------------

const GLOB_CHARS = /[*?[\]{}()!+]/;

function matchesGlob(rel, pattern) {
  // Minimal glob: converts the pattern into a RegExp supporting * ** ? []
  // (no extglobs). Deterministic and dependency-free.
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches any depth, including none
        re += ".*";
        i += 2;
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      re += "[^/]";
      i += 1;
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        re += "\\[";
        i += 1;
      } else {
        re += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      re += ch.replace(/[.+^${}()|\\]/g, "\\$&");
      i += 1;
    }
  }
  const reObj = new RegExp(`^${re}$`);
  return reObj.test(rel);
}

/**
 * Expand a single rules pattern to matching file paths under dir.
 * Files are returned in sorted order for determinism.
 */
function expandPatternIntoFiles(pattern) {
  const abs = path.resolve(pattern);
  if (!GLOB_CHARS.test(pattern)) {
    // Literal path: must exist.
    if (!fs.existsSync(abs)) throw new Error(`rules file not found: ${abs}`);
    return [abs];
  }
  // Split the glob into a base dir and the pattern tail.
  const slug = abs.indexOf("*");
  const slashBeforeWild = abs.lastIndexOf("/", slug);
  const baseDir = slashBeforeWild === -1 ? process.cwd() : abs.slice(0, slashBeforeWild);
  const tail = abs.slice(baseDir.length + 1);

  const hits = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), childRel);
      else if (e.isFile() && matchesGlob(childRel, tail)) hits.push(path.join(dir, e.name));
    }
  };
  walk(baseDir, "");
  if (hits.length === 0) throw new Error(`no rules files matched: ${pattern}`);
  return hits.sort();
}

/**
 * Resolve a --rules value (comma-separated paths/globs) into an ordered
 * list of absolute file paths. Node-only.
 */
function resolveRuleFiles(value) {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) out.push(...expandPatternIntoFiles(part));
  return out;
}

function readRuleFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`rules file is not valid JSON: ${file} (${err.message})`);
    }
  }
  const mod = require(file);
  // CommonJS module exports the payload directly.
  return mod && mod.__esModule && mod.default ? mod.default : mod;
}

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

/**
 * Deep-merge a custom payload into a base corpus.
 *
 *   - custom categories with a NEW id are appended
 *   - custom categories with an EXISTING id merge into the base category
 *     (custom name/desc win where provided; the slot is not duplicated)
 *   - custom patterns are appended; a pattern id that already exists — in
 *     the base corpus or in the custom set — is rejected with a clear error
 *   - custom version overrides the base version when present
 *
 * Returns a new corpus-like object ({ version, categories, patterns,
 * categoryById, patternToRegExp }) ready for scanner.createEngine().
 */
function mergeCorpus(base, custom, source) {
  const categories = base.categories.map((c) => ({ ...c }));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const patterns = [...base.patterns];
  const seen = new Set(base.patterns.map((p) => p.id));

  for (const c of custom.categories) {
    const existing = byId.get(c.id);
    if (existing) {
      if (c.name !== undefined) existing.name = c.name;
      if (c.desc !== undefined) existing.desc = c.desc;
    } else {
      const copy = { ...c };
      categories.push(copy);
      byId.set(copy.id, copy);
    }
  }

  for (const p of custom.patterns) {
    if (seen.has(p.id)) {
      throw new Error(`duplicate pattern id "${p.id}" in custom rules${source ? ` (${source})` : ""} — already defined in the base corpus`);
    }
    if (!byId.has(p.category)) {
      throw new Error(`custom rule "${p.id}"${source ? ` (${source})` : ""} references unknown category "${p.category}" — declare it in categories or use an existing category id`);
    }
    patterns.push({ ...p });
    seen.add(p.id);
  }

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

  return {
    version: custom.version !== undefined ? custom.version : base.version,
    categories,
    patterns,
    categoryById,
    patternToRegExp: base.patternToRegExp,
  };
}

/**
 * loadRules(input) — deep-merge external rules into the built-in corpus.
 *
 *   input (node): a module/JSON path, a glob, a comma-separated list, or an
 *   in-memory payload ({categories?, patterns, version?} or pattern array).
 *   input (browser): an in-memory payload only.
 *
 * Returns the merged corpus object (see mergeCorpus).
 */
function loadRules(input, opts = {}) {
  const base = opts.base || BASE_CORPUS;
  // Node file resolution.
  const files = typeof input === "string" && fs ? resolveRuleFiles(input) : [];
  let merged = base;
  if (files.length > 0) {
    let acc = { categories: [], patterns: [] };
    for (const file of files) {
      const payload = readRuleFile(file);
      normalizePayload(payload, file, acc);
    }
    merged = mergeCorpus(base, acc, files.join(", "));
  } else if (typeof input === "string" && !fs) {
    throw new Error("loadRules: a string path is only supported in Node; pass an object or array in the browser");
  } else {
    // In-memory payload (possibly a comma-separated set of raw payloads is
    // NOT allowed — object or array only).
    const acc = { categories: [], patterns: [] };
    normalizePayload(input, "custom rules", acc);
    merged = mergeCorpus(base, acc, "custom rules");
  }
  return merged;
}

const api = {
  loadRules,
  mergeCorpus,
  resolveRuleFiles,
  validatePattern,
};

// Browser global for the no-build web checker.
if (typeof window !== "undefined") {
  window.SlopRules = api;
}

return api;
});