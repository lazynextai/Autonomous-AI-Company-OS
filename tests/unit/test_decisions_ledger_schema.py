"""Schema contract for roadmap P1/P2: decision packages + outcome ledger.

Migration 011 is additive and must apply cleanly on top of 001..010, be safe to
re-run (the deploy path runs every file in `db/migrations/` each time), and keep
the shipped self-heal DDL in `worker/src/decisions.ts` / `worker/src/ledger.ts`
in sync with the file — otherwise a fresh D1 that self-heals before the
migration gets a different table shape than a migrated one.
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


def _columns(conn: sqlite3.Connection, table: str) -> dict[str, str]:
    return {row[1]: row[2] for row in conn.execute(f"PRAGMA table_info({table})")}


def _columns_in_worker_ddl(source: str, table: str) -> set[str]:
    block = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\n\s*\)`", source, re.S)
    assert block, f"{table} DDL not found in worker source"
    cols = set()
    for line in block.group(1).splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        cols.add(stripped.split()[0])
    return cols


# --- migration 011 ---------------------------------------------------------
def test_migration_011_is_idempotent() -> None:
    conn = sqlite3.connect(":memory:")
    _schema(conn)
    _apply_all(conn)  # worker-migrate re-runs must be a no-op, not an error
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"decision_packages", "outcome_ledger"} <= tables


def test_decision_packages_carries_the_whole_governance_record() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    cols = _columns(conn, "decision_packages")
    for required in (
        "title",
        "objective",
        "proposed_action",
        "authority",
        "evidence",
        "cost_projection_cents",
        "target",
        "expiry_at",
        "decided_by",
        "outcome",
        "rollback",
        "executed_task_id",
        "voided_reason",
    ):
        assert required in cols, f"missing governance column {required}"
    assert cols["evidence"] == "TEXT"
    assert cols["cost_projection_cents"] == "INTEGER"


def test_authority_and_outcome_are_constrained() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute(
        "INSERT INTO decision_packages (title, proposed_action, authority) VALUES ('t', 'a', 'approval')"
    )
    for bad in ("trust-me", "AUTO", ""):
        try:
            conn.execute(
                "INSERT INTO decision_packages (title, proposed_action, authority) VALUES ('t', 'a', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover - the CHECK must reject it
            raise AssertionError(f"authority accepted {bad!r}")

    for bad in ("pending", "done", "APPROVED"):
        try:
            conn.execute(
                "INSERT INTO decision_packages (title, proposed_action, outcome) VALUES ('t', 'a', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"outcome accepted {bad!r}")


def test_outcome_defaults_to_draft_and_cost_cannot_go_negative() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO decision_packages (title, proposed_action) VALUES ('t', 'a')")
    assert conn.execute("SELECT outcome FROM decision_packages").fetchone()[0] == "draft"
    assert conn.execute("SELECT evidence FROM decision_packages").fetchone()[0] == "[]"
    for bad in (-1, -1000):
        try:
            conn.execute(
                "INSERT INTO decision_packages (title, proposed_action, cost_projection_cents)"
                " VALUES ('t', 'a', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"negative cost accepted {bad}")


def test_outcome_ledger_ref_type_and_acceptance_are_constrained() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute(
        "INSERT INTO outcome_ledger (ref_type, ref_id, acceptance) VALUES ('task', 'abc', 'passed')"
    )
    for bad in ("invoice", "TASK", ""):
        try:
            conn.execute(
                "INSERT INTO outcome_ledger (ref_type, ref_id) VALUES (?, 'x')", (bad,)
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"ref_type accepted {bad!r}")
    for bad in ("maybe", "PASSED", ""):
        try:
            conn.execute(
                "INSERT INTO outcome_ledger (ref_type, ref_id, acceptance) VALUES ('task', 'y', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"acceptance accepted {bad!r}")


def test_outcome_ledger_dedupe_key_is_unique() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO outcome_ledger (ref_type, ref_id, dedupe_key) VALUES ('task', 'a', 'task:a')")
    conn.execute("INSERT OR IGNORE INTO outcome_ledger (ref_type, ref_id, dedupe_key) VALUES ('task', 'a', 'task:a')")
    assert conn.execute("SELECT COUNT(*) FROM outcome_ledger").fetchone()[0] == 1
    # NULL dedupe keys are distinct: live dispatch rows are one-per-event.
    conn.execute("INSERT INTO outcome_ledger (ref_type, ref_id) VALUES ('connector', 'x')")
    conn.execute("INSERT INTO outcome_ledger (ref_type, ref_id) VALUES ('connector', 'x')")
    assert conn.execute("SELECT COUNT(*) FROM outcome_ledger").fetchone()[0] == 3


def test_outcome_ledger_defaults() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO outcome_ledger (ref_type, ref_id) VALUES ('scan', 's1')")
    row = conn.execute(
        "SELECT retries, est_cost_cents, acceptance FROM outcome_ledger"
    ).fetchone()
    assert row == (0, 0, "n/a")


def test_worker_self_heal_ddl_matches_migration_011() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    for table, module in (
        ("decision_packages", "decisions.ts"),
        ("outcome_ledger", "ledger.ts"),
    ):
        source = (WORKER_SRC / module).read_text()
        migrated = set(_columns(conn, table))
        inline = _columns_in_worker_ddl(source, table)
        assert inline == migrated, (
            f"{table}: worker self-heal DDL drifted from db/migrations "
            f"(only in worker: {inline - migrated}; only in migration: {migrated - inline})"
        )


def test_decision_indexes_exist() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    idx = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
    assert "idx_decision_packages_outcome" in idx
    assert "idx_outcome_ledger_ref" in idx
