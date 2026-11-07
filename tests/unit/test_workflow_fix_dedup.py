"""Workflow-run fix tasks: one per run id, and none for ancient runs.

Measured defect (2026-11-08): 48 `Fix GitHub Actions workflow failure…` rows
covering only 18 run ids. Run `35918692524` had five tasks across two months
(2026-09-23 ×3, 2026-10-25, 2026-11-07). GitHub reports exactly 10 failed
runs on `main`, all 2026-09-23..09-30, so the monitor re-examined the same
September failures every ~2 minutes forever — and both late duplicates landed
SECONDS after a `task_tracker_operation_failed` line in the fleet log
(`[Errno 54] Connection reset by peer`, `Server disconnected without sending a
response`). `find_by_description` swallowed the read error and returned None,
and `if existing_tasks:` read that as "no task for this run".

Two gates are pinned here: a sane age cutoff at the fetch layer (with a clear
skip log line), and fail-closed dedup — an unreadable task_log must never
authorise creating another task for a run id.
"""

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from structlog.testing import capture_logs

from agents.engineering.devops_agent import DevOpsAgent
from core.operations.task_tracker import TaskTracker
from core.tools.github_actions import (
    WORKFLOW_FIX_MAX_AGE_DAYS,
    GitHubActionsManager,
    workflow_run_age_days,
)


# --- fetch layer ----------------------------------------------------------

class _Resp:
    status_code = 200
    text = ""

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _Client:
    def __init__(self, payload, requests):
        self._payload = payload
        self._requests = requests

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None, params=None):
        self._requests.append({"url": url, "params": dict(params or {})})
        return _Resp(self._payload)


def _manager(default_branch="main") -> GitHubActionsManager:
    mgr = GitHubActionsManager.__new__(GitHubActionsManager)
    mgr._repo_owner = "o"
    mgr._repo_name = "r"
    mgr._default_branch = default_branch
    mgr.token = "x"
    return mgr


def _iso(days_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _run(run_id: int, days_ago: float, branch: str = "main") -> dict:
    return {
        "id": run_id,
        "name": "CI",
        "head_branch": branch,
        "conclusion": "failure",
        "status": "completed",
        "created_at": _iso(days_ago),
    }


@pytest.mark.asyncio
async def test_ancient_runs_are_dropped_and_logged(monkeypatch):
    requests = []
    payload = {"workflow_runs": [_run(1, 2), _run(2, 45), _run(3, 60)]}
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _Client(payload, requests))

    mgr = _manager()
    with capture_logs() as logs:
        runs = await mgr.get_failed_workflows(limit=5)

    # Only the fresh failure reaches the monitor, so no logs are fetched for
    # and no task can be minted from a two-month-old run.
    assert [r["id"] for r in runs] == [1]
    skipped = [e for e in logs if e["event"] == "workflow_fix_skipped_ancient"]
    assert {e["run_id"] for e in skipped} == {2, 3}
    assert all(e["max_age_days"] == WORKFLOW_FIX_MAX_AGE_DAYS for e in skipped)
    fetched = [e for e in logs if e["event"] == "fetched_failed_workflows"][-1]
    assert fetched["count"] == 1
    assert fetched["skipped_ancient"] == 2


@pytest.mark.asyncio
async def test_skip_log_line_is_emitted_once_per_run(monkeypatch):
    # The monitor polls every ~2 minutes; repeating the same five lines every
    # tick would bury the decision it is supposed to surface.
    payload = {"workflow_runs": [_run(2, 45)]}
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _Client(payload, []))

    mgr = _manager()
    with capture_logs() as first:
        await mgr.get_failed_workflows(limit=5)
    with capture_logs() as second:
        await mgr.get_failed_workflows(limit=5)

    assert len([e for e in first if e["event"] == "workflow_fix_skipped_ancient"]) == 1
    assert [e for e in second if e["event"] == "workflow_fix_skipped_ancient"] == []


@pytest.mark.asyncio
async def test_recent_runs_survive_and_limit_is_honoured(monkeypatch):
    requests = []
    payload = {"workflow_runs": [_run(i, 0) for i in (1, 2, 3)]}
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _Client(payload, requests))

    runs = await _manager().get_failed_workflows(limit=2)

    assert [r["id"] for r in runs] == [1, 2]
    # A wider page protects a fresh failure from a backlog of old ones.
    assert requests[0]["params"]["per_page"] >= 20
    assert requests[0]["params"]["sort"] == "created"
    assert requests[0]["params"]["direction"] == "desc"
    assert requests[0]["params"]["branch"] == "main"


@pytest.mark.asyncio
async def test_missing_created_at_is_never_treated_as_ancient(monkeypatch):
    # Unknown age must not silently suppress a real failure.
    payload = {"workflow_runs": [{"id": 9, "head_branch": "main"}]}
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _Client(payload, []))

    assert [r["id"] for r in await _manager().get_failed_workflows(limit=5)] == [9]


@pytest.mark.asyncio
async def test_pr_branch_runs_still_excluded(monkeypatch):
    payload = {"workflow_runs": [_run(1, 0, branch="agent/x"), _run(2, 0)]}
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _Client(payload, []))

    assert [r["id"] for r in await _manager().get_failed_workflows(limit=5)] == [2]


