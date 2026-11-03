"""Schema contract for migration 013: per-campaign consent basis.

The marketing footer's "why are you receiving this" line must match how the
audience was acquired, so the basis is a campaign column, not copy. SQLite has
no ADD COLUMN IF NOT EXISTS, so this file (and the shared applier) pins that a
re-run is a duplicate-column no-op while the column itself defaults to the
opt-in sentence every existing campaign already sends.
"""

from __future__ import annotations

import sqlite3

from tests.unit.migration_helpers import apply_all_migrations


def _schema(conn: sqlite3.Connection) -> sqlite3.Connection:
    apply_all_migrations(conn)
    return conn


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def test_migration_013_adds_consent_basis_and_survives_a_re_run() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    assert "consent_basis" in _columns(conn, "email_campaigns")
    # worker-migrate re-runs every file: the additive column is a no-op there.
    apply_all_migrations(conn)
    assert "consent_basis" in _columns(conn, "email_campaigns")


def test_existing_campaigns_default_to_opt_in() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute(
        "INSERT INTO email_campaigns (name, subject, html) VALUES ('legacy', 's', '<p>x</p>')"
    )
    row = conn.execute(
        "SELECT consent_basis FROM email_campaigns WHERE name = 'legacy'"
    ).fetchone()
    assert row[0] == "opt_in"
