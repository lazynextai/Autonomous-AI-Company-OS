"use strict";
/**
 * Lazynext AI Slop Checker — soft-tell advisory scorer.
 *
 * Structural tells that a word list cannot see: sentences of almost equal
 * length, paragraphs poured into one mold, and three-part clauses (or three
 * sentences) that repeat one shape. These are advisory. They never change
 * the deterministic scan score and never flip PASS | REVIEW | REFUSE.
 *
 * Thresholds are precision-first. A signal fires only on a tight shape.
 * test/soft-tells.test.js re-measures precision against the labeled cases
 * and the clean bench corpus; a false positive there fails the build.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SlopSoftTells = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const DRIVES_DETERMINISTIC_SCORE = false;

function wordsOf(sentence) {
  return String(sentence)
    .replace(/[“”«»"']/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function mean(xs) {
  let s = 0;
  for (const n of xs) s += n;
  return s / xs.length;
}

function stdev(xs) {
  const m = mean(xs);
  let v = 0;
  for (const n of xs) v += (n - m) * (n - m);
  return Math.sqrt(v / xs.length);
}

function splitSentences(block) {
  const flat = String(block).replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => wordsOf(s).length >= 5);
}

function paragraphsOf(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => wordsOf(p).length >= 12);
}

function sentenceSpread(text) {
  const sentences = splitSentences(text);
  if (sentences.length < 4) return null;
  const lens = sentences.map((s) => wordsOf(s).length);
  const m = mean(lens);
  if (m < 6 || m > 28) return null;
  const range = Math.max(...lens) - Math.min(...lens);
  const cv = stdev(lens) / m;
  // Four or more sentences whose lengths barely move. Product copy in the
  // clean corpus spreads by 4+ words; that stays under this bar.
  // Range of 2 still describes ordinary notes ("two days" next to "Monday
  // at ten"). Only a spread of one word or less is the poured-mold tell.
  if (range > 1 || cv >= 0.1) return null;
  return {
    id: "sentence-spread",
    detail: `${sentences.length} sentences, word-count range ${range}, variation ${(cv * 100).toFixed(1)}% — lengths barely move.`,
    evidence: { sentences: sentences.length, range, variation: Number(cv.toFixed(3)) },
  };
}

function paragraphShape(text) {
  const paras = paragraphsOf(text);
  if (paras.length < 3) return null;
  const counts = paras.map((p) => splitSentences(p).length);
  const lens = paras.map((p) => wordsOf(p).length);
  const sameCount = counts.every((n) => n >= 2 && n <= 3 && n === counts[0]);
  const m = mean(lens);
  const cv = stdev(lens) / m;
  const range = Math.max(...lens) - Math.min(...lens);
  if (sameCount && cv < 0.08 && range / m < 0.12) {
    return {
      id: "paragraph-shape",
      detail: `${paras.length} paragraphs share one sentence count (${counts[0]}) and nearly one length.`,
      evidence: { paragraphs: paras.length, sentenceCount: counts[0], variation: Number(cv.toFixed(3)) },
    };
  }
  const lastSentences = splitSentences(paras[paras.length - 1]);
  const last = lastSentences[lastSentences.length - 1] || "";
  const conclusion = /^(In conclusion|In summary|To summarize|Ultimately|Overall),/i.test(last);
  const priorSame = counts.slice(0, -1).every((n) => n >= 2 && n === counts[0]);
  if (conclusion && wordsOf(last).length >= 14 && paras.length >= 3 && priorSame) {
    return {
      id: "paragraph-shape",
      detail: "The last sentence is a conclusion template after uniform paragraphs.",
      evidence: { paragraphs: paras.length, conclusion: true },
    };
  }
  return null;
}

function parallelClauses(text) {
  const sentences = splitSentences(text);
  const flat = String(text).replace(/\s+/g, " ");
  const re = /([^,.;:!?]{12,80}),\s+([^,.;:!?]{12,80}),\s+and\s+([^,.;:!?]{12,90})/gi;
  let match;
  while ((match = re.exec(flat))) {
    const parts = [match[1], match[2], match[3]].map((s) => s.trim());
    const lens = parts.map((p) => wordsOf(p).length);
    if (lens.some((n) => n < 6 || n > 12)) continue;
    if (Math.max(...lens) - Math.min(...lens) > 1) continue;
    // "the first …, the second …, and the third …" is an ordered spec,
    // not a rhetorical tricolon. Leave enumerations alone.
    if (/\b(first|second|third|fourth|fifth)\b/i.test(parts.join(" "))) continue;
    return {
      id: "parallel-clauses",
      detail: `Three clauses of ${lens.join("/")} words: “${parts[0]}”, “${parts[1]}”, and “${parts[2]}”.`,
      evidence: { words: lens },
    };
  }

  for (let i = 0; i + 2 < sentences.length; i++) {
    const trio = sentences.slice(i, i + 3);
    const lens = trio.map((s) => wordsOf(s).length);
    if (lens.some((n) => n < 8)) continue;
    if (Math.max(...lens) - Math.min(...lens) > 1) continue;
    const prefixes = trio.map((s) => wordsOf(s).slice(0, 3).join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, ""));
    if (prefixes[0].split(" ").length < 3) continue;
    if (prefixes.every((p) => p === prefixes[0])) {
      return {
        id: "parallel-clauses",
        detail: `Three sentences open with “${prefixes[0]}” at ${lens.join("/")} words.`,
        evidence: { words: lens, opening: prefixes[0] },
      };
    }
  }
  return null;
}

function plainTextFromHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ");
}

/**
 * scoreSoftTells(text) → advisory report.
 * advisoryScore is 0 when nothing fired, otherwise 34 per signal (cap 100).
 * drivesDeterministicScore is always false.
 */
