"use strict";
/**
 * Lazynext AI Slop Checker — judge mode (src/judge.js).
 *
 * `--judge` turns "judgement tells" into a deterministic checklist. The
 * scanner answers "how much slop?"; judgeReport answers "what would a
 * sharp design partner actually say?" — a machine-built review with three
 * parts:
 *
 *   1. THE 5-QUESTION REVIEW (purpose / audience / decision / variety /
 *      defaults) — human questions with machine-flagged signals. Each
 *      question carries `hints` (how a reviewer answers it) and a
 *      `verdictHint` (what a passing answer looks like). Where scan
 *      evidence bears on a question, `signals` lists the detected tells
 *      so the human checks them first. The questions themselves are
 *      labelled as human steps — the machine never answers them.
 *
 *   2. THE CRAFT FLOOR — the six non-negotiable quality rules. Each item
 *      is mapped to machine evidence ONLY where the evidence exists:
 *      text hierarchy / spacing / fake data / decorative effects map to
 *      scanner design patterns; contrast and alignment need computed
 *      styles (r-contrast, geometry) and are emitted as guidance
 *      checkboxes — never as fake machine verdicts.
 *
 *   3. REFUSAL SCAFFOLDS — the professional sentences to send when the
 *      floor passes but the bar does not (the reviewer's words).
 *
 * The final verdict (PASS | REVIEW | REFUSE) is computed ONLY from the
 * machine-verifiable parts: REFUSE when a machine-checked floor item
 * fails, REVIEW when machine objections are found, PASS only when
 * neither fires. A machine PASS is still labelled as requiring the human
 * checklist below. Deterministic: same input, same report, no LLM.
 */

const { scanText, scanHtml } = require("./scanner.js");
const { scanProject } = require("./project-scanner.js");
const corpus = require("../data/slop-patterns.js");

const ENGINE_NAME = "lazynext-ai-slop-checker-judge";
const CLEAN_THRESHOLD = 9;

// ---------------------------------------------------------------------------
// The 5-question review (docs/design-review-guide.md §5), with the machine
// signals that bear on each question. Deterministic, data-driven tables.
// ---------------------------------------------------------------------------

const FIVE_QUESTIONS = [
  {
    id: "purpose",
    question: "What is this for?",
    hints: [
      "Name the page's ONE job in one sentence.",
      "If you cannot name it, the page is hedging — and the hedge is the slop.",
      "Every section should serve that one job; anything that does not is up for cuts.",
    ],
    verdictHint: "Pass = you can state the one job in one sentence, and every section serves it.",
    signalCategories: [
      "filler-phrases",
      "throat-clearing",
      "faux-insight",
      "importance-puffery",
      "weasel-attribution",
      "business-jargon",
      "meta-commentary",
      "vague-declaratives",
    ],
  },
  {
    id: "audience",
    question: "Who is it for?",
    hints: [
      "Describe a real person in a real context — job, stakes, situation.",
      '"Everyone" is not an audience; it is a default nobody chose.',
      "The copy should name that person's job, stakes, or situation.",
    ],
    verdictHint: "Pass = you can name the exact person and context the page speaks to.",
    signalCategories: [],
  },
  {
    id: "decision",
    question: "Does it decide?",
    hints: [
      "Every element should have a chosen importance.",
      "If the hero, the first card, the primary button and the footer CTA all shout, nothing leads.",
      "Hierarchy is a decision, not a cascade of emphasis.",
    ],
    verdictHint: "Pass = a clear single hierarchy — one element leads per screen.",
    signalPatternIds: ["d-flat-type", "d-display-headline", "d-kicker", "d-caps-card-grid"],
  },
  {
    id: "variety",
    question: "Does it vary?",
    hints: [
      "The rhythm of sections, the weight of sentences, the shape of cards.",
      "Uniformity everywhere is the machine's comfort zone.",
      "Variation should encode meaning, not decorate it.",
    ],
    verdictHint: "Pass = sections, cards and sentences vary in ways that signal relative importance.",
    signalPatternIds: ["d-one-gap", "d-caps-card-grid", "d-section-numbers"],
  },
  {
    id: "defaults",
    question: "Does it use defaults nobody chose?",
    hints: [
      "The gradient, the Inter font, the equal cards, the \"seamless\" line.",
      "Name the default; then decide whether to keep it deliberately.",
      "A default only becomes slop when you cannot justify it (the Reflex gate).",
    ],
    verdictHint: "Pass = every AI-default visible is either removed or kept for a named reason.",
    anyDesign: true,
  },
];

