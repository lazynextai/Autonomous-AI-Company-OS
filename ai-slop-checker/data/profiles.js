"use strict";
/**
 * Lazynext AI Slop Checker — severity profiles (data/profiles.js).
 *
 * Profiles select the scoring threshold and which severities count, without
 * touching the corpus. The engine's default scoring is `default`; `strict`
 * makes warn-class findings count harder and lowers the clean threshold
 * (nothing that squeaks through as "fine"), while `lenient` ignores
 * warn-class (severity 1) findings and raises the clean threshold (only
 * confident tells push the score).
 *
 *   default: all severities count, clean <= 9    (the v1.0-1.2 behaviour)
 *   strict:  all severities count (×1.25/1.5), clean <= 6
 *   lenient: severity >= 2 only, clean <= 14
 *
 * A profile applies AFTER a scan: matches are filtered by minSeverity and
 * re-scored with pointScale, then the score/verdict/clean/categories are
 * recomputed on the same exponential-decay curve. Applying `default` is a
 * no-op (identical report).
 *
 * Consumed by src/scanner.js (text/html/design), src/render-checks.js,
 * src/project-scanner.js (pooled project scoring), the CLI --profile flag,
 * the HTTP API scan/scan-project/render-scan fields, and the MCP tools.
 * Pure data + pure helpers, zero dependencies — browser-safe (UMD).
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopProfiles = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const PROFILES = {
  default: {
    id: "default",
    name: "Default",
    desc: "All severities count; clean at score <= 9 (the v1.0-1.2 behaviour).",
    cleanThreshold: 9,
    minSeverity: 1,
    pointScale: { 1: 1, 2: 1, 3: 1 },
  },
  strict: {
    id: "strict",
    name: "Strict",
    desc: "Warn-class findings count harder (×1.5 for severity 1) and the clean threshold drops to 6.",
    cleanThreshold: 6,
    minSeverity: 1,
    pointScale: { 1: 1.5, 2: 1.25, 3: 1 },
  },
  lenient: {
    id: "lenient",
    name: "Lenient",
    desc: "Ignores warn-class (severity 1) findings; clean threshold rises to 14.",
    cleanThreshold: 14,
    minSeverity: 2,
    pointScale: { 1: 0, 2: 1, 3: 1 },
  },
};

const PROFILE_IDS = Object.keys(PROFILES);

/**
 * resolveProfile('strict' | { id: 'strict' } | undefined) -> profile object | null.
 * Unknown names throw a descriptive Error.
 */
function resolveProfile(nameOrObj) {
  if (nameOrObj === undefined || nameOrObj === null || nameOrObj === false) return null;
  if (typeof nameOrObj === "string") {
    const p = PROFILES[nameOrObj];
    if (!p) throw new Error(`unknown profile "${nameOrObj}" (expected one of: ${PROFILE_IDS.join(", ")})`);
    return p;
  }
  if (typeof nameOrObj === "object" && nameOrObj.id && PROFILES[nameOrObj.id]) {
    return PROFILES[nameOrObj.id];
  }
  throw new Error(`invalid profile value (expected "default" | "strict" | "lenient" or a profile object)`);
}

const VERDICTS = [
  { max: 9, label: "clean" },
  { max: 29, label: "light" },
  { max: 59, label: "moderate" },
  { max: Infinity, label: "heavy" },
];
const PATTERN_POINT_CAP_MULTIPLIER = 3;

/**
 * Score a match list with a profile's rules. Shared by the scanner's report
 * build (default) and by profile re-scores, so the decay curve and category
 * pooling are identical everywhere.
 *
 * Returns { totalPoints, score, verdict, clean, counts (Map category -> {count, points}), matches (post-filter) }.
 * profile = null → the default path (pure severity math, no filtering).
 */
function scoreMatches(matches, profile) {
  const minSeverity = profile ? profile.minSeverity : 1;
  const scale = profile ? profile.pointScale : null;
  const filtered = profile ? matches.filter((m) => (m.severity || 1) >= minSeverity) : matches;

  const pointsByPattern = new Map();
  let totalPoints = 0;
  const counts = new Map(); // category -> { count, points }

  for (const m of filtered) {
    if (m.suppressed) continue; // a suppressed finding stays in the record, never in the score
    const cap = m.severity * PATTERN_POINT_CAP_MULTIPLIER;
    const used = pointsByPattern.get(m.id) || 0;
    let add = m.severity * (scale ? scale[m.severity] || 0 : 1);
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
  const cleanThreshold = profile ? profile.cleanThreshold : 9;
  const verdict = clamped <= cleanThreshold ? "clean" : VERDICTS.find((v) => clamped <= v.max).label;
  return { totalPoints, score: clamped, verdict, clean: clamped <= cleanThreshold, counts, matches: filtered };
}

const DEFAULT_CLEAN_THRESHOLD = 9;
function verdictFor(score, cleanThreshold = DEFAULT_CLEAN_THRESHOLD) {
  if (score <= cleanThreshold) return "clean";
  return VERDICTS.find((v) => score <= v.max).label;
}

/**
 * applyProfileReport(report, 'strict' | profileObj) -> new report with the
 * profile's threshold + severity inclusion applied. Non-mutating: matches are
 * filtered and re-scored; `profile` is stamped on the result. `default` and
 * null return the report unchanged.
 */
function applyProfileReport(report, nameOrObj) {
  const profile = resolveProfile(nameOrObj);
  if (!profile || profile.id === "default") return report;
  const scored = scoreMatches(report.matches || [], profile);
  const categories = [...scored.counts.entries()]
    .map(([id, slot]) => {
      const existing = (report.categories || []).find((c) => c.id === id);
      return { id, name: (existing && existing.name) || id, count: slot.count, points: slot.points };
    })
    .sort((a, b) => b.points - a.points || b.count - a.count);

  return {
    ...report,
    profile: profile.id,
    score: scored.score,
    verdict: verdictFor(scored.score, profile.cleanThreshold),
    clean: scored.clean,
    totalPoints: scored.totalPoints,
    matches: scored.matches,
    categories,
  };
}

const api = {
  PROFILES,
  PROFILE_IDS,
  resolveProfile,
  applyProfileReport,
  scoreMatches,
  verdictFor,
  defaultCleanThreshold: DEFAULT_CLEAN_THRESHOLD,
  pointCapMultiplier: PATTERN_POINT_CAP_MULTIPLIER,
};

if (typeof window !== "undefined") {
  window.SlopProfiles = api;
}

return api;
});