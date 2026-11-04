"""Weekly finance report must not invent customers or revenue.

Regression (found 2026-11-04 by the full-body inbox read): the 2026-10-26
agent-written report claimed one paid Pro subscription while simultaneously
reporting $0 MRR and $0 revenue. Real state: `subscriptions_active: 0`,
`licenses_pro: 1` — and that single license is the self-issued dogfood license
on support@lazynext.com, i.e. an entitlement, not a customer. Dodo is
permanently in test mode, so collectible revenue is $0 by configuration.

The old prompt handed the model `licenses_pro=1` with no distinction, so the
fix is structural: numbers now come from a deterministic facts block built off
the live billing funnel, and the prompt forbids paid/customer claims.
"""

from pathlib import Path

from agents.infrastructure.finance_agent import build_report_prompt
from core.operations.report_facts import format_verified_facts, funnel_number

# The verified production shape at the time of the fix.
REAL_FUNNEL = {
    "scans_30d": 12,
    "leads": 40,
    "crm_leads": 67,
    "crm_engaged": 9,
    "trials_active": 0,
    "licenses_pro": 1,
    "licenses_free": 0,
    "subscriptions_active": 0,
    "monitors": 1,
}


def test_facts_block_state_is_zero_subscriptions_and_a_dogfood_license():
    facts = format_verified_facts(REAL_FUNNEL)
    assert "Active subscriptions (the ONLY measure of actual customers): 0" in facts
    assert "Pro licenses issued: 1" in facts
    assert "self-issued/dogfood" in facts
    assert "NOT customers" in facts
    assert "revenue = $0" in facts
    assert "Dodo TEST MODE" in facts


def test_facts_block_never_describes_a_paid_customer():
    facts = format_verified_facts(REAL_FUNNEL).lower()
    for forbidden in ("paid subscriber", "paying user", "paying customer", "paying subscriber"):
        assert forbidden not in facts


def test_facts_block_does_not_call_the_license_a_customer():
    facts = format_verified_facts(REAL_FUNNEL)
    # "1 Pro license" must never be presented as one customer.
    assert "1 customer" not in facts
    assert "customer: 1" not in facts


def test_failed_read_reports_unavailable_and_never_guesses():
    import re

    facts = format_verified_facts(None)
    assert "unavailable" in facts
    assert "FUNNEL READ FAILED" in facts
    # No figure may appear at all: only the $0 test-mode constant and the "30d" window label.
    assert not re.search(r"\b\d+\b", facts.replace("$0", "").replace("Scans (30d)", "Scans"))


def test_a_real_subscription_flips_the_customer_line():
    facts = format_verified_facts({**REAL_FUNNEL, "subscriptions_active": 2, "licenses_pro": 3})
    assert "Active subscriptions (the ONLY measure of actual customers): 2" in facts
    assert "only 2 of them are backed by an active subscription" in facts


def test_funnel_number_refuses_non_numeric_and_missing_values():
    assert funnel_number({"x": 5}, "x") == "5"
    assert funnel_number({"x": True}, "x") == "unavailable"  # bool is not a count
    assert funnel_number({"x": "5"}, "x") == "unavailable"
    assert funnel_number({}, "x") == "unavailable"
    assert funnel_number(None, "x") == "unavailable"


def test_prompt_pins_customers_to_subscriptions_and_forbids_paid_claims():
    prompt = build_report_prompt(REAL_FUNNEL)
    assert "Customers = subscriptions_active. It is 0." in prompt
    low = prompt.lower()
    assert "no one has paid" in low
    assert "claim no revenue and no paid conversion" in low
    assert "never estimate" in low
    # The live figures are quoted into the prompt, so the model never has to infer them.
    assert "Active subscriptions (the ONLY measure of actual customers): 0" in prompt
    assert "PRODUCT LINE" not in prompt  # sanity: no template placeholders
    assert "{" not in prompt.replace("$0", "")


def test_prompt_tells_the_model_to_write_unavailable_when_the_read_failed():
    prompt = build_report_prompt(None)
    assert "FUNNEL READ FAILED" in prompt
    assert "unavailable" in prompt.lower()


def test_both_report_generators_route_figures_through_the_facts_block():
    """The founder briefing had the same defect (`Users=<license count>`).

    Pinned at source level so a future edit cannot quietly hand the model a
    license count labelled as users/revenue again.
    """
    root = Path(__file__).resolve().parents[2]
    generators = [
        root / "agents" / "infrastructure" / "finance_agent.py",
        root / "agents" / "strategic" / "ceo_agent.py",
    ]
    for path in generators:
        src = path.read_text()
        assert "format_verified_facts(funnel)" in src, f"{path.name} must quote the facts block"
        assert "hard_rules(funnel)" in src, f"{path.name} must carry the no-fabrication rules"

    ceo = (root / "agents" / "strategic" / "ceo_agent.py").read_text()
    assert "Users={m_users}" not in ceo, "a license count must never be printed as Users="
    assert "Revenue=${m_revenue}" not in ceo, "revenue must come from the facts block, not brain.metrics"