// ---------------------------------------------------------------------------
// The craft floor (docs/design-review-guide.md §4). `evidenceIds` lists the
// scanner pattern ids that constitute machine evidence for the item;
// `checkableFromScan` says whether the item is verifiable from the inputs
// this module accepts (text/html/project). Contrast and alignment are NOT —
// they need computed styles — so they ship as human-checkbox items with
// guidance, never as machine verdicts.
// ---------------------------------------------------------------------------

const CRAFT_FLOOR = [
  {
    id: "contrast",
    name: "Contrast",
    desc: "Text over its real (computed) background: ≥ 4.5:1 for normal text, ≥ 3:1 for large text (24px+, or 18.66px+ bold).",
    checkableFromScan: false,
    guidance:
      "Not machine-checkable from a text/HTML scan — contrast needs computed styles. Run the rendered checks (r-contrast over a snapshot, src/render-checks.js) or measure in a browser; then check the box.",
  },
  {
    id: "alignment",
    name: "Alignment",
    desc: "Things that look aligned must be aligned by the same grid — shared axes share an edge within 1px, never by eye-felt.",
    checkableFromScan: false,
    guidance:
      "Not machine-checkable without computed geometry. Check hairline-off misalignment by eye (two elements sharing a visual axis must share an edge within 1px), then check the box.",
  },
  {
    id: "text-hierarchy",
    name: "Text hierarchy",
    desc: "One type scale doing real work — a size step is a promise about importance; kickers must not read as body or shout past the heading.",
    checkableFromScan: true,
    evidenceIds: ["d-flat-type", "d-display-headline", "d-kicker"],
    guidance: "Machine evidence: d-flat-type (headings at body size), d-display-headline (full-sentence display headlines), d-kicker (tracked-caps labels above headings).",
  },
  {
    id: "spacing",
    name: "Spacing",
    desc: "Space by relationship, not by one gap value stamped everywhere — tight inside groups, generous between.",
    checkableFromScan: true,
    evidenceIds: ["d-one-gap"],
    guidance: "Machine evidence: d-one-gap (one spacing value repeated across independent blocks).",
  },
  {
    id: "no-fake-data",
    name: "No fake data",
    desc: "Invented metrics (\"10,000+ users\"), badges that manufacture buzz, avatar grids standing in for social proof — if the number is real, name its source.",
    checkableFromScan: true,
    evidenceIds: ["d-stat-row", "d-badge-spam", "d-avatar-grid"],
    guidance: "Machine evidence: d-stat-row (round invented stat rows), d-badge-spam (\"New!/Hot!/beta\" pills), d-avatar-grid (generic face grids).",
  },
  {
    id: "no-decorative-effects",
    name: "No decorative text-effects",
    desc: "Gradient-crushed headline text, all-caps-with-wayward-tracking labels, glued arrows (learn-more-→).",
    checkableFromScan: true,
    evidenceIds: ["d-gradient-text", "d-crushed-tracking", "d-glued-arrow"],
    guidance: "Machine evidence: d-gradient-text, d-crushed-tracking, d-glued-arrow.",
  },
];

// ---------------------------------------------------------------------------
// Refusal scaffolds (docs/design-review-guide.md §6) — the professional
// sentences to send when the floor passes but the bar does not.
// ---------------------------------------------------------------------------

const REFUSAL_SCAFFOLDS = [
  {
    name: "The shape is wrong — here is the shape I'd choose",
    when: "Craft passes, but the section shape is the machine's landing page (kicker + huge claim + six equal cards).",
    text: "The craft is fine — the contrast passes, the type is clean. The problem is the shape: a kicker, a huge claim, and six equal cards is the machine's landing page, not this product's. I'd cut the kicker, make the first card state the single promise, and let the other five be tertiary.",
  },
  {
    name: "The claim outruns the evidence",
    when: "\"Seamless\" / \"revolutionary\" / stat-row claims above the fold with nothing behind them below.",
    text: "You say \"seamless\" and \"revolutionary\" above the fold, but the page shows three features. The fix is not better adjectives — it is one sentence about the actual hardest thing this product solves.",
  },
  {
    name: "The floor passes, the bar is the problem",
    when: "Nothing is broken and nothing is chosen — every pixel defensible, nothing memorable.",
    text: "Nothing here is broken and nothing here is chosen. Every pixel is defensible and nothing is memorable. Let's start from the one thing a visitor must understand in five seconds, and rebuild the hierarchy from that.",
  },
];

// ---------------------------------------------------------------------------
// Machine-signal helpers (deterministic)
// ---------------------------------------------------------------------------