def test_workflow_run_age_days_parsing():
    assert workflow_run_age_days(None) is None
    assert workflow_run_age_days("not a date") is None
    assert workflow_run_age_days(_iso(0)) == pytest.approx(0, abs=1)
    assert workflow_run_age_days(_iso(30)) == pytest.approx(30, abs=1)
    # D1/GitHub both emit Z-suffixed UTC; a naive timestamp is UTC too.
    assert workflow_run_age_days("2026-01-01T00:00:00") is not None


# --- dedup gate -----------------------------------------------------------

class _Tracker:
    def __init__(self, existing, persist=True):
        self.existing = existing
        self.persist = persist
        self.created = []

    async def find_by_description(self, fragment):
        return self.existing

    async def create_task(self, task_id, agent_id, description, status="pending", attempts=0):
        self.created.append(description)
        return self.persist


class _Bus:
    def __init__(self):
        self.published = []

    async def publish(self, channel, message):
        self.published.append(message)


def _agent(tracker) -> DevOpsAgent:
    agent = DevOpsAgent.__new__(DevOpsAgent)
    agent.agent_id = "devops_1"
    agent.task_tracker = tracker
    agent.message_bus = _Bus()
    import structlog

    agent.logger = structlog.get_logger("test")
    return agent


WORKFLOW = {
    "id": 35918692524,
    "name": "Test and Deploy",
    "head_branch": "main",
    "created_at": _iso(45),
}


@pytest.mark.asyncio
async def test_unreadable_task_log_fails_closed():
    # The exact 2026-11-07 failure: read raised, tracker returned None, and
    # the old `if existing_tasks:` minted a second task for a Sept run.
    tracker = _Tracker(existing=None)
    agent = _agent(tracker)
    with capture_logs() as logs:
        await agent._create_workflow_fix_task({**WORKFLOW, "created_at": _iso(1)}, {})

    assert tracker.created == []
    assert agent.message_bus.published == []
    assert any(e["event"] == "workflow_fix_dedup_unavailable" for e in logs)


@pytest.mark.asyncio
async def test_existing_task_in_any_status_blocks_creation():
    tracker = _Tracker(existing=[{"task_id": "abc", "description": "…run 1…", "status": "failed"}])
    agent = _agent(tracker)
    await agent._create_workflow_fix_task(WORKFLOW, {})

    assert tracker.created == []
    assert agent.message_bus.published == []


@pytest.mark.asyncio
async def test_ancient_run_never_creates_a_task():
    # Defence in depth: even if an ancient run reaches this layer, it must
    # not create work. Dedup would be a no-op here (empty result).
    tracker = _Tracker(existing=[])
    agent = _agent(tracker)
    with capture_logs() as logs:
        await agent._create_workflow_fix_task(WORKFLOW, {})

    assert tracker.created == []
    assert agent.message_bus.published == []
    assert any(e["event"] == "workflow_fix_skipped_ancient" for e in logs)


@pytest.mark.asyncio
async def test_fresh_unseen_run_creates_exactly_one_task():
    tracker = _Tracker(existing=[])
    agent = _agent(tracker)
    await agent._create_workflow_fix_task({**WORKFLOW, "created_at": _iso(1)}, {})

    assert len(tracker.created) == 1
    assert "run 35918692524" in tracker.created[0]
    assert len(agent.message_bus.published) == 1


@pytest.mark.asyncio
async def test_unpersisted_task_is_not_published():
    # The row is the dedup marker; publishing an unpersisted task means the
    # next tick sees "no existing task" and mints another.
    tracker = _Tracker(existing=[], persist=False)
    agent = _agent(tracker)
    with capture_logs() as logs:
        await agent._create_workflow_fix_task({**WORKFLOW, "created_at": _iso(1)}, {})

    assert len(tracker.created) == 1
    assert agent.message_bus.published == []
    assert any(e["event"] == "workflow_fix_task_not_persisted" for e in logs)


@pytest.mark.asyncio
async def test_pr_branch_creates_nothing():
    tracker = _Tracker(existing=[])
    agent = _agent(tracker)
    await agent._create_workflow_fix_task({**WORKFLOW, "head_branch": "agent/x"}, {})

    assert tracker.created == []
    assert agent.message_bus.published == []


# --- tracker contract -----------------------------------------------------

class _FailingClient:
    def is_configured(self):
        return True

    def table(self, name):
        class _Q:
            def select(self, *a, **k):
                return self

            def like(self, *a, **k):
                return self

            def limit(self, *a, **k):
                return self

            def execute(self):
                raise ConnectionResetError("connection reset by peer")

        return _Q()


class _EmptyClient(_FailingClient):
    def table(self, name):
        class _Q:
            def select(self, *a, **k):
                return self

            def like(self, *a, **k):
                return self

            def limit(self, *a, **k):
                return self

            def execute(self):
                return type("R", (), {"data": []})()

        return _Q()


@pytest.mark.asyncio
async def test_find_by_description_distinguishes_failure_from_empty():
    failed = TaskTracker.__new__(TaskTracker)
    failed._client = _FailingClient()
    assert await failed.find_by_description("run 1") is None

    empty = TaskTracker.__new__(TaskTracker)
    empty._client = _EmptyClient()
    assert await empty.find_by_description("run 1") == []


@pytest.mark.asyncio
async def test_create_task_reports_write_failure():
    tracker = TaskTracker.__new__(TaskTracker)
    tracker._client = _FailingClient()

    async def _no_row(task_id):
        return None

    tracker.get_task = _no_row  # type: ignore[assignment]
    assert await tracker.create_task("t", "devops", "d") is False
