"use strict";
/**
 * Lazynext AI Slop Checker — browser-safe project scanner.
 *
 * Same lens classification and pooling as src/project-scanner.js, but for
 * the no-build web checker: it scans an array of in-memory files
 * ({ name, text }) instead of a filesystem tree. The web checker feeds it
 * files picked via the File System Access API (showDirectoryPicker) or a
 * fallback multiple <input type=file>.
 *
 * Lenses mirror the Node project scanner:
 *   - prose  (.md .mdx .txt .rst .adoc)        -> scanText  (writing tells)
 *   - markup (.html .htm .jsx .tsx .vue .svelte .astro .php .twig)
 *                                              -> scanHtml  (design + text)
 *   - styles (.css .scss .sass .less)          -> scanDesign (raw source)
 *   - code   (.js .ts .mjs .cjs .json .yaml .yml .py .rb .go .java ...)
 *                                              -> scanDesign (class strings)
 * Skipped the same way: node_modules/.git/dist/build/out/.next, lockfiles,
 * *.min.*, binaries (null-byte sniff), and files past a size wall.
 *
 * UMD: CommonJS on Node (module.exports) and window.SlopProjectBrowser on
 * browsers (used by web/app.js).
 */
(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports
      ? require("./scanner.js")
      : root.SlopScanner
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopProjectBrowser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (scanner) {

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".astro",
  ".output", ".svelte-kit", ".nuxt", "coverage", "vendor", ".cache",
  ".vercel", ".turbo", ".idea", ".vscode",
]);

const PROSE_EXT = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const MARKUP_EXT = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".php", ".twig"]);
const STYLE_EXT = new Set([".css", ".scss", ".sass", ".less"]);
const CODE_EXT = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".json", ".yaml", ".yml",
  ".py", ".rb", ".go", ".java", ".cs", ".c", ".h", ".cpp", ".rs",
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 5000;
const LOCKFILE_RE = /(?:package-lock|pnpm-lock|yarn\.lock|bun\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock)/;

/** Classify a file name into a scan lens; null when skipped/irrelevant. */
function classify(name) {
  if (typeof name !== "string") return null;
  if (LOCKFILE_RE.test(name)) return null;
  if (/\.min\.(?:js|css|html)$/.test(name)) return null;
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (PROSE_EXT.has(ext)) return "prose";
  if (MARKUP_EXT.has(ext)) return "markup";
  if (STYLE_EXT.has(ext)) return "styles";
  if (CODE_EXT.has(ext)) return "code";
  return null;
}

/** True when the path has a skipped directory segment. */
function withinSkippedDir(rel) {
  const parts = rel.split("/");
  return parts.some((p) => SKIP_DIRS.has(p) || p.startsWith("."));
}

function isBinaryLike(text) {
  // Null byte sniff — same signal the Node scanner uses.
  return text.indexOf("\0") !== -1;
}

/**
 * Scan an array of files [{ name, rel?, text }]. `name` is used for lens
 * classification (full relative path preferred; basename falls back).
 *
 * Returns { root, engine, version, files, summary, topFiles, categories }
 * — the same shape as node scanProject (root is the picker label, not a
 * filesystem path).
 */
function scanProjectBrowser(items, opts = {}) {
  if (!Array.isArray(items)) throw new TypeError("scanProjectBrowser expects an array of { name, text } files");
  const maxFiles = Number.isInteger(opts.maxFiles) ? opts.maxFiles : MAX_FILES;
  const scanned = [];

  for (const item of items.slice(0, maxFiles)) {
    const name = item.name || "";
    const rel = item.rel || name;
    // Classify by the rel path's basename: a real project's rel paths carry
    // the true file names ("dist/app.js", "package-lock.json"), and the
    // Node scanner classes full paths the same way.
    const baseName = rel.split("/").pop() || name;
    const kind = classify(baseName);
    if (!kind) continue;
    if (rel && withinSkippedDir(rel.replace(/^\.\//, ""))) continue;

    const text = String(item.text ?? "");
    if (text.length === 0) {
      scanned.push({ file: rel || name, kind, skipped: "empty" });
      continue;
    }
    if (text.length > MAX_FILE_BYTES) {
      scanned.push({ file: rel || name, kind, skipped: "too-large" });
      continue;
    }
    if (isBinaryLike(text)) {
      scanned.push({ file: rel || name, kind, skipped: "binary" });
      continue;
    }

    let report;
    try {
      if (kind === "prose") report = scanner.scanText(text);
      else if (kind === "markup") report = scanner.scanHtml(text);
      else report = scanner.scanDesign(text);
    } catch (err) {
      scanned.push({ file: rel || name, kind, error: err.message });
      continue;
    }
    scanned.push({ file: rel || name, kind, report });
  }

  // Pool exactly like the Node scanner.
  const pointsByPattern = new Map();
  const categoryStats = new Map();
  let totalPoints = 0;
  let filesWithHits = 0;
  let filesSkipped = 0;

  for (const entry of scanned) {
    if (!entry.report) {
      filesSkipped += 1;
      continue;
    }
    if (entry.report.totalPoints > 0) filesWithHits += 1;
    for (const match of entry.report.matches) {
      const cap = match.severity * 3;
      const used = pointsByPattern.get(match.id) || 0;
      const add = Math.min(match.severity, Math.max(0, cap - used));
      pointsByPattern.set(match.id, used + add);
      totalPoints += add;
      const slot = categoryStats.get(match.category) || { count: 0, points: 0 };
      slot.count += 1;
      slot.points += add;
      categoryStats.set(match.category, slot);
    }
  }

  const score = Math.round(100 * (1 - Math.exp(-totalPoints / 28)));
  const clamped = Math.max(0, Math.min(100, score));
  const verdict = clamped <= 9 ? "clean" : clamped <= 29 ? "light" : clamped <= 59 ? "moderate" : "heavy";

  const categories = [...categoryStats.entries()]
    .map(([id, slot]) => ({ id, count: slot.count, points: slot.points }))
    .sort((a, b) => b.points - a.points || b.count - a.count);

  const withHits = scanned.filter((e) => e.report && e.report.totalPoints > 0);
  const topFiles = [...withHits]
    .sort((a, b) => b.report.totalPoints - a.report.totalPoints || b.report.score - a.report.score)
    .slice(0, opts.topFiles || 10)
    .map((e) => ({
      file: e.file,
      kind: e.kind,
      score: e.report.score,
      points: e.report.totalPoints,
      matches: e.report.matches.length,
      verdict: e.report.verdict,
    }));

  return {
    engine: "lazynext-ai-slop-checker",
    version: scanner.version,
    root: opts.root || "",
    files: scanned,
    summary: {
      filesScanned: scanned.length,
      filesWithHits,
      filesSkipped,
      totalMatches: withHits.reduce((n, e) => n + e.report.matches.length, 0),
      totalPoints,
      score: clamped,
      verdict,
      verdictBands: [
        { max: 9, label: "clean" },
        { max: 29, label: "light" },
        { max: 59, label: "moderate" },
        { max: Infinity, label: "heavy" },
      ],
    },
    topFiles,
    categories,
  };
}

const api = {
  scanProjectBrowser,
  classify,
  SKIP_DIRS,
  PROSE_EXT,
  MARKUP_EXT,
  STYLE_EXT,
  CODE_EXT,
};

if (typeof window !== "undefined") {
  window.SlopProjectBrowser = api;
}

return api;
});