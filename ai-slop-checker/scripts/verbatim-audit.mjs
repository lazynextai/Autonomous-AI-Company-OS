#!/usr/bin/env node
/**
 * Lazynext AI Slop Checker — verbatim provenance audit (`npm run verbatim-audit`).
 *
 * ATTRIBUTIONS.md used to claim that nothing from the five source projects was
 * copied verbatim. Measured 2026-11-27, that claim was false: the skill file
 * carried runs of 14+ identical words against petergyang/no-ai-slop's SKILL.md,
 * and several `desc:` fields reproduced kill-ai-slop's taxonomy prose.
 *
 * This script turns the claim into a test instead of a sentence. It loads the
 * prose files of the five upstream repositories at HEAD (by network, or from a
 * local clone supplied with `--root`), slides a 14-word window over every
 * tracked prose segment in this repo, and reports each run whose normalised
 * text appears in an upstream file.
 *
 * Enumerated term lists are exempt by design. The banned-word and banned-phrase
 * lists are factual vocabularies — any two projects auditing the same language
 * produce the same list — so they are kept (founder decision, 2026-11-27) and
 * labelled as factual vocabularies in ATTRIBUTIONS.md. See `isEnumerationRun`.
 *
 * Deterministic and dependency-free. Exit codes:
 *   0  clean               — no >=14-word verbatim run found
 *   1  hits found          — provenance regression; rewrite the passage
 *   2  audit could not run — every upstream source was unreachable (never a pass)
 *
 * Usage:
 *   node scripts/verbatim-audit.mjs
 *   node scripts/verbatim-audit.mjs --json
 *   node scripts/verbatim-audit.mjs --root /tmp        (offline: /tmp/upstream-<name>)
 *   node scripts/verbatim-audit.mjs --window 18        (stricter window)
 *   node scripts/verbatim-audit.mjs --update-baseline  (stamp today's date in ATTRIBUTIONS.md)
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default window, in words — the threshold the 2026-11-27 audit used. */
const DEFAULT_WINDOW = 14;

/** Floor: below this a shared n-gram is a phrase, not copied prose. */
const MIN_WINDOW = 8;

/**
 * The five upstream projects and the prose files we audit against.
 *
 * `prose` lists the documents that carry creative expression. Code files are
 * excluded deliberately: this product shares algorithm ideas with its
 * references, not their source, and a regex literal is not prose.
 */
const UPSTREAMS = [
  {
    name: "impeccable",
    repo: "pbakaus/impeccable",
    license: "Apache-2.0",
    prose: [
      ".agent/skills/impeccable/SKILL.md",
      ".agent/skills/impeccable/reference/audit.md",
      ".agent/skills/impeccable/reference/critique.md",
      ".agent/skills/impeccable/reference/critique-rubric.md",
      ".agent/skills/impeccable/reference/craft-floor.md",
      ".agent/skills/impeccable/reference/craft.md",
      ".agent/skills/impeccable/reference/harden.md",
      ".agent/skills/impeccable/reference/distill.md",
      ".agent/skills/impeccable/reference/clarify.md",
      ".agent/skills/impeccable/reference/colorize.md",
      ".agent/skills/impeccable/reference/bolder.md",
      ".agent/skills/impeccable/reference/delight.md",
    ],
  },
  {
    name: "kill-ai-slop",
    repo: "yetone/kill-ai-slop",
    license: "Apache-2.0",
    prose: [
      "skill/SKILL.md",
      "skill/references/taxonomy.md",
      "skill/references/detection.md",
      "skill/references/fixes.md",
    ],
  },
  {
    name: "no-ai-slop",
    repo: "petergyang/no-ai-slop",
    license: "MIT",
    prose: ["skills/no-ai-slop/SKILL.md", "skills/no-ai-slop/eval.md"],
  },
  {
    name: "stop-slop",
    repo: "hardikpandya/stop-slop",
    license: "MIT",
    prose: ["SKILL.md", "references/phrases.md", "references/structures.md", "references/examples.md"],
  },
  {
    name: "hallmark",
    repo: "Nutlope/hallmark",
    license: "MIT",
    prose: [
      "skills/hallmark/SKILL.md",
      "skills/hallmark/references/gates.md",
      "skills/hallmark/references/craft.md",
      "skills/hallmark/references/macrostructures.md",
      "skills/hallmark/references/anatomy.md",
      "skills/hallmark/references/brand-truth.md",
    ],
  },
];

