/**
 * Outbound copy quality gate — the worker-side half of
 * `core/quality/copy_quality.py`.
 *
 * The platform worker cannot execute Python, and the campaign send loop is a
 * worker path, so the rule table exists twice. The two implementations are
 * pinned together by ONE shared fixture file
 * (`worker/test/fixtures/copy-quality-cases.json`, read by this test and by
 * `tests/unit/test_copy_quality.py`): a rule that exists in one runtime and
 * not the other fails on the same case. Keep the regexes port-for-port when
 * editing either side — the shared fixtures are the only drift defence.
 *
 * Severity asymmetry (identical to the Python module): a `block` finding is an
 * unsupported conformance/certification claim and prevents the send; a `warn`
 * finding is a style tell, returned and logged but never blocking. A style
 * tell is not a legal risk.
 *
 * Deterministic, no LLM, no network, no imports. Rule text was written for
 * this codebase; nothing is copied from any third-party rule set.
 */

export type CopySeverity = "warn" | "block";

export interface CopyRule {
  id: string;
  severity: CopySeverity;
  purpose: string;
}

export interface CopyFinding {
  rule_id: string;
  severity: CopySeverity;
  line: number;
  match: string;
  why: string;
}

export const COPY_RULES: readonly CopyRule[] = [
  { id: "slop-empty-phrase", severity: "warn", purpose: "an empty marketing phrase that adds words without information" },
  { id: "slop-not-just-x-its-y", severity: "warn", purpose: "the 'not just X, it's Y' frame is a recognised machine-writing tell" },
  { id: "claim-unsupported-conformance", severity: "block", purpose: "a conformance/certification claim with no cited audit — never imply a site is compliant" },
  { id: "claim-unsourced-superlative", severity: "warn", purpose: "a superlative about our product with no citation on or beside the line" },
  { id: "style-excess-exclamation", severity: "warn", purpose: "three or more exclamation marks in one paragraph" },
  { id: "style-hedge-stack", severity: "warn", purpose: "stacked hedging qualifiers weaken an otherwise direct claim" },
];

const RULE_ORDER = new Map(COPY_RULES.map((r, i) => [r.id, i]));
const RULE_SEVERITY = new Map(COPY_RULES.map((r) => [r.id, r.severity]));
const RULE_PURPOSE = new Map(COPY_RULES.map((r) => [r.id, r.purpose]));

// One clearly-marked, deliberately short constant — the same twelve phrases
// as the Python module. A long list flags competent brand copy, which is the
// failure mode that makes teams turn these gates off.
export const SLOP_PHRASES: readonly string[] = [
  "in today's fast-paced world",
  "in the ever-evolving",
  "unlock the power of",
  "unlock the potential of",
  "revolutionize",
  "seamlessly integrate",
  "game-changer",
  "delve into",
  "take it to the next level",
  "a testament to",
  "cutting-edge",
  "supercharge",
];

