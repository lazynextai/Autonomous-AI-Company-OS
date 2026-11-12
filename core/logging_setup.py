"""Durable, self-rotating file logging for the local fleet.

**Two files, two different jobs** (the distinction is the fix for a measured
2026-11-12 durability gap):

* ``/tmp/lazynext-fleet.log`` — launchd's ``StandardOutPath`` /
  ``StandardErrorPath`` for the fleet job. It is a **live tail only and NOT
  durable**. launchd opens this file *itself* before it execs Python, and on a
  **fresh job start** (login, ``launchctl bootstrap``, machine boot, or any
  start where the job is not already running) it truncates/recreates it — so
  every line the previous process wrote through stdio is destroyed before this
  module runs. A KeepAlive *respawn* happens to preserve the append position,
  which is why the earlier planted-marker test passed while the defect shipped:
  it exercised the benign restart path and never a fresh start. Measured
  2026-11-12: after a fresh start at 04:33:30 IST the file's earliest surviving
  line was 04:34:37, and the 04:20 boot records from pid 62697 plus all of the
  previous day were gone, with no ``.1`` backup.

* ``~/.lazynext/logs/fleet.log`` (``FLEET_APP_LOG_PATH``) — the **durable
  record**. Python owns this path end to end; launchd never opens it, so no
  external truncation can reach it. A ``RotatingFileHandler`` opened with
  ``mode="a"`` appends across restarts, and its backups (``.1``..``.N``) are
  also paths launchd never touches. Size cap is ``MAX_FILE_BYTES`` x
  ``BACKUP_COUNT`` (20 MB x 4 ≈ 100 MB) so it stays bounded on a machine that
  runs for weeks.

**Operational reading rule:** the durable record to consult for history/forensics
is ``FLEET_APP_LOG_PATH``; ``tail -f /tmp/lazynext-fleet.log`` is still the live
feed and an empty launchd file after a fresh start is expected, not data loss.
Console/stdio output is deliberately unchanged — local ``make``-style runs and
the live launchd tail behave exactly as before. This is additive file logging,
never a replacement.

A bash wrapper is deliberately NOT used: launchd-spawned bash has no Desktop
TCC grant and dies with exit 126 (AGENTS.md). Everything here is plain Python.

``configure_logging()`` — called once, early, from a process entry point
(``scripts/run_agents.py``; the health check / CLI can adopt it later) —
installs structlog's stdlib integration plus two handlers on the root logger:

* a ``StreamHandler(stdout)`` preserving the console format logged today
  (timestamp ``[level]`` event key=value, colors per tty), still captured by
  launchd exactly as before; and
* a ``RotatingFileHandler`` on the app-owned path (``FLEET_APP_LOG_PATH``),
  opened with ``mode="a"`` so it appends rather than truncates.

Both handlers share one ``structlog.stdlib.ProcessorFormatter``, so structlog
records **and** plain stdlib ``logging`` records (third-party libraries,
``warnings``) land in the same file.

Fail-safe: if the file cannot be opened (permissions, full disk), log a
warning and continue console-only — logging setup must never prevent the
fleet from starting (same discipline as the health check).
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys

import structlog

# launchd's StandardOutPath/StandardErrorPath for com.lazynext.fleet. LIVE TAIL
# ONLY — launchd opens it before exec and truncates/recreates it on a fresh job
# start, so it must never be treated as the durable record.
FLEET_STDIO_LOG_PATH = "/tmp/lazynext-fleet.log"

# The durable record. App-owned (~/.lazynext/logs is never opened by launchd),
# so it survives fresh launchd starts, KeepAlive respawns, and reboots (unlike
# /tmp, which macOS periodically clears). Override with LAZYNEXT_FLEET_APP_LOG
# for tests or a relocated deployment.
FLEET_APP_LOG_PATH = os.environ.get("LAZYNEXT_FLEET_APP_LOG") or os.path.join(
    os.path.expanduser("~"), ".lazynext", "logs", "fleet.log"
)

# Rotation policy: 20 MB per segment, 4 backups (fleet.log.1..4), so the
# directory stays bounded at ~100 MB even for a worker that runs for weeks.
# Backups sit on paths launchd never touches, so the preceding run's older
# segments survive a restart.
MAX_FILE_BYTES = 20 * 1024 * 1024
BACKUP_COUNT = 4

_CONSOLE_HANDLER_NAME = "lazynext-fleet-console"
_FILE_HANDLER_NAME = "lazynext-fleet-file"

# Path -> handler registry for idempotency within one process. A fresh process
# has an empty registry; two successive ``configure_logging`` calls with the
# same path return the same handler instead of stacking duplicates.
_ATTACHED_FILE_HANDLERS: dict[str, logging.Handler] = {}


def _resolve_level(level: int | str) -> int:
    if isinstance(level, str):
        return getattr(logging, level.upper(), logging.INFO)
    return int(level)


def configure_logging(
    path: str | os.PathLike[str] | None = None,
    *,
    level: int | str = logging.INFO,
    max_bytes: int = MAX_FILE_BYTES,
    backup_count: int = BACKUP_COUNT,
    console: bool = True,
) -> logging.Handler | None:
    """Install structlog's stdlib integration plus console and file handlers.

    Call once, early, in a process entry point (``scripts/run_agents.py``).
    ``path`` defaults to ``FLEET_APP_LOG_PATH`` — the app-owned durable record.
    It must NOT default to launchd's ``StandardOutPath``: that file is opened
    and truncated by launchd *before* exec on a fresh job start, so appending
    to it cannot preserve history. Pass an explicit path only in tests.
    Idempotent per ``path``: a second call with the same path returns the
    already-attached file handler instead of stacking a duplicate.

    The console handler preserves today's default rendering (timestamp,
    ``[level]``, event, key=value; colors when stdout is a tty). The file
    handler appends to ``path`` (``mode="a"`` — never truncates what exists)
    and rotates at ``max_bytes`` keeping ``backup_count`` backups.

    Fail-safe: an inability to open the file (missing parent, permissions,
    full disk) is logged as a warning through the console chain and this
    returns ``None`` — it never raises, so logging setup can never prevent
    the fleet from starting.

    Returns the attached file handler, or ``None`` when the file path could
    not be used and only the console chain is active.
    """
    root = logging.getLogger()
    root.setLevel(_resolve_level(level))
    if path is None:
        # Resolved at call time (not as a default argument) so monkeypatching
        # FLEET_APP_LOG_PATH and an env override both take effect, and so a
        # future ops move needs no signature change.
        path = FLEET_APP_LOG_PATH

    shared_foreign_chain = [
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
    ]

    # Stdlib integration: structlog loggers become thin wrappers over stdlib
    # loggers, so every record flows through the root handlers below — both
    # structlog and plain stdlib records end up in the same file.
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    if console and not any(
        h.get_name() == _CONSOLE_HANDLER_NAME for h in root.handlers
    ):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.set_name(_CONSOLE_HANDLER_NAME)
        console_handler.setFormatter(
            structlog.stdlib.ProcessorFormatter(
                processor=structlog.dev.ConsoleRenderer(),
                foreign_pre_chain=list(shared_foreign_chain),
            )
        )
        root.addHandler(console_handler)

    norm_path = os.fspath(path)
    key = os.path.realpath(norm_path)
    if key in _ATTACHED_FILE_HANDLERS:
        return _ATTACHED_FILE_HANDLERS[key]

    file_handler = None
    try:
        parent = os.path.dirname(norm_path) or "."
        os.makedirs(parent, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            norm_path,
            mode="a",
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.set_name(_FILE_HANDLER_NAME)
        file_handler.setFormatter(
            structlog.stdlib.ProcessorFormatter(
                processor=structlog.processors.JSONRenderer(ensure_ascii=False),
                foreign_pre_chain=list(shared_foreign_chain),
            )
        )
    except OSError as e:
        # Fail-safe: never let logging setup take the fleet down with it.
        logging.getLogger(__name__).warning(
            "file_logging_unavailable: path=%s error=%s note=%s",
            norm_path,
            f"{type(e).__name__}: {e}",
            "continuing with console logging only; "
            "file logging must never stop the fleet",
        )
        return None

    root.addHandler(file_handler)
    _ATTACHED_FILE_HANDLERS[key] = file_handler
    return file_handler