"""Outbound copy quality gate — deterministic machine-tell + claim rules.

Architectural precedent: ``core/quality/metric_claims.py``. Same shape (a
rule table, no LLM, no network) applied to a different domain: the copy we
actually publish — campaign bodies, social posts, prospect emails.

Severity is deliberately NOT the metric guard's single blocking mode:

* ``block`` — an unsupported conformance/certification claim ("WCAG 2.1 AA
  compliant", "fully accessible", "Section 508 certified"). We sell an
  accessibility checker; implying a *site* is compliant is a regulatory claim
  we cannot make without a cited third-party audit. This prevents a send.
* ``warn`` — a style tell (empty marketing phrase, unsourced superlative,
  exclamation pile-up, stacked hedges). A style tell is not a legal risk, so
  it is returned and logged but must never stop a send. False positives on
  good copy are worse than missing some slop, which is why the phrase list is
  short and every rule has an explicit pass case.

The block/warn asymmetry is the whole point of the module: it lets the gate
cover legally-risky copy from day one while the style rules earn trust.

Deliberately NOT flagged (each has a regression fixture):

* quoted third-party text (a vendor's "WCAG 2.1 AA compliant" claim we quote);
* fenced code blocks and headings (labels, not assertions);
* our own honest disclosure sentences — anything that scans, checks, finds,
  fixes, improves, tests or audits is describing the product, and a negation
  ("does not make your site WCAG compliant") is a disclaimer, not a claim;
* "best practice(s)" / "best effort" / "the only way" — idioms, not claims.

No rule text or code was taken from an external repository; the rule table is
written from scratch for this codebase.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from core.quality.metric_claims import has_citation

WARN = "warn"
BLOCK = "block"
SEVERITIES = (WARN, BLOCK)


@dataclass(frozen=True)
class CopyRule:
    """One entry of the rule table — the whole gate is this table."""

    rule_id: str
    severity: str
    purpose: str


@dataclass(frozen=True)
class CopyFinding:
    """One match: which rule, how severe, where, what, and why it matters."""

    rule_id: str
    severity: str
    line: int
    match: str
    why: str


# --- The rule table --------------------------------------------------------
# Rule ids are stable: they appear in a blocked send's 422 body and in the
# fleet's task result, so an operator can look up exactly what fired.
COPY_RULES: tuple[CopyRule, ...] = (
    CopyRule(
        "slop-empty-phrase",
        WARN,
        "an empty marketing phrase that adds words without information",
    ),
    CopyRule(
        "slop-not-just-x-its-y",
        WARN,
        "the 'not just X, it's Y' frame is a recognised machine-writing tell",
    ),
    CopyRule(
        "claim-unsupported-conformance",
        BLOCK,
        "a conformance/certification claim with no cited audit — never imply a site is compliant",
    ),
    CopyRule(
        "claim-unsourced-superlative",
        WARN,
        "a superlative about our product with no citation on or beside the line",
    ),
    CopyRule(
        "style-excess-exclamation",
        WARN,
        "three or more exclamation marks in one paragraph",
    ),
    CopyRule(
        "style-hedge-stack",
        WARN,
        "stacked hedging qualifiers weaken an otherwise direct claim",
    ),
)

RULE_SEVERITY: dict[str, str] = {r.rule_id: r.severity for r in COPY_RULES}
_RULE_PURPOSE: dict[str, str] = {r.rule_id: r.purpose for r in COPY_RULES}


# --- slop-phrase: one clearly-marked, deliberately short constant ---------
# Twelve phrases that are genuinely empty. Every one is a phrase a reader can
# delete without losing information. Kept short on purpose: a long list would
# flag competent brand copy, which is the failure mode that makes teams turn
# these gates off. Entries are matched case-insensitively with an optional
# inflection suffix, so "revolutionize" also catches "revolutionizing".
SLOP_PHRASES: tuple[str, ...] = (
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
)

# "It's not just X, it's Y" — structural, so it needs a pattern rather than a
# literal phrase, but it belongs to the same slop family.
_NOT_JUST_X_RE = re.compile(
    r"\bnot\s+(?:just|only|merely)\b[^.!?\n]{0,80}?\b(?:it'?s|it\s+is)\b",
    re.IGNORECASE,
)

# The phrase list compiles to one alternation with an optional inflection
# suffix ("revolutionize" also catches "revolutionizing").
_SLOP_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(p) for p in SLOP_PHRASES) + r")(?:s|es|ed|d|ing|ly)?\b",
    re.IGNORECASE,
)

# --- unsupported conformance ----------------------------------------------
# A standard/certification name...
_STANDARD_RE = re.compile(
    r"\b(?:wcag(?:\s*2(?:\.[0-2])?)?(?:\s*(?:aaa|aa|a))?"
    r"|section\s*508"
    r"|en\s*301\s*549"
    r"|aoda"
    r"|ada)\b",
    re.IGNORECASE,
)
# ...plus a claim predicate. `\bconform(?:s|ant)?\b` deliberately does NOT
# match "conformance"/"conformance issues", which describe the subject matter
# rather than asserting it.
_CERT_PREDICATE_RE = re.compile(r"\b(?:certified|certification|certifies)\b", re.IGNORECASE)
_COMPLIANT_PREDICATE_RE = re.compile(r"\b(?:compliant|compliance|conform(?:s|ant)?)\b", re.IGNORECASE)
# Absolute blanket claims that need no named standard to be risky.
_BLANKET_CLAIM_RE = re.compile(
    r"\b(?:fully|100\s*%|completely|entirely|totally)\s+(?:accessible|compliant|conformant)\b",
    re.IGNORECASE,
)
# "compliance issues" / "compliance tests" describe a check, not a claim.
_ISSUE_CONTEXT_RE = re.compile(
    r"\s+(?:issues?|problems?|gaps?|checks?|scans?|audits?|tests?|reports?|"
    r"dashboards?|tracking|monitoring|status|concerns?|risks?)\b",
    re.IGNORECASE,
)
# A negation near the predicate is a disclaimer, not a claim.
_NEGATED_CLAIM_RE = re.compile(
    r"\b(?:is|are|was|were)\s+not\b[^.!?\n]{0,60}?"
    r"\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b"
    r"|\b(?:does|do|did)\s+not\b[^.!?\n]{0,60}?"
    r"\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b"
    r"|\b(?:isn'?t|aren'?t|wasn'?t|weren'?t|doesn'?t|don'?t|cannot|can'?t)\b[^.!?\n]{0,60}?"
    r"\b(?:compliant|compliance|certified|certification|conformant|conforms|fully\s+accessible)\b"
    r"|\bno\b[^.!?\n]{0,40}?\b(?:compliant|compliance|certified|conformance|certification)\b"
    r"|\b(?:not|no)\s+a?\s*guarantee\b|\b(?:does|do|did)\s+not\s+guarantee\b|\bcannot\s+guarantee\b",
    re.IGNORECASE,
)
# A verb that governs the claim and describes checking rather than asserting.
# Only counted when it appears BEFORE the claim (a trailing "…read by a
# scanner" must not launder a claim).
_HONEST_VERB_RE = re.compile(
    r"\b(?:improve|improves|improving|improvement"
    r"|check|checks|checking"
    r"|scan|scans|scanning"
    r"|find|finds|finding"
    r"|fix|fixes|fixing"
    r"|review|reviews|reviewing"
    r"|test|tests|testing"
    r"|audit|audits|auditing"
    r"|help|helps|helping"
    r"|track|tracks|tracking"
    r"|monitor|monitors|monitoring"
    r"|report|reports|reporting"
    r"|verify|verifies|verifying"
    r"|surface|surfaces|surfacing"
    r"|flag|flags|flagging"
    r"|catch|catches|catching"
    r"|identify|identifies|identifying"
    r"|measure|measures|measuring)\b",
    re.IGNORECASE,
)

# --- unsourced superlative --------------------------------------------------
_SUPERLATIVE_RE = re.compile(
    r"\b(?:the\s+)?(?:best|only|world[- ]class|#\s*1|number\s+one|number\s+1"
    r"|unmatched|unrivall?ed)\b",
    re.IGNORECASE,
)
# Idioms and qualifiers that contain a superlative word but assert nothing
# about us. "not only static markup" and "only if it is reproducible" are
# ordinary English, not a claim of superiority — flagged live on our own
# accessibility statement (dogfood pass, 2026-11-11), which is exactly the
# false positive that makes people switch a guard off.
_SUPERLATIVE_IDIOM_RE = re.compile(
    r"\bbest\s+practices?\b|\bbest\s+efforts?\b|\bthe\s+only\s+(?:way|thing|reason|place|option)\b"
    # "not only X", "not only ... but also" — contrastive, never a claim.
    r"|\bnot\s+only\b"
    # "only if", "only when", "only after", "only once" — conditional.
    r"|\bonly\s+(?:if|when|after|before|once|where|for|through|by|in|on|at)\b"
    # "one of the only", "the only real" are hedged by their own context.
    r"|\bonly\s+(?:a|an|the)\b",
    re.IGNORECASE,
)

# --- style rules ------------------------------------------------------------
_HEDGE_WORDS = frozenset({
    "potentially", "maybe", "perhaps", "possibly", "might", "could", "may",
    "arguably", "somewhat", "seemingly", "apparently", "fairly", "rather",
})
_HEDGE_WINDOW = 6

_WORD_RE = re.compile(r"[A-Za-z']+")

# --- cleaning (mirrors metric_claims so both gates see the same text) ------
_FENCE_RE = re.compile(r"```[\s\S]*?```|~~~[\s\S]*?~~~")
_BLOCK_TAG_RE = re.compile(
    r"</(?:p|div|h[1-6]|li|tr|blockquote|section|article)\s*>|<br\s*/?>",
    re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")
# Mirrors metric_claims' quoted-span stripping (a one-line pattern, not the
# 30-line citation regex) and also handles curly quotes, so a quoted vendor
# claim is third-party text rather than our assertion.
_QUOTED_RE = re.compile(r'"[^"\n]*"|\u201c[^\u201d\n]*\u201d')
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s")

# Payload fields that carry human copy. Order matters only for determinism.
_COPY_FIELDS = ("subject", "title", "text", "body", "caption", "html")

# Connectors whose payload IS publishable copy. Internal JSON surfaces
# (github/gitlab/webhook) are excluded: prose rules on a payload blob produce
# noise, and those payloads are not public copy.
COPY_CONNECTORS = frozenset({
    "x", "linkedin", "meta", "facebook", "instagram", "threads", "bluesky",
    "mastodon", "reddit", "pinterest", "vk", "youtube", "tiktok", "gmb",
    "snapchat", "line", "devto", "hashnode", "medium", "wordpress", "tumblr",
    "ghost", "beehiiv", "lemmy", "listmonk", "nostr", "ayrshare", "postiz",
    "buffer", "letmepost", "brevo", "twilio", "whatsapp", "telegram",
    "discord", "slack", "mattermost", "teams", "zulip", "matrix", "viber",
})


def extract_copy_text(payload: object) -> str:
    """The human copy inside a dispatch payload, or ``""``.

    A bare string is the copy. A dict is joined from the known copy-bearing
    fields (brevo sends ``subject`` + ``html``; reddit sends ``title`` +
    ``body``), so a dispatch that carries no prose is simply not gated rather
    than being scanned as JSON.
    """
    if isinstance(payload, str):
        return payload
    if not isinstance(payload, dict):
        return "" if payload is None else str(payload)
    parts = [
        str(payload[field])
        for field in _COPY_FIELDS
        if isinstance(payload.get(field), str) and str(payload[field]).strip()
    ]
    return "\n".join(parts)


def _prepare(text: str) -> list[str]:
    """Strip fenced code, HTML and quoted spans while keeping line numbers.

    A fence is replaced by the same number of newlines (so a line number in a
    finding still points at the reader's line), and block-level tags become
    newlines so an HTML email keeps its paragraphs — which is what the
    exclamation rule counts.
    """
    text = _FENCE_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    text = _BLOCK_TAG_RE.sub("\n", text)
    text = _TAG_RE.sub(" ", text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    text = _QUOTED_RE.sub(" ", text)
    return text.splitlines()


def _spans_overlap(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def _finding(rule_id: str, line_no: int, match: str) -> CopyFinding:
    return CopyFinding(
        rule_id=rule_id,
        severity=RULE_SEVERITY[rule_id],
        line=line_no,
        match=match.strip()[:120],
        why=_RULE_PURPOSE[rule_id],
    )


def _slop_findings(line_no: int, line: str) -> list[CopyFinding]:
    out: list[CopyFinding] = []
    for m in _SLOP_RE.finditer(line):
        out.append(_finding("slop-empty-phrase", line_no, m.group(0)))
    for m in _NOT_JUST_X_RE.finditer(line):
        out.append(_finding("slop-not-just-x-its-y", line_no, m.group(0)))
    return out


def _conformance_findings(line_no: int, line: str) -> list[CopyFinding]:
    # A disclaimer anywhere on the line wins: "A score is not a guarantee",
    # "this does not make your site WCAG compliant" are honest statements.
    if _NEGATED_CLAIM_RE.search(line):
        return []

    spans: list[tuple[int, int]] = []
    for m in _BLANKET_CLAIM_RE.finditer(line):
        spans.append((m.start(), m.end()))

    for std in _STANDARD_RE.finditer(line):
        tail = line[std.end(): std.end() + 48]
        for predicate in (_CERT_PREDICATE_RE, _COMPLIANT_PREDICATE_RE):
            pm = predicate.search(tail)
            if not pm:
                continue
            # "WCAG 2.1 AA compliance issues" is a check, not a claim.
            if _ISSUE_CONTEXT_RE.match(tail, pm.end()):
                continue
            spans.append((std.start(), std.end() + pm.end()))
            break

    out: list[CopyFinding] = []
    seen: set[tuple[int, int]] = set()
    for start, end in spans:
        if (start, end) in seen:
            continue
        seen.add((start, end))
        # An issue-finding verb BEFORE the claim means the sentence is about
        # scanning ("Improve your WCAG compliance"), not asserting compliance.
        if _HONEST_VERB_RE.search(line[:start]):
            continue
        out.append(_finding("claim-unsupported-conformance", line_no, line[start:end]))
    return out


def _superlative_findings(
    line_no: int, line: str, neighbours: list[str],
) -> list[CopyFinding]:
    idioms = [(m.start(), m.end()) for m in _SUPERLATIVE_IDIOM_RE.finditer(line)]
    out: list[CopyFinding] = []
    for m in _SUPERLATIVE_RE.finditer(line):
        if any(_spans_overlap((m.start(), m.end()), span) for span in idioms):
            continue
        # A citation on this line or an adjacent one is evidence — the same
        # test the metric guard uses.
        if any(has_citation(text) for text in neighbours):
            continue
        out.append(_finding("claim-unsourced-superlative", line_no, m.group(0)))
    return out


def _hedge_findings(line_no: int, line: str) -> list[CopyFinding]:
    tokens = list(_WORD_RE.finditer(line))
    for i in range(len(tokens)):
        window = tokens[i:i + _HEDGE_WINDOW]
        hedges = [
            t for t in window
            if t.group(0).lower() in _HEDGE_WORDS and t.group(0).islower()
        ]
        if len(hedges) < 2:
            continue
        start, end = hedges[0].start(), hedges[-1].end()
        between = line[start:end]
        # A sentence boundary between the hedges means separate clauses, not a
        # stack ("maybe. Could you…").
        if re.search(r"[.!?;]", between):
            continue
        return [_finding("style-hedge-stack", line_no, between)]
    return []


def _exclamation_findings(lines: list[str]) -> list[CopyFinding]:
    """Three or more exclamation marks in one paragraph (blank line = break)."""
    out: list[CopyFinding] = []
    count = 0
    first_line = 0
    for idx, line in enumerate(lines, 1):
        if not line.strip():
            if count >= 3:
                out.append(_finding("style-excess-exclamation", first_line, f"{count} '!' in one paragraph"))
            count, first_line = 0, 0
            continue
        marks = line.count("!")
        if marks:
            if not first_line:
                first_line = idx
            count += marks
    if count >= 3:
        out.append(_finding("style-excess-exclamation", first_line, f"{count} '!' in one paragraph"))
    return out


def scan_copy(text: str) -> list[CopyFinding]:
    """Return every finding for outbound copy, ordered by line then rule."""
    if not text or not text.strip():
        return []

    lines = _prepare(text)
    findings: list[CopyFinding] = []

    for idx, line in enumerate(lines, 1):
        if not line.strip() or _HEADING_RE.match(line):
            continue  # headings and blank lines are labels, not assertions
        # Adjacent lines are evidence for a citation ("the best — see <url>").
        neighbours = [line]
        if idx >= 2:
            neighbours.append(lines[idx - 2])
        if idx < len(lines):
            neighbours.append(lines[idx])
        findings.extend(_slop_findings(idx, line))
        findings.extend(_conformance_findings(idx, line))
        findings.extend(_superlative_findings(idx, line, neighbours))
        findings.extend(_hedge_findings(idx, line))

    findings.extend(_exclamation_findings(lines))

    # Dedupe identical (rule, match) pairs — a phrase repeated verbatim is one
    # finding, not two — and order by line then table order for stable output.
    order = {r.rule_id: i for i, r in enumerate(COPY_RULES)}
    unique: dict[tuple[str, int, str], CopyFinding] = {}
    for f in findings:
        unique.setdefault((f.rule_id, f.line, f.match), f)
    return sorted(unique.values(), key=lambda f: (f.line, order.get(f.rule_id, 99)))


def blocking_findings(findings: list[CopyFinding]) -> list[CopyFinding]:
    return [f for f in findings if f.severity == BLOCK]


def warning_findings(findings: list[CopyFinding]) -> list[CopyFinding]:
    return [f for f in findings if f.severity == WARN]


def findings_to_dicts(findings: list[CopyFinding]) -> list[dict[str, object]]:
    return [
        {
            "rule_id": f.rule_id,
            "severity": f.severity,
            "line": f.line,
            "match": f.match,
            "why": f.why,
        }
        for f in findings
    ]


def format_copy_feedback(findings: list[CopyFinding], limit: int = 4) -> str:
    """One actionable sentence for a blocked send / retry prompt."""
    if not findings:
        return ""
    shown = findings[:limit]
    where = "; ".join(f"L{f.line} {f.rule_id} {f.match!r}" for f in shown)
    more = f" (+{len(findings) - len(shown)} more)" if len(findings) > len(shown) else ""
    return (
        "unsupported or low-quality copy — cite a third-party audit for any "
        "conformance claim, or state what the scan checks instead of that a site "
        f"is compliant: {where}{more}"
    )


def copy_block_reason(text: str) -> str | None:
    """Feedback text when the copy has a blocking finding, else ``None``.

    Warn-class findings never reach this — that asymmetry is the contract.
    """
    blocked = blocking_findings(scan_copy(text))
    return format_copy_feedback(blocked) if blocked else None
