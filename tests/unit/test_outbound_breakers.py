"""Unit tests for the fleet outbound breaker gate (core/tools/outbound_breakers.py).

Covers the four worker-mirrored policies (volume / repeated failures /
error-rate floor / email-only deliverability), the observe-vs-active posture,
fail-soft reads, per-connector tripped blocking, and the wiring in
`call_connector` (provider fn must NOT run when active+tripped, and MUST run
when observe+tripped). No provider is ever contacted — reads are stubbed and
the "sender" in the call_connector test is an AsyncMock.
"""

from unittest.mock import AsyncMock

import pytest

from core.tools import connectors
from core.tools import outbound_breakers as ob

DEFAULTS = dict(ob.DEFAULT_POLICY)


def _policy(**overrides) -> dict:
    policy = {**DEFAULTS, "tripped_reason": None, "tripped_at": None}
    policy.update(overrides)
    return policy


def _stub_reads(monkeypatch, policy=None, dispatch=(0, 0, None), email=(0, 0, None)):
    monkeypatch.setattr(ob, "_load_policy", AsyncMock(return_value=(policy or _policy(), None)))
    monkeypatch.setattr(ob, "_dispatch_stats", AsyncMock(return_value=dispatch))
    monkeypatch.setattr(ob, "_email_stats", AsyncMock(return_value=email))


@pytest.mark.asyncio
async def test_volume_window_blocks_in_active(monkeypatch):
    """At/over volume_limit within the window, active mode blocks with the
    volume reason — and only for the connector that hit it."""
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    _stub_reads(monkeypatch, dispatch=(DEFAULTS["volume_limit"], 0, None))
    res = await ob.check_outbound("x")
    assert res == {"allow": False, "mode": "active", "reason": "volume: 100 dispatches in 60m (limit 100)"}

    # A different connector with clean stats is not blocked by x's volume.
    _stub_reads(monkeypatch, dispatch=(1, 0, None))
    res = await ob.check_outbound("reddit")
    assert res["allow"] is True and res["reason"] is None


@pytest.mark.asyncio
async def test_repeated_failures_block(monkeypatch):
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    _stub_reads(monkeypatch, dispatch=(5, DEFAULTS["failure_limit"], None))
    res = await ob.check_outbound("x")
    assert res["allow"] is False
    assert res["reason"] == "provider failures: 5 in 10m (limit 5)"


@pytest.mark.asyncio
async def test_error_rate_has_event_floor(monkeypatch):
    """Below the 5-dispatch floor, a 100% failure rate must NOT trip."""
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    policy = _policy(failure_limit=50)  # keep failures out of the picture
    _stub_reads(monkeypatch, policy=policy, dispatch=(4, 4, None))
    res = await ob.check_outbound("x")
    assert res["allow"] is True, res

    # At/above the floor with >=50% errors -> blocked by error rate.
    _stub_reads(monkeypatch, policy=policy, dispatch=(10, 6, None))
    res = await ob.check_outbound("x")
    assert res["allow"] is False
    assert res["reason"] == "error rate: 60% (limit 50%)"


@pytest.mark.asyncio
async def test_deliverability_is_email_only(monkeypatch):
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    # 10 events, 2 degraded (20% >= 0.2) — over the floor for email.
    email = (10, 2, None)
    _stub_reads(monkeypatch, email=email)
    res = await ob.check_outbound("brevo")
    assert res["allow"] is False
    assert res["reason"].startswith("deliverability: 20% degraded events")

    # The same degraded mail stream says nothing about a tweet.
    _stub_reads(monkeypatch, email=email)
    res = await ob.check_outbound("x")
    assert res["allow"] is True and res["reason"] is None


@pytest.mark.asyncio
async def test_observe_never_blocks(monkeypatch):
    """Default posture: even with a tripped row and exceeded volumes the gate
    allows the send and reports the would-be reason."""
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    policy = _policy(tripped_reason="x: volume: 250 dispatches in 60m (limit 100)")
    _stub_reads(monkeypatch, policy=policy, dispatch=(250, 0, None))
    res = await ob.check_outbound("x")
    assert res["mode"] == "observe"
    assert res["allow"] is True
    assert "volume: 250" in res["reason"]


