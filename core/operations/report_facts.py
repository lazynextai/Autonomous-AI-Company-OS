"""Verified-facts blocks for agent-written reports.

Agents write prose; numbers must come from D1. This module turns the live
billing funnel (`GET /api/v1/billing/funnel`) into a deterministic block that
is prepended to a report, so the model never has to state a figure it did not
read.

Why this exists: the 2026-10-26 Weekly Finance Report claimed one paid Pro
subscription while reporting $0 MRR/$0 revenue on the previous line. Real state
was `subscriptions_active: 0` and `licenses_pro: 1` — that single license is
the self-issued dogfood license on support@lazynext.com, an entitlement rather
than a customer. Dodo is permanently in test mode, so collectible revenue is
$0 by configuration. See docs/ops/watch-calendar.md.
"""

from __future__ import annotations

# The only keys a report may quote. Anything missing reads "unavailable" —
# never a guess, never a zero that is really "no data".
FUNNEL_FIELDS = (
    "scans_30d", "leads", "crm_leads", "crm_engaged", "trials_active",
    "licenses_pro", "licenses_free", "subscriptions_active", "monitors",
)

HARD_RULES = """HARD RULES — a report that breaks one is wrong:
- Customers = subscriptions_active. It is {subs}. A license is an
  entitlement someone was issued, not a customer.
- Claim no revenue and no paid conversion of any kind: no one has paid, upgraded to a paid plan, or
  converted to a paid user. Do not imply it in any wording, including adjectives
  ("paying ...", "paid ...", "subscribed ...").
- Never state a revenue or MRR figure other than $0. Dodo is in test mode: there is no collectible revenue.
- Never say we are "preparing to flip to live billing" or otherwise promise revenue next period unless
  the facts block says so.
- Any figure not in the facts block: write "unavailable". Never estimate, never round, never infer."""


def funnel_number(funnel: dict | None, key: str) -> str:
    """A single funnel figure as text, or `unavailable` when it was not read."""
    if not isinstance(funnel, dict) or key not in funnel:
        return "unavailable"
    value = funnel.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return "unavailable"
    return str(int(value))


def format_verified_facts(funnel: dict | None) -> str:
    """Deterministic, D1-sourced facts block. The LLM supplies no numbers."""
    subs = funnel_number(funnel, "subscriptions_active")
    pro = funnel_number(funnel, "licenses_pro")
    zero_subs = subs == "0"
    customer_line = (
        f"- Active subscriptions (the ONLY measure of actual customers): {subs}"
        if subs != "unavailable"
        else "- Active subscriptions: unavailable (funnel read failed — do not estimate)"
    )
    if zero_subs:
        license_note = (
            f"- Pro licenses issued: {pro} — all self-issued/dogfood (support@lazynext.com), "
            "NOT customers, NOT paid subscriptions"
        )
    elif subs == "unavailable" or pro == "unavailable":
        license_note = (
            f"- Pro licenses issued: {pro} — issued entitlements; whether any is backed by an active "
            "subscription is unavailable"
        )
    else:
        license_note = (
            f"- Pro licenses issued: {pro} — issued entitlements; only {subs} of them are backed "
            "by an active subscription"
        )
    lines = [
        "VERIFIED FACTS — live D1/KV read; these are the only numbers this report may state.",
        "- Billing mode: Dodo TEST MODE — no live payments are possible, so revenue = $0 and MRR = $0 "
        "by configuration, not by failure.",
        customer_line,
        license_note,
        f"- Free licenses: {funnel_number(funnel, 'licenses_free')} · "
        f"trials active: {funnel_number(funnel, 'trials_active')} · "
        f"monitors: {funnel_number(funnel, 'monitors')}",
        f"- Scans (30d): {funnel_number(funnel, 'scans_30d')} · leads: {funnel_number(funnel, 'leads')} · "
        f"CRM leads: {funnel_number(funnel, 'crm_leads')} · engaged: {funnel_number(funnel, 'crm_engaged')}",
    ]
    if funnel is None or all(funnel_number(funnel, k) == "unavailable" for k in FUNNEL_FIELDS):
        lines.append("- FUNNEL READ FAILED: quote no figures at all; say the live read was unavailable.")
    return "\n".join(lines)


def hard_rules(funnel: dict | None) -> str:
    """The no-fabrication rule block, with the live subscription count quoted in."""
    return HARD_RULES.format(subs=funnel_number(funnel, "subscriptions_active"))
