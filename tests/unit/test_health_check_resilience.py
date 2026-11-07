"""The health checker must survive a network blip and always try to alert.

This is the monitoring system: it runs every 15 min under launchd. If one
flaky check can abort the run *before* the alert block, a DNS outage produces
a monitoring blackout at exactly the moment things are broken — the failure
mode the fleet hit 14 times on 2026-11-07 (see PR #57 / core/resilience.py).

Two properties are pinned here:

1. No individual network check can raise. ``check``/``fetch_body``/
   ``kv_age_ms``/``corpus_size``/``keep_warm`` each return a safe default
   (``False``/``None``) for any exception, DNS failures included
   (``socket.gaierror`` -> ``urllib.error.URLError`` is an ``Exception``).
   A failing check is therefore *a failed check*, not a crash.

2. Nothing before the alert block can abort the run. The one gap that
   remained was the transition state file: a bare ``json.loads`` on a
   corrupt/torn ``.health_state.json`` raised before any alert, and because
   the file was never repaired every later tick crashed identically —
   a permanent blackout from a 268-byte file. ``_load_state``/``_save_state``
   close that path (and make the write atomic, since one tick can run for
   ~15 min — the launchd interval — when Penpot recovery is engaged).
"""

from __future__ import annotations

import asyncio
import inspect
import json
import socket
import urllib.error
from pathlib import Path

import pytest

from scripts import health_check


class _Resp:
    """Minimal context-manager response for ``check``/``fetch_body``."""

    def __init__(self, status: int = 200, body: bytes = b"{}") -> None:
        self.status = status
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def read(self) -> bytes:
        return self._body


def _dns_error() -> urllib.error.URLError:
    """What urllib raises on macOS when DNS cannot resolve a name."""
    return urllib.error.URLError(socket.gaierror(8, "nodename nor servname provided"))


# --- 1. every network check absorbs its own failure -------------------------


@pytest.mark.parametrize(
    "call, default",
    [
        (lambda: health_check.check("https://example.test/health"), False),
        (lambda: health_check.fetch_body("https://example.test/health"), None),
        (lambda: health_check.kv_age_ms("cron:last_tick"), None),
        (lambda: health_check.corpus_size(), None),
    ],
)
def test_network_failure_returns_safe_default_not_raise(monkeypatch, call, default):
    """A DNS failure is reported as a failed probe, never as an exception."""
    monkeypatch.setenv("CLOUDFLARE_API_URL", "https://platform.test")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-token")

    def boom(_req):
        raise _dns_error()

    monkeypatch.setattr(health_check, "_open", boom)
    assert call() is default


def test_keep_warm_absorbs_network_failure(monkeypatch):
    def boom(*_args, **_kwargs):
        raise _dns_error()

    monkeypatch.setattr(health_check.urllib.request, "urlopen", boom)
    assert health_check.keep_warm("https://example.test/") is None


@pytest.mark.parametrize(
    "func_name",
    ["keep_warm", "check", "fetch_body", "kv_age_ms", "corpus_size"],
)
def test_every_network_check_is_individually_guarded(func_name):
    """Source-level pin: the blanket guard cannot be dropped without a red test."""
    src = inspect.getsource(getattr(health_check, func_name))
    assert "except Exception" in src, f"{func_name} lost its catch-all guard"


# --- 2. the transition state can never abort the run ------------------------


@pytest.mark.parametrize(
    "content",
    ["", "{not json", '{"api": tr', "[1, 2, 3]", '"just a string"', "null"],
)
def test_load_state_tolerates_any_bad_state_file(tmp_path: Path, content: str):
    path = tmp_path / "state.json"
    path.write_text(content)
    assert health_check._load_state(path) == {}


def test_load_state_missing_file(tmp_path: Path):
    assert health_check._load_state(tmp_path / "absent.json") == {}


def test_save_state_round_trips_atomically_and_leaves_no_temp(tmp_path: Path):
    path = tmp_path / "state.json"
    state = {"api": True, "dashboard": False}
    health_check._save_state(path, state)
    assert health_check._load_state(path) == state
    assert not path.with_name(path.name + ".tmp").exists()


