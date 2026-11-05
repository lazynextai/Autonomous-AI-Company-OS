"""Unit tests for the weekly readiness digest (scripts/weekly_digest.py).

Covers the four honesty contracts of C1:
  1. a failed read renders `unavailable` - never a number, never an estimate;
  2. every rendered figure names the endpoint/key it was read from;
  3. the 6.5-day gate (boundary: exactly 6.5d runs, 6.5d - 1s does not;
     an UNREADABLE digest:last_run skips - duplicate mail is worse than late);
  4. stale breadcrumbs are flagged against their documented windows;
  and the dry-run contract: renders and prints, writes nothing, sends nothing.

No network, no KV, no Brevo - all readers and the sender are stubbed.
"""

import json
import time
from unittest.mock import AsyncMock

import pytest

import scripts.weekly_digest as wd

# Breadcrumb budget for the cron tick, from BREADCRUMBS (25 min).
_CRON_BUDGET_MS = 25 * 60_000
_NOW = 1_800_000_000_000.0  # fixed fake clock, ms


# ------------------------------------------------------------------ fixtures --


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Neutralize the real `.env`/environment so tests are deterministic."""
    monkeypatch.delenv("CLOUDFLARE_API_URL", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("LAZYNEXT_API_KEY", raising=False)
    monkeypatch.delenv("CONN_BREAKER_MODE", raising=False)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [])
    monkeypatch.setattr(wd, "_settings_lzk", lambda: "")
    return monkeypatch


def _digest() -> wd.Digest:
    return wd.Digest(generated_at="2026-11-05 12:00 UTC", sections=[], gate_note="")


@pytest.fixture
def _async_breaker_stub(monkeypatch):
    """Stub breaker reads to a benign default row (no trips)."""

    def _fake_query(sql: str, params: list | None = None):
        assert "outbound_breaker_config" in sql
        return [
            {
                "enabled": 1,
                "volume_limit": 100,
                "volume_window_ms": 3_600_000,
                "failure_limit": 5,
                "failure_window_ms": 600_000,
                "error_rate_limit": 0.5,
                "error_rate_window_ms": 600_000,
                "deliverability_limit": 0.2,
                "deliverability_window_ms": 86_400_000,
                "tripped_reason": None,
                "tripped_at": None,
            }
        ]

    class _FakeClient:
        def __init__(self):
            pass

        def is_configured(self):
            return True

        def query(self, sql: str, params: list | None = None):
            return _fake_query(sql, params)

    import core.cloudflare_client as cfc

    monkeypatch.setattr(cfc, "CloudflareClient", _FakeClient)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [
        wd.Figure("breaker mode", "observe", "CONN_BREAKER_MODE (fleet setting)"),
        wd.Figure("breaker tripped", "no", "D1 outbound_breaker_config (internal POST /query)"),
    ])


# ---------------------------------------------------------------- read units --


def test_parse_ms_bare_epoch_and_json_at():
    assert wd.parse_ms("1793901015885") == 1793901015885.0
    assert wd.parse_ms('{"at": 1793882421718}') == 1793882421718.0
    assert wd.parse_ms("0") is None
    assert wd.parse_ms("not a number") is None
    assert wd.parse_ms(None) is None


def test_parse_ms_bare_string_timestamp_rejected():
    # An ISO string is not a ms epoch - do not guess a number from it.
    assert wd.parse_ms("2026-11-05T10:00:00Z") is None


def test_error_text_stays_on_one_line():
    """A multi-line HTTP client error must not break the rendered digest."""
    text = wd._err_text(ValueError("boom\nsecond line\nthird line"))
    assert "\n" not in text
    assert text.startswith("ValueError: boom")
    assert len(wd._err_text(RuntimeError("x" * 500))) <= 160


# --------------------------------------------------------------- unavailable --


def test_failed_capability_read_renders_unavailable(monkeypatch):
    monkeypatch.setattr(wd, "get_json", lambda path: (None, "HTTP 502"))
    section = wd.connectors_section()
    assert section.figures[0].value == "unavailable"
    assert section.figures[0].source == "GET /capability/matrix"
    assert "HTTP 502" in section.figures[0].error
    text = wd.render_text(wd.Digest(generated_at="t", sections=[section]))
    assert "connector readiness: unavailable" in text
    assert "source: GET /capability/matrix" in text


def test_failed_ledger_read_renders_unavailable(monkeypatch):
    monkeypatch.setattr(wd, "get_json", lambda path: (None, "HTTP 401"))
    section = wd.outcomes_section()
    assert section.figures[0].value == "unavailable"
    assert section.figures[0].source == "GET /ledger/summary"


def test_failed_funnel_read_renders_unavailable_and_no_lzk_guess(monkeypatch):
    monkeypatch.setattr(wd, "get_json", lambda path, token=None, base=None: (None, "HTTP 403"))
    section = wd.funnel_section()
    assert section.figures[0].value == "unavailable"
    assert section.figures[0].source == "GET /api/v1/billing/funnel (internal bearer)"
    # Every figure in the section must be the single unavailable row - no zeros.
    assert len(section.figures) == 1


def test_failed_read_never_produces_a_number_anywhere(monkeypatch):
    """All five sections with every read failing: every figure is unavailable."""
    monkeypatch.setattr(wd, "get_json", lambda path, token=None, base=None: (None, "boom"))
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, "boom"))
    digest = wd.build_digest(_NOW)
    assert len(digest.sections) == 5
    assert digest.figures(), "expected figures from the failing reads"
    assert all(figure.value == "unavailable" for figure in digest.figures())
    text = wd.render_text(digest)
    # one occurrence per figure value, plus the single mention in the header
    assert text.count("unavailable") == len(digest.figures()) + 1


# ------------------------------------------------------------------- sources --


def test_every_figure_includes_its_source(monkeypatch, _async_breaker_stub):
    """The renderer prints each figure's source; every figure names one."""

    def _fake_get(path, token=None, base=None):
        if path == "/capability/matrix":
            return {
                "summary": {
                    "total": 45, "probe-ok": 3, "probe-failed": 1, "stale": 0,
                    "configured-unprobed": 37, "documented-only": 4, "absent": 0,
                },
                "connectors": [
                    {
                        "capability": "signwell", "configured": True,
                        "state": "probe-failed", "last_error": "HTTP 401 from probe",
                    },
                    {"capability": "linkedin", "configured": False, "state": "documented-only"},
                ],
            }, None
        if path.startswith("/decision"):
            return {"blocks": [], "packages": []}, None
        if path == "/ledger/summary":
            return {"days": 7, "totals": {"total": 36, "est_cost_cents": 35}, "groups": []}, None
        if path.endswith("/funnel"):
            return {
                "scans_30d": 137, "scans_external_30d": 6, "leads": 1, "email_contacts": 54,
                "crm_leads": 78, "crm_engaged": 17, "monitors": 1,
            }, None
        return {"value": None}, None

    monkeypatch.setattr(wd, "get_json", _fake_get)
    monkeypatch.setattr(wd, "kv_read", lambda key: ("1793882421718", None))
    digest = wd.build_digest(_NOW)
    text = wd.render_text(digest)
    rendered_figures = [f for f in digest.figures()]
    assert len(rendered_figures) >= 20
    for figure in rendered_figures:
        assert figure.source, f"figure without source: {figure.label}"
        assert f"source: {figure.source}" in text, f"source missing in render for {figure.label}"
    # Absent connectors are disclosed as a note with its source, not hidden.
    assert "linkedin" in text and "GET /capability/matrix" in text