const escapePhrase = (p: string): string => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SLOP_RE = new RegExp(
  `\\b(?:${SLOP_PHRASES.map(escapePhrase).join("|")})(?:s|es|ed|d|ing|ly)?\\b`,
  "gi",
);
const NOT_JUST_X_RE = /\bnot\s+(?:just|only|merely)\b[^.!?\n]{0,80}?\b(?:it'?s|it\s+is)\b/gi;

const STANDARD_RE = /\b(?:wcag(?:\s*2(?:\.[0-2])?)?(?:\s*(?:aaa|aa|a))?|section\s*508|en\s*301\s*549|aoda|ada)\b/gi;
const CERT_PREDICATE_RE = /\b(?:certified|certification|certifies)\b/i;
const COMPLIANT_PREDICATE_RE = /\b(?:compliant|compliance|conform(?:s|ant)?)\b/i;
const BLANKET_CLAIM_RE = /\b(?:fully|100\s*%|completely|entirely|totally)\s+(?:accessible|compliant|conformant)\b/gi;
// "compliance issues" / "compliance tests" describe a check, not a claim.
const ISSUE_CONTEXT_AFTER_RE = /^\s+(?:issues?|problems?|gaps?|checks?|scans?|audits?|tests?|reports?|dashboards?|tracking|monitoring|status|concerns?|risks?)\b/i;
const NEGATED_CLAIM_RE =
  /\b(?:is|are|was|were)\s+not\b[^.!?\n]{0,60}?\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b|\b(?:does|do|did)\s+not\b[^.!?\n]{0,60}?\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b|\b(?:isn'?t|aren'?t|wasn'?t|weren'?t|doesn'?t|don'?t|cannot|can'?t)\b[^.!?\n]{0,60}?\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b|\bno\b[^.!?\n]{0,40}?\b(?:compliant|compliance|certified|conformance|certification)\b|\b(?:not|no)\s+a?\s*guarantee\b|\b(?:does|do|did)\s+not\s+guarantee\b|\bcannot\s+guarantee\b/gi;
const HONEST_VERB_RE = /\b(?:improve|improves|improving|improvement|check|checks|checking|scan|scans|scanning|find|finds|finding|fix|fixes|fixing|review|reviews|reviewing|test|tests|testing|audit|audits|auditing|help|helps|helping|track|tracks|tracking|monitor|monitors|monitoring|report|reports|reporting|verify|verifies|verifying|surface|surfaces|surfacing|flag|flags|flagging|catch|catches|catching|identify|identifies|identifying|measure|measures|measuring)\b/i;

const SUPERLATIVE_RE = /\b(?:the\s+)?(?:best|only|world[- ]class|#\s*1|number\s+one|number\s+1|unmatched|unrivall?ed)\b/gi;
const SUPERLATIVE_IDIOM_RE = /\bbest\s+practices?\b|\bbest\s+efforts?\b|\bthe\s+only\s+(?:way|thing|reason|place|option)\b/gi;

// Mirrors the load-bearing subset of `metric_claims._CITATION_RE` (Python
// imports the canonical regex; the worker cannot). Only a `warn` rule uses
// this, so a divergence changes noise, never a block.
const CITATION_RE =
  /(?:https?:\/\/|\/api\/|\b(?:GET|POST|PUT|DELETE)\s+\/|\bsources?\b|\bsourced\b|\bcites?\b|\bcited\b|\bcitation\b|\breferences?\b|\bD1\b|\bKV\b|\bfunnel\b|\bdashboard\b|\bGSC\b|Google Search Console|\bmeasured\b|\bobserved\b|\bquer(?:y|ies|ied)\b)/i;

const HEDGE_WORDS = new Set([
  "potentially", "maybe", "perhaps", "possibly", "might", "could", "may",
  "arguably", "somewhat", "seemingly", "apparently", "fairly", "rather",
]);
const HEDGE_WINDOW = 6;

const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const BLOCK_TAG_RE = /<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)\s*>|<br\s*\/?>/gi;
const TAG_RE = /<[^>]+>/g;
// Mirrors the Python module's quoted-span stripping (and metric_claims' idea):
// a quoted vendor claim is third-party text, not our assertion.
const QUOTED_RE = /"[^"\n]*"|\u201c[^\u201d\n]*\u201d/g;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;
const WORD_RE = /[A-Za-z']+/g;

const finding = (ruleId: string, line: number, match: string): CopyFinding => ({
  rule_id: ruleId,
  severity: RULE_SEVERITY.get(ruleId) as CopySeverity,
  line,
  match: match.trim().slice(0, 120),
  why: RULE_PURPOSE.get(ruleId) as string,
});

function spansOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Strip fences/HTML/quotes while preserving line numbers (see Python twin). */
function prepare(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  let out = normalized.replace(FENCE_RE, (m) => "\n".repeat((m.match(/\n/g) ?? []).length));
  out = out.replace(BLOCK_TAG_RE, "\n");
  out = out.replace(TAG_RE, " ");
  out = out.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "");
  out = out.replace(QUOTED_RE, " ");
  return out.split("\n");
}

function slopFindings(lineNo: number, line: string): CopyFinding[] {
  const out: CopyFinding[] = [];
  for (const m of line.matchAll(SLOP_RE)) out.push(finding("slop-empty-phrase", lineNo, m[0]));
  for (const m of line.matchAll(NOT_JUST_X_RE)) out.push(finding("slop-not-just-x-its-y", lineNo, m[0]));
  return out;
}

function conformanceFindings(lineNo: number, line: string): CopyFinding[] {
  NEGATED_CLAIM_RE.lastIndex = 0;
  if (NEGATED_CLAIM_RE.test(line)) return [];

  const spans: Array<[number, number]> = [];
  for (const m of line.matchAll(BLANKET_CLAIM_RE)) {
    const start = m.index ?? 0;
    spans.push([start, start + m[0].length]);
  }

  for (const std of line.matchAll(STANDARD_RE)) {
    const stdStart = std.index ?? 0;
    const stdEnd = stdStart + std[0].length;
    const tail = line.slice(stdEnd, stdEnd + 48);
    for (const predicate of [CERT_PREDICATE_RE, COMPLIANT_PREDICATE_RE]) {
      const pm = predicate.exec(tail);
      if (!pm) continue;
      const afterPredicate = tail.slice((pm.index ?? 0) + pm[0].length);
      // "WCAG 2.1 AA compliance issues" is a check, not a claim.
      if (ISSUE_CONTEXT_AFTER_RE.test(afterPredicate)) continue;
      spans.push([stdStart, stdEnd + (pm.index ?? 0) + pm[0].length]);
      break;
    }
  }

  const out: CopyFinding[] = [];
  const seen = new Set<string>();
  for (const [start, end] of spans) {
    const key = `${start}:${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // An issue-finding verb BEFORE the claim describes a check, not a claim.
    if (HONEST_VERB_RE.test(line.slice(0, start))) continue;
    out.push(finding("claim-unsupported-conformance", lineNo, line.slice(start, end)));
  }
  return out;
}

function superlativeFindings(lineNo: number, line: string, neighbours: string[]): CopyFinding[] {
  const idioms: Array<[number, number]> = [];
  for (const m of line.matchAll(SUPERLATIVE_IDIOM_RE)) {
    const start = m.index ?? 0;
    idioms.push([start, start + m[0].length]);
  }
  const out: CopyFinding[] = [];
  for (const m of line.matchAll(SUPERLATIVE_RE)) {
    const start = m.index ?? 0;
    const span: [number, number] = [start, start + m[0].length];
    if (idioms.some((i) => spansOverlap(span, i))) continue;
    if (neighbours.some((n) => CITATION_RE.test(n))) continue;
    out.push(finding("claim-unsourced-superlative", lineNo, m[0]));
  }
  return out;
}

function hedgeFindings(lineNo: number, line: string): CopyFinding[] {
  const tokens = [...line.matchAll(WORD_RE)].map((m) => ({
    text: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  for (let i = 0; i < tokens.length; i += 1) {
    const window = tokens.slice(i, i + HEDGE_WINDOW);
    const hedges = window.filter((t) => t.text === t.text.toLowerCase() && HEDGE_WORDS.has(t.text.toLowerCase()));
    if (hedges.length < 2) continue;
    const start = hedges[0].start;
    const end = hedges[hedges.length - 1].end;
    if (/[.!?;]/.test(line.slice(start, end))) continue;
    return [finding("style-hedge-stack", lineNo, line.slice(start, end))];
  }
  return [];
}

function exclamationFindings(lines: string[]): CopyFinding[] {
  const out: CopyFinding[] = [];
  let count = 0;
  let firstLine = 0;
  const flush = () => {
    if (count >= 3) out.push(finding("style-excess-exclamation", firstLine, `${count} '!' in one paragraph`));
    count = 0;
    firstLine = 0;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    const marks = (line.match(/!/g) ?? []).length;
    if (marks) {
      if (!firstLine) firstLine = i + 1;
      count += marks;
    }
  }
  flush();
  return out;
}

/**
 * Every finding for outbound copy, ordered by line then rule-table order.
 * `warn` findings are advisory; `block` findings must prevent a send.
 */
export function lintCopy(text: string): CopyFinding[] {
  if (!text || !text.trim()) return [];
  const lines = prepare(text);
  const findings: CopyFinding[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!line.trim() || HEADING_RE.test(line)) continue;
    const neighbours = [line];
    if (i >= 1) neighbours.push(lines[i - 1]);
    if (i + 1 < lines.length) neighbours.push(lines[i + 1]);
    findings.push(...slopFindings(lineNo, line));
    findings.push(...conformanceFindings(lineNo, line));
    findings.push(...superlativeFindings(lineNo, line, neighbours));
    findings.push(...hedgeFindings(lineNo, line));
  }

  findings.push(...exclamationFindings(lines));

  const unique = new Map<string, CopyFinding>();
  for (const f of findings) unique.set(`${f.rule_id}|${f.line}|${f.match}`, f);
  return [...unique.values()].sort(
    (a, b) => a.line - b.line || (RULE_ORDER.get(a.rule_id) ?? 99) - (RULE_ORDER.get(b.rule_id) ?? 99),
  );
}

export function blockingFindings(findings: CopyFinding[]): CopyFinding[] {
  return findings.filter((f) => f.severity === "block");
}

export function warningFindings(findings: CopyFinding[]): CopyFinding[] {
  return findings.filter((f) => f.severity === "warn");
}

/** One actionable sentence for a blocked send — names rule, line and match. */
export function describeCopyFindings(findings: CopyFinding[], limit = 4): string {
  if (!findings.length) return "";
  const shown = findings.slice(0, limit).map((f) => `L${f.line} ${f.rule_id} '${f.match}'`);
  const more = findings.length > shown.length ? ` (+${findings.length - shown.length} more)` : "";
  return (
    "unsupported or low-quality copy — cite a third-party audit for any " +
    `conformance claim, or state what the scan checks: ${shown.join("; ")}${more}`
  );
}