def test_save_state_failure_is_swallowed(tmp_path: Path):
    """An unwritable path must not turn a completed audit into a crash."""
    health_check._save_state(tmp_path / "missing-dir" / "state.json", {"api": True})


# --- 3. main(): one bad check still reports, still alerts -------------------


@pytest.fixture
def isolated(monkeypatch, tmp_path):
    """Silence the side-effectful collaborators; keep the real check logic."""
    sent = []

    async def fake_send_email(to, subject, body, **_kwargs):
        sent.append({"to": to, "subject": subject, "body": body})
        return True

    async def fake_digest(_argv):
        return 0

    monkeypatch.setattr("core.tools.email_tool.send_email", fake_send_email)
    monkeypatch.setattr("scripts.weekly_digest.main", fake_digest)
    monkeypatch.setattr(health_check, "keep_warm", lambda url: None)
    monkeypatch.setattr(health_check, "STATE_FILE", tmp_path / "state.json")
    monkeypatch.setattr(health_check, "PENPOT_RECOVER_STATE", tmp_path / "penpot.json")
    monkeypatch.setattr(health_check, "recover_penpot", lambda **_kwargs: False)
    monkeypatch.setattr(health_check, "reset_penpot_recover_state", lambda: None)
    monkeypatch.setattr(health_check, "fetch_body", lambda url: b"same")
    monkeypatch.setattr(health_check, "kv_age_ms", lambda key: 0.0)
    monkeypatch.setattr(health_check, "corpus_size", lambda: 5)
    monkeypatch.setenv("CLOUDFLARE_API_URL", "https://platform.test")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-token")
    monkeypatch.setenv("FOUNDER_EMAIL", "support@lazynext.com")
    return sent


def test_dns_failure_in_one_check_does_not_stop_the_others_or_the_alert(
    monkeypatch, isolated
):
    """A single unreachable host costs one failed check, not the whole audit."""
    failing_url = health_check.CHECKS["dashboard"]
    contacted = []

    def fake_open(req):
        contacted.append(req.full_url)
        if req.full_url == failing_url:
            raise _dns_error()
        return _Resp(status=200)

    monkeypatch.setattr(health_check, "_open", fake_open)

    rc = asyncio.run(health_check.main())

    assert rc == 1, "a failed check must still exit non-zero"
    # every check was actually attempted — the DNS failure did not short-circuit
    assert len(contacted) == len(health_check.CHECKS)
    assert len(isolated) == 1, "the FAILED alert must still be attempted"
    alert = isolated[0]
    assert alert["subject"] == "[AI Company] Health check FAILED"
    assert "FAILED checks: dashboard" in alert["body"]
    # sibling checks reported normally rather than vanishing from the results
    results = json.loads(alert["body"].split("All results: ", 1)[1])
    assert results["api"] is True
    assert results["a11y-mirror"] is True
    assert results["dead-corpus"] is True


def test_corrupt_state_file_does_not_abort_before_the_alert(monkeypatch, isolated):
    """The regression this guard exists for: corrupt state -> silent blackout."""
    state_path = health_check.STATE_FILE
    state_path.write_text('{"api": tr')  # torn write from an overlapping tick
    monkeypatch.setattr(health_check, "_open", lambda req: _Resp(status=503))

    rc = asyncio.run(health_check.main())

    assert rc == 1
    assert len(isolated) == 1, "a corrupt state file must not silence the alert"
    assert "FAILED checks:" in isolated[0]["body"]
    # the run repaired the file instead of dying on it every 15 minutes
    assert isinstance(json.loads(state_path.read_text()), dict)


def test_healthy_tick_writes_state_and_stays_silent(monkeypatch, isolated):
    monkeypatch.setattr(health_check, "_open", lambda req: _Resp(status=200))

    rc = asyncio.run(health_check.main())

    assert rc == 0
    assert isolated == [], "no transition -> no mail"
    state = json.loads(health_check.STATE_FILE.read_text())
    assert state["api"] is True and state["penpot"] is True
