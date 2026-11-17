"use strict";
/**
 * Lazynext AI Slop Checker — project scanner.
 *
 * Scans a whole directory tree of text- and code-based files, producing a
 * per-file report plus an aggregate. The directory mode of kill-ai-slop's
 * scan->triage->report workflow, re-expressed for this engine: walk the
 * tree, infer each file's kind (prose / markup / styles / code), scan with
 * the right lens, and roll everything into one view.
 *
 * Lenses:
 *   - prose  (.md .mdx .txt)            -> scanText   (writing tells)
 *   - markup (.html .jsx .tsx .vue .svelte .astro .php .twig)
 *                                      -> scanHtml   (design + visible text)
 *   - styles (.css .scss .sass .less)  -> design-only over raw CSS
 *   - code   (.js .ts .mjs .cjs .json .yaml .yml .py .rb .go)
 *                                      -> design-only over raw source
 *                                        (class strings & style attrs; the
 *                                        text tells would drown in code)
 *
 * Skipped: node_modules, .git, dist, build, out, .next, .astro, coverage,
 * vendor, lockfiles, *.min.*, binaries (null-byte sniff), and files past a
 * size wall.
 *
 * Deterministic, zero dependencies, never edits files.
 */

const fs = require("node:fs");
const path = require("node:path");

const BUILTIN_ENGINE = require("./scanner.js");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".astro",
  ".output",
  ".svelte-kit",
  ".nuxt",
  "coverage",
  "vendor",
  ".cache",
  ".vercel",
  ".turbo",
  ".idea",
  ".vscode",
]);

const PROSE_EXT = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const MARKUP_EXT = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".php", ".twig"]);
const STYLE_EXT = new Set([".css", ".scss", ".sass", ".less"]);
const CODE_EXT = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".json", ".yaml", ".yml",
  ".py", ".rb", ".go", ".java", ".cs", ".c", ".h", ".cpp", ".rs",
]);

const MAX_FILE_BYTES = 512 * 1024; // skip large/generated files
const MAX_FILES = 5000; // hard cap on files scanned in one pass
const LOCKFILE_RE = /(?:package-lock|pnpm-lock|yarn\.lock|bun\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock)/;

function kindFor(file, base) {
  const ext = path.extname(base).toLowerCase();
  if (PROSE_EXT.has(ext)) return "prose";
  if (MARKUP_EXT.has(ext)) return "markup";
  if (STYLE_EXT.has(ext)) return "styles";
  if (CODE_EXT.has(ext)) return "code";
  if (/^tailwind\.config\./.test(base)) return "code";
  return null;
}

function walk(root, maxFiles) {
  const files = [];
  const seen = new Set();
  const visit = (dir) => {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= maxFiles) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        visit(full);
      } else if (e.isFile()) {
        if (LOCKFILE_RE.test(e.name)) continue;
        if (/\.min\.(?:js|css|html)$/.test(e.name)) continue;
        const kind = kindFor(full, e.name);
        if (!kind) continue;
        const real = (() => {
          try {
            return fs.realpathSync(full);
          } catch {
            return full;
          }
        })();
        if (seen.has(real)) continue;
        seen.add(real);
        files.push({ full, rel: path.relative(root, full), kind, base: e.name });
      }
    }
  };
  visit(root);
  return files;
}

function isBinary(buf) {
  return buf.indexOf(0) !== -1;
}

/**
 * Scan one file with the lens its kind implies. Returns the scan report for
 * prose/markup, or a design-only report for styles/code. Never throws on a
 * single file — errors become a `{ error }` entry so one bad file can't kill
 * a whole tree pass. `engine` defaults to the built-in scanner; pass a
 * custom engine (scanner.createEngine(loadRules(...))) to scan with
 * external rules. `profile` (optional) is forwarded to every engine scan so
 * per-file reports already honour the severity profile.
 */
function scanFile(file, engine, profile) {
  let buf;
  try {
    const st = fs.statSync(file.full);
    if (st.size > MAX_FILE_BYTES) return { file: file.rel, kind: file.kind, skipped: "too-large" };
    if (st.size === 0) return { file: file.rel, kind: file.kind, skipped: "empty" };
    buf = fs.readFileSync(file.full);
  } catch (err) {
    return { file: file.rel, kind: file.kind, error: err.message };
  }
  if (isBinary(buf)) return { file: file.rel, kind: file.kind, skipped: "binary" };
  const raw = buf.toString("utf8");
  const scanOpts = profile !== undefined ? { profile } : undefined;

  try {
    if (file.kind === "prose") return { file: file.rel, kind: file.kind, report: engine.scanText(raw, scanOpts) };
    if (file.kind === "markup") return { file: file.rel, kind: file.kind, report: engine.scanHtml(raw, scanOpts) };
    // styles + code: design tells only (raw source; no text extraction)
    return { file: file.rel, kind: file.kind, report: engine.scanDesign(raw, scanOpts) };
  } catch (err) {
    return { file: file.rel, kind: file.kind, error: err.message };
  }
}

