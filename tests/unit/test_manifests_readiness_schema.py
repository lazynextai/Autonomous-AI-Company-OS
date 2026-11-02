"""Schema contract for roadmap P3/P5: manifests + capability readiness.

Migration 012 is additive and re-runnable. The active manifest pointer is KV
(`config:manifest:active`) plus the activated row, so nothing here adds a column
to an existing table — that keeps the migration idempotent while SQLite still
lacks ADD COLUMN IF NOT EXISTS. The worker's self-heal DDL must match the file.
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


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _columns_in_worker_ddl(source: str, table: str) -> set[str]:
    block = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\n\s*\)`", source, re.S)
    assert block, f"{table} DDL not found in worker source"
    cols = set()
    # Standalone table constraints (UNIQUE (...), CHECK (...)) are not columns.
    constraint_starters = {"UNIQUE", "PRIMARY", "CHECK", "FOREIGN", "CONSTRAINT"}
    for line in block.group(1).splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        first = stripped.split()[0]
        if first.upper() in constraint_starters:
            continue
        cols.add(first)
    return cols


def test_migration_012_is_idempotent() -> None:
    conn = sqlite3.connect(":memory:")
    _schema(conn)
    _apply_all(conn)
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"company_manifests", "capability_readiness"} <= tables


def test_company_manifests_carries_versioning_and_validation_state() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    cols = _columns(conn, "company_manifests")
    for required in (
        "name",
        "version",
        "body",
        "valid",
        "activated",
        "validation_errors",
        "created_at",
    ):
        assert required in cols, f"missing manifest column {required}"


def test_manifest_versions_are_unique_per_name() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO company_manifests (name, version, body) VALUES ('company', 1, '{}')")
    try:
        conn.execute("INSERT INTO company_manifests (name, version, body) VALUES ('company', 1, '{}')")
    except sqlite3.IntegrityError:
        pass
    else:  # pragma: no cover - UNIQUE(name, version) must hold
        raise AssertionError("duplicate (name, version) was accepted")
    # A different name may reuse version numbers, and a second version is fine.
    conn.execute("INSERT INTO company_manifests (name, version, body) VALUES ('company', 2, '{}')")
    conn.execute("INSERT INTO company_manifests (name, version, body) VALUES ('sandbox', 1, '{}')")
    assert conn.execute("SELECT COUNT(*) FROM company_manifests").fetchone()[0] == 3


def test_manifest_flags_are_bounded_booleans() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO company_manifests (name, version, body) VALUES ('c', 1, '{}')")
    row = conn.execute("SELECT valid, activated, validation_errors FROM company_manifests").fetchone()
    assert row == (0, 0, "[]"), "a stored manifest starts unvalidated and inactive"
    for bad in (2, -1):
        try:
            conn.execute(
                "INSERT INTO company_manifests (name, version, body, valid) VALUES ('x', 1, '{}', ?)",
                (bad,),
            )
        except sqlite3.IntegrityError:
            pass
        else:  # pragma: no cover
            raise AssertionError(f"valid accepted {bad}")


def test_only_one_active_row_is_expected_but_not_a_constraint() -> None:
    # Activation flips pointers in two statements, so a hard UNIQUE would break
    # the intermediate state; the invariant is enforced in code, not the schema.
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO company_manifests (name, version, body, activated) VALUES ('c', 1, '{}', 1)")
    conn.execute("INSERT INTO company_manifests (name, version, body, activated) VALUES ('c', 2, '{}', 0)")
    active = conn.execute("SELECT COUNT(*) FROM company_manifests WHERE activated = 1").fetchone()[0]
    assert active == 1


def test_capability_readiness_is_keyed_by_capability() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    cols = _columns(conn, "capability_readiness")
    for required in (
        "capability",
        "last_probe_at",
        "last_probe_ok",
        "last_error",
        "documented",
        "probe_supported",
        "keystore",
    ):
        assert required in cols, f"missing readiness column {required}"

    conn.execute("INSERT INTO capability_readiness (capability) VALUES ('x')")
    try:
        conn.execute("INSERT INTO capability_readiness (capability) VALUES ('x')")
    except sqlite3.IntegrityError:
        pass
    else:  # pragma: no cover - UNIQUE(capability) makes the upsert work
        raise AssertionError("duplicate capability was accepted")


def test_readiness_upsert_updates_in_place() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO capability_readiness (capability, documented) VALUES ('brevo', 1)")
    conn.execute(
        "INSERT INTO capability_readiness (capability, last_probe_at, last_probe_ok, documented)"
        " VALUES ('brevo', '2026-11-03T00:00:00Z', 1, 1)"
        " ON CONFLICT(capability) DO UPDATE SET"
        "   last_probe_at = excluded.last_probe_at,"
        "   last_probe_ok = excluded.last_probe_ok"
    )
    assert conn.execute("SELECT COUNT(*) FROM capability_readiness").fetchone()[0] == 1
    row = conn.execute("SELECT last_probe_ok, last_probe_at FROM capability_readiness").fetchone()
    assert row == (1, "2026-11-03T00:00:00Z")


def test_readiness_defaults_are_conservative() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    conn.execute("INSERT INTO capability_readiness (capability) VALUES ('github')")
    row = conn.execute(
        "SELECT last_probe_at, last_probe_ok, documented, probe_supported FROM capability_readiness"
    ).fetchone()
    assert row == (None, None, 0, 1), "an unprobed capability claims nothing"


def test_readiness_flags_reject_non_booleans() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    for col in ("documented", "probe_supported"):
        for bad in (3, -1):
            try:
                conn.execute(
                    f"INSERT INTO capability_readiness (capability, {col}) VALUES ('c', ?)",
                    (bad,),
                )
            except sqlite3.IntegrityError:
                pass
            else:  # pragma: no cover
                raise AssertionError(f"{col} accepted {bad}")
            conn.execute("DELETE FROM capability_readiness")


def test_worker_self_heal_ddl_matches_migration_012() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    manifests = (WORKER_SRC / "manifests.ts").read_text()
    readiness = (WORKER_SRC / "readiness.ts").read_text()
    for table, source in (
        ("company_manifests", manifests),
        ("capability_readiness", readiness),
    ):
        migrated = _columns(conn, table)
        inline = _columns_in_worker_ddl(source, table)
        assert inline == migrated, (
            f"{table}: worker self-heal DDL drifted from db/migrations "
            f"(only in worker: {inline - migrated}; only in migration: {migrated - inline})"
        )


def test_manifests_and_readiness_indexes_exist() -> None:
    conn = _schema(sqlite3.connect(":memory:"))
    idx = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
    assert "idx_company_manifests_active" in idx
    assert "idx_capability_readiness_probe" in idx
