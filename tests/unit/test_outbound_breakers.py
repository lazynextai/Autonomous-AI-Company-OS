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

# Captured before any monkeypatch so a test can exercise the REAL resolution.
_REAL_SETTINGS_MODE = ob._settings_mode


@pytest.fixture(autouse=True)
def _isolate_dotenv_mode(monkeypatch):
    """Neutralize the `.env` fallback unless a test opts in.

    The repo's `.env` is the fleet's real config surface, so once operators set
    `CONN_BREAKER_MODE` there every test that asserted the default would flip
    with it. Each test therefore starts from "unset everywhere" and states the
    source it wants explicitly.
    """
    monkeypatch.setattr(ob, "_settings_mode", lambda: None, raising=True)


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
# --- Mode resolution: os.environ > .env (Settings) > observe -----------------
# Regression-locked defect: `scripts/run_agents.py` has no `load_dotenv`, so
# `.env` keys never reach `os.environ` under launchd, and the old `_current_mode`
# (os.environ only) silently ignored the documented `CONN_BREAKER_MODE=active`
# switch. The fallback now reads the pydantic Settings object that parses `.env`.

def test_mode_env_wins_over_dotenv(monkeypatch):
    """An explicit os.environ value beats the `.env` value in both directions."""
    monkeypatch.setenv("CONN_BREAKER_MODE", "active")
    monkeypatch.setattr(ob, "_settings_mode", lambda: "observe")
    assert ob._current_mode() == "active"

    monkeypatch.setenv("CONN_BREAKER_MODE", "observe")
    monkeypatch.setattr(ob, "_settings_mode", lambda: "active")
    assert ob._current_mode() == "observe"


def test_mode_dotenv_honored_when_env_unset(monkeypatch):
    """The `.env`-only value (via pydantic Settings) arms the gate — this is
    the launchd fleet's config surface."""
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    monkeypatch.setattr(ob, "_settings_mode", lambda: "active")
    assert ob._current_mode() == "active"


def test_mode_dotenv_resolution_uses_real_settings_path(monkeypatch):
    """The real `_settings_mode` reads `get_settings().conn_breaker_mode` —
    proving the wiring is to the Settings object, not the stubbed helper."""
    import core.config as config

    class _FakeSettings:
        conn_breaker_mode = "active"

    monkeypatch.setattr(ob, "_settings_mode", _REAL_SETTINGS_MODE)
    monkeypatch.setattr(config, "get_settings", lambda: _FakeSettings())
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    assert ob._current_mode() == "active"


def test_mode_absent_observes(monkeypatch):
    """No env, no `.env` value -> observe."""
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    monkeypatch.setattr(ob, "_settings_mode", lambda: None)
    assert ob._current_mode() == "observe"


def test_mode_unknown_and_blank_observe(monkeypatch):
    """'active', case/space-insensitively, is the only arming value; unknown
    or blank values observe from either source."""
    monkeypatch.setattr(ob, "_settings_mode", lambda: "observe")
    for armed in ("active", " ACTIVE ", "Active\n"):
        monkeypatch.setenv("CONN_BREAKER_MODE", armed)
        assert ob._current_mode() == "active", armed
    for bogus in ("", "1", "enforce", "human_only"):
        monkeypatch.setenv("CONN_BREAKER_MODE", bogus)
        assert ob._current_mode() == "observe", bogus

    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    for bogus in ("approval", "   ", "All", "ENFORCE"):
        monkeypatch.setattr(ob, "_settings_mode", lambda: bogus)
        assert ob._current_mode() == "observe", bogus


def test_mode_unreadable_settings_observes(monkeypatch):
    """A settings object that blows up degrades to observe, never to a fatal."""
    monkeypatch.setattr(ob, "_settings_mode", _REAL_SETTINGS_MODE)
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)

    def _boom():
        raise RuntimeError("pydantic misconfigured")

    import core.config as config

    monkeypatch.setattr(config, "get_settings", _boom)
    assert ob._current_mode() == "observe"


def test_settings_model_declares_conn_breaker_mode(monkeypatch, tmp_path):
    """The Settings model has conn_breaker_mode and pydantic picks it up from
    a .env file (the field is what makes the documented switch work)."""
    from pydantic_settings import BaseSettings

    from core.config import Settings

    env_file = tmp_path / ".env"
    env_file.write_text("CONN_BREAKER_MODE=active\n")
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)

    class _Probe(BaseSettings):
        model_config = Settings.model_config
        conn_breaker_mode: str = "observe"

    probe = _Probe(_env_file=str(env_file))
    assert probe.conn_breaker_mode == "active"

    # The real model carries the field and declares a default.
    assert "conn_breaker_mode" in Settings.model_fields
    assert Settings.model_fields["conn_breaker_mode"].default == "observe"


@pytest.mark.asyncio
async def test_dotenv_active_blocks_in_check_outbound(monkeypatch):
    """End-to-end: with NO env var but a `.env`-resolved active, check_outbound
    reports mode=active and blocks an exceeded window."""
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    monkeypatch.setattr(ob, "_settings_mode", lambda: "active")
    _stub_reads(monkeypatch, dispatch=(DEFAULTS["volume_limit"], 0, None))
    res = await ob.check_outbound("x")
    assert res["mode"] == "active" and res["allow"] is False
    assert "volume:" in res["reason"]