function scoreSoftTells(text) {
  const source = typeof text === "string" ? text : "";
  const signals = [];
  if (source.trim()) {
    for (const found of [sentenceSpread(source), paragraphShape(source), parallelClauses(source)]) {
      if (found) signals.push(found);
    }
  }
  signals.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const advisoryScore = signals.length === 0 ? 0 : Math.min(100, signals.length * 34);
  return {
    drivesDeterministicScore: DRIVES_DETERMINISTIC_SCORE,
    appliedToVerdict: false,
    advisoryScore,
    signals,
    note: "Advisory structural score only. It does not change the scan score or the PASS | REVIEW | REFUSE verdict.",
  };
}

/**
 * scoreInput({ text?, html? }) — text and HTML are scored; a project
 * report does not retain source text, so the advisory score stays null
 * rather than inventing one. Same object from the Node judge and the
 * browser judge.
 */
function scoreInput(input) {
  const src = input || {};
  if (typeof src.text === "string") return scoreSoftTells(src.text);
  if (typeof src.html === "string") return scoreSoftTells(plainTextFromHtml(src.html));
  return {
    drivesDeterministicScore: DRIVES_DETERMINISTIC_SCORE,
    appliedToVerdict: false,
    advisoryScore: null,
    signals: [],
    skipped: "project reports do not keep the source text, so structural soft tells are not scored",
    note: "Advisory structural score only. It does not change the scan score or the PASS | REVIEW | REFUSE verdict.",
  };
}

function formatSoftTellLines(report) {
  const lines = [];
  if (!report) return lines;
  lines.push("SOFT TELLS  [advisory — not part of the score or the verdict]");
  if (report.skipped) {
    lines.push(`  skipped — ${report.skipped}`);
    return lines;
  }
  if (!report.signals || report.signals.length === 0) {
    lines.push("  none — sentence lengths, paragraph shape, and parallel clauses stay varied");
  } else {
    lines.push(`  advisory score: ${report.advisoryScore}/100 (not added to the scan score)`);
    for (const s of report.signals) lines.push(`  - ${s.id}: ${s.detail}`);
  }
  return lines;
}

return {
  scoreSoftTells,
  scoreInput,
  formatSoftTellLines,
  plainTextFromHtml,
  sentenceSpread,
  paragraphShape,
  parallelClauses,
  DRIVES_DETERMINISTIC_SCORE,
};
});
