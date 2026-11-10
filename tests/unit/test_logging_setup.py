"""Tests for core.logging_setup — durable fleet log file + fail-safe behaviour.

These tests call configure_logging() with tmp_path locations, so they never
touch the live /tmp/lazynext-fleet.log. structlog's configuration is global,
so a module-scoped fixture snapshots the root handlers and structlog state
before this module and restores them (structlog.reset_defaults) after, leaving
the environment byte-identical for the rest of the suite.
"""

import json
import logging

import pytest
import structlog

from core import logging_setup
from core.logging_setup import configure_logging


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


def test_configure_logging_creates_file_and_appends_across_calls(tmp_path):
    log_path = tmp_path / "fleet.log"
    handler = configure_logging(log_path)
    assert handler is not None
    assert log_path.exists()  # creates the file immediately

    logging.getLogger("append.test").info("first-run-line")

    # Same-process second call: idempotent — same handler, no truncation,
    # no duplicate handler stacking (each line appears exactly once).
    handler_again = configure_logging(log_path)
    assert handler_again is handler
    logging.getLogger("append.test").info("second-run-line-same-process")

    text = log_path.read_text()
    assert text.count("first-run-line") == 1
    assert text.count("second-run-line-same-process") == 1
    assert text.index("first-run-line") < text.index("second-run-line-same-process")

    # True restart proxy: a fresh handler instance opening the same file must
    # append (mode="a"), never truncate the previous run's lines.
    _simulate_fresh_process()
    configure_logging(log_path)
    logging.getLogger("append.test").info("third-run-line-after-restart")

    text = log_path.read_text()
    for line in (
        "first-run-line",
        "second-run-line-same-process",
        "third-run-line-after-restart",
    ):
        assert line in text, f"lost line after restart: {line}"
    assert text.index("second-run-line-same-process") < text.index(
        "third-run-line-after-restart"
    )


def test_rotation_produces_backup_with_earlier_lines(tmp_path):
    log_path = tmp_path / "fleet.log"
    configure_logging(log_path, max_bytes=1024, backup_count=4)
    log = structlog.get_logger("rotation.test")

    for i in range(60):
        log.info(f"seq-{i:03d}", i=i, pad="y" * 400)

    base_text = log_path.read_text()
    backups = sorted(tmp_path.glob("fleet.log.*"))

    # The newest lines survive in the base file.
    assert "seq-059" in base_text

    # Rotation happened and is bounded: at most backup_count backups.
    assert backups, "expected at least one rotated backup file"
    assert len(backups) <= 4

    # A line written earlier than the newest is preserved in a backup —
    # exactly the "previous run's tail must still be readable somewhere"
    # guarantee for a restart.
    rotated = "\n".join(b.read_text() for b in backups)
    assert "seq-057" in rotated

    # Bounded, not unbounded: the oldest lines were rolled off.
    total_lines = sum(len(b.read_text().splitlines()) for b in backups) + len(
        base_text.splitlines()
    )
    assert total_lines < 60


def test_unwritable_path_does_not_raise(tmp_path):
    # Simulate an unwritable location deterministically: a path whose parent
    # is a regular file — os.makedirs / open must fail with an OSError.
    occupied = tmp_path / "occupied"
    occupied.write_text("x")
    bad_path = occupied / "fleet.log"

    handler = configure_logging(bad_path)
    assert handler is None  # fail-safe: console-only, no file

    # The process keeps running and logging does not raise.
    logging.getLogger("fail_safe").warning("still-alive")
    structlog.get_logger("fail_safe.structlog").info("still-alive-structlog")
    assert not bad_path.exists() and not (tmp_path / "fleet.log").exists()


def test_structlog_and_stdlib_records_share_the_file(tmp_path):
    log_path = tmp_path / "shared.log"
    configure_logging(log_path)

    structlog.get_logger("shared.structlog").info("structlog_ok", k=1)
    logging.getLogger("shared.stdlib").info("stdlib_ok")

    lines = log_path.read_text().splitlines()
    assert lines, "expected at least one record in the file"

    # Every line is well-formed JSON (one record per line).
    parsed = [json.loads(line) for line in lines]
    events = {p["event"]: p for p in parsed}

    assert "structlog_ok" in events
    assert events["structlog_ok"]["k"] == 1  # structured keys survive
    assert "stdlib_ok" in events