/**
 * Scan a project directory. Returns:
 *   { root, engine, version, files: [{file, kind, skipped?, error?, report?}],
 *     summary: { filesScanned, filesWithHits, filesSkipped, totalMatches,
 *                totalPoints, score, verdict, verdicts: {clean, light,
 *                moderate, heavy} },
 *     topFiles: [{file, kind, score, points, matches, verdict}...] (by points),
 *     categories: [{id, name, count, points}...] (pooled across files) }
 */
function scanProject(rootDir, opts = {}) {
  if (typeof rootDir !== "string") throw new TypeError("scanProject expects a directory path");
  const root = path.resolve(rootDir);
  const st = fs.statSync(root);
  if (!st.isDirectory()) throw new Error(`not a directory: ${rootDir}`);

  const maxFiles = Number.isInteger(opts.maxFiles) ? opts.maxFiles : MAX_FILES;
  const engine = opts.engine || BUILTIN_ENGINE;
  const profile = opts.profile !== undefined && opts.profile !== null ? opts.profile : undefined;
  const files = walk(root, maxFiles);
  const scanned = [];

  for (const file of files) {
    const out = scanFile(file, engine, profile);
    if (out.report) {
      out.score = out.report.score;
      out.points = out.report.totalPoints;
      out.matches = out.report.matches.length;
      out.verdict = out.report.verdict;
    }
    scanned.push(out);
  }

  // Aggregate: pool every pattern hit's points the same way the single-file
  // scorer does, then map through the same exponential decay. When a
  // severity profile is active, pool through the shared profile scorer so
  // the project-level threshold + severity inclusion match the per-file
  // reports (lenient ignores warn-class contributions here too).
  let pools;
  if (profile) {
    const profilesModule = require("../data/profiles.js");
    const prof = profilesModule.resolveProfile(profile);
    const flatMatches = [];
    for (const entry of scanned) {
      if (entry.report) flatMatches.push(...entry.report.matches);
    }
    pools = profilesModule.scoreMatches(flatMatches, prof);
    pools.profile = prof.id;
  } else {
    const pointsByPattern = new Map();
    const categoryStats = new Map(); // category id -> { count, points }
    let totalPoints = 0;
    for (const entry of scanned) {
      if (entry.skipped || entry.error) continue;
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
    pools = { totalPoints, score: clamped, verdict, clean: clamped <= 9, categories, categoryIds: new Set(categories.map((c) => c.id)) };
  }

  // Files-with-hits and skipped counts are computed outside the point pool
  // (the profile path pools only matches, not entries).
  let filesWithHits = 0;
  let filesSkipped = 0;
  for (const entry of scanned) {
    if (entry.skipped || entry.error) {
      filesSkipped += 1;
      continue;
    }
    if (entry.report.totalPoints > 0) filesWithHits += 1;
  }

  const withHits = scanned.filter((e) => e.report && e.report.totalPoints > 0);
  const topFiles = [...withHits]
    .sort((a, b) => b.points - a.points || b.score - a.score)
    .slice(0, opts.topFiles || 10)
    .map((e) => ({
      file: e.file,
      kind: e.kind,
      score: e.score,
      points: e.points,
      matches: e.matches,
      verdict: e.verdict,
    }));

  const summary = {
    filesScanned: scanned.length,
    filesWithHits,
    filesSkipped,
    totalMatches: withHits.reduce((n, e) => n + e.matches, 0),
    totalPoints: pools.totalPoints,
    score: pools.score,
    verdict: pools.verdict,
    verdictBands: [
      { max: 9, label: "clean" },
      { max: 29, label: "light" },
      { max: 59, label: "moderate" },
      { max: Infinity, label: "heavy" },
    ],
  };
  if (profile) summary.profile = pools.profile ?? (typeof profile === "string" ? profile : profile.id);

  let categories;
  if (profile) {
    // profile pools return categories via the counts map
    categories = [...pools.counts.entries()]
      .map(([id, slot]) => ({ id, count: slot.count, points: slot.points }))
      .sort((a, b) => b.points - a.points || b.count - a.count);
  } else {
    ({ categories } = pools);
  }

  return {
    engine: "lazynext-ai-slop-checker",
    version: engine.version,
    root,
    files: scanned,
    summary,
    topFiles,
    categories,
  };
}

module.exports = { scanProject, kindFor, walk, SKIP_DIRS };