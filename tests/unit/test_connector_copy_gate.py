"""The fleet's copy-quality gate, wired into `call_connector` (2026-11-10).

Pins the seam, not just the rules:

1. a blocking conformance claim never reaches the provider;
2. a warn-class style tell rides along in the result and still sends;
3. clean copy is unchanged (no new response keys);
4. the gate sits after the decision gate and before `_invoke`, so a preview
   (which returns earlier) still renders for copy it would block.

No network: the credential, the cap, the breaker, the decision gate and the
provider seam are all faked.
"""

from __future__ import annotations

import inspect

import pytest

from core.tools import connectors


@pytest.fixture
def wired(monkeypatch):
    """A connected, allowed connector whose provider seam records calls."""
    calls: list[str] = []

    async def _cred(_cid):
        return "fake-token"

    async def _allow_cap(_cid, **_kwargs):
        return {"allow": True}

    async def _allow(*_args, **_kwargs):
        return {"allow": True, "reason": None}

    async def _post(url, **kwargs):
        calls.append(str(url))
        return {"status": 200, "ok": True, "body": {"data": {"id": "1"}}}

    monkeypatch.setattr(connectors, "_credential", _cred)
    monkeypatch.setattr(connectors, "consume_connector_daily_cap", _allow_cap)
    monkeypatch.setattr(connectors, "check_outbound", _allow)
    monkeypatch.setattr(connectors, "check_decision", _allow)
    monkeypatch.setattr(connectors, "_post", _post)
    return calls


@pytest.mark.anyio
async def test_a_conformance_claim_never_reaches_the_provider(wired):
    out = await connectors.call_connector("x", "Our site is WCAG 2.1 AA compliant.")

    assert out["ok"] is False
    assert out["copy_gate"] is True
    assert "blocked by copy quality gate" in out["error"]
    assert [f["rule_id"] for f in out["findings"]] == ["claim-unsupported-conformance"]
    assert wired == [], "a blocked send must not touch the provider"


@pytest.mark.anyio
async def test_a_warn_class_style_tell_still_posts_and_rides_along(wired):
    out = await connectors.call_connector(
        "x", "In today's fast-paced world, we unlock the power of seamless integration.",
    )

    assert out["ok"] is True
    assert len(wired) == 1, "a warning must never stop a send"
    assert {f["rule_id"] for f in out["copy_warnings"]} == {"slop-empty-phrase"}
    assert all(f["severity"] == "warn" for f in out["copy_warnings"])


@pytest.mark.anyio
async def test_clean_copy_adds_no_response_keys(wired):
    out = await connectors.call_connector("x", "Scan any page and find WCAG 2.1 AA issues.")

    assert out["ok"] is True
    assert len(wired) == 1
    assert "copy_warnings" not in out


@pytest.mark.anyio
async def test_copy_for_a_non_copy_connector_payload_is_not_gated(wired):
    """A payload with no prose (no known copy field) is simply not scanned."""
    out = await connectors.call_connector("x", {"image_url": "https://example.com/a.png"})

    assert out["ok"] is True
    assert len(wired) == 1


def test_the_gate_sits_between_the_decision_gate_and_the_provider_call():
    src = inspect.getsource(connectors.call_connector)
    decision_at = src.index("decision = await check_decision(connector_id)")
    copy_at = src.index("if connector_id in COPY_CONNECTORS")
    invoke_at = src.index("result = await _invoke(")

    assert decision_at < copy_at < invoke_at
    # And a block returns before the invoke line, so no payload can slip past.
    block_at = src.index('"blocked by copy quality gate')
    assert block_at < invoke_at
