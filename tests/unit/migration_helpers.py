"""Shared migration applier for the schema-contract tests.

`worker-migrate` applies every file in `db/migrations/` on every run, so each
file must be re-runnable. SQLite has no `ADD COLUMN IF NOT EXISTS` (it is a
parse error — verified), so the one thing a `.sql` file cannot express
idempotently is an additive column: re-running it raises
`duplicate column name`, which changes no schema state.

Migration 013 (`email_campaigns.consent_basis`) is exactly that case. Its
guard is the worker's `ensureCampaignConsentColumn()` PRAGMA-table_info
self-heal in `worker/src/services.ts`, so a deploy never depends on the file
being re-applied. This helper tolerates *only* the duplicate-column no-op and
re-raises every other operational error, so a genuinely broken migration still
fails the schema-contract tests.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "db" / "migrations"

_DUPLICATE_COLUMN = "duplicate column name"


def apply_all_migrations(conn: sqlite3.Connection) -> None:
    for path in sorted(MIGRATIONS.glob("*.sql")):
        try:
            conn.executescript(path.read_text())
        except sqlite3.OperationalError as exc:
            if _DUPLICATE_COLUMN not in str(exc).lower():
                raise
            # Additive column already present: a no-op, not a failure.
