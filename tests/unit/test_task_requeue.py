"""The crash-orphan retry gate (`agentTick` in worker/src/index.ts).

Measured defect (2026-11-08): task `8506422a…` was left `failed` with
attempts=2 after the fleet process was killed mid-task (the row was flipped
by the stale-claim sweep, whose only write is
`error_log=json_insert(…,'orphaned: in_progress claim went stale')`). It sat
unretried for 9+ hours. The requeue subquery was

    UPDATE task_log SET status='pending' WHERE id=(
      SELECT id FROM task_log WHERE status='failed' AND attempts<3
      AND NOT (DEAD_CORPUS_WHERE) ORDER BY created_at LIMIT 1)

and `DEAD_CORPUS_WHERE` read `result LIKE '%retired:%' OR …`. `result` is
NULL on every row the fleet never finished, so each LIKE yielded NULL, the
OR chain collapsed to NULL and `NOT (…)` was NULL — which a WHERE clause
treats as false. In production 52 of the 60 `failed AND attempts<3` rows had
`result IS NULL`; the eligible set was empty, so nothing was ever retried.

These tests lift the shipped SQL out of index.ts and execute it against a
real SQLite database, so the three-valued-logic behaviour — not a regex on
source text — is what is pinned.
"""

import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKER = (ROOT / "worker/src/index.ts").read_text()

CLAUSE = re.search(r'DEAD_CORPUS_WHERE\s*=\s*"([^"]+)"', WORKER).group(1)
MAX_AGE_DAYS = int(re.search(r"REQUEUE_MAX_AGE_DAYS\s*=\s*(\d+)", WORKER).group(1))

_UPDATE = re.search(
    r"`(UPDATE task_log SET status='pending'[\s\S]*?)`", WORKER
).group(1)
_UPDATE = _UPDATE.replace("${DEAD_CORPUS_WHERE}", CLAUSE).replace(
    "${REQUEUE_MAX_AGE_DAYS}", str(MAX_AGE_DAYS)
)
# The exact subquery the cron tick runs, lifted rather than paraphrased.
SELECT = re.search(r"WHERE id=\((SELECT [\s\S]*?LIMIT 1)\)", _UPDATE).group(1)


def _iso(days_ago: float) -> str:
    ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return ts.isoformat()


def _db(rows) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE task_log ("
        "id TEXT PRIMARY KEY, status TEXT, attempts INTEGER, result TEXT, "
        "error_log TEXT, created_at TEXT, description TEXT)"
    )
    for row in rows:
        conn.execute(
            "INSERT INTO task_log "
            "(id,status,attempts,result,error_log,created_at,description) "
            "VALUES (?,?,?,?,?,?,?)",
            row,
        )
    return conn


def _selected(conn: sqlite3.Connection) -> list[str]:
    return [r[0] for r in conn.execute(SELECT)]


ORPHANED_JSON = (
    '[{"attempt":1,"error":"The write operation timed out",'
    '"at":"2026-11-07T20:21:57.118937+00:00"},'
    '"orphaned: in_progress claim went stale"]'
)

# (id, status, attempts, result, error_log, created_at, description)
ELIGIBLE = [
    # The production row verbatim: crash-orphaned, result NULL.
    ("orphaned", "failed", 2, None, ORPHANED_JSON, _iso(1),
     "Develop a comprehensive marketing strategy to reach 100 users"),
    # Plain infrastructure timeout, never judged on its merits.
    ("timeout", "failed", 1, None,
     '[{"attempt":1,"error":"The write operation timed out"}]', _iso(1),
     "Draft the weekly founder briefing"),
    # A judged failure inside the freshness window still gets its retry with
    # the failure injected as feedback (gate #9) — result stays NULL here,
    # which is exactly the shape the old predicate could not see.
    ("judged_recent", "failed", 1, None,
     '["verification failed: docs/x.md already exists and this rewrite discards most of it"]',
     _iso(3), "Rewrite docs/x.md"),
    ("last_attempt", "failed", 2, None, "[]", _iso(6),
     "Add cache headers to the badge endpoint"),
]

