"""Unit tests for the fleet decision gate (core/tools/decision_gate.py).

Mirrors the worker's `decisionGate()` semantics — scope parsing, rank-based
coverage, authority classification for connector dispatch, approved-package
lookup, and the visible `decision_gate` audit row — plus the wiring in
`call_connector`: a blocked dispatch must NOT reach the provider fn, an
approved one must. No network is touched; the Cloudflare client is faked and
the "sender" is an AsyncMock.
"""

import json
from unittest.mock import AsyncMock

import pytest

from core.tools import connectors
from core.tools import decision_gate as dg


class _FakeClient:
    """KV + D1 stand-in. Records every query and write for assertions."""

    def __init__(self, flag=None, rows=None, kv_error=None, query_error=None, write_error=None):
        self.flag = flag
        self.rows = rows or []
        self.kv_error = kv_error
        self.query_error = query_error
        self.write_error = write_error
        self.queries: list[tuple[str, list | None]] = []
        self.writes: list[tuple[str, list | None]] = []
        self.closed = False

    async def kv_get(self, key):
        assert key == dg._SCOPE_KEY
        if self.kv_error:
            raise self.kv_error
        return self.flag

    async def aquery(self, sql, params=None):
        self.queries.append((sql, params))
        if self.query_error:
            raise self.query_error
        return self.rows

    async def aexecute(self, sql, params=None):
        self.writes.append((sql, params))
        if self.write_error:
            raise self.write_error
        return {"meta": {"changes": 1}}

    async def close(self):
        self.closed = True


def _use(monkeypatch, client: _FakeClient) -> _FakeClient:
    """Point the gate at a fake client (overrides the conftest D1 guard)."""
    monkeypatch.setattr(dg, "CloudflareClient", lambda *a, **k: client)
    return client


# --- Scope parsing (parseDecisionScope parity) ------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("off", "off"),
        ("OFF", "off"),
        ("human_only", "human_only"),
        ("human", "human_only"),
        ("human-only", "human_only"),
        ("  Human_Only  ", "human_only"),
        ("approval", "approval"),
        (" Approval ", "approval"),
        ("all", "all"),
        ("ALL", "all"),
        ("1", "all"),  # legacy boolean stays all-enforcing
        ("", "off"),
        (None, "off"),
        ("bogus", "off"),
        ("2", "off"),
        ("true", "off"),
    ],
)
def test_parse_decision_scope(raw, expected):
    assert dg.parse_decision_scope(raw) == expected


# --- Rank coverage, both directions ----------------------------------------


@pytest.mark.parametrize(
    "scope,authority,expected",
    [
        # A scope covers its own class...
        ("human_only", "human_only", True),
        ("approval", "approval", True),
        ("all", "auto", True),
        # ...and anything narrower...
        ("approval", "human_only", True),
        ("all", "human_only", True),
        ("all", "approval", True),
        # ...but never anything more autonomous.
        ("human_only", "approval", False),
        ("human_only", "auto", False),
        ("approval", "auto", False),
        # off / unknown cover nothing.
        ("off", "human_only", False),
        ("off", "approval", False),
        ("off", "auto", False),
        ("weird", "human_only", False),
    ],
)
def test_scope_covers_is_rank_based(scope, authority, expected):
    assert dg.scope_covers(scope, authority) is expected


# --- Authority classification (classifyAuthority subset) -------------------


@pytest.mark.parametrize(
    "cid",
    ["discord", "slack", "mattermost", "teams", "zulip", "telegram", "matrix", "webhook"],
)
def test_internal_messaging_is_auto(cid):
    assert dg.classify_connector_authority(cid) == "auto"


def test_signwell_is_human_only():
    assert dg.classify_connector_authority("signwell") == "human_only"


@pytest.mark.parametrize("cid", ["x", "brevo", "linkedin", "brand_new_connector", " X "])
def test_external_and_unknown_default_to_approval(cid):
    assert dg.classify_connector_authority(cid) == "approval"


# --- check_decision ---------------------------------------------------------


@pytest.mark.asyncio
async def test_off_scope_allows_without_touching_d1(monkeypatch):
    client = _use(monkeypatch, _FakeClient(flag=None))
    res = await dg.check_decision("x")
    assert res == {"allow": True, "mode": "off", "reason": None, "package_id": None}
    assert client.queries == [] and client.writes == []
    assert client.closed is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "cid",
    ["discord", "slack", "mattermost", "teams", "zulip", "telegram", "matrix", "webhook"],
)
async def test_internal_messaging_never_blocked_under_approval(monkeypatch, cid):
    """auto > approval in rank, so the approval scope does not cover these."""
    client = _use(monkeypatch, _FakeClient(flag="approval", rows=[]))
    res = await dg.check_decision(cid)
    assert res == {"allow": True, "mode": "approval", "reason": None, "package_id": None}
    assert client.queries == [] and client.writes == []


@pytest.mark.asyncio
async def test_external_connector_with_package_allowed(monkeypatch):
    client = _use(monkeypatch, _FakeClient(flag="approval", rows=[{"id": 5}]))
    res = await dg.check_decision("x")
    assert res == {"allow": True, "mode": "approval", "reason": None, "package_id": 5}
    assert client.writes == []
    sql, params = client.queries[0]
    assert "decision_packages" in sql and "outcome = 'approved'" in sql
    assert params == ["x"]


