"""``kv_age_ms`` must survive a resolver blip without masking a server answer.

The defect this pins: the KV_WATCH probes (``cron-tick``, ``mon-sweep``, …)
read a breadcrumb with ONE ``/kv/get`` POST. macOS resolver blips
(``[Errno 8] nodename nor servname``, a few seconds each, recurring every
~10-19 min overnight) made that single read raise, ``kv_age_ms`` returned
``None``, the loop failed the probe and mailed a false "FAILED" — then
"Recovered" 15 min later while the breadcrumb itself had never gone stale
(measured 2026-11-12 21:41:31Z → 21:56:52Z, breadcrumb 16h old against a 26h
budget). Nothing was operationally broken; only the monitoring layer lied.

Three boundaries are pinned:

1. connect-phase error then success -> the read completes (no false alarm);
2. an HTTP status (401/403/404/500) is a real answer -> no retry, still None;
3. a successful read of an old value is genuine staleness -> still over budget.

And the loop's fail-closed rule (``age is None`` -> failed) is pinned at source
level, because the retry must not weaken it.
"""

from __future__ import annotations

import inspect
import json
import socket
import time
import urllib.error

import pytest

from core.resilience import is_connect_phase_error
from scripts import health_check


class _Resp:
    """Minimal context-manager response holding a ``/kv/get`` JSON body."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode()


def _fresh(age_ms: float) -> _Resp:
    """A KV value whose breadcrumb timestamp is ``age_ms`` in the past."""
    ts = time.time() * 1000 - age_ms
    return _Resp({"value": json.dumps({"at": ts})})


def _dns_error() -> urllib.error.URLError:
    """Exactly what urllib raises on a resolver failure: URLError(gaierror).

    The ``from exc`` is deliberate — urllib wraps ``OSError`` inside an
    ``except`` block, so the real exception carries the ``gaierror`` as
    ``__context__`` and ``is_connect_phase_error`` walks that chain.
    """
    try:
        raise socket.gaierror(8, "nodename nor servname provided")
    except socket.gaierror as exc:
        raise urllib.error.URLError(exc) from exc


@pytest.fixture(autouse=True)
def _platform_env(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_API_URL", "https://platform.test")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-token")


@pytest.fixture
def no_delay(monkeypatch):
    """Keep the retry real but instant — the pause is bounded, not the subject."""
    monkeypatch.setattr(health_check, "KV_RETRY_BASE_DELAY_S", 0.0)


def test_retry_budget_is_small_and_bounded():
    """A ~3-60s blip needs one replay, not a retry storm inside a 15-min tick."""
    assert health_check.KV_RETRY_ATTEMPTS == 2
    assert 0 < health_check.KV_RETRY_BASE_DELAY_S <= 5


# --- 1. a connect-phase blip is replayed ------------------------------------


def test_connect_error_then_success_returns_the_age(monkeypatch, no_delay):
    calls: list[int] = []

    def flaky(_req):
        calls.append(1)
        if len(calls) == 1:
            raise _dns_error()
        return _fresh(1_000)

    monkeypatch.setattr(health_check, "_open", flaky)

    age = health_check.kv_age_ms("mon:last_sweep")

    assert len(calls) == 2, "the blip must be replayed exactly once"
    assert age is not None, "a transient DNS failure must not fail the probe"
    assert age == pytest.approx(1_000, abs=2_000)


def test_connect_timeout_shape_is_also_retried(monkeypatch, no_delay):
    """``ETIMEDOUT`` in the connect phase is the same class of failure."""
    calls: list[int] = []

    def flaky(_req):
        calls.append(1)
        if len(calls) == 1:
            try:
                raise OSError(60, "Operation timed out")
            except OSError as exc:  # urllib wraps it exactly this way
                raise urllib.error.URLError(exc) from exc
        return _fresh(0)

    monkeypatch.setattr(health_check, "_open", flaky)

    assert health_check.kv_age_ms("cron:last_tick") is not None
    assert len(calls) == 2


def test_exhausted_retries_still_return_none(monkeypatch, no_delay):
    """A real outage must not turn into a silent pass."""
    calls: list[int] = []

    def always_down(_req):
        calls.append(1)
        raise _dns_error()

    monkeypatch.setattr(health_check, "_open", always_down)

    assert health_check.kv_age_ms("mon:last_sweep") is None
    assert len(calls) == health_check.KV_RETRY_ATTEMPTS


# --- 2. a server answer is never retried ------------------------------------


@pytest.mark.parametrize("status", [401, 403, 404, 500, 503])
def test_http_status_is_not_retried(monkeypatch, status):
    calls: list[int] = []

    def denied(_req):
        calls.append(1)
        raise urllib.error.HTTPError(
            "https://platform.test/kv/get", status, "server said no", {}, None
        )

    monkeypatch.setattr(health_check, "_open", denied)

    assert health_check.kv_age_ms("cron:last_tick") is None
    assert len(calls) == 1, "an HTTP status is a real answer — do not mask it"


def test_http_error_is_not_classified_as_connect_phase():
    err = urllib.error.HTTPError(
        "https://platform.test/kv/get", 401, "Unauthorized", {}, None
    )
    assert is_connect_phase_error(err) is False


# --- 3. a fresh response carrying an old value is still stale ---------------


def test_old_but_valid_value_still_reads_as_stale(monkeypatch):
    calls: list[int] = []

    def ok(_req):
        calls.append(1)
        return _fresh(30 * 3_600_000)  # 30h — past the 26h budget

    monkeypatch.setattr(health_check, "_open", ok)

    age = health_check.kv_age_ms("mon:last_sweep")

    assert len(calls) == 1, "a successful read must never be retried"
    assert age is not None
    assert age > health_check.KV_WATCH["mon-sweep"][1], (
        "genuine staleness must still fail the check"
    )


def test_kv_watch_loop_still_fails_closed_on_unreadable_breadcrumb():
    """The retry must not soften ``age is None -> failed``."""
    src = inspect.getsource(health_check.main)
    assert "age is not None and age < budget" in src
