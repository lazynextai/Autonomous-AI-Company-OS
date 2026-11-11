"""Unsourced business-metric guard on generated documents.

Pins the incident (2026-11-08): fleet task `8506422a` completed and shipped
PR #120 — a marketing plan asserting an invented "30/20/15/20/15" budget split
and a "100 users / $1000 MRR in 6 months" target while the real funnel read
`subscriptions_active: 0`, `scans_external_30d: 6`. The finance/report guard
only covered the two generators that call `format_verified_facts()`.

Pins the second incident (2026-11-12): the customer_success agent shipped
PR #121 in the product repo — a "Customer Feedback" research report asserting
"We recruited 20 participants… 80% of participants found the tool easy to
use… 90% reported accurate identification… 85% found recommendations
helpful" against 0 paying customers and no feedback program. The finance
vocabulary (users/MRR/customers) had moved to research (participants/
percentages), and both old gates returned zero findings. The `research`
claim class closes it.

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

# The exact fabrication from PR #121 (2026-11-12): a customer-feedback
# research report the product has no data for (0 paying customers, no
# feedback program), quoting participant counts and percentage findings as
# if a survey had been run.
PR121_DOC = """# Customer Feedback Research

## Methodology
We recruited 20 participants for the customer feedback sessions, including
small business owners, solo entrepreneurs, and web developers.

## Key Findings
* 80% of participants found the tool easy to use and navigate.
* 20% of participants experienced some difficulty understanding the results.
* 90% of participants reported that the tool accurately identified
  accessibility issues on their website.
* 85% of participants found the tool's recommendations helpful.
* 60% of participants suggested adding more features to the tool.
* 40% of participants reported that the tool met their needs.
"""

PR121_BLOCKED_SENTENCES = (
    "We recruited 20 participants for the customer feedback sessions",
    "80% of participants found the tool easy to use and navigate",
    "90% of participants reported that the tool accurately identified",
    "85% of participants found the tool's recommendations helpful",
    "60% of participants suggested adding more features to the tool",
)


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
# It fires on the PR #121 research-fabrication class
# --------------------------------------------------------------------------

def test_pr121_document_is_rejected():
    findings = scan_business_claims(PR121_DOC)
    assert findings, "the PR #121 research report must be blocked"
    kinds = {f.kind for f in findings}
    assert "research" in kinds
    assert "metric" not in kinds  # the old finance vocabulary is not the class


def test_pr121_research_findings_name_the_offending_lines():
    texts = " ".join(f.text for f in scan_business_claims(PR121_DOC))
    for sentence in PR121_BLOCKED_SENTENCES:
        assert sentence in texts, (
            f"expected the unreported evidence sentence to block: {sentence!r}"
        )


def test_pr121_blocker_sentence_is_blocking_for_the_gate():
    """The exact PR #121 sentence must now make document_claim_failure fire."""
    msg = document_claim_failure(PR121_DOC)
    assert msg
    assert "research" in msg


def test_pr121_each_percentage_line_blocks_on_its_own():
    for line in (
        "80% of participants found the tool easy to use and navigate.",
        "20% of participants experienced some difficulty understanding the results.",
        "90% of participants reported that the tool accurately identified issues.",
        "60% of participants suggested adding more features to the tool.",
    ):
        findings = scan_business_claims("# Heading\n\n" + line + "\n")
        assert any(f.kind == "research" for f in findings), line


def test_survey_verb_without_participants_blocks_on_its_own():
    assert scan_business_claims("We recruited 20 participants for the study.\n")
    assert scan_business_claims("We interviewed 5 developers about onboarding.\n")
    assert scan_business_claims("We surveyed 54 email contacts for feedback.\n")


def test_survey_noun_form_with_people_count_blocks():
    """'survey/study of N <people-ish>' — the noun form of the verb line."""
    assert scan_business_claims("A survey of 54 email contacts was run.\n")
    assert scan_business_claims("A study of 20 customers was conducted.\n")


def test_subjectless_percentage_reporting_blocks():
    """'90% reported accurate identification' — no noun, still a finding."""
    assert scan_business_claims("90% reported accurate identification of issues.\n")
    assert scan_business_claims("85% found the recommendations helpful.\n")


def test_out_of_n_with_research_subject_blocks():
    assert scan_business_claims("20 out of 25 participants rated the tool 4/5.\n")
    assert scan_business_claims("30 out of 40 respondents said the results were clear.\n")


def test_feedback_sessions_count_blocks():
    assert scan_business_claims("We ran 5 customer feedback sessions last quarter.\n")


def test_studies_show_blocks():
    assert scan_business_claims("Studies show 80% of websites fail WCAG.\n")


# --------------------------------------------------------------------------
# A cited research claim passes; the PR #121 shape cited is fine
# --------------------------------------------------------------------------

def test_pr121_report_citing_the_funnel_passes():
    """The same participant/percentage report, but with a live-read citation."""
    text = (
        "# Customer Feedback Research\n\n"
        "Survey of 20 participants, run 2026-11-10, results in "
        "/api/v1/billing/funnel.\n"
        "80% of participants found the tool easy to use (measured via "
        "GET /api/v1/billing/funnel).\n"
    )
    assert scan_business_claims(text) == []


def test_pr121_report_with_verified_facts_block_passes():
    text = (
        "VERIFIED FACTS (live D1/KV read at 2026-11-12T09:00Z)\n"
        "  subscriptions_active: 0\n"
        "\n"
        "# Customer Feedback Research\n\n"
        "We recruited 20 participants.\n"
        "80% of participants found the tool easy to use.\n"
    )
    assert scan_business_claims(text) == []


def test_absent_value_must_be_written_unavailable():
    """A missing figure written as 'unavailable' is honest, so it passes."""
    assert scan_business_claims("subscriptions_active: unavailable\n") == []


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


def test_quoted_research_text_is_third_party_not_our_assertion():
    text = 'A competitor blog claimed "80% of participants found our tool easy to use".\n'
    assert scan_business_claims(text) == []


def test_fenced_code_is_ignored():
    text = "Example:\n```\nSELECT COUNT(*) FROM subs; -- 100 users\n```\nDone.\n"
    assert scan_business_claims(text) == []


def test_fenced_research_stat_is_not_a_claim():
    text = "Sample:\n```\nrecruited 20 participants; 80% of participants found it easy\n```\n"
    assert scan_business_claims(text) == []


def test_headings_are_labels_not_claims():
    assert scan_business_claims("## 5 customers won\n\nNo figures below.\n") == []


def test_research_stat_in_a_heading_is_a_label():
    assert scan_business_claims("## 80% of participants\n\nNo figures below.\n") == []


def test_engineering_stat_shapes_are_not_research():
    assert scan_business_claims("42 out of 45 connectors are connected.\n") == []
    assert scan_business_claims("3 out of 5 tests passed this run.\n") == []
    assert scan_business_claims("the survey endpoint returns 200 OK.\n") == []
    assert scan_business_claims("a study of 500 pages took 2s.\n") == []
    assert scan_business_claims("sessions lasted approximately 60 minutes each.\n") == []
    assert scan_business_claims("instance survey 2026-10-06: registration_denied.\n") == []


def test_qualified_research_shapes_without_a_number_pass():
    assert scan_business_claims("We run weekly feedback sessions.\n") == []
    assert scan_business_claims("A survey was planned for next quarter.\n") == []


def test_research_stat_attributed_to_a_third_party_passes():
    text = "According to the 2026 W3C study, 80% of websites fail WCAG.\n"
    assert scan_business_claims(text) == []


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