/**
 * The files this repo claims as its own expression. Everything listed is prose
 * we assert is not copied; anything not listed is either code or generated.
 */
const TRACKED = [
  "skill/SKILL.md",
  "skill/CLAUDE.md",
  "skill/references/visual-tells.md",
  "data/slop-patterns.js",
  "data/rules.ru.js",
  "data/rules.hi.js",
  "data/rules.es.js",
  "data/rules.fr.js",
  "data/rules.de.js",
  "docs/design-review-guide.md",
  "docs/upstream-diff-2026-11-27.md",
  "bench/eval.js",
  "llms.txt",
  "README.md",
  "CHANGELOG.md",
  "ROADMAP.md",
  "docs/usage.md",
];

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'\u2019]*/gu;

/**
 * Normalise text into a token stream, with character offsets and a quote mask.
 *
 * Tokens are runs of letters/digits with internal apostrophes, lowercased.
 * Typographic punctuation folds (`don’t` → `don't`, en/em dashes → space) so
 * the same sentence written with either style compares equal.
 *
 * `quoted[i]` is true when token i sits inside a backtick span or a
 * double-quoted string. The mask is computed over the whole segment, so a
 * window that clips a list's opening backtick still classifies correctly.
 */
export function tokenizeWithOffsets(text) {
  const src = String(text)
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2012]/g, " ");

  const spans = [];
  const spanRe = /`[^`\n]*`|"[^"\n]*"/g;
  let s;
  while ((s = spanRe.exec(src)) !== null) spans.push([s.index, s.index + s[0].length]);

  const tokens = [];
  const offsets = [];
  const quoted = [];
  const re = new RegExp(TOKEN_RE.source, "gu");
  let m;
  while ((m = re.exec(src)) !== null) {
    const tok = m[0].toLowerCase().replace(/^'+|'+$/g, "");
    if (!tok) continue;
    tokens.push(tok);
    offsets.push(m.index);
    quoted.push(spans.some(([a, b]) => m.index >= a && m.index < b));
  }
  return { tokens, offsets, quoted, src };
}

/** Normalise text into a plain token stream. */
export function tokenize(text) {
  return tokenizeWithOffsets(text).tokens;
}

/**
 * True when a run carries no sentence of its own — it is a term list.
 *
 * This is the exemption the founder decision rests on: the banned-word and
 * banned-phrase ENUMERATIONS stay, as factual vocabulary, while every prose
 * sentence is rewritten. Two signals, either sufficient:
 *
 *   (a) at least 80% of the run's tokens sit inside backticks or quotes. The
 *       mask comes from the whole segment, so a clipped window still works.
 *   (b) the run is a list fragment: at least two item separators per fourteen
 *       words and no sentence-ending punctuation inside the run.
 *
 * Copied prose fails both — it carries a period, or it has no separator rhythm.
 * The rule errs toward flagging: a false hit costs one rewrite, a false pass
 * costs the claim.
 */
export function isEnumerationRun(sliceText, quotedFlags) {
  const words = tokenize(sliceText);
  if (words.length === 0) return false;

  const flags = Array.isArray(quotedFlags) ? quotedFlags : quoteMaskFor(sliceText);
  if (flags.length) {
    const insideQuotes = flags.filter(Boolean).length;
    if (insideQuotes / flags.length >= 0.8) return true;
  }

  const seps = (sliceText.match(/[,/|\u00b7]|\s+[-\u2013\u2014]\s+/g) || []).length;
  const sentenceEnd = /[.!?](\s|$)/.test(sliceText.replace(/\.\.\./g, ""));
  const needed = Math.max(2, Math.ceil((words.length / DEFAULT_WINDOW) * 2));
  return !sentenceEnd && seps >= needed;
}

/** Quote mask for a standalone slice (fallback when no segment mask exists). */
function quoteMaskFor(sliceText) {
  return tokenizeWithOffsets(sliceText).quoted;
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

/**
 * Split a tracked document into the prose segments the audit judges.
 *
 * Markdown/text documents are judged whole: every word is our own prose and the
 * backticked/quoted spans form the vocabulary mask.
 *
 * JavaScript data modules are judged field by field. Only the human-readable
 * fields (`name`, `desc`, `fix`, `rewrite`) and comments carry prose. Auditing
 * the raw module would let a regex body or a repeated identifier pass as
 * "quoted, therefore a list" — exactly how a copied `desc:` would hide behind
 * its own string delimiters. Field segments have no quote mask: their entire
 * value is prose, so an unquoted vocabulary list there is still prose-shaped.
 */
export function segmentsOf(file, text) {
  if (!/\.(?:js|mjs|cjs)$/.test(file)) return [{ text, line: 1, quotedMask: true }];

  const segments = [];

  const fieldRe = /\b(?:name|desc|fix|rewrite)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  let m;
  while ((m = fieldRe.exec(text)) !== null) {
    const value = m[1]
      .slice(1, -1)
      .replace(/\\n/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    if (!value.trim()) continue;
    segments.push({ text: value, line: lineOf(text, m.index), quotedMask: false });
  }

  // Comments are our writing too: /** block */ and // line.
  const commentRe = /\/\*\*([\s\S]*?)\*\/|(?:^|\n)[ \t]*\/\/([^\n]*)/g;
  while ((m = commentRe.exec(text)) !== null) {
    const body = (m[1] || m[2] || "").replace(/^\s*\*\s?/gm, " ");
    if (tokenize(body).length < MIN_WINDOW) continue;
    segments.push({ text: body, line: lineOf(text, m.index), quotedMask: true });
  }

  return segments;
}

/** 1-based line number of a character offset. */
function lineOf(text, offset) {
  let line = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

// ---------------------------------------------------------------------------
// Index + audit
// ---------------------------------------------------------------------------

/** Sliding-window index: normalised n-gram -> first token offset. */
export function buildIndex(tokens, window) {
  const index = new Map();
  for (let i = 0; i + window <= tokens.length; i += 1) {
    const key = tokens.slice(i, i + window).join(" ");
    if (!index.has(key)) index.set(key, i);
  }
  return index;
}

/**
 * Find every >=window-word run shared between tracked files and upstream prose.
 *
 * Returns hits shaped { file, line, words, upstream, upstreamFile, slice, text }.
 * Adjacent matching windows collapse into one hit per contiguous duplicate
 * region, so a 30-word copy reports once rather than seventeen times.
 */
export function findVerbatimRuns({ tracked, upstreams, window = DEFAULT_WINDOW, minWindow = MIN_WINDOW }) {
  const hits = [];
  const win = Math.max(minWindow, window);

  const corpus = [];
  for (const up of upstreams) {
    for (const { file, text } of up.texts || []) {
      corpus.push({ upstream: up.name, file, tokens: tokenize(text) });
    }
  }
  if (corpus.length === 0) return hits;

  for (const doc of tracked) {
    if (!doc.text) continue;
    for (const seg of segmentsOf(doc.file, doc.text)) {
      const { tokens: localTokens, quoted, offsets } = tokenizeWithOffsets(seg.text);
      if (localTokens.length < win) continue;

      for (const upDoc of corpus) {
        const upIndex = buildIndex(upDoc.tokens, win);
        if (upIndex.size === 0) continue;

        let runStart = -1;
        for (let i = 0; i + win <= localTokens.length; i += 1) {
          const key = localTokens.slice(i, i + win).join(" ");
          if (upIndex.has(key)) {
            if (runStart === -1) runStart = i;
            continue;
          }
          if (runStart !== -1) {
            emitHit({ doc, seg, tokens: localTokens, quoted, offsets, start: runStart, firstMiss: i, upDoc, win, hits });
            runStart = -1;
          }
        }
        if (runStart !== -1) {
          emitHit({
            doc,
            seg,
            tokens: localTokens,
            quoted,
            offsets,
            start: runStart,
            firstMiss: localTokens.length - win + 1,
            upDoc,
            win,
            hits,
          });
        }
      }
    }
  }
  return hits;
}

/** Emit one hit for a finished run, unless it is a vocabulary enumeration. */
function emitHit({ doc, seg, tokens, quoted, offsets, start, firstMiss, upDoc, win, hits }) {
  // firstMiss is the first window index that did not match, so the run's last
  // matching window starts at firstMiss-1 and covers through firstMiss-1+win.
  const end = Math.max(start + win, firstMiss - 1 + win);
  const runTokens = tokens.slice(start, end);
  if (runTokens.length < win) return;

  // Recover the run's original text so punctuation survives: an item list is
  // only recognisable as a list while its commas are still there.
  const from = offsets[start] ?? 0;
  const lastIdx = Math.min(end - 1, offsets.length - 1);
  const to = (offsets[lastIdx] ?? 0) + runTokens[runTokens.length - 1].length;
  const sliceText = seg.text.slice(from, to).replace(/\s+/g, " ").trim();

  if (seg.quotedMask && isEnumerationRun(sliceText, quoted.slice(start, end))) return;

  // Segment-relative token offset -> segment line -> document line.
  const line = seg.line + lineOf(seg.text, offsets[start] ?? 0) - 1;

  hits.push({
    file: doc.file,
    line,
    words: runTokens.length,
    upstream: upDoc.upstream,
    upstreamFile: upDoc.file,
    slice: sliceText,
    text: runTokens.slice(0, 24).join(" ") + (runTokens.length > 24 ? " …" : ""),
  });
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "lazynext-verbatim-audit/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Load one upstream's prose corpus.
 *
 * Returns { name, license, texts, source, skipped }. `source` is "network",
 * "local-clone", "partial", "unreachable" or "disabled"; a network failure
 * records each skipped file rather than pretending the corpus was clean.
 */
async function loadUpstream(upstream, { root, fetchEnabled }) {
  const texts = [];
  const skipped = [];

  if (root) {
    for (const file of upstream.prose) {
      const p = join(root, `upstream-${upstream.name}`, file);
      if (!existsSync(p)) {
        skipped.push(`${file} (not in ${root}/upstream-${upstream.name})`);
        continue;
      }
      texts.push({ file, text: readFileSync(p, "utf8") });
    }
    return {
      name: upstream.name,
      license: upstream.license,
      texts,
      source: texts.length ? (skipped.length ? "partial-clone" : "local-clone") : "unreachable",
      skipped,
    };
  }

  if (!fetchEnabled) {
    return { name: upstream.name, license: upstream.license, texts, source: "disabled", skipped: [...upstream.prose] };
  }

  for (const file of upstream.prose) {
    const url = `https://raw.githubusercontent.com/${upstream.repo}/HEAD/${file}`;
    try {
      texts.push({ file, text: await fetchText(url) });
    } catch (err) {
      skipped.push(`${file} (${err.message})`);
    }
  }
  return {
    name: upstream.name,
    license: upstream.license,
    texts,
    source: texts.length === 0 ? "unreachable" : skipped.length ? "partial" : "network",
    skipped,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function loadTracked() {
  const docs = [];
  for (const rel of TRACKED) {
    const p = join(ROOT, rel);
    if (existsSync(p)) docs.push({ file: rel, text: readFileSync(p, "utf8") });
  }
  return docs;
}

function parseArgs(argv) {
  const opts = { json: false, root: null, window: DEFAULT_WINDOW, updateBaseline: false, fetch: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--root") opts.root = argv[++i];
    else if (a === "--window") opts.window = Number(argv[++i]) || DEFAULT_WINDOW;
    else if (a === "--update-baseline") opts.updateBaseline = true;
    else if (a === "--no-fetch") opts.fetch = false;
  }
  return opts;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Stamp today's date into ATTRIBUTIONS.md's provenance line. Opt-in: a plain
 * run stays read-only, so the file only changes when someone vouches for it.
 */
function updateBaseline() {
  const p = join(ROOT, "ATTRIBUTIONS.md");
  if (!existsSync(p)) return false;
  const before = readFileSync(p, "utf8");
  const after = before.replace(
    /verified clean by `npm run verbatim-audit` as of \d{4}-\d{2}-\d{2}/,
    `verified clean by \`npm run verbatim-audit\` as of ${today()}`
  );
  if (after === before) return false;
  writeFileSync(p, after);
  return true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = opts.json ? () => {} : (s) => console.log(s);

  out(`Lazynext AI Slop Checker — verbatim provenance audit (window: ${opts.window} words)`);

  const upstreams = [];
  for (const up of UPSTREAMS) {
    upstreams.push(await loadUpstream(up, { root: opts.root, fetchEnabled: opts.fetch }));
  }

  for (const u of upstreams) {
    const note = u.skipped.length ? `, ${u.skipped.length} file(s) skipped` : "";
    out(`  source ${u.name.padEnd(13)} ${u.license.padEnd(11)} ${u.source} (${u.texts.length} file(s)${note})`);
  }

  const usable = upstreams.filter((u) => u.texts.length > 0);
  if (usable.length === 0) {
    const message =
      "AUDIT CANNOT RUN — no upstream source reachable. This is not a pass. " +
      "Re-run with network access, or pass --root at a directory holding upstream-<name> clones.";
    if (opts.json) console.log(JSON.stringify({ status: "unavailable", message, upstreams }, null, 2));
    else console.error(`\n${message}`);
    process.exit(2);
  }

  const tracked = loadTracked();
  const hits = findVerbatimRuns({ tracked, upstreams: usable, window: opts.window });

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          status: hits.length === 0 ? "clean" : "hits",
          window: opts.window,
          audited: tracked.map((t) => t.file),
          upstreams: upstreams.map((u) => ({
            name: u.name,
            license: u.license,
            source: u.source,
            files: u.texts.length,
            skipped: u.skipped,
          })),
          hits,
        },
        null,
        2
      )
    );
    process.exit(hits.length === 0 ? 0 : 1);
  }

  out(`\nAudited ${tracked.length} tracked prose file(s) against ${usable.length} upstream corpus/corpora.`);

  if (hits.length === 0) {
    out(`\nVERBATIM AUDIT: CLEAN — no run of ${opts.window}+ identical words against any upstream prose file.`);
    if (opts.updateBaseline) {
      const changed = updateBaseline();
      out(changed ? `Baseline date updated in ATTRIBUTIONS.md (${today()}).` : "No baseline line to update.");
    }
    process.exit(0);
  }

  out(`\nVERBATIM AUDIT: ${hits.length} HIT(S) — rewrite these passages in our own words.\n`);
  for (const h of hits) {
    out(`  ${h.file}:${h.line}  ${h.words} words vs ${h.upstream}/${h.upstreamFile}`);
    out(`    "${h.slice.slice(0, 170)}${h.slice.length > 170 ? "…" : ""}"`);
  }
  out("\nMIT and Apache-2.0 permit the reuse; the claim is what must stay true.");
  out("Rewrite the passage in our own words, and keep the credit.");
  process.exit(1);
}

// Run only when invoked directly; the test suite imports the pure helpers.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`verbatim-audit failed: ${err && err.stack ? err.stack : err}`);
    process.exit(2);
  });
}

export { UPSTREAMS, TRACKED, DEFAULT_WINDOW, MIN_WINDOW };
