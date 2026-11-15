"use strict";
/**
 * Lazynext AI Slop Checker — conservative rewriter.
 *
 * (see header above for the rewrite model)
 *
 * UMD-style module: CommonJS on Node (module.exports) and a browser global
 * (window.SlopRewriter) when loaded via <script> in the no-build web checker.
 * Depends on the scanner — injected from Node require or the browser global.
 */
(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports
      ? require("../data/slop-patterns.js")
      : root.SlopPatterns,
    typeof module !== "undefined" && module.exports
      ? require("./scanner.js")
      : root.SlopScanner
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopRewriter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (corpus, _scanner) {

// Word substitutions that are always safe in normal prose
// (key lowercase -> replacement). Only whole-word matches are replaced.
const WORD_SUBSTITUTIONS = {
  delve: "explore",
  leverage: "use",
  leverages: "uses",
  leveraged: "used",
  leveraging: "using",
  utilize: "use",
  utilizes: "uses",
  utilized: "used",
  utilizing: "using",
  facilitate: "help",
  facilitates: "helps",
  facilitated: "helped",
  facilitating: "helping",
  streamline: "simplify",
  streamlines: "simplifies",
  streamlined: "simplified",
  streamlining: "simplifying",
  empower: "enable",
  empowers: "enables",
  empowered: "enabled",
  empowering: "enabling",
  unlock: "enable",
  unlocks: "enables",
  supercharge: "boost",
  supercharges: "boosts",
  supercharged: "boosted",
  harness: "use",
  harnesses: "uses",
  harnessed: "used",
  embarking: "starting",
  embarks: "starts",
  embarked: "started",
  seamless: "smooth",
  navigate: "handle",
  unpack: "explain",
  "double down": "commit",
};

// Curated removals: phrases that can be deleted wholesale without breaking
// the surrounding sentence in most contexts. Keys are lowercase literals.
// The match may be a prefix of the removal (e.g. the pattern "it's worth
// noting" matches the removal "it's worth noting that"); the tail-glue step
// absorbs a trailing "that" so the sentence stays grammatical.
const PHRASE_REMOVALS = [
  "it's worth noting that",
  "it's important to note that",
  "it is worth noting that",
  "it is important to note that",
  "at the end of the day",
  "in today's fast-paced world",
  "in today's world",
  "it turns out",
  "let me walk you through",
  "here's the thing",
  "let me be clear",
  "i want to explore",
  "in conclusion",
  "to sum up",
  "all in all",
  "at its core",
];

// Replace an exact whole-word token (letter boundaries) in the text.
function replaceWord(text, word, replacement, index) {
  // "g" is required: without it RegExp.exec ignores lastIndex and the match
  // always starts at 0, so repeated tokens would be rewritten at the wrong
  // position (or skipped entirely).
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  // Re-anchor at the reported index: search only from index onward to keep
  // deterministic behavior for repeated tokens. Matches are processed from
  // the end of the text backwards, so everything before `index` is
  // untouched and the occurrence at `index` is still the one that was
  // reported by the scanner.
  re.lastIndex = Math.max(0, index);
  const m = re.exec(text);
  if (!m || m.index !== index) return null;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return { before: text.slice(m.index, m.index + m[0].length), after: replacement, index: m.index, text: before + replacement + after };
}

/**
 * Suggest a rewrite for one scan match.
 * Returns null when no safe rewrite exists.
 */
function suggestionFor(match, pattern) {
  if (pattern.kind === "word" && pattern.rewrite) {
    return { type: "word", before: match.snippet, after: pattern.rewrite, fix: pattern.fix };
  }
  if (pattern.kind === "phrase" && pattern.rewrite) {
    return { type: "phrase", before: match.snippet, after: pattern.rewrite, fix: pattern.fix };
  }
  if (pattern.category === "em-dash" && match.kind === "count") {
    return {
      type: "dashes",
      before: "— (em/en dashes)",
      after: "commas or periods",
      fix: "Replace the dash habit with commas or split into separate sentences.",
    };
  }
  return null;
}

/**
 * Rewrite a full text: applies every safe substitution and removal found by
 * the scanner. Returns { text, changes } where changes is a list of
 * { pattern, before, after, index }. Unchanged when nothing is safe.
 */
function rewriteText(input, opts = {}) {
  if (typeof input !== "string") throw new TypeError("rewriteText expects a string");
  // Only rewrite what the scanner actually flagged (deterministic and safe).
  const report = _scanner.scanText(input);
  let text = input;
  const changes = [];
  // Process matches from the end of the text backwards: an earlier
  // substitution shifts later indices, never earlier ones, so every
  // remaining match index stays valid.
  const ordered = [...report.matches].sort((a, b) => b.index - a.index);
  const consumed = new Set(); // indices already replaced this pass

  for (const match of ordered) {
    if (consumed.has(match.index)) continue;
    const pattern = corpus.patterns.find((p) => p.id === match.id);
    if (!pattern) continue;
    if (match.index >= text.length) continue; // stale index guard: earlier edits shrank the tail

    // 1) Whole-word substitution
    if (pattern.kind === "word" && WORD_SUBSTITUTIONS[pattern.match.toLowerCase()]) {
      const w = WORD_SUBSTITUTIONS[pattern.match.toLowerCase()];
      const replaced = replaceWord(text, pattern.match, w, match.index);
      if (replaced) {
        changes.push({
          pattern: pattern.id,
          before: replaced.before,
          after: replaced.after,
          index: replaced.index,
        });
        text = replaced.text;
        consumed.add(match.index);
        continue;
      }
    }

    // 2) Phrase removal (safe to delete)
    if (pattern.kind === "phrase") {
      const lower = pattern.match.toLowerCase();
      if (PHRASE_REMOVALS.some((pr) => lower.includes(pr) || pr.includes(lower))) {
        // Find the phrase in the current text near the match index:
        // lowercase-at-index may have shifted; search the immediate region.
        const phrase = pattern.match;
        const region = text.slice(match.index, Math.min(text.length, match.index + 240));
        const idx = region.toLowerCase().indexOf(phrase.toLowerCase());
        if (idx >= 0) {
          const realIndex = match.index + idx;
          // Delete the phrase plus trailing whitespace/comma glues.
          let end = realIndex + phrase.length;
          let tail = text.slice(end, end + 80);
          const tailMatch = /^[\s,.;:]+/.exec(tail);
          if (tailMatch) end += tailMatch[0].length;
          // Absorb a trailing "that" so "It's worth noting that X"
          // becomes "X", not "that X".
          tail = text.slice(end, end + 80);
          const thatMatch = /^that\b\s*/i.exec(tail);
          if (thatMatch) end += thatMatch[0].length;
          // Also eat a preceding comma+space if the phrase was mid-clause.
          let start = realIndex;
          const head = text.slice(Math.max(0, start - 30), start);
          if (/[,\s]+$/.test(head) && !/^\./.test(tail || "")) {
            const hm = /[,\s]+$/.exec(head);
            if (hm) start -= hm[0].length;
          }
          const removed = text.slice(start, end);
          const fixed = text.slice(0, start) + text.slice(end);
          changes.push({ pattern: pattern.id, before: removed.trim(), after: "", index: start });
          text = fixed;
          consumed.add(match.index);
        }
      }
    }
  }

  return { text, changed: changes.length > 0, changes };
}

/**
 * Convenience: rewrite an object-of-strings or string, preserving non-matching
 * parts exactly. Used by the API so clients can see before/after diffs.
 */
function createPreview(sample) {
  const result = rewriteText(sample);
  if (!result.changed) {
    return { sample, changes: [], note: "No safe automatic rewrites; see fix suggestions in the scan report." };
  }
  return Object.assign({ sample }, result);
}

const api = {
  rewriteText,
  createPreview,
  suggestionFor,
  wordSubstitutions: WORD_SUBSTITUTIONS,
  phraseRemovals: PHRASE_REMOVALS,
};

// Browser global for the no-build web checker.
if (typeof window !== "undefined") {
  window.SlopRewriter = api;
}

return api;
});