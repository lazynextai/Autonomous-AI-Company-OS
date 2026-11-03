"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture
def anyio_backend() -> str:
    """Use asyncio backend for anyio."""
    return "asyncio"


@pytest.fixture(autouse=True)
def _observer_never_writes_production(monkeypatch):
    """Tests must never reach production D1 through the fleet observer.

    BaseAgent.handle_task() schedules the fleet-side observer
    (core/tools/observer.observe_task -> CloudflareClient.aquery writes to D1).
    Tests that drive handle_task without stubbing the observer therefore wrote
    real `t-veto`/`test-agent` rows into production episodic_events (observed
    2026-11-03: 6 + 9 rows purged; source tests/unit/test_deterministic_veto.py).

    This autouse fixture no-ops the observer at the handle_task boundary. Tests
    that specifically exercise the wiring (tests/unit/test_observer.py) patch
    `agents.base_agent.observe_task` themselves inside the test body, which runs
    after this fixture, so their recorder still wins.
    """
    import agents.base_agent as base_agent

    async def _never(*_args, **_kwargs):
        return None

    monkeypatch.setattr(base_agent, "observe_task", _never)


@pytest.fixture(autouse=True)
def _decision_gate_never_writes_production(monkeypatch):
    """Tests must never reach production KV/D1 through the fleet decision gate.

    core/tools/decision_gate.check_decision constructs a real CloudflareClient
    (KV + D1). An unstubbed call from a test would read production KV and —
    if a block fired — write a real `decision_gate` row into production
    episodic_events. This autouse fixture swaps the client factory for one
    whose every call raises, which makes an unstubbed check_decision fail
    SOFT (allow + log) with zero network. Tests that exercise the gate
    (tests/unit/test_decision_gate.py) patch `decision_gate.CloudflareClient`
    themselves inside the test body, which runs after this fixture, so their
    fake client still wins.
    """

    class _NoNetworkClient:
        async def kv_get(self, key):  # pragma: no cover - guard only
            raise RuntimeError("tests must not read production KV")

        async def aquery(self, sql, params=None):  # pragma: no cover - guard only
            raise RuntimeError("tests must not read production D1")

        async def aexecute(self, sql, params=None):  # pragma: no cover - guard only
            raise RuntimeError("tests must not write production D1")

        async def close(self):  # pragma: no cover - guard only
            return None

    import core.tools.decision_gate as decision_gate

    monkeypatch.setattr(decision_gate, "CloudflareClient", lambda *a, **k: _NoNetworkClient())
