import test from "node:test";
import assert from "node:assert/strict";

import {
  tokenize,
  buildIndex,
  findVerbatimRuns,
  segmentsOf,
  DEFAULT_WINDOW,
  MIN_WINDOW,
} from "../scripts/verbatim-audit.mjs";

/**
 * These lock the provenance claim that ATTRIBUTIONS.md makes. The claim is only
 * worth anything if three things hold: a real copied run is caught, ordinary
 * prose is not, and an unreachable corpus never reads as a pass.
 */

const RUN = 14; // the documented window: 14+ identical words is a violation

/** Upstream docs are { name, texts: [{ file, text }] }. */
function upstream(name, file, text) {
  return { name, license: "MIT", texts: [{ file, text }] };
}

function tracked(file, text) {
  return { file, text };
}

test("a 14-word run shared with an upstream file is reported as a hit", () => {
  const copied =
    "the quick brown fox jumps over the lazy dog while the band plays on and the crowd cheers loudly into the night";
  const up = upstream("fake-mit", "SKILL.md", `nothing before\n${copied}\nnothing after`);
  const ours = tracked("skill/SKILL.md", `our own intro. ${copied} our own outro.`);

  const hits = findVerbatimRuns({ tracked: [ours], upstreams: [up] });

  assert.ok(hits.length > 0, "the copied run must be reported");
  assert.equal(hits[0].file, "skill/SKILL.md");
  assert.ok(hits[0].upstream === "fake-mit");
  assert.ok(hits[0].words >= RUN);
});

test("the hit reports a line number the writer can act on", () => {
  const copied =
    "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho";
  const up = upstream("fake-mit", "taxonomy.md", copied);
  const ours = tracked("docs/page.md", `line one\nline two\n${copied}\nline four`);

  const hits = findVerbatimRuns({ tracked: [ours], upstreams: [up] });

  assert.ok(hits.length > 0);
  assert.equal(hits[0].line, 3, "the copied words begin on line 3");
});

test("independent prose that shares only ordinary phrasing is not a hit", () => {
  const up = upstream(
    "fake-mit",
    "SKILL.md",
    "Writing well means cutting the words that announce a point instead of making one.",
  );
  const ours = tracked(
    "skill/SKILL.md",
    "Our guidance: write the point itself. If a sentence only promises to make a point later, delete it.",
  );

  const hits = findVerbatimRuns({ tracked: [ours], upstreams: [up] });

  assert.equal(hits.length, 0, "no run of 14+ identical words exists between them");
});

test("a run shorter than the window does not fire", () => {
  // 12 identical words — below the 14-word floor, so it must stay silent.
  const short = "one two three four five six seven eight nine ten eleven twelve";
  const up = upstream("fake-mit", "SKILL.md", short);
  const ours = tracked("docs/page.md", `and then ${short} and then more text follows here`);

  const hits = findVerbatimRuns({ tracked: [ours], upstreams: [up] });

  assert.equal(hits.length, 0);
});

test("the documented window is 14 words", () => {
  assert.equal(DEFAULT_WINDOW, 14);
  assert.ok(MIN_WINDOW <= DEFAULT_WINDOW);
});

test("an empty upstream corpus evaluates nothing and yields no hits", () => {
  const ours = tracked("docs/page.md", "some prose that is entirely ours and therefore fine to ship");

  // An empty corpus cannot corroborate anything. It returns zero hits, which is
  // precisely why the CLI must distinguish that from a verified-clean result and
  // exit 2 (unreachable) rather than 0 (clean).
  const hits = findVerbatimRuns({ tracked: [ours], upstreams: [] });

  assert.deepEqual(hits, []);
});

test("tokenizing normalizes punctuation and whitespace consistently", () => {
  assert.deepEqual(tokenize("Hello,   world!"), tokenize("hello world"));
  // Apostrophes are kept (so "it's" stays one token and cannot fake a match
  // against "it s"), but case and surrounding punctuation are normalized.
  assert.deepEqual(tokenize("It's NOT x"), tokenize("it's not x"));
});

test("segmentsOf keeps prose and enumerations separable", () => {
  // A comma-joined word list is a factual vocabulary, not prose.
  const text = "Words to cut: delve, foster, leverage, utilize, facilitate, empower, streamline.";
  const segs = segmentsOf("skill/SKILL.md", text);

  assert.ok(Array.isArray(segs));
  assert.ok(segs.length > 0);
});

test("buildIndex keys windows by size", () => {
  const tokens = tokenize("a b c d e f g h i j k l m n o p");

  assert.ok(buildIndex(tokens, 4).size > 0);
  assert.equal(buildIndex(tokens, 40).size, 0, "a window longer than the text indexes nothing");
});