def test_governance_blocks_and_packages_cite_endpoints(monkeypatch, _async_breaker_stub):
    now_ms = 1_800_000_000_000.0
    week_ago = now_ms - 3 * 24 * 3_600_000  # 3 days in the past
    week_ago_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(week_ago / 1000))

    def _fake_get(path, token=None, base=None):
        if path == "/decision/blocks?limit=20":
            return {
                "blocks": [
                    {
                        "id": 1,
                        "created_at": week_ago_iso,
                        "payload": json.dumps({"type": "connector.dispatch", "connector": "signwell", "target": "signwell", "reason": "no approved package"}),
                    },
                    {"id": 2, "created_at": "2026-10-01T00:00:00.000Z", "payload": "{}"},  # outside 7d
                ]
            }, None
        if path == "/decision/packages?outcome=draft":
            return {"packages": [{"id": 7, "target": "campaign:9", "title": "Send warm follow-up"}]}, None
        if path == "/capability/matrix":
            return {"summary": {"total": 45, "probe-ok": 3, "probe-failed": 1, "stale": 0, "configured-unprobed": 37, "documented-only": 4, "absent": 0}, "connectors": []}, None
        if path == "/ledger/summary":
            return {"days": 7, "totals": {"total": 36, "est_cost_cents": 35}, "groups": []}, None
        return {"value": None}, None

    monkeypatch.setattr(wd, "get_json", _fake_get)
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, None))
    section = wd.governance_section(now_ms)
    block_figure = next(f for f in section.figures if f.label.startswith("gate blocks"))
    assert block_figure.value == "1 of 2"  # only the 3-day-old block counts as this week
    awaiting = next(f for f in section.figures if f.label == "packages awaiting approval")
    assert awaiting.value == "1"
    assert awaiting.source == "GET /decision/packages?outcome=draft"
    assert any(f.label == "awaiting: campaign:9" for f in section.figures)
    assert any(f.label == "block (signwell)" for f in section.figures)


