"use strict";
/**
 * Rewriter tests: conservative rewriting, before/after diffs, determinism,
 * and stability of unchanged text.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { rewriteText, createPreview, suggestionFor } = require("../src/rewriter.js");
const { scanText } = require("../src/scanner.js");
const corpus = require("../data/slop-patterns.js");

test("rewriteText: replaces whole-word bans with safe synonyms", () => {
  const result = rewriteText("We must leverage this robust tool and utilize it well.");
  assert.ok(result.changed, "expected changes");
  assert.ok(result.text.includes("use this"), `expected 'use' replacement: ${result.text}`);
  assert.ok(!result.text.includes("leverage"), `'leverage' still present: ${result.text}`);
  assert.ok(!result.text.includes("utilize"), `'utilize' still present: ${result.text}`);
  assert.ok(result.changes.some((c) => c.pattern === "w-leverage"), "changes must identify the pattern");
  assert.ok(result.changes.some((c) => c.pattern === "w-utilize"));
  assert.ok(result.changes.every((c) => typeof c.before === "string" && typeof c.after === "string"));
});

test("rewriteText: removes safe filler phrases", () => {
  const result = rewriteText("It's worth noting that the bakery opens at six.");
  assert.ok(result.changed);
  assert.ok(!result.text.toLowerCase().includes("it's worth noting"), `phrase not removed: ${result.text}`);
});

test("rewriteText: cleans em-dash runs are left alone (no blanket dashes)", () => {
  // Em-dash aggregate matches get no automatic rewrite in rewriteText —
  // verify the rewriter does not corrupt the text and reports nothing unsafe.
  const result = rewriteText("A — B — C — D.");
  assert.equal(result.text, "A — B — C — D.", "dashes must not be auto-rewritten");
});

test("rewriteText: input without tells is returned unchanged", () => {
  const clean =
    "The bakery opens at six. Maya sets the loaves on the counter in order of size, largest first.";
  const result = rewriteText(clean);
  assert.equal(result.changed, false);
  assert.equal(result.text, clean);
  assert.equal(result.changes.length, 0);
});

test("rewriteText: deterministic", () => {
  const input = "We must leverage this robust tool and utilize it well.";
  assert.deepEqual(rewriteText(input), rewriteText(input));
});

test("rewriteText: re-scan shows the rewrites reduced the flagged tell", () => {
  const input = "We must leverage this robust tool and utilize it well.";
  const before = scanText(input);
  const after = scanText(rewriteText(input).text);
  const beforeIds = before.matches.filter((m) => ["w-leverage", "w-utilize"].includes(m.id)).length;
  const afterIds = after.matches.filter((m) => ["w-leverage", "w-utilize"].includes(m.id)).length;
  assert.ok(afterIds < beforeIds, `expected fewer banned words after rewrite: ${beforeIds} -> ${afterIds}`);
});

test("suggestionFor: word patterns with rewrite produce a suggestion", () => {
  const pattern = corpus.patterns.find((p) => p.id === "w-delve");
  const match = { id: "w-delve", snippet: "delve", kind: "word" };
  const s = suggestionFor(match, pattern);
  assert.ok(s, "expected a suggestion");
  assert.equal(s.after, "explore");
});

test("suggestionFor: patterns without a safe rewrite return null", () => {
  const pattern = corpus.patterns.find((p) => p.id === "p-testament");
  const match = { id: "p-testament", snippet: "stands as a testament", kind: "phrase" };
  assert.equal(suggestionFor(match, pattern), null);
});

test("suggestionFor: em-dash count match suggests commas/periods", () => {
  const pattern = corpus.patterns.find((p) => p.id === "e-em-dash");
  const match = { id: "e-em-dash", snippet: "—", kind: "count", category: "em-dash" };
  const s = suggestionFor(match, pattern);
  assert.ok(s, "em-dash count should suggest a rewrite");
  assert.equal(s.type, "dashes");
});

test("createPreview: returns original when nothing to fix", () => {
  const out = createPreview("The bakery opens at six.");
  assert.equal(out.changes.length, 0);
  assert.ok(out.note);
});

test("createPreview: returns text + changes when fixes exist", () => {
  const out = createPreview("We should utilize this and leverage that.");
  assert.ok(out.changes.length >= 2);
  assert.equal(typeof out.sample, "string");
});

test("rewriteText: handles repeated same-word occurrences independently", () => {
  const input = "Leverage the API. Then leverage the data.";
  const result = rewriteText(input);
  assert.ok(!result.text.includes("leverage"), `both occurrences should be rewritten: ${result.text}`);
  assert.equal(result.changes.filter((c) => c.pattern === "w-leverage").length, 2);
});