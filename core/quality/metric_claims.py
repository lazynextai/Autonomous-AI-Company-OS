"""Unsourced business-metric claim gate for agent-written documents.

Incident (2026-11-08): fleet task ``8506422a`` ("Develop a comprehensive
marketing strategy to reach 100 users and achieve $1000 MRR") was retried after
a crash and COMPLETED, producing PR #120 in the public product repo
(``marketing/market_strategy.md``). The plan asserted an invented budget split
("Content creation: 30%, Social media: 20%, Email: 15%, Paid: 20%,
Partnerships: 15%") and a "100 users / $1000 MRR in 6 months" target with no
source and no reference to the real funnel (``subscriptions_active: 0``,
``scans_external_30d: 6``, ``trials_active: 0``). The PR was closed unmerged.

The existing truthfulness guard (``core/operations/report_facts.py``) only
covers the finance report and the founder briefing — the two generators that
explicitly call ``format_verified_facts()``. Every other writer can assert any
number it likes. This module is the deterministic gate those paths were
missing: a document that asserts a business metric (a number next to MRR,
revenue, users, customers, subscribers, conversions, churn, growth, budget,
trials) must either cite its source next to the claim or carry the VERIFIED
FACTS block produced by ``report_facts.format_verified_facts()``.

Incident (2026-11-12): the fabrication vocabulary moved from finance to
research. The customer_success agent shipped PR #121 in the product repo — a
"Customer Feedback" report asserting "We recruited 20 participants… 80% of
participants found the tool easy to use… 90% reported accurate
identification… 85% found recommendations helpful" — a survey that was never
run (0 paying customers, no feedback program). Neither the business-noun
set nor the copy gate flagged a single line. The ``research`` claim class
closes it: a number (count or percentage) next to a research noun/verb
(participants, respondents, interviewees, recruited/interviewed/surveyed,
"% found/reported/said/rated", "N out of M <people>", "survey/study of N
people", "studies show N%", "N feedback sessions") with no citation is a
blocking finding.

Deliberately tight, so ordinary product prose never trips it:

* ``75 WCAG rules``, ``3 pages crawled``, ``score 95``, ``21 API paths``,
  ``Microsoft 365 trial`` — no business-count pattern, so they pass.
* ``1-on-1 customer support`` / ``24/7 customer support`` — the number is a
  hyphenated or slash compound, not a standalone count, so it passes.
* ``$9 stays cheapest-in-class and preserves the conversion wedge`` — the
  number is not near the business noun, so it passes.
* ``subscriptions_active: 0 (GET /api/v1/billing/funnel)`` — the line carries
  the funnel endpoint, so it passes.
* ``42 out of 45 connectors connected``, ``3 out of 5 tests passed`` — the
  "N out of M" shape needs an animate/research subject or a reporting verb,
  so engineering facts pass.
* ``the survey endpoint returns 200``, ``a study of 500 pages``, ``sessions
  lasted 60 minutes each``, ``instance survey 2026-10-06`` — research words
  with no people-count shape, so they pass.
* Inline double-quoted text (a quoted Reddit title, an email subject) is not
  the author's own assertion; quoted spans are stripped before scanning.
* Markdown headings are skipped (``## 5. Microsoft 365 trial end`` is a label,
  not a quantified claim) and zero-valued figures are exempt (``$0 revenue``
  is an under-claim, not the fabrication class).
* Code fences and HTML tags are stripped first, and ISO dates never count as
  quantities.

When a live funnel is supplied, a present VERIFIED FACTS block is also checked
figure-by-figure against it (``funnel_number``); a fabricated block is then a
finding rather than a free pass. Without a funnel the block is accepted only
when its header states its live-read provenance, which is exactly what
``format_verified_facts()`` emits. The gate never guesses a figure: a missing
value must be written as ``unavailable``, which no rule flags.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# Prose documents only. Product HTML is excluded on purpose: "for teams of up
# to 50 users" is product copy, not a business-metric claim, and gating HTML
# would block legitimate copy. Code files are never scanned.
DOC_EXTENSIONS = frozenset({".md", ".markdown", ".txt", ".text", ".rst"})

# A number next to one of these is a claim about the business, not prose.
# Kept deliberately narrow: "sales", "leads", "scans", "pages", "rules" are
# absent so ordinary marketing/engineering prose stays clean. "signups" is
# plural-only so product copy ("no signup, 75 checks") never matches.
_BUSINESS_NOUN_RE = re.compile(
    r"\b(?:mrr|arr|revenues?|users?|customers?|subscribers?|subscriptions?|"
    r"sign[\s-]?ups|conversions?|churn(?:ed|ing)?|growth|budgets?|paying|trials?)\b",
    re.IGNORECASE,
)

_STRONG_NUMBER_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?[km]?"
    r"|\d[\d,]*(?:\.\d+)?\s*(?:%|percent)"
    r"|\d[\d,]*(?:\.\d+)?\s?[km](?![a-z])",
    re.IGNORECASE,
)
_INT_TOKEN_RE = re.compile(r"^\d[\d,]*(?:\.\d+)?$")

# A bare count must sit next to its noun; these words describe it without
# changing what is being counted.
_INT_GAP_WORDS = frozenset({
    "a", "an", "the", "to", "of", "in", "per", "cent", "at", "by", "with",
    "and", "or", "about", "around", "over", "under", "only", "just", "nearly",
    "almost", "exactly", "approx", "approximately", "roughly", "reach",
    "reaches", "target", "targets", "goal", "aim", "hit", "achieve", "get",
    "gain", "grow", "growing", "add", "adding", "daily", "weekly", "monthly",
    "yearly", "annual", "new", "total", "unique", "registered", "active",
    "free", "pro", "premium", "current", "existing", "engaged", "loyal",
    "prospective", "targeted", "first", "last", "next", "another", "more",
    "than", "paid", "paying", "rate", "ratio", "amount", "count", "level",
    "value", "avg", "average", "≈", "~", "+", "-", "×",
})

# Treated as a cited source for a claim on the same or an adjacent line.
_CITATION_RE = re.compile(
    r"(?:https?://"
    r"|/api/"
    r"|\b(?:GET|POST|PUT|DELETE)\s+/"
    r"|\bsources?\b|\bsourced\b|\bcites?\b|\bcited\b|\bcitation\b|\breferences?\b"
    r"|\bD1\b|\bKV\b|\bfunnel\b|\bbilling\b|\bdashboard\b"
    r"|\bGSC\b|Google Search Console"
    r"|\bmeasured\b|\bobserved\b|\bqueries\b|\bqueried\b"
    r"|\b(?:from|per|via)\s+(?:the\s+)?(?:live\s+)?(?:funnel|D1|KV|dashboard|API)\b"
    r"|\breported\s+by\b|\baccording\s+to\b"
    r"|subscriptions_active|scans_external_30d|trials_active|licenses_pro"
    r"|licenses_free|monitors)",
    re.IGNORECASE,
)

# The block generated by report_facts.format_verified_facts().
_FACTS_HEADER_RE = re.compile(r"^\s*VERIFIED FACTS\b", re.IGNORECASE | re.MULTILINE)
_FACTS_PROVENANCE_RE = re.compile(r"\blive\b[^\n]{0,40}\bD1\b|\blive D1/KV\b", re.IGNORECASE)
_SOURCES_HEADER_RE = re.compile(r"^\s*(?:sources?|references?)\s*:", re.IGNORECASE | re.MULTILINE)

# Distribution-style percentage lines ("Content creation: 30%, Paid: 20%") —
# the invented budget split from PR #120. A lone "20%" is not enough; two
# percentages plus an allocation word is a budget split.
_PERCENT_RE = re.compile(r"\b\d{1,3}\s*%")
_ALLOCATION_WORD_RE = re.compile(
    r"\b(?:content|creation|social|email|paid|partnerships?|organic|channels?|"
    r"search|ads?|advertising|spend|splits?|allocation|budget|mix|distribution|"
    r"promotion|campaigns?|outreach)\b",
    re.IGNORECASE,
)

# --- Research/survey-stat class (incident 2026-11-12, PR #121) -------------
# PR #120 moved the fabrication vocabulary to business metrics (users/MRR);
# PR #121 moved it again, to research: the customer_success agent shipped a
# "Customer Feedback" report claiming "We recruited 20 participants… 80% of
# participants found the tool easy to use… 90% reported accurate
# identification… 85% found recommendations helpful" — a survey that was
# never run (0 paying customers, no feedback program). Neither the business-
# noun set nor the copy gate flagged a single line. This class closes it.
#
# The sentence shape: a number (count or percentage) next to a research noun
# or verb with no citation. Kept deliberately tight so honest prose stays
# clean: participants/respondents/interviewees are the animate survey
# subjects, recruited/interviewed/surveyed the verbs that take them, and the
# percentage/out-of/study shapes need an animate subject or a research verb
# ("Studies show 80% of websites fail WCAG" yes; "42 out of 45 connectors
# connected", "the survey endpoint returns 200", "a study of 500 pages",
# "sessions lasted 60 minutes each" never match). Percentages must be
# non-zero, mirroring the metric class's under-claim exemption.

# The people who were surveyed — a count next to one of these is a stat.
_RESEARCH_SUBJECT_RE = re.compile(
    r"\b(?:participants?|respondents?|interviewees?)\b",
    re.IGNORECASE,
)
# Verbs that run a study on people.
_RESEARCH_VERB_RE = re.compile(
    r"\b(?:recruited|interviewed|surveyed)\b",
    re.IGNORECASE,
)
# "% of participants …" — the exact PR #121 line shape.
_PCT_OF_SUBJECT_RE = re.compile(
    r"\b[1-9]\d{0,2}\s*%\s+of\s+(?:the\s+)?"
    r"(?:participants?|respondents?|interviewees?)\b",
    re.IGNORECASE,
)
# "% reported/found/said/rated …" with an optional animate subject. The
# subject list is people-only, so "100% of scans completed" never matches;
# "users"/"customers" here are harmless because the metric class already
# gates a % next to a business noun.
_PCT_VERB_RE = re.compile(
    r"\b[1-9]\d{0,2}\s*%(?:\s+of\s+(?:the\s+)?(?:participants?|respondents?|"
    r"interviewees?|users?|customers?|testers?|people))?\s+"
    r"(?:found|reported|said|rated|suggested|experienced|agreed|liked|thought|"
    r"answered|responded|stated)\b",
    re.IGNORECASE,
)
# "N out of M <people>" — requires the animate subject, so "3 out of 5 tests
# passed" stays clean.
_OUT_OF_SUBJECT_RE = re.compile(
    r"\b\d[\d,]*\s+out\s+of\s+(?:(?:the\s+)?\d[\d,]*\s+)?"
    r"(?:participants?|respondents?|interviewees?|users?|customers?|testers?|"
    r"people)\b",
    re.IGNORECASE,
)
# "N out of M reported/found…" — subjectless, but the reporting verb still
# carries the survey voice; "2 out of 3 runs failed" never matches.
_OUT_OF_VERB_RE = re.compile(
    r"\b\d[\d,]*\s+out\s+of\s+\d[\d,]*\s+"
    r"(?:found|reported|said|rated|agreed|responded|stated|answered)\b",
    re.IGNORECASE,
)
# "survey/study of N <people-ish>" — the count must count people; one
# interposed qualifier is allowed ("54 email contacts"), but "a study of 500
# pages" and "survey of 12 API endpoints" still never match (the noun list
# gates the tail).
_RESEARCH_STUDY_RE = re.compile(
    r"\b(?:surveys?|stud(?:y|ies))\s+(?:of|with|involving|covering)\s+"
    r"\d[\d,]*(?:\.\d+)?(?:[km]|\s*%)?(?:\s+\w+)?\s+"
    r"(?:participants?|respondents?|interviewees?|users?|customers?|people|"
    r"contacts?|businesses?|companies|organisations?|organizations?)\b",
    re.IGNORECASE,
)
# "Studies show 80% of websites fail WCAG" — an unsourced research claim.
_STUDIES_SHOW_RE = re.compile(
    r"\bstud(?:y|ies)\s+(?:show|shows|showed|found|suggest|suggests|indicate|"
    r"indicates|report|reports)\b[^.!?\n]{0,80}?\b[1-9]\d{0,2}\s*%",
    re.IGNORECASE,
)
# "N feedback sessions" — a count of a research artifact; a bare "feedback
# sessions" with no number never matches.
_FEEDBACK_SESSIONS_RE = re.compile(
    r"\b\d[\d,]*\s+(?:(?:customer|user|research)\s+)?feedback\s+sessions?\b",
    re.IGNORECASE,
)

_FENCE_RE = re.compile(r"```[\s\S]*?```|~~~[\s\S]*?~~~")
_ISO_DATE_RE = re.compile(r"\b\d{4}-\d{1,2}-\d{1,2}\b")
_TAG_RE = re.compile(r"<[^>]+>")
_QUOTED_RE = re.compile(r'"[^"\n]*"')
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s")
_LIST_NUMBER_RE = re.compile(r"^\s*(?:[-*+>]\s*)?\d+[.)]\s+")
_PUNCT = ".,:;()[]{}<>\"'`*~_!?"

# Product/version identifiers that happen to contain a digit: "Microsoft 365
# trial", "Windows 11", "Office 365", "WCAG 2.1". The digit is part of a name,
# not a count of anything — counting it as a claim blocked legitimate docs
# ("Microsoft 365 trial ends Nov 26"). Matched as the capitalised token that
# immediately precedes the number.
_IDENTIFIER_WORDS = frozenset({
    "microsoft", "office", "windows", "azure", "google", "apple", "ios",
    "android", "python", "node", "wcag", "http", "https", "iso", "rfc",
    "iphone", "ipad", "macos", "ubuntu", "debian", "chapter", "section",
    "phase", "part", "step", "version", "v", "postgres", "mysql", "nodejs",
})

_ALLOWED_CLAIM_FIELDS = (
    "scans_30d", "scans_external_30d", "leads", "crm_leads", "crm_engaged",
    "trials_active", "licenses_pro", "licenses_free", "subscriptions_active",
    "monitors",
)


@dataclass(frozen=True)
class ClaimFinding:
    """One blocking finding: a line number, its text, and why it blocks."""

    line_no: int
    text: str
    kind: str  # "metric" | "allocation" | "research" | "facts_mismatch"


def is_document(path: str) -> bool:
    """True when this artifact is prose we should scan."""
    return Path(str(path)).suffix.lower() in DOC_EXTENSIONS


def has_citation(text: str) -> bool:
    """True when the line cites a source (endpoint, URL, dataset, live read).

    Public seam for ``core/quality/copy_quality.py``: the copy gate needs the
    same "is this claim sourced?" test for superlatives, and duplicating the
    regex would let the two copies drift. This adds nothing to the metric
    guard's behaviour — it only exposes the existing pattern.
    """
    return bool(_CITATION_RE.search(text or ""))


def _clean(text: str) -> str:
    """Strip noise that would split a claim across tokens or fake a number."""
    text = _FENCE_RE.sub("\n", text)
    text = _TAG_RE.sub(" ", text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    return _ISO_DATE_RE.sub("DATE", text)


def _tokens(line: str) -> list[str]:
    # Slash-compounds ("24/7", "1-on-1", "OpenAI/o1") are identifiers, not a
    # count followed by another count — collapse them before splitting so the
    # pair cannot pair with a business noun ("24/7 customer support").
    line = re.sub(r"\b\d{1,3}\s*/\s*\d{1,3}\b", "COMPOUND", line)
    return [
        t.strip(_PUNCT)
        for t in line.replace("/", " ").split()
        if t.strip(_PUNCT)
    ]


def _number_value(token: str) -> float | None:
    raw = token.strip(_PUNCT).replace("$", "").replace("%", "").replace(",", "").lower()
    multiplier = 1.0
    if raw.endswith("k"):
        multiplier, raw = 1000.0, raw[:-1]
    elif raw.endswith("m"):
        multiplier, raw = 1_000_000.0, raw[:-1]
    try:
        return float(raw) * multiplier
    except ValueError:
        return None


def _is_number(token: str) -> bool:
    """True for a standalone quantity — never a zero (under-claims are safe)."""
    if not (_STRONG_NUMBER_RE.fullmatch(token) or _INT_TOKEN_RE.fullmatch(token)):
        return False
    value = _number_value(token)
    return value is not None and value != 0


def _is_identifier_number(toks: list[str], idx: int) -> bool:
    """True when this number is part of a product/version name, not a count.

    ``Microsoft 365 trial`` / ``Windows 11 machines`` — the digit belongs to the
    brand, so pairing it with the noun "trial"/"machines" is not a claim. Only
    applies when the preceding token is a known identifier word (or the pair is
    hyphenated, e.g. ``Python-3``), so ``Reach 100 users`` still counts.
    """
    if idx <= 0:
        return False
    prev = toks[idx - 1].lower().strip(_PUNCT)
    if prev in _IDENTIFIER_WORDS:
        return True
    # Hyphenated identifiers survive tokenisation as one token ("wcag-2.1"),
    # but a separated pair like "Python 3.12" needs the word list above.
    return False


def _has_claim(line: str) -> bool:
    """A business noun paired, within a few words, with a count of it."""
    if not _BUSINESS_NOUN_RE.search(line):
        return False
    toks = _tokens(line)
    noun_idx = [i for i, t in enumerate(toks) if _BUSINESS_NOUN_RE.fullmatch(t)]
    num_idx = [i for i, t in enumerate(toks) if _is_number(t)]
    for n in noun_idx:
        for i in num_idx:
            distance = abs(n - i)
            if distance > 3:
                continue
            if _is_identifier_number(toks, i):
                continue
            lo, hi = min(n, i) + 1, max(n, i)
            gap = toks[lo:hi]
            if all(g.lower() in _INT_GAP_WORDS for g in gap):
                return True
    return False


def _allocation_split_lines(lines: list[str]) -> set[int]:
    """Line numbers forming a distribution/budget split.

    PR #120 wrote the invented split as separate bullets, one percentage each
    ("* Content creation: 30%", "* Social media: 20%", …), so a single-line
    check missed it. A run of closely spaced lines whose percentages total two
    or more, where the lines name allocation channels, is a split.
    """
    flagged: set[int] = set()
    window = 10  # a split is contiguous; prose rarely stacks 2+ % that tight
    idx = [i for i, ln in enumerate(lines) if _PERCENT_RE.search(ln)]
    for start, first in enumerate(idx):
        group = [first]
        for nxt in idx[start + 1:]:
            if nxt - group[-1] <= 2:
                group.append(nxt)
            else:
                break
        if len(group) < 2:
            continue
        block = " ".join(lines[g] for g in group)
        if any(g - group[0] <= window for g in group) and _ALLOCATION_WORD_RE.search(block):
            # Only the lines that actually carry a percentage and a channel word
            # (plus the bare-percentage ones between them) belong to the split.
            for g in group:
                flagged.add(g)
    return flagged


def _is_allocation_split(line: str) -> bool:
    """True for distribution-style percentage lines (budget split)."""
    if len(_PERCENT_RE.findall(line)) < 2:
        return False
    return bool(_ALLOCATION_WORD_RE.search(line))


def _has_research_stat(line: str) -> bool:
    """A research/survey stat: a number next to a research noun or verb.

    Covers the PR #121 sentence shapes ("recruited 20 participants",
    "80% of participants found the tool easy", "90% reported accurate
    identification", "85% found recommendations helpful", "60% of
    participants suggested adding more features") plus subjectless
    percentage-verbs, "N out of M" with an animate subject or reporting
    verb, "survey/study of N people", "studies show N%", and "N feedback
    sessions". Engineering facts (connector counts, test results, page
    counts, durations, endpoint status codes) never match — their subjects
    and verbs are not in the research vocabulary.
    """
    if _PCT_OF_SUBJECT_RE.search(line):
        return True
    if _PCT_VERB_RE.search(line):
        return True
    if _OUT_OF_SUBJECT_RE.search(line):
        return True
    if _OUT_OF_VERB_RE.search(line):
        return True
    if _RESEARCH_STUDY_RE.search(line):
        return True
    if _STUDIES_SHOW_RE.search(line):
        return True
    if _FEEDBACK_SESSIONS_RE.search(line):
        return True
    toks = _tokens(line)
    noun_idx = [i for i, t in enumerate(toks) if _RESEARCH_SUBJECT_RE.fullmatch(t)]
    verb_idx = [i for i, t in enumerate(toks) if _RESEARCH_VERB_RE.fullmatch(t)]
    num_idx = [i for i, t in enumerate(toks) if _is_number(t)]
    for anchor in noun_idx + verb_idx:
        for i in num_idx:
            distance = abs(anchor - i)
            if distance > 3:
                continue
            if _is_identifier_number(toks, i):
                continue
            lo, hi = min(anchor, i) + 1, max(anchor, i)
            gap = toks[lo:hi]
            if all(g.lower() in _INT_GAP_WORDS for g in gap):
                return True
    return False


def _facts_block_trusted(text: str) -> bool:
    """The block is accepted only when it states its live-read provenance —
    the header ``format_verified_facts()`` always emits. A fabricated block
    still needs a live funnel supplied by the caller to be number-checked."""
    header = _FACTS_HEADER_RE.search(text)
    if not header:
        return False
    end = text.find("\n", header.start())
    head_line = text[header.start(): end if end != -1 else len(text)]
    return bool(_FACTS_PROVENANCE_RE.search(head_line))


def _facts_mismatches(text: str, funnel: dict | None) -> list[tuple[int, str]]:
    """Compare figures in a VERIFIED FACTS block against the live funnel."""
    if not isinstance(funnel, dict) or not funnel:
        return []
    from core.operations.report_facts import funnel_number

    findings: list[tuple[int, str]] = []
    in_block = False
    for i, line in enumerate(text.splitlines(), 1):
        if _FACTS_HEADER_RE.match(line):
            in_block = True
            continue
        if in_block and not line.strip():
            in_block = False
            continue
        if not in_block:
            continue
        for field in _ALLOWED_CLAIM_FIELDS:
            m = re.search(
                rf"\b{re.escape(field)}\b[^\d\n]{{0,6}}(\d[\d,]*)", line, re.IGNORECASE
            )
            if not m:
                continue
            quoted = int(m.group(1).replace(",", ""))
            real = funnel_number(funnel, field)
            if real != "unavailable" and int(real) != quoted:
                findings.append((i, f"{field}: {quoted} (live: {real})"))
    return findings


def scan_business_claims(
    text: str,
    *,
    funnel: dict | None = None,
) -> list[ClaimFinding]:
    """Return blocking findings for a document, or ``[]`` when it is grounded."""
    if not text or not text.strip():
        return []

    cleaned = _clean(text)
    trusted_block = _facts_block_trusted(cleaned)
    doc_has_sources = bool(_SOURCES_HEADER_RE.search(cleaned))
    lines = cleaned.splitlines()

    findings: list[ClaimFinding] = []
    allocation_lines = _allocation_split_lines(lines)
    for offset, raw_line in enumerate(lines):
        if _HEADING_RE.match(raw_line):
            continue  # section labels are not quantified prose
        line = _QUOTED_RE.sub(" ", raw_line)
        line = _LIST_NUMBER_RE.sub("", line).strip()
        if not line:
            continue
        cited = (
            doc_has_sources
            or bool(_CITATION_RE.search(line))
            or (offset > 0 and bool(_CITATION_RE.search(lines[offset - 1])))
            or (offset + 1 < len(lines) and bool(_CITATION_RE.search(lines[offset + 1])))
        )
        if cited:
            continue
        kind = ""
        if _has_claim(line):
            kind = "metric"
        elif _is_allocation_split(line) or offset in allocation_lines:
            kind = "allocation"
        elif _has_research_stat(line):
            kind = "research"
        if kind and not trusted_block:
            findings.append(ClaimFinding(offset + 1, line.strip()[:180], kind))

    for line_no, detail in _facts_mismatches(cleaned, funnel):
        findings.append(
            ClaimFinding(line_no, f"fabricated facts block: {detail}", "facts_mismatch")
        )

    return findings


def format_claim_feedback(findings: list[ClaimFinding], limit: int = 4) -> str:
    """One actionable sentence for the retry prompt / task error."""
    if not findings:
        return ""
    shown = findings[:limit]
    where = "; ".join(f"L{f.line_no} {f.text!r}" for f in shown)
    more = f" (+{len(findings) - len(shown)} more)" if len(findings) > len(shown) else ""
    parts = []
    if any(f.kind == "research" for f in findings):
        parts.append(
            "unsourced research/survey findings — cite the actual survey run "
            "(where/when/whom, or a results URL) or the VERIFIED FACTS block "
            "next to every figure; never invent participant counts or percentages"
        )
    if any(f.kind != "research" for f in findings):
        parts.append(
            "unsourced business-metric claims — quote the live funnel "
            "(GET /api/v1/billing/funnel) or the VERIFIED FACTS block next to every "
            "figure, or write 'unavailable'"
        )
    return "; ".join(parts) + f": {where}{more}"


def document_claim_failure(text: str, *, funnel: dict | None = None) -> str | None:
    """Feedback text when a document is unsourced, else ``None``."""
    findings = scan_business_claims(text, funnel=funnel)
    return format_claim_feedback(findings) if findings else None