# --------------------------------------------------------------------- gate --


def test_gate_runs_when_key_absent():
    run, reason = wd.gate_decision(_NOW, None)
    assert run is True
    assert "absent" in reason


def test_gate_runs_exactly_at_boundary_6_5_days():
    exact_age = wd.DIGEST_INTERVAL_MS
    run, _ = wd.gate_decision(_NOW, _NOW - exact_age)
    assert run is True


def test_gate_skips_one_second_before_boundary():
    one_sec_early = wd.DIGEST_INTERVAL_MS - 1000
    run, reason = wd.gate_decision(_NOW, _NOW - one_sec_early)
    assert run is False
    assert "skipped" in reason


def test_gate_skips_well_within_window():
    run, _ = wd.gate_decision(_NOW, _NOW - 24 * 3_600_000)
    assert run is False


def test_gate_skips_an_unreadable_last_run_key():
    """A KV outage must not cause a duplicate send - fail closed."""
    run, reason = wd.gate_decision(_NOW, None, read_error="HTTP 502")
    assert run is False
    assert "duplicate send" in reason


def test_gate_round_trips_through_parse_ms():
    raw = str(int(_NOW - wd.DIGEST_INTERVAL_MS))
    run, _ = wd.gate_decision(_NOW, wd.parse_ms(raw))
    assert run is True


# -------------------------------------------------------- stale breadcrumbs --


def test_stale_cron_age_is_flagged(monkeypatch):
    monkeypatch.setattr(wd, "kv_read", lambda key: (
        (str(int(_NOW - 40 * 60_000)) if key == "cron:last_tick"
         else str(int(_NOW - 60 * 1000)), None)
    ))
    section = wd.automation_section(_NOW)
    cron = next(f for f in section.figures if f.label == "cron tick")
    assert cron.stale is True  # 40 min > 25 min budget
    assert "40 min ago" in cron.value
    text = wd.render_text(wd.Digest(generated_at="t", sections=[section]))
    assert "STALE" in text
    fresh = next(f for f in section.figures if f.label == "monitor sweep")
    assert fresh.stale is False


def test_absent_breadcrumb_is_stale_not_a_number(monkeypatch):
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, None))
    section = wd.automation_section(_NOW)
    assert all(f.value == "absent" and f.stale is True for f in section.figures)
    assert all(f.source.startswith("GET /kv/get?key=") for f in section.figures)


def test_failed_breadcrumb_renders_unavailable(monkeypatch):
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, "read failed"))
    section = wd.automation_section(_NOW)
    assert all(f.value == "unavailable" for f in section.figures)


# ------------------------------------------------------------ dry-run + send --