@pytest.mark.asyncio
async def test_external_connector_without_package_blocks_and_audits(monkeypatch):
    client = _use(monkeypatch, _FakeClient(flag="approval", rows=[]))
    res = await dg.check_decision("x")
    assert res["allow"] is False
    assert res["mode"] == "approval"
    assert res["package_id"] is None
    assert res["reason"] == (
        "no approved decision package for 'x' (authority approval, scope approval)"
    )

    # Exactly ONE visible block row, same payload shape the worker writes.
    assert len(client.writes) == 1
    sql, params = client.writes[0]
    assert "INSERT INTO episodic_events (scope, payload)" in sql
    assert "'decision_gate'" in sql
    payload = json.loads(params[0])
    assert payload["event"] == "decision_gate_blocked"
    assert payload["type"] == "connector.dispatch"
    assert payload["connector"] == "x"
    assert payload["target"] == "x"
    assert payload["authority"] == "approval"
    assert payload["scope"] == "approval"
    assert payload["reason"] == res["reason"]
    assert payload["ts"]


@pytest.mark.asyncio
async def test_signwell_human_only_blocked_under_approval(monkeypatch):
    """approval covers human_only — the deliberately unseeded signwell target."""
    _use(monkeypatch, _FakeClient(flag="approval", rows=[]))
    res = await dg.check_decision("signwell")
    assert res["allow"] is False
    assert "authority human_only" in res["reason"]


@pytest.mark.asyncio
async def test_human_only_scope_does_not_cover_external(monkeypatch):
    client = _use(monkeypatch, _FakeClient(flag="human_only", rows=[]))
    res = await dg.check_decision("x")
    assert res == {"allow": True, "mode": "human_only", "reason": None, "package_id": None}
    assert client.queries == [] and client.writes == []


@pytest.mark.asyncio
async def test_all_scope_gates_auto_connectors(monkeypatch):
    _use(monkeypatch, _FakeClient(flag="all", rows=[]))
    res = await dg.check_decision("discord")
    assert res["allow"] is False
    assert "authority auto" in res["reason"]


@pytest.mark.asyncio
async def test_kv_unreadable_fails_soft(monkeypatch):
    """A control-plane outage must never stop company posting."""
    client = _use(monkeypatch, _FakeClient(kv_error=RuntimeError("kv down")))
    res = await dg.check_decision("x")
    assert res["allow"] is True
    assert res["mode"] == "unavailable"
    assert "scope read failed" in res["reason"]
    assert client.queries == [] and client.writes == []


@pytest.mark.asyncio
async def test_package_read_unreadable_fails_soft(monkeypatch):
    client = _use(monkeypatch, _FakeClient(flag="approval", query_error=RuntimeError("d1 down")))
    res = await dg.check_decision("x")
    assert res["allow"] is True
    assert res["mode"] == "approval"
    assert "package read failed" in res["reason"]
    assert client.writes == []


@pytest.mark.asyncio
async def test_block_audit_write_failure_keeps_the_block(monkeypatch):
    _use(monkeypatch, _FakeClient(flag="approval", rows=[], write_error=RuntimeError("d1 down")))
    res = await dg.check_decision("x")
    assert res["allow"] is False
    assert "no approved decision package" in res["reason"]


# --- call_connector wiring --------------------------------------------------


@pytest.mark.asyncio
async def test_call_connector_consults_decision_gate(monkeypatch):
    """Blocked -> provider fn never runs; allowed -> it runs."""
    sender = AsyncMock(return_value={"ok": True, "status": 200, "body": {}})
    monkeypatch.setitem(connectors._DISPATCH, "_testdecision", sender)
    monkeypatch.setattr(connectors, "_credential", AsyncMock(return_value="tok"))
    monkeypatch.setattr(connectors, "check_outbound", AsyncMock(
        return_value={"allow": True, "mode": "observe", "reason": None}
    ))

    reason = "no approved decision package for '_testdecision' (authority approval, scope approval)"
    monkeypatch.setattr(connectors, "check_decision", AsyncMock(
        return_value={"allow": False, "mode": "approval", "reason": reason, "package_id": None}
    ))
    res = await connectors.call_connector("_testdecision", {"text": "hello"})
    assert res["ok"] is False
    assert res["gate"] is True
    assert res["error"] == f"blocked by decision gate — missing approval: {reason}"
    sender.assert_not_awaited()

    monkeypatch.setattr(connectors, "check_decision", AsyncMock(
        return_value={"allow": True, "mode": "approval", "reason": None, "package_id": 5}
    ))
    res = await connectors.call_connector("_testdecision", {"text": "hello"})
    assert res == {"ok": True, "status": 200, "body": {}}
    sender.assert_awaited_once()


@pytest.mark.asyncio
async def test_call_connector_real_gate_end_to_end(monkeypatch):
    """The REAL check_decision runs in call_connector (no check_decision stub):
    approval scope + no package blocks before the provider; an approved package
    lets the same call through."""
    sender = AsyncMock(return_value={"ok": True, "status": 200, "body": {}})
    monkeypatch.setitem(connectors._DISPATCH, "_teste2e", sender)
    monkeypatch.setattr(connectors, "_credential", AsyncMock(return_value="tok"))
    monkeypatch.setattr(connectors, "check_outbound", AsyncMock(
        return_value={"allow": True, "mode": "observe", "reason": None}
    ))

    client = _use(monkeypatch, _FakeClient(flag="approval", rows=[]))
    res = await connectors.call_connector("_teste2e", {"text": "hello"})
    assert res["ok"] is False and res["gate"] is True
    assert "no approved decision package for '_teste2e'" in res["error"]
    sender.assert_not_awaited()
    assert len(client.writes) == 1  # the block is visible in episodic_events

    _use(monkeypatch, _FakeClient(flag="approval", rows=[{"id": 5}]))
    res = await connectors.call_connector("_teste2e", {"text": "hello"})
    assert res == {"ok": True, "status": 200, "body": {}}
    sender.assert_awaited_once()
