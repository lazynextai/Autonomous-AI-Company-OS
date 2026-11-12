"""Regression: the fleet's durable log must survive a FRESH launchd start.

Measured 2026-11-12: after a fresh launchd start at 04:33:30 IST the fleet's log
file began at 04:34:37 — the 04:20 boot records (pid 62697) and the whole prior
day were gone, with no ``.1`` backup. Cause: launchd opens its
``StandardOutPath`` (``/tmp/lazynext-fleet.log``) itself, *before* exec, and on a
fresh job start it truncates/recreates that file. A Python handler appending to
the same path therefore appends to an empty file, and the process's own handler
is opened after the damage is done.

The earlier planted-marker test could not catch this: it exercised a **KeepAlive
respawn** (launchd keeps the append position) and never a fresh start.

These tests assert the architecture, not an implementation detail:

* the durable record is an app-owned path DISTINCT from launchd's stdio path;
* a KeepAlive-style restart keeps history (the old, benign case);
* a fresh-start truncation of launchd's file (simulated exactly the way launchd
  does it: recreate the file empty *before* the app opens anything) leaves the
  durable record and its earlier lines intact.

Against the pre-fix implementation — one Python handler on
``/tmp/lazynext-fleet.log``, no separate app path — the fresh-start test fails:
the truncation erased the earlier lines, because the app and launchd shared one
file.
"""

import logging
from pathlib import Path

import pytest
import structlog

from core import logging_setup
from core.logging_setup import configure_logging

REPO_ROOT = Path(__file__).resolve().parents[2]


def _simulate_fresh_process() -> None:
    """Tear down our handlers and registry — like a new process boot."""
    root = logging.getLogger()
    for h in list(root.handlers):
        if h.get_name() in (
            logging_setup._CONSOLE_HANDLER_NAME,
            logging_setup._FILE_HANDLER_NAME,
        ):
            root.removeHandler(h)
            h.close()
    logging_setup._ATTACHED_FILE_HANDLERS.clear()


@pytest.fixture(scope="module", autouse=True)
def _restore_logging_state():
    """Leave the logging/structlog environment as this suite found it."""
    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    yield
    root.handlers = saved_handlers
    structlog.reset_defaults()
    logging_setup._ATTACHED_FILE_HANDLERS.clear()


@pytest.fixture()
def log_paths(tmp_path, monkeypatch):
    """Point both shipped paths at the tmp dir, keeping them distinct.

    The relationship under test is preserved (two different files), so the
    assertions exercise the same configuration production uses without ever
    touching the live ``/tmp/lazynext-fleet.log`` or ``~/.lazynext/logs``.
    """
    stdio_path = tmp_path / "launchd-stdio.log"
    app_path = tmp_path / "app-owned" / "fleet.log"
    monkeypatch.setattr(logging_setup, "FLEET_STDIO_LOG_PATH", str(stdio_path))
    monkeypatch.setattr(logging_setup, "FLEET_APP_LOG_PATH", str(app_path))
    _simulate_fresh_process()
    yield stdio_path, app_path
    _simulate_fresh_process()


def test_durable_path_is_distinct_from_launchd_stdio_path():
    """The durable record must not be the file launchd truncates.

    This is the architectural invariant the fix rests on. Pre-fix there was a
    single ``FLEET_LOG_PATH`` serving both roles, so this fails on the old code
    (``FLEET_APP_LOG_PATH`` did not exist at all).
    """
    stdio = Path(logging_setup.FLEET_STDIO_LOG_PATH)
    app = Path(logging_setup.FLEET_APP_LOG_PATH)

    assert stdio != app, (
        "durable log path must differ from launchd's StandardOutPath; "
        "launchd truncates the file it opens on every fresh job start"
    )
    assert Path(stdio).resolve() != Path(app).resolve()


def test_default_configure_logging_targets_the_app_owned_path(log_paths):
    """``configure_logging()`` with no argument must open the durable path."""
    stdio_path, app_path = log_paths

    handler = configure_logging()

    assert handler is not None
    assert Path(handler.baseFilename).resolve() == Path(app_path).resolve()
    assert app_path.exists()
    assert not stdio_path.exists(), (
        "the Python handler must not own launchd's stdio path — writing it "
        "twice would duplicate lines, and it is not durable anyway"
    )


def test_keepalive_respawn_preserves_history(log_paths):
    """Case (a): a respawn keeps the file — history must survive."""
    _, app_path = log_paths

    configure_logging()
    logging.getLogger("respawn.test").info("pre-respawn-marker")

    # KeepAlive respawn: launchd leaves the file (and its append position)
    # alone; only Python's process state is fresh.
    _simulate_fresh_process()
    configure_logging()
    logging.getLogger("respawn.test").info("post-respawn-marker")

    text = app_path.read_text()
    assert text.count("pre-respawn-marker") == 1
    assert text.count("post-respawn-marker") == 1
    assert text.index("pre-respawn-marker") < text.index("post-respawn-marker")


def test_fresh_launchd_start_truncation_cannot_erase_durable_history(log_paths):
    """Case (b): launchd recreates its file before exec — durable record survives.

    This is the 2026-11-12 failure, reproduced. Pre-fix the app appended to the
    same path launchd had just truncated, so ``pre-restart-marker`` was gone and
    the fleet's own boot evidence died with it.
    """
    stdio_path, app_path = log_paths

    configure_logging()
    logging.getLogger("fresh.test").info("pre-restart-marker")
    assert "pre-restart-marker" in app_path.read_text()

    # What launchd does on a fresh job start, BEFORE exec: reopen the
    # StandardOutPath truncated (here: recreated empty, then the new boot's
    # stdio bytes would land in it).
    stdio_path.write_text("launchd-boot-banner-line\n")

    _simulate_fresh_process()
    configure_logging()
    logging.getLogger("fresh.test").info("post-restart-marker")

    durable = app_path.read_text()
    assert "pre-restart-marker" in durable, (
        "durable log lost pre-restart history — the app-owned path must be "
        "outside every file launchd opens"
    )
    assert "post-restart-marker" in durable
    assert durable.index("pre-restart-marker") < durable.index("post-restart-marker")

    # The launchd file is a live tail only: the durable marker never had to
    # reach it, and its truncation is harmless.
    assert "pre-restart-marker" not in stdio_path.read_text()
    assert "launchd-boot-banner-line" in stdio_path.read_text()


def test_fleet_entrypoint_uses_the_app_owned_path():
    """``scripts/run_agents.py`` must opt into the durable path explicitly."""
    source = (REPO_ROOT / "scripts" / "run_agents.py").read_text()

    assert "configure_logging(" in source
    assert "path=FLEET_APP_LOG_PATH" in source, (
        "the fleet entrypoint must configure the app-owned durable log, not "
        "lean on launchd's truncated stdio file"
    )