function isDesignMatch(m) {
  return typeof m.category === "string" && m.category.startsWith("design-");
}

function isCopyMatch(m) {
  return !isDesignMatch(m);
}

/** Count distinct match ids (sorted by id) that fall in the given filter. */
function signalCounts(matches, opts) {
  const counts = new Map();
  for (const m of matches) {
    const hit =
      opts.anyDesign ? isDesignMatch(m) :
      opts.patternIds ? opts.patternIds.includes(m.id) :
      opts.categories ? opts.categories.includes(m.category) :
      false;
    if (hit) counts.set(m.id, (counts.get(m.id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Build the 5-question review with machine-flagged signals. */
function buildFiveQuestions(matches) {
  return FIVE_QUESTIONS.map((q) => ({
    question: q.question,
    hints: q.hints,
    verdictHint: q.verdictHint,
    signals: signalCounts(matches, q),
  }));
}

/**
 * Build the craft floor. `inputType` is "text" | "html" | "project".
 * Machine verdicts only where checkable: html/project scans can fire
 * design patterns; plain text cannot, so those items become human steps.
 */
function buildCraftFloor(matches, inputType) {
  return CRAFT_FLOOR.map((item) => {
    const checkable = item.checkableFromScan && inputType !== "text";
    const evidence = item.evidenceIds ? matches.filter((m) => item.evidenceIds.includes(m.id)) : [];
    const machine = checkable
      ? evidence.length > 0 ? "flag" : "ok"
      : "unchecked"; // human checkbox — never a fake machine verdict
    return {
      id: item.id,
      name: item.name,
      desc: item.desc,
      machine, // "ok" | "flag" | "unchecked"
      evidence: evidence.map((m) => m.id).sort(),
      humanCheckbox: !checkable,
      guidance: item.guidance,
    };
  });
}

// ---------------------------------------------------------------------------
// Scan normalization (one uniform view for text/html/project)
// ---------------------------------------------------------------------------

/** Flatten matches out of a scan report OR a project report. */
function scanView(reportOrProject) {
  if (reportOrProject && Array.isArray(reportOrProject.files)) {
    const matches = [];
    for (const f of reportOrProject.files) {
      if (f && f.report && Array.isArray(f.report.matches)) matches.push(...f.report.matches);
    }
    return {
      project: true,
      root: reportOrProject.root,
      score: reportOrProject.summary.score,
      verdict: reportOrProject.summary.verdict,
      clean: reportOrProject.summary.score <= CLEAN_THRESHOLD,
      matches,
      filesScanned: reportOrProject.summary.filesScanned,
      filesWithHits: reportOrProject.summary.filesWithHits,
      filesSkipped: reportOrProject.summary.filesSkipped,
      totalPoints: reportOrProject.summary.totalPoints,
    };
  }
  return {
    project: false,
    score: reportOrProject.score,
    verdict: reportOrProject.verdict,
    clean: reportOrProject.clean,
    matches: Array.isArray(reportOrProject.matches) ? reportOrProject.matches : [],
  };
}

// ---------------------------------------------------------------------------
// judgeReport
// ---------------------------------------------------------------------------

/**
 * judgeReport({ text? | html? | project? }) — the deterministic judge
 * checklist. Exactly one input. Returns:
 *  { engine, version, input, scan, fiveQuestionReview, craftFloor,
 *    craftFloorMet, refusalScaffolds, summary }
 */
function judgeReport(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("judgeReport expects an input object");
  }
  const { text, html, project } = input;
  const kinds = [text !== undefined, html !== undefined, project !== undefined].filter(Boolean).length;
  if (kinds === 0) throw new TypeError("judgeReport needs one of: text, html, project");
  if (kinds > 1) throw new TypeError("judgeReport needs exactly one of: text, html, project");

  let raw;
  let inputDesc;
  if (text !== undefined) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    raw = scanText(text);
    inputDesc = { type: "text", length: text.length };
  } else if (html !== undefined) {
    if (typeof html !== "string") throw new TypeError("html must be a string");
    raw = scanHtml(html);
    inputDesc = { type: "html", length: html.length };
  } else {
    if (typeof project !== "string" || project.length === 0) {
      throw new TypeError("project must be a non-empty directory path");
    }
    raw = scanProject(project);
    inputDesc = { type: "project", dir: project, filesScanned: raw.summary.filesScanned };
  }

  const scan = scanView(raw);
  const matches = scan.matches;
  const copyTells = matches.filter(isCopyMatch).length;
  const designTells = matches.filter(isDesignMatch).length;

  const fiveQuestionReview = buildFiveQuestions(matches);
  const craftFloor = buildCraftFloor(matches, inputDesc.type);
  const floorFlags = craftFloor.filter((f) => f.machine === "flag");
  const craftFloorMet = floorFlags.length === 0;

  // ── Machine-computed verdict (ONLY from machine-verifiable parts) ──────
  const reasons = [];
  let verdict;
  if (!craftFloorMet) {
    verdict = "REFUSE";
    for (const f of floorFlags) {
      reasons.push(`craft floor not met: ${f.name} — evidence: ${f.evidence.join(", ")}`);
    }
  } else if (matches.length > 0) {
    verdict = "REVIEW";
    if (copyTells > 0) reasons.push(`copy objections: ${copyTells} AI-dialect tell(s) in the copy`);
    if (designTells > 0) reasons.push(`design objections: ${designTells} AI-default design tell(s)`);
    if (reasons.length === 0) reasons.push(`score ${scan.score}/100 — above the clean threshold`);
  } else {
    verdict = "PASS";
    reasons.push("no machine-verifiable floor violations and no machine objections");
  }

  const summary = {
    verdict,
    reasons,
    machineChecked: {
      floorItemsTotal: craftFloor.length,
      floorFlagged: floorFlags.length,
      floorOk: craftFloor.filter((f) => f.machine === "ok").length,
      floorUnchecked: craftFloor.filter((f) => f.machine === "unchecked").length,
      objections: matches.length,
      copyTells,
      designTells,
    },
    humanStepsRequired: true,
    note:
      "Verdict computed ONLY from machine-verifiable parts. The 5-question review and any unchecked floor items are human steps — a human objection flips PASS to REVIEW, and REFUSE stands until the floor clears.",
  };

  return {
    engine: ENGINE_NAME,
    version: corpus.version,
    input: inputDesc,
    scan,
    fiveQuestionReview,
    craftFloor,
    craftFloorMet,
    refusalScaffolds: REFUSAL_SCAFFOLDS,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Human-readable render for the CLI
// ---------------------------------------------------------------------------

/** Build the human report lines. Shared by the CLI (--judge). */
function formatJudgeLines(r) {
  const lines = [];
  lines.push(`JUDGE — ${r.engine} v${r.version}`);
  if (r.input.type === "project") {
    lines.push(`Input:  project (${r.input.dir}) — ${r.input.filesScanned} file(s) scanned`);
  } else {
    lines.push(`Input:  ${r.input.type} (${r.input.length} chars)`);
  }
  lines.push(`Scan:   ${r.scan.score}/100 ${r.scan.verdict}${r.scan.clean ? " — clean" : ""} · ${r.scan.matches.length} match(es)`);
  lines.push("");

  lines.push("THE 5-QUESTION REVIEW  [human steps — machine signals below each]");
  r.fiveQuestionReview.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question}`);
    if (q.signals.length) {
      for (const s of q.signals) lines.push(`     signal: ${s.count}× ${s.id}`);
    } else {
      lines.push(`     signal: no machine evidence detected for this question`);
    }
    lines.push(`     pass looks like: ${q.verdictHint}`);
  });

  lines.push("");
  lines.push("CRAFT FLOOR  [machine-checked where possible; unchecked = human step]");
  for (const f of r.craftFloor) {
    const mark = f.machine === "flag" ? "[FAIL]" : f.machine === "ok" ? "[ OK ]" : "[  ?  ]";
    lines.push(` ${mark} ${f.name}${f.evidence.length ? " — " + f.evidence.join(", ") : ""}`);
    if (f.machine === "unchecked") lines.push(`         human step: ${f.guidance}`);
  }

  lines.push("");
  lines.push("REFUSAL SCAFFOLDS  [the reviewer's words when the floor passes but the bar does not]");
  for (const s of r.refusalScaffolds) {
    lines.push(` · ${s.name}: ${s.text}`);
  }

  lines.push("");
  lines.push(`VERDICT: ${r.summary.verdict}`);
  for (const reason of r.summary.reasons) lines.push(`  - ${reason}`);
  lines.push(`  ${r.summary.note}`);
  return lines;
}

function formatJudge(r) {
  return formatJudgeLines(r).join("\n");
}

module.exports = {
  judgeReport,
  formatJudge,
  formatJudgeLines,
  FIVE_QUESTIONS,
  CRAFT_FLOOR,
  REFUSAL_SCAFFOLDS,
  ENGINE_NAME,
};