"""Regression tests for fleet survival across transient network/DNS failures.

Pins the behaviour introduced after the 2026-11-07 DNS outage, where a
``httpx.ConnectError: [Errno 8] nodename nor servname provided`` raised from
``MessageBus.create_consumer_groups`` / ``AgentMemory.initialize`` propagated
out of ``asyncio.gather`` and terminated the whole fleet process:

* transient failures are retried with bounded backoff and never become fatal;
* a server answer (4xx/auth) is NEVER retried and still raises;
* exhaustion past the bound logs at error level and re-raises;
* connect-phase-only retries are not applied to the wider reset/timeout class
  (the sync write path must not replay a request that may have been applied).
"""

import asyncio
import importlib.util
import socket
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from core.messaging.bus import MessageBus
from core.resilience import (
    is_connect_phase_error,
    is_transient_network_error,
    retry_async,
)

ROOT = Path(__file__).resolve().parents[2]

# Captured at import so per-test monkeypatching cannot leak between tests.
_REAL_SLEEP = asyncio.sleep


def _load_run_agents():
    """Import scripts/run_agents.py without a package (no scripts/__init__.py)."""
    path = ROOT / "scripts" / "run_agents.py"
    spec = importlib.util.spec_from_file_location("_fleet_run_agents", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


run_agents = _load_run_agents()


def _gaierror() -> socket.gaierror:
    """The exact macOS shape from the incident log."""
    return socket.gaierror(8, "nodename nor servname provided, or not known")


def _connect_error(errno: int = 8, message: str = "nodename nor servname provided, or not known") -> httpx.ConnectError:
    """An httpx.ConnectError wrapping a socket error, as httpx raises it."""
    exc = httpx.ConnectError(f"[Errno {errno}] {message}")
    exc.__cause__ = OSError(errno, message)
    return exc


def _auth_error(status: int = 401) -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "https://ai-company.lazynext.com/query")
    res = httpx.Response(status, request=req)
    return httpx.HTTPStatusError(f"Client error '{status}'", request=req, response=res)


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Keep the whole module fast; sleeps are asserted, never waited."""

    async def _fast(_delay):
        return None

    monkeypatch.setattr(asyncio, "sleep", _fast)
    yield


# --------------------------------------------------------------------------
# classification
# --------------------------------------------------------------------------

def test_gaierror_is_transient():
    assert is_transient_network_error(_gaierror()) is True


def test_httpx_connect_error_with_oserror_cause_is_transient():
    assert is_transient_network_error(_connect_error()) is True
    # A DNS/TCP failure is connect-phase, so even a POST may be replayed.
    assert is_connect_phase_error(_connect_error()) is True


def test_reset_mid_request_is_transient_but_not_connect_phase():
    """Errno 54 can land after the request was written — retriable only for
    idempotent operations, never blindly for a mutating POST."""
    exc = _connect_error(54, "Connection reset by peer")
    assert is_transient_network_error(exc) is True
    # httpx raises ConnectError only from connect(), so the class is still safe;
    # the bare OSError shape (no httpx wrapper) is what must stay excluded.
    assert is_connect_phase_error(OSError(54, "Connection reset by peer")) is False


def test_auth_error_is_never_transient():
    assert is_transient_network_error(_auth_error(401)) is False
    assert is_connect_phase_error(_auth_error(401)) is False


def test_http_status_error_wins_over_nested_transport_error():
    """A 401 with a transport-ish __cause__ must still read as a server answer."""
    exc = _auth_error(401)
    exc.__cause__ = _gaierror()
    assert is_transient_network_error(exc) is False


# --------------------------------------------------------------------------
# retry_async
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_connect_error_is_retried_then_succeeds():
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise _connect_error()
        return "ok"

    assert await retry_async(flaky, label="unit", attempts=3) == "ok"
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_gaierror_is_retried_then_succeeds():
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise _gaierror()
        return "ok"

    assert await retry_async(flaky, label="unit", attempts=3) == "ok"
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_auth_error_raises_on_first_attempt():
    calls = {"n": 0}

    async def boom():
        calls["n"] += 1
        raise _auth_error(401)

    with pytest.raises(httpx.HTTPStatusError):
        await retry_async(boom, label="unit", attempts=5)
    assert calls["n"] == 1, "an auth failure must not be retried"


@pytest.mark.asyncio
async def test_connect_phase_classifier_does_not_retry_plain_oserror_reset():
    calls = {"n": 0}

    async def boom():
        calls["n"] += 1
        raise OSError(54, "Connection reset by peer")

    with pytest.raises(OSError):
        await retry_async(boom, label="unit", attempts=4, classify=is_connect_phase_error)
    assert calls["n"] == 1


class _LogRecorder:
    def __init__(self):
        self.events = []

    def _record(self, level, event, **kw):
        self.events.append((level, event, kw))

    def debug(self, event, **kw):
        self._record("debug", event, **kw)

    def info(self, event, **kw):
        self._record("info", event, **kw)

    def warning(self, event, **kw):
        self._record("warning", event, **kw)

    def error(self, event, **kw):
        self._record("error", event, **kw)

    def events_named(self, name):
        return [e for e in self.events if e[1] == name]


@pytest.mark.asyncio
async def test_exhaustion_reraises_after_bounded_attempts(monkeypatch):
    from core import resilience as res

    log = _LogRecorder()
    monkeypatch.setattr(res, "logger", log)
    calls = {"n": 0}

    async def boom():
        calls["n"] += 1
        raise _connect_error()

    with pytest.raises(httpx.ConnectError):
        await retry_async(boom, label="exhaust-me", attempts=3)
    assert calls["n"] == 3
    exhausted = log.events_named("network_retry_exhausted")
    assert exhausted and exhausted[-1][0] == "error"
    assert exhausted[-1][2]["label"] == "exhaust-me"
    assert len(log.events_named("network_retry")) == 2


@pytest.mark.asyncio
async def test_backoff_grows_and_is_capped():
    delays: list[float] = []

    async def flaky():
        if len(delays) < 6:
            raise _connect_error()
        return "ok"

    async def sleeper(delay):
        delays.append(round(delay, 4))

    await retry_async(
        flaky,
        label="backoff",
        attempts=7,
        base_delay=1.0,
        max_delay=4.0,
        sleep=sleeper,
    )
    # 1, 2, 4 then capped at 4 (jittered into [0.5x, 1.5x) of the ceiling).
    ceilings = [1.0, 2.0, 4.0, 4.0, 4.0, 4.0]
    for delay, ceiling in zip(delays, ceilings):
        assert ceiling * 0.5 <= delay <= ceiling * 1.5


@pytest.mark.asyncio
async def test_cancellation_is_never_swallowed():
    async def cancelled():
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        await retry_async(cancelled, label="unit", attempts=3)


# --------------------------------------------------------------------------
# Boot-time bus pre-warm — the exact frame that killed the process on 11-07
# (`run_agents.py:32 -> bus.py:105 create_consumer_groups`)
# --------------------------------------------------------------------------

class _FakeClock:
    """Deterministic monotonic clock advanced by the sleeps a test observes."""

    def __init__(self):
        self.value = 0.0

    def now(self) -> float:
        return self.value

    def advance(self, delta: float) -> None:
        self.value += delta


def _boot_harness(monkeypatch, bus, steps, budget_s=60.0):
    """Run `_ensure_consumer_groups` with a fake clock and a scripted bus."""
    clock = _FakeClock()
    sleeps: list[float] = []
    calls = {"n": 0}

    def _side_effect():
        calls["n"] += 1
        step = steps[min(calls["n"], len(steps)) - 1]
        if isinstance(step, BaseException):
            raise step
        return None

    async def _create_consumer_groups():
        _side_effect()

    monkeypatch.setattr(bus, "create_consumer_groups", _create_consumer_groups)

    async def sleeper(delay):
        sleeps.append(delay)
        clock.advance(delay)

    async def _run():
        return await run_agents._ensure_consumer_groups(
            bus, budget_s=budget_s, sleep=sleeper, clock=clock.now
        )

    return _run, calls, sleeps


@pytest.mark.asyncio
async def test_boot_bus_setup_retries_then_succeeds(monkeypatch):
    """A DNS blip during boot costs seconds and the fleet still starts."""
    bus = MessageBus()
    run, calls, sleeps = _boot_harness(
        monkeypatch, bus, [_gaierror(), _gaierror(), None]
    )
    assert await run() is True
    assert calls["n"] == 3, "boot must retry the transient failure"
    assert sleeps and all(s > 0 for s in sleeps), "retries must back off"


@pytest.mark.asyncio
async def test_boot_bus_setup_is_non_fatal_when_budget_expires(monkeypatch):
    """Persistent outage: bounded wait, then continue without the bus pre-warm."""
    bus = MessageBus()
    run, calls, sleeps = _boot_harness(
        monkeypatch, bus, [_connect_error()], budget_s=10.0
    )
    assert await run() is False, "must not raise — the fleet has to start"
    assert calls["n"] > 1
    assert sum(sleeps) <= 10.0 + run_agents.BOOT_BUS_MAX_DELAY_S


@pytest.mark.asyncio
async def test_boot_bus_setup_does_not_retry_auth_failure(monkeypatch):
    """A bad token is not a blip — fail over to the non-fatal path immediately."""
    bus = MessageBus()
    run, calls, sleeps = _boot_harness(monkeypatch, bus, [_auth_error(401)])
    assert await run() is False
    assert calls["n"] == 1
    assert sleeps == []


@pytest.mark.asyncio
async def test_boot_bus_setup_hard_caps_a_hung_call(monkeypatch):
    """A resolver that hangs cannot stretch startup past the budget."""
    bus = MessageBus()

    async def _hang():
        await asyncio.Event().wait()

    monkeypatch.setattr(bus, "create_consumer_groups", _hang)
    started = asyncio.get_running_loop().time()
    ok = await run_agents._ensure_consumer_groups(bus, budget_s=0.05)
    elapsed = asyncio.get_running_loop().time() - started
    assert ok is False
    assert elapsed < 1.0, "the wall-clock cap must fire"


@pytest.mark.asyncio
async def test_boot_bus_setup_contains_unexpected_errors(monkeypatch):
    """Even a non-network crash in the pre-warm must not stop the fleet."""
    bus = MessageBus()
    run, calls, _ = _boot_harness(monkeypatch, bus, [RuntimeError("boom")])
    assert await run() is False
    assert calls["n"] == 1


# --------------------------------------------------------------------------
# CloudflareClient transport — retry policy is per-method-safety
# --------------------------------------------------------------------------

class _FakeSyncHTTP:
    """Minimal httpx.Client stand-in that replays a scripted sequence."""

    def __init__(self, steps, calls):
        self._steps = steps
        self._calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def post(self, url, headers=None, json=None):
        self._calls.append(url)
        step = self._steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        return httpx.Response(200, json=step, request=httpx.Request("POST", url))


def _client(monkeypatch, steps):
    from core import cloudflare_client as cc

    calls: list[str] = []
    monkeypatch.setattr(
        cc.httpx, "Client", lambda timeout=None: _FakeSyncHTTP(steps, calls)
    )
    client = cc.CloudflareClient()
    client.url = "https://ai-company.lazynext.com"
    client.token = "test-token"
    return client, calls


def test_sync_query_retries_connect_phase_failure(monkeypatch):
    client, calls = _client(monkeypatch, [_connect_error(), {"results": [{"id": "1"}]}])
    assert client.query("SELECT 1") == [{"id": "1"}]
    assert len(calls) == 2


def test_sync_query_does_not_replay_a_mid_flight_failure(monkeypatch):
    """A reset after the request was written may already have applied the write."""
    client, calls = _client(monkeypatch, [httpx.RemoteProtocolError("disconnected")])
    with pytest.raises(httpx.RemoteProtocolError):
        client.execute("INSERT INTO t VALUES (1)")
    assert len(calls) == 1


def test_sync_query_does_not_retry_auth_failure(monkeypatch):
    client, calls = _client(monkeypatch, [_auth_error(401)])
    with pytest.raises(httpx.HTTPStatusError):
        client.query("SELECT 1")
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_agent_memory_initialize_survives_dns_blip(monkeypatch):
    """The second fatal frame from the incident log (qa_agent -> initialize)."""
    from core.memory.agent_memory import AgentMemory

    client, calls = _client(
        monkeypatch,
        [
            _connect_error(),      # the DNS blip, on the initial select
            {"results": []},       # select retried: agent has no row yet
            {"results": []},       # insert succeeds
        ],
    )
    memory = AgentMemory()
    memory._client = client

    await memory.initialize("qa_1", "qa")  # must not raise
    assert len(calls) == 3


# --------------------------------------------------------------------------
# startup + supervision
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_supervisor_restarts_agent_after_transient_crash():
    crashes: dict[str, int] = {}
    attempts = {"n": 0}
    delays: list[float] = []

    async def factory():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise _gaierror()
        return None

    async def sleeper(delay):
        delays.append(delay)

    await asyncio.wait_for(
        run_agents._supervise("qa_1", factory, crashes, sleep=sleeper), timeout=5
    )
    assert attempts["n"] == 3
    assert crashes["qa_1"] == 2
    assert delays == [
        run_agents.AGENT_RESTART_BASE_S,
        run_agents.AGENT_RESTART_BASE_S * 2,
    ]


@pytest.mark.asyncio
async def test_supervisor_propagates_permanent_failure():
    """Bad credentials / genuine bugs must stay fatal — no silent half-fleet."""
    crashes: dict[str, int] = {}

    async def factory():
        raise _auth_error(403)

    with pytest.raises(httpx.HTTPStatusError):
        await run_agents._supervise("qa_1", factory, crashes, sleep=AsyncMock())
    assert crashes == {}


@pytest.mark.asyncio
async def test_supervisor_backoff_is_capped():
    crashes: dict[str, int] = {}
    attempts = {"n": 0}
    delays: list[float] = []

    async def factory():
        attempts["n"] += 1
        if attempts["n"] <= 12:
            raise _connect_error()
        return None

    async def sleeper(delay):
        delays.append(delay)

    await asyncio.wait_for(
        run_agents._supervise("sales_1", factory, crashes, sleep=sleeper), timeout=5
    )
    assert max(delays) == run_agents.AGENT_RESTART_MAX_S
    assert delays == sorted(delays), "backoff must be non-decreasing"