@pytest.mark.asyncio
async def test_dry_run_does_not_send_or_write(monkeypatch, capsys):
    """--dry-run renders and prints; sender, briefing and KV writes untouched."""
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, None))
    monkeypatch.setattr(wd, "get_json", _capture_get)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [])
    sender = AsyncMock(return_value=True)
    briefing = AsyncMock(return_value=True)
    last_run_writer = AsyncMock(return_value=(True, None))
    monkeypatch.setattr(wd, "send_email", sender)
    monkeypatch.setattr(wd, "post_briefing", briefing)
    monkeypatch.setattr(wd, "_write_last_run", last_run_writer)

    code = await wd.main(["--dry-run"])
    assert code == 0
    assert sender.await_count == 0
    assert briefing.await_count == 0
    assert last_run_writer.await_count == 0
    out = capsys.readouterr().out
    assert "[dry-run] rendered only" in out
    assert "digest:last_run absent" in out  # gate is evaluated and reported


def _capture_get(path: str, token: str | None = None, base: str | None = None):
    if path == "/capability/matrix":
        return {
            "summary": {"total": 45, "probe-ok": 3, "probe-failed": 1, "stale": 0,
                        "configured-unprobed": 37, "documented-only": 4, "absent": 0},
            "connectors": [],
        }, None
    if path.startswith("/decision"):
        return {"blocks": [], "packages": []}, None
    if path == "/ledger/summary":
        return {"days": 7, "totals": {}, "groups": []}, None
    if path.endswith("/funnel"):
        return {"scans_30d": 137}, None
    return {"value": None}, None


@pytest.mark.asyncio
async def test_non_dry_run_send_path_uses_tag_digest_and_writes_last_run(
    monkeypatch,
):
    """A real (gated) run sends with tag 'digest', persists, marks last_run."""
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, None))
    monkeypatch.setattr(wd, "get_json", _capture_get)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [])
    sender = AsyncMock(return_value=True)
    briefing = AsyncMock(return_value=True)
    monkeypatch.setattr(wd, "send_email", sender)
    monkeypatch.setattr(wd, "post_briefing", briefing)
    written = {}
    monkeypatch.setattr(wd, "_write_last_run", lambda now: written.update(now=now) or (True, None))

    code = await wd.main([])
    assert code == 0
    assert sender.await_count == 1
    to, subject, body = sender.await_args.args[:3]
    kwargs = sender.await_args.kwargs
    assert to == "support@lazynext.com"
    assert kwargs["tag"] == "digest"
    assert "<html" in kwargs["html"]
    assert briefing.await_args.kwargs["kind"] == "digest"
    assert "now" in written  # digest:last_run written after a successful send


@pytest.mark.asyncio
async def test_recent_last_run_skips_without_sending(monkeypatch):
    """A run inside the 6.5-day window prints and exits 0, sending nothing."""
    recent = str(int(time.time() * 1000 - 2 * 24 * 3_600_000))
    monkeypatch.setattr(wd, "kv_read", lambda key: (recent, None))
    monkeypatch.setattr(wd, "get_json", _capture_get)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [])
    sender = AsyncMock(return_value=True)
    monkeypatch.setattr(wd, "send_email", sender)
    monkeypatch.setattr(wd, "post_briefing", AsyncMock(return_value=True))
    writer = AsyncMock(return_value=(True, None))
    monkeypatch.setattr(wd, "_write_last_run", writer)

    assert await wd.main([]) == 0
    assert sender.await_count == 0
    assert writer.await_count == 0


@pytest.mark.asyncio
async def test_send_failure_leaves_last_run_unwritten(monkeypatch):
    """A failed send must not mark the digest as sent — the next run retries."""
    monkeypatch.setattr(wd, "kv_read", lambda key: (None, None))
    monkeypatch.setattr(wd, "get_json", _capture_get)
    monkeypatch.setattr(wd, "breaker_figures", lambda: [])
    monkeypatch.setattr(wd, "send_email", AsyncMock(return_value=False))
    briefing = AsyncMock(return_value=True)
    monkeypatch.setattr(wd, "post_briefing", briefing)
    writer = AsyncMock(return_value=(True, None))
    monkeypatch.setattr(wd, "_write_last_run", writer)

    assert await wd.main([]) == 1
    assert writer.await_count == 0
    assert briefing.await_count == 0