"""Durable, self-rotating file logging for the local fleet.

launchd redirects the fleet's stdout+stderr to ``/tmp/lazynext-fleet.log``
(``StandardOutPath``/``StandardErrorPath``) and **recreates that file at every
job start** — measured: the file's birth time equals the fleet boot time
(birth ``Nov 10 06:07:01`` for a process started ``06:06:40``). A crash
therefore erased its own forensics: the file's first line was the new boot's
first line, so the pre-crash cause was unrecoverable.

A bash wrapper is deliberately NOT used: launchd-spawned bash has no Desktop
TCC grant and dies with exit 126 (AGENTS.md). Everything here is plain Python.

``configure_logging()`` — called once, early, from a process entry point
(``scripts/run_agents.py``; the health check / CLI can adopt it later) —
installs structlog's stdlib integration plus two handlers on the root logger:

* a ``StreamHandler(stdout)`` preserving the console format logged today
  (timestamp ``[level]`` event key=value, colors per tty), still captured by
  launchd exactly as before; and
* a ``RotatingFileHandler`` on the stable path (``/tmp/lazynext-fleet.log``,
  referenced by other tooling and the operating ledger) opened with
  ``mode="a"`` so it appends rather than truncates, with a size cap of
  ``MAX_FILE_BYTES`` x ``BACKUP_COUNT`` backups so it cannot grow unbounded
  on a machine that runs for weeks. Backups (``.1``..``.N``) live on paths
  launchd never touches, so a rotated segment — including the preceding run's
  tail — survives a restart.

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

# Path the fleet logs to; launchd's StandardOutPath/StandardErrorPath for the
# fleet job points here too. Other tooling and the operating ledger reference
# this exact path, so the Python handler must keep writing to the same file.
FLEET_LOG_PATH = "/tmp/lazynext-fleet.log"

# Rotation policy: 20 MB per segment, 4 backups (lazynext-fleet.log.1..4),
# so the directory stays bounded at ~100 MB even for a worker that runs for
# weeks. Backups sit on paths launchd never touches, so the preceding run's
# older segments survive a restart.
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
    path: str | os.PathLike[str] = FLEET_LOG_PATH,
    *,
    level: int | str = logging.INFO,
    max_bytes: int = MAX_FILE_BYTES,
    backup_count: int = BACKUP_COUNT,
    console: bool = True,
) -> logging.Handler | None:
    """Install structlog's stdlib integration plus console and file handlers.

    Call once, early, in a process entry point (``scripts/run_agents.py``).
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