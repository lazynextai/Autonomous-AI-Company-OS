"""Schema contract for roadmap P1: CRM evidence provenance + outbound breakers.

Both features are additive — migration 010 must apply cleanly on top of the
existing 001..009 chain, be safe to re-run (the deploy path runs every file in
`db/migrations/` each time), and keep the shipped code's self-heal DDL in sync
with the file. The worker's `ensureEvidenceSchema` / `ensureBreakerSchema`
exist only for a deploy that lands before the migration; if the two drift, a
fresh D1 gets a different table shape than a migrated one.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "db" / "migrations"
WORKER_SRC = ROOT / "worker" / "src"


def _apply_all(conn: sqlite3.Connection) -> None:
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.executescript(path.read_text())


def _schema(conn: sqlite3.Connection) -> sqlite3.Connection:
    _apply_all(conn)
    return conn


def test_migration_010_is_idempotent() -> None:
    conn = sqlite3.connect(":memory:")
    _schema(conn)
    # make worker-migrate re-runs a no-op, not an error
    _apply_all(conn)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    assert {"crm_lead_evidence", "outbound_breaker_config"} <= tables


def test_evidence_table_carries_every_provenance_field() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    cols = {
        row[1]: row[2]
        for row in conn.execute("PRAGMA table_info(crm_lead_evidence)")
    }
    for required in (
        "lead_id",
        "claim",
        "source_url",
        "fetched_at",
        "evidence_excerpt",
        "evidence_hash",
        "verification_method",
        "confidence",
        "provider",
        "disposition",
    ):
        assert required in cols, f"missing provenance column {required}"


def test_disposition_and_method_are_constrained() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO crm_leads (name) VALUES ('Acme')")
    conn.execute(
        "INSERT INTO crm_lead_evidence (lead_id, claim, verification_method, confidence, disposition)"
        " VALUES (1, 'ok', 'exact', 1.0, 'verified')"
    )
    for bad_method in ("trust-me", "EXACT", ""):
        try:
            conn.execute(
                "INSERT INTO crm_lead_evidence (lead_id, claim, verification_method)"
                " VALUES (1, 'bad', ?)",
                (bad_method,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover - the CHECK must reject it
            raise AssertionError(f"verification_method accepted {bad_method!r}")
    for bad_disposition in ("certain", "probably"):
        try:
            conn.execute(
                "INSERT INTO crm_lead_evidence (lead_id, claim, disposition)"
                " VALUES (1, 'bad', ?)",
                (bad_disposition,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"disposition accepted {bad_disposition!r}")


def test_confidence_is_bounded_by_the_schema() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO crm_leads (name) VALUES ('Acme')")
    for bad in (1.4, -0.1):
        try:
            conn.execute(
                "INSERT INTO crm_lead_evidence (lead_id, claim, confidence) VALUES (1, 'c', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"confidence accepted {bad}")


def test_breaker_config_is_a_single_seeded_row() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    _apply_all(conn)  # second pass must not duplicate the row
    assert conn.execute("SELECT COUNT(*) FROM outbound_breaker_config").fetchone()[0] == 1
    row = conn.execute(
        "SELECT volume_limit, volume_window_ms, failure_limit, error_rate_limit,"
        " deliverability_limit, deliverability_window_ms, enabled"
        " FROM outbound_breaker_config WHERE id = 1"
    ).fetchone()
    assert row == (100, 3_600_000, 5, 0.5, 0.2, 86_400_000, 1)


def _columns_in_worker_ddl(source: str, table: str) -> set[str]:
    block = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\n\s*\)", source, re.S
    )
    assert block, f"{table} DDL not found in worker source"
    return {
        line.strip().split()[0]
        for line in block.group(1).splitlines()
        if line.strip() and not line.strip().startswith("--")
    }


def test_worker_self_heal_ddl_matches_the_migration() -> None:
    evidence = (WORKER_SRC / "evidence.ts").read_text()
    breakers = (WORKER_SRC / "breakers.ts").read_text()

    conn = _schema(sqlite3.connect(":memory:"))
    for table, source in (
        ("crm_lead_evidence", evidence),
        ("outbound_breaker_config", breakers),
    ):
        migrated = {
            row[1] for row in conn.execute(f"PRAGMA table_info({table})")
        }
        inline = _columns_in_worker_ddl(source, table)
        assert inline == migrated, (
            f"{table}: worker self-heal DDL drifted from db/migrations "
            f"(only in worker: {inline - migrated}; only in migration: {migrated - inline})"
        )