@pytest.mark.asyncio
async def test_tripped_provider_blocks_only_itself(monkeypatch):
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    policy = _policy(tripped_reason="x: volume: 250 dispatches in 60m (limit 100)")
    _stub_reads(monkeypatch, policy=policy, dispatch=(0, 0, None))
    blocked = await ob.check_outbound("x")
    assert blocked["allow"] is False
    assert blocked["reason"] == "volume: 250 dispatches in 60m (limit 100)"

    clean = await ob.check_outbound("reddit")
    assert clean["allow"] is True and clean["reason"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["observe", "active"])
async def test_config_unreadable_posts_anyway(monkeypatch, mode):
    """Fail-SOFT: a control-plane outage must never stop posting — active mode
    included, since the evidence itself could not be read."""
    monkeypatch.setenv("CONN_BREAKER_MODE", mode)
    monkeypatch.setattr(ob, "_load_policy", AsyncMock(return_value=({}, "breaker config read failed: boom")))
    res = await ob.check_outbound("brevo")
    assert res["allow"] is True
    assert "read failed" in res["reason"]


@pytest.mark.asyncio
async def test_stats_unreadable_posts_anyway(monkeypatch):
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    _stub_reads(monkeypatch, dispatch=(0, 0, "breaker dispatch stats read failed: boom"))
    res = await ob.check_outbound("x")
    assert res["allow"] is True
    assert "read failed" in res["reason"]


@pytest.mark.asyncio
async def test_call_connector_consults_gate(monkeypatch):
    """The real call_connector path: active+tripped must NOT reach the provider
    fn; observe+tripped must still call it (the observe-mode proof)."""
    sender = AsyncMock(return_value={"ok": True, "status": 200, "body": {}})
    monkeypatch.setitem(connectors._DISPATCH, "_testbreaker", sender)
    monkeypatch.setattr(connectors, "_credential", AsyncMock(return_value="tok"))

    # active + tripped -> blocked before the provider, structured gate error.
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    monkeypatch.setattr(connectors, "check_outbound", AsyncMock(
        return_value={"allow": False, "mode": "active", "reason": "volume: 250 dispatches in 60m (limit 100)"}
    ))
    res = await connectors.call_connector("_testbreaker", {"text": "hello"})
    assert res["ok"] is False
    assert res["breaker"] is True
    assert res["error"] == "blocked by outbound breaker: volume: 250 dispatches in 60m (limit 100)"
    sender.assert_not_awaited()

    # observe + tripped -> logs and continues; the provider fn runs.
    monkeypatch.setenv("CONN_BREAKER_MODE", "observe")
    monkeypatch.setattr(connectors, "check_outbound", AsyncMock(
        return_value={"allow": True, "mode": "observe", "reason": "volume: 250 dispatches in 60m (limit 100)"}
    ))
    res = await connectors.call_connector("_testbreaker", {"text": "hello"})
    assert res == {"ok": True, "status": 200, "body": {}}
    sender.assert_awaited_once()


@pytest.mark.asyncio
async def test_client_construction_failure_posts_anyway(monkeypatch):
    """Fail-SOFT at the outer boundary: if the platform client cannot even be
    constructed (missing/invalid config), the gate must allow the send rather
    than raise into call_connector — a broken control plane must never stop
    company posting."""
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")

    def _boom(*_a, **_k):
        raise RuntimeError("no credentials configured")

    monkeypatch.setattr(ob, "CloudflareClient", _boom)
    res = await ob.check_outbound("x")
    assert res["allow"] is True
    assert "gate error" in res["reason"]


@pytest.mark.asyncio
async def test_close_failure_posts_anyway(monkeypatch):
    """A failing close() must not turn a permitted send into an exception."""
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    _stub_reads(monkeypatch, dispatch=(0, 0, None))

    class _Client:
        async def close(self):
            raise RuntimeError("close blew up")

    monkeypatch.setattr(ob, "CloudflareClient", lambda *a, **k: _Client())
    res = await ob.check_outbound("x")
    assert res["allow"] is True