"""Unsourced business-metric guard on generated documents.

Pins the incident (2026-11-08): fleet task `8506422a` completed and shipped
PR #120 — a marketing plan asserting an invented "30/20/15/20/15" budget split
and a "100 users / $1000 MRR in 6 months" target while the real funnel read
`subscriptions_active: 0`, `scans_external_30d: 6`. The finance/report guard
only covered the two generators that call `format_verified_facts()`.

Both directions are pinned here, because a guard that also blocks legitimate
documents is worse than no guard:

* it must FIRE on unsourced business-metric assertions, and
* it must NOT fire on real product prose (WCAG counts, scores, product names
  containing digits, quoted third-party titles, zero-value under-claims).
"""

from core.quality.metric_claims import (
    document_claim_failure,
    format_claim_feedback,
    is_document,
    scan_business_claims,
)

PR120_DOC = """# Market Strategy

## Executive Summary
We aim to reach 100 users and achieve $1000 Monthly Recurring Revenue (MRR)
within the next 6 months.

## Budget
* Content creation: 30%
* Social media marketing: 20%
* Email marketing: 15%
* Paid advertising: 20%
* Partnerships and collaborations: 15%

Our goal is 50 paying customers by Q2.
"""


# --------------------------------------------------------------------------
# It fires on the real incident
# --------------------------------------------------------------------------

def test_pr120_document_is_rejected():
    findings = scan_business_claims(PR120_DOC)
    assert findings, "the PR #120 marketing plan must be blocked"
    kinds = {f.kind for f in findings}
    assert "metric" in kinds
    assert "allocation" in kinds


def test_pr120_metric_claim_names_the_offending_line():
    texts = " ".join(f.text for f in scan_business_claims(PR120_DOC))
    assert "100 users" in texts
    assert "MRR" in texts


def test_pr120_budget_split_bullets_are_caught_as_one_block():
    """Each bullet carries a single %, so a per-line check would miss it."""
    allocation = [f for f in scan_business_claims(PR120_DOC) if f.kind == "allocation"]
    assert len(allocation) >= 2


def test_feedback_text_is_actionable():
    msg = document_claim_failure(PR120_DOC)
    assert msg
    assert "/api/v1/billing/funnel" in msg
    assert "VERIFIED FACTS" in msg
    # It points at the offending line rather than a vague complaint.
    assert "L" in msg


def test_no_findings_means_no_feedback():
    assert document_claim_failure("# Notes\nNothing quantitative here.\n") is None
    assert format_claim_feedback([]) == ""


# --------------------------------------------------------------------------
# It does NOT fire on legitimate material
# --------------------------------------------------------------------------

def test_product_prose_with_numbers_passes():
    text = (
        "# Engineering Notes\n"
        "The scanner emits **75 WCAG rules** across 21 API paths.\n"
        "A scan of 3 pages takes about 2s and our site scored 95.\n"
    )
    assert scan_business_claims(text) == []


def test_product_names_containing_digits_are_not_claims():
    """'Microsoft 365 trial' is a product name, not a count of trials."""
    text = (
        "Microsoft 365 trial ends 2026-11-26. Windows 11 and Python 3.12 are "
        "supported. 24/7 customer support is included.\n"
    )
    assert scan_business_claims(text) == []


def test_zero_valued_figures_are_under_claims():
    assert scan_business_claims("Current: $0 revenue, 0 subscriptions, 0 trials.\n") == []


def test_quoted_third_party_text_is_not_the_author_asserting_it():
    text = 'A post titled "How I hit $50k MRR in 2 weeks" was misleading.\n'
    assert scan_business_claims(text) == []


def test_fenced_code_is_ignored():
    text = "Example:\n```\nSELECT COUNT(*) FROM subs; -- 100 users\n```\nDone.\n"
    assert scan_business_claims(text) == []


def test_headings_are_labels_not_claims():
    assert scan_business_claims("## 5 customers won\n\nNo figures below.\n") == []


# --------------------------------------------------------------------------
# A cited claim passes; an uncited one does not
# --------------------------------------------------------------------------

def test_claim_citing_the_funnel_endpoint_passes():
    text = (
        "subscriptions_active: 0 (GET /api/v1/billing/funnel)\n"
        "We have 6 external scans in 30 days, measured from /api/v1/billing/funnel.\n"
    )
    assert scan_business_claims(text) == []


def test_same_claim_without_a_source_is_blocked():
    # "scans" is deliberately NOT a business noun (marketing prose stays
    # clean); use a real business count to test the citation requirement.
    assert scan_business_claims("We have 6 paying customers this month.\n")


def test_verified_facts_block_unlocks_the_document():
    text = (
        "VERIFIED FACTS (live D1/KV read at 2026-11-08T12:00Z)\n"
        "  subscriptions_active: 0\n"
        "  scans_external_30d: 6\n"
        "\n"
        "We target 100 users and $1000 MRR in 6 months.\n"
    )
    assert scan_business_claims(text) == []


def test_fabricated_facts_block_is_caught_when_a_live_funnel_is_supplied():
    text = (
        "VERIFIED FACTS (live D1/KV read)\n"
        "  subscriptions_active: 42\n"
        "\nBody.\n"
    )
    findings = scan_business_claims(text, funnel={"subscriptions_active": 0})
    assert any(f.kind == "facts_mismatch" for f in findings)


def test_absent_value_must_be_written_unavailable():
    """A missing figure written as 'unavailable' is honest, so it passes."""
    assert scan_business_claims("subscriptions_active: unavailable\n") == []


# --------------------------------------------------------------------------
# Scope
# --------------------------------------------------------------------------

def test_only_prose_documents_are_scanned():
    for name in ("docs/plan.md", "notes.txt", "a.rst", "b.markdown"):
        assert is_document(name) is True
    for name in ("index.html", "src/scanner.js", "worker.py", "package.json"):
        assert is_document(name) is False