NOT_ELIGIBLE = [
    # Dead-corpus marker in result (annotations written by the sweep).
    ("dead_retired", "failed", 1, "retired: superseded by shipped work",
     None, _iso(1), "Retired work"),
    ("dead_obsolete", "failed", 1, "obsolete: already shipped",
     None, _iso(1), "Obsolete work"),
    ("dead_infeasible", "failed", 1, "infeasible: mobile app (dead corp)",
     None, _iso(1), "Build a mobile app"),
    ("dead_closed", "failed", 1, "closed: shipped out of band",
     None, _iso(1), "Closed work"),
    ("dead_resolved", "failed", 1, "resolved:shipped — done manually",
     None, _iso(1), "Resolved work"),
    # Dead-corpus marker in error_log with a NULL result — the symmetric
    # half. The worker writes these annotations to error_log, so matching
    # only `result` made 270 explicitly dead rows look retryable.
    ("dead_err_obsolete", "failed", 1, None, '["obsolete: workflow fixed directly"]',
     _iso(1), "Fix CI"),
    ("dead_err_retired", "failed", 1, None,
     '[{"attempt":1,"error":"retired: duplicate of shipped work"}]',
     _iso(1), "Duplicate work"),
    ("dead_err_infeasible", "failed", 1, None,
     "infeasible: python-stack deliverable (dead corpus)", _iso(1), "Publish a PyPI package"),
    ("dead_err_deliverable", "failed", 1, None,
     '[{"attempt":1,"error":"Deliverable rejected: repo test suite failed"}]',
     _iso(1), "Fix the test suite"),
    ("dead_err_phantom", "failed", 1, None,
     "phantom_completion: claimed PR never merged", _iso(1), "Ship the feature"),
    # Never retried: escalation is a terminal human decision.
    ("escalated", "escalated", 1, None, "[]", _iso(1), "Escalated work"),
    ("escalated_dead", "escalated", 1, "obsolete: x", None, _iso(1), "Escalated dead work"),
    # Out of retry budget.
    ("attempts_3", "failed", 3, None, "[]", _iso(1), "Burned every attempt"),
    # Not failed.
    ("completed", "completed", 1, "done", None, _iso(1), "Completed work"),
    ("pending", "pending", 0, None, None, _iso(1), "Pending work"),
    # Ancient: abandoned work is not a fresh chance (the same anti-
    # resurrection rule the workflow-run monitor applies).
    ("ancient_8d", "failed", 1, None, "[]", _iso(8), "Two-month-old failure"),
    ("ancient_40d_orphan", "failed", 2, None, ORPHANED_JSON, _iso(40),
     "Ancient crash orphan"),
]


def test_sql_is_null_safe_on_both_columns() -> None:
    # The whole defect in one assertion: an unguarded `result LIKE …` on a
    # NULL result poisons the OR chain and makes `NOT (…)` NULL.
    assert "COALESCE(result,'') LIKE" in CLAUSE
    assert "COALESCE(error_log,'') LIKE" in CLAUSE
    assert "result LIKE" not in CLAUSE.replace("COALESCE(result,'') LIKE", "")
    assert "error_log LIKE" not in CLAUSE.replace("COALESCE(error_log,'') LIKE", "")


@pytest.mark.parametrize("row", ELIGIBLE, ids=[r[0] for r in ELIGIBLE])
def test_infrastructure_and_recent_failures_are_requeued(row) -> None:
    conn = _db([row])
    assert _selected(conn) == [row[0]]


@pytest.mark.parametrize("row", NOT_ELIGIBLE, ids=[r[0] for r in NOT_ELIGIBLE])
def test_dead_corpus_escalation_and_ancient_rows_are_not_requeued(row) -> None:
    conn = _db([row])
    assert _selected(conn) == []


def test_dead_corpus_row_does_not_block_an_eligible_orphan() -> None:
    # The dead row is older, so it is first in the ORDER BY. A broken NOT()
    # returned neither; a broken corpus check would return the dead one.
    dead = ("dead", "failed", 1, "obsolete: shipped", None, _iso(3), "Dead work")
    orphan = ELIGIBLE[0]
    conn = _db([dead, orphan])
    assert _selected(conn) == [orphan[0]]


def test_oldest_eligible_row_wins() -> None:
    newer = ("newer", "failed", 1, None, "[]", _iso(1), "Newer failure")
    older = ("older", "failed", 1, None, "[]", _iso(4), "Older failure")
    conn = _db([newer, older])
    assert _selected(conn) == [older[0]]


def test_requeue_update_flips_exactly_one_row() -> None:
    # The shipped statement itself (not just its subquery) must move the
    # orphan to pending and leave everything else alone.
    rows = [ELIGIBLE[0], ("dead", "failed", 1, "obsolete: x", None, _iso(2), "Dead")]
    conn = _db(rows)
    conn.execute(_UPDATE)
    statuses = dict(conn.execute("SELECT id, status FROM task_log"))
    assert statuses["orphaned"] == "pending"
    assert statuses["dead"] == "failed"


def test_age_window_is_documented_and_sane() -> None:
    # Retrying abandoned work is a resurrection, not a retry. Keep the bound
    # in the low-days range: long enough for a weekend outage, short enough
    # that a backlog cannot be drained into the live fleet.
    assert 1 <= MAX_AGE_DAYS <= 14
