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
