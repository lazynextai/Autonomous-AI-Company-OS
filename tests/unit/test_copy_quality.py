"""Copy-quality gate — the fleet-side rule table (2026-11-10).

Mirrors ``worker/test/copygate.test.mjs``: both read the same shared fixture
file, so a rule that exists on one runtime and not the other fails here. The
fixtures pin both directions, because a gate that also blocks legitimate
copy is worse than no gate:

* it must FIRE on unsupported conformance claims (the legally-risky class)
  and on the curated machine tells, and
* it must NOT fire on "scan/check/improve" product copy, negations,
  disclaimers, quoted third-party claims, code fences or headings.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.quality.copy_quality import (
    BLOCK,
    COPY_CONNECTORS,
    COPY_RULES,
    RULE_SEVERITY,
    SLOP_PHRASES,
    WARN,
    blocking_findings,
    copy_block_reason,
    extract_copy_text,
    findings_to_dicts,
    format_copy_feedback,
    scan_copy,
    warning_findings,
)

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[2] / "worker" / "test" / "fixtures" / "copy-quality-cases.json").read_text()
)


def _ids(findings) -> list[str]:
    return sorted({f.rule_id for f in findings})


# --- the rule table -------------------------------------------------------


def test_rule_table_matches_the_shared_fixture_table():
    actual = [{"id": r.rule_id, "severity": r.severity} for r in COPY_RULES]
    assert actual == FIXTURES["rules"]


def test_exactly_one_rule_class_blocks_and_it_is_the_conformance_claim():
    blocking = [r.rule_id for r in COPY_RULES if r.severity == BLOCK]
    assert blocking == ["claim-unsupported-conformance"]


def test_every_rule_has_a_defensible_purpose():
    for rule in COPY_RULES:
        assert rule.severity in (WARN, BLOCK)
        assert len(rule.purpose) > 20, rule.rule_id


def test_slop_phrase_list_is_short():
    assert 8 <= len(SLOP_PHRASES) <= 15, "a long phrase list flags competent copy"


# --- shared behaviour (same cases as the worker test) ----------------------


@pytest.mark.parametrize("case", FIXTURES["cases"], ids=[c["name"] for c in FIXTURES["cases"]])
def test_shared_fixture(case):
    findings = scan_copy(case["text"])
    assert _ids(blocking_findings(findings)) == sorted(case["block"]), case["name"]
    assert _ids(warning_findings(findings)) == sorted(case["warn"]), case["name"]
    if case.get("line"):
        blocked = blocking_findings(findings)
        assert blocked, f"{case['name']}: expected a blocking finding"
        assert blocked[0].line == case["line"]


# --- severity semantics ---------------------------------------------------


def test_warn_only_copy_never_blocks_a_send():
    text = "In today's fast-paced world, we unlock the power of seamless integration."
    findings = scan_copy(text)
    assert findings, "the slop phrase must be reported"
    assert blocking_findings(findings) == [], "a style tell is not a legal risk"
    assert copy_block_reason(text) is None


def test_a_conformance_claim_blocks_and_names_the_fix():
    findings = scan_copy("Intro line.\n\nOur site is WCAG 2.1 AA compliant.")
    blocked = blocking_findings(findings)
    assert len(blocked) == 1
    assert blocked[0].rule_id == "claim-unsupported-conformance"
    assert blocked[0].line == 3
    assert blocked[0].match == "WCAG 2.1 AA compliant"
    assert blocked[0].severity == BLOCK

    reason = copy_block_reason("Our site is WCAG 2.1 AA compliant.")
    assert reason and "L1 claim-unsupported-conformance" in reason
    assert "third-party audit" in reason
    single = blocking_findings(scan_copy("Our site is WCAG 2.1 AA compliant."))
    assert format_copy_feedback(single) == reason


def test_findings_payload_is_json_safe():
    payload = findings_to_dicts(scan_copy("Our site is WCAG 2.1 AA compliant."))
    assert payload and set(payload[0]) == {"rule_id", "severity", "line", "match", "why"}
    json.dumps(payload)  # no non-serialisable values


def test_findings_are_ordered_by_line_then_rule():
    findings = scan_copy(
        "Our site is WCAG 2.1 AA compliant.\n\nIn today's fast-paced world, we supercharge things."
    )
    lines = [f.line for f in findings]
    assert lines == sorted(lines)
    assert findings[0].rule_id == "claim-unsupported-conformance"


def test_empty_copy_is_clean():
    assert scan_copy("") == []
    assert scan_copy("   \n\n ") == []


def test_severity_map_is_derived_from_the_table():
    assert RULE_SEVERITY == {r.rule_id: r.severity for r in COPY_RULES}


# --- payload extraction ---------------------------------------------------


def test_extract_copy_text_reads_the_prose_fields():
    assert extract_copy_text("hello") == "hello"
    assert extract_copy_text({"text": "post body"}) == "post body"
    joined = extract_copy_text({"subject": "Subj", "html": "<p>Body</p>", "to": "a@b.c"})
    assert "Subj" in joined and "Body" in joined and "a@b.c" not in joined


def test_extract_copy_text_ignores_non_copy_payloads():
    assert extract_copy_text({"chat_id": "1", "attachments": [{"x": 1}]}) == ""
    assert extract_copy_text(None) == ""


def test_copy_connectors_cover_public_copy_surfaces():
    assert {"x", "linkedin", "brevo", "bluesky", "ayrshare", "postiz"} <= COPY_CONNECTORS
    # JSON payload surfaces are deliberately outside the copy rule set.
    assert {"github", "gitlab", "webhook", "signwell"}.isdisjoint(COPY_CONNECTORS)
