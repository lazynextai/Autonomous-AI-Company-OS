"""Penpot self-heal in scripts/health_check.py.

Covers the four promises of the recovery: (1) opt-in by default with a
PENPOT_AUTORECOVER=0 kill switch, (2) a 30-minute cooldown that also fires
after a crash mid-recovery, (3) two consecutive failed recoveries back off
for hours instead of looping, (4) every failure mode returns False so the
normal FAILED alert path runs unchanged, and no recovery exception escapes.
"""
import json
import time
from pathlib import Path

import pytest

from scripts import health_check


@pytest.fixture
def state_path(tmp_path: Path) -> Path:
    return tmp_path / "penpot-recover.json"


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.delenv("PENPOT_AUTORECOVER", raising=False)


def test_enabled_by_default(monkeypatch):
    monkeypatch.delenv("PENPOT_AUTORECOVER", raising=False)
    assert health_check._penpot_recover_enabled() is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "NO", "FaLsE"])
def test_disable_values(monkeypatch, value):
    monkeypatch.setenv("PENPOT_AUTORECOVER", value)
    assert health_check._penpot_recover_enabled() is False


def test_disabled_returns_false_without_side_effects(monkeypatch, state_path):
    monkeypatch.setenv("PENPOT_AUTORECOVER", "0")
    calls = []
    monkeypatch.setattr(
        health_check, "_resolve_binary", lambda name: calls.append(name) or "/usr/local/bin/docker"
    )
    assert health_check.recover_penpot(state_path=state_path) is False
    assert calls == []
    assert not state_path.exists()


def test_missing_docker_binary_returns_false(monkeypatch, state_path):
    monkeypatch.setattr(health_check, "_resolve_binary", lambda name: None)
    assert health_check.recover_penpot(state_path=state_path) is False
    assert not state_path.exists()


def test_cooldown_skips_without_resolving_docker(monkeypatch, state_path):
    state_path.write_text(json.dumps({"last_attempt": time.time(), "consecutive_failures": 0}))
    calls = []
    monkeypatch.setattr(
        health_check, "_resolve_binary", lambda name: calls.append(name) or "/usr/local/bin/docker"
    )
    assert health_check.recover_penpot(state_path=state_path) is False
    assert calls == []


def test_backoff_after_two_failures(monkeypatch, state_path):
    state_path.write_text(
        json.dumps({"last_attempt": time.time() - 60, "consecutive_failures": 2})
    )
    calls = []
    monkeypatch.setattr(
        health_check, "_resolve_binary", lambda name: calls.append(name) or "/usr/local/bin/docker"
    )
    assert health_check.recover_penpot(state_path=state_path) is False
    assert calls == []


def test_launches_docker_then_recovers(monkeypatch, state_path):
    """Daemon down -> open -a Docker -> daemon comes up -> site answers."""
    launched = []
    monkeypatch.setattr(health_check, "_resolve_binary", lambda name: "/usr/local/bin/docker")

    def fake_run(cmd, timeout, cwd=None):
        if cmd[:2] == ["/usr/bin/open", "-a"]:
            launched.append(cmd)
            return (0, "")
        return (1, "daemon down")

    monkeypatch.setattr(health_check, "_run", fake_run)
    monkeypatch.setattr(health_check, "_docker_up", lambda: False)
    monkeypatch.setattr(health_check, "_poll", lambda pred, _t, _i: True)
    monkeypatch.setattr(health_check, "check", lambda url: True)

    assert health_check.recover_penpot(state_path=state_path, cooldown_s=0) is True
    assert launched == [["/usr/bin/open", "-a", "Docker"]]
    state = json.loads(state_path.read_text())
    assert state["consecutive_failures"] == 0
    assert state["last_success"]
    assert state["last_attempt"]


def test_daemon_up_but_site_down_runs_compose_then_records_failure(monkeypatch, state_path, tmp_path):
    """Daemon healthy, site still down: compose up -d, poll again, then fail."""
    compose_dir = tmp_path / "penpot"
    compose_dir.mkdir()
    monkeypatch.setattr(health_check, "PENPOT_COMPOSE_DIR", compose_dir)
    monkeypatch.setattr(health_check, "_resolve_binary", lambda name: "/usr/local/bin/docker")
    calls = []
    monkeypatch.setattr(health_check, "_run", lambda cmd, timeout, cwd=None: calls.append(cmd) or (0, ""))
    monkeypatch.setattr(health_check, "_docker_up", lambda: True)
    monkeypatch.setattr(health_check, "_poll", lambda pred, _t, _i: pred() and False)
    monkeypatch.setattr(health_check, "check", lambda url: False)

    assert health_check.recover_penpot(state_path=state_path, cooldown_s=0) is False
    assert calls[-1][1:] == ["compose", "up", "-d"]
    state = json.loads(state_path.read_text())
    assert state["consecutive_failures"] == 1


def test_success_resets_consecutive_failures(monkeypatch, state_path):
    # 7 h ago clears the 6 h post-failure backoff, so the attempt is allowed.
    state_path.write_text(
        json.dumps({"last_attempt": time.time() - 7 * 3600, "consecutive_failures": 2})
    )
    monkeypatch.setattr(health_check, "_resolve_binary", lambda name: "/usr/local/bin/docker")
    monkeypatch.setattr(health_check, "_docker_up", lambda: True)
    monkeypatch.setattr(health_check, "_poll", lambda pred, _t, _i: True)
    monkeypatch.setattr(health_check, "check", lambda url: True)

    assert health_check.recover_penpot(state_path=state_path, cooldown_s=0) is True
    state = json.loads(state_path.read_text())
    assert state["consecutive_failures"] == 0


def test_exception_inside_recovery_returns_false(monkeypatch, state_path):
    monkeypatch.setattr(health_check, "_resolve_binary", lambda name: "/usr/local/bin/docker")

    def boom(*_args, **_kwargs):
        raise RuntimeError("docker exploded")

    monkeypatch.setattr(health_check, "_docker_up", boom)
    assert health_check.recover_penpot(state_path=state_path, cooldown_s=0) is False
    # Cooldown and failure count are still recorded for the crashed attempt.
    state = json.loads(state_path.read_text())
    assert state["consecutive_failures"] >= 1