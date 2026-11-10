"""Per-connector daily caps — the fleet half of `rl:conn:<id>:<utcDay>`.

What this pins:

1. COUNTER — the key shape, the UTC day bucket, and the explicit two-day TTL.
   `/kv/put` floors a missing ttl at 60 seconds, so a "daily" counter without an
   explicit ttl would reset every minute and enforce nothing.
2. CAP — refuse at `per_day`, allow below it, leave uncapped connectors alone.
3. WIRING — `call_connector` refuses before the breaker and the decision gate
   and before any dispatch function runs.
4. DRY RUN — reads the counter, never consumes it.
5. FAIL-OPEN — a KV failure allows the send instead of turning a capacity
   guard into an outage.

Every test passes a fake client; nothing here can reach production KV.
"""

import datetime as _dt
import time

import pytest

from core.tools import connector_capabilities as cc
from core.tools import connector_rate_limits as rl
from core.tools import connectors

DAY_MS = rl.DAY_MS


def _today() -> int:
    return int(time.time() * 1000) // DAY_MS


class FakeClient:
    """Minimal CloudflareClient stand-in — records ttl so it can be asserted."""

    def __init__(self, seed: dict[str, str] | None = None, *, read_error: Exception | None = None,
                 write_error: Exception | None = None, configured: bool = True):
        self.map = dict(seed or {})
        self.puts: list[tuple[str, str, int | None]] = []
        self._read_error = read_error
        self._write_error = write_error
        self._configured = configured

    def is_configured(self) -> bool:
        return self._configured

    async def kv_get(self, key: str):
        if self._read_error:
            raise self._read_error
        return self.map.get(key)

    async def kv_put(self, key: str, value: str, ttl: int | None = None) -> None:
        if self._write_error:
            raise self._write_error
        self.puts.append((key, value, ttl))
        self.map[key] = value

    async def close(self) -> None:
        return None


# --- 1. the counter ---------------------------------------------------------
def test_key_shape_is_rl_conn_id_utcday():
    assert rl.connector_cap_key("x", 20370) == "rl:conn:x:20370"
    assert rl.connector_cap_key("linkedin") == f"rl:conn:linkedin:{_today()}"
    # Same bucket the worker uses: floor(unix_ms / 86_400_000).
    assert rl.utc_day(20370 * DAY_MS + 5) == 20370


def test_resets_at_is_the_next_utc_midnight():
    now_ms = 1_700_000_123_456
    expected = _dt.datetime.fromtimestamp(
        ((now_ms // DAY_MS) + 1) * DAY_MS / 1000, tz=_dt.timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    assert rl.cap_resets_at(now_ms) == expected
    assert rl.cap_resets_at(now_ms).endswith("T00:00:00.000Z")


@pytest.mark.anyio
async def test_consume_writes_the_counter_with_an_explicit_two_day_ttl():
    client = FakeClient()
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is True
    assert v["used"] == 1
    assert v["remaining"] == 16
    assert client.puts == [(f"rl:conn:x:{_today()}", "1", rl.CAP_TTL_SECONDS)]
    assert rl.CAP_TTL_SECONDS == 172_800  # 2 x the one-day window


@pytest.mark.anyio
async def test_uncapped_connectors_are_not_counted_at_all():
    client = FakeClient()
    assert cc.CONNECTOR_CAPABILITIES["reddit"]["rate_limit"]["per_day"] is None
    v = await rl.consume_connector_daily_cap("reddit", client=client)
    assert v["allow"] is True
    assert v["limited"] is False
    assert v["used"] is None
    assert client.puts == []
    assert client.map == {}


@pytest.mark.anyio
async def test_the_ceiling_comes_from_the_table():
    client = FakeClient()
    assert (await rl.consume_connector_daily_cap("x", client=client))["per_day"] == 17
    assert (await rl.consume_connector_daily_cap("linkedin", client=client))["per_day"] == 100
    assert (await rl.consume_connector_daily_cap("pinterest", client=client))["per_day"] == 1000


@pytest.mark.anyio
async def test_at_the_ceiling_the_send_is_refused_and_nothing_is_written():
    client = FakeClient({f"rl:conn:x:{_today()}": "17"})
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is False
    assert v["error"] == "'x' daily cap reached (17/day)"
    assert v["per_day"] == 17 and v["used"] == 17 and v["remaining"] == 0
    assert client.puts == []


@pytest.mark.anyio
async def test_a_malformed_counter_reads_as_zero():
    client = FakeClient({f"rl:conn:x:{_today()}": "garbage"})
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is True and v["used"] == 1


# --- 2. peek ---------------------------------------------------------------
@pytest.mark.anyio
async def test_peek_never_writes():
    client = FakeClient({f"rl:conn:x:{_today()}": "5"})
    state = await rl.peek_connector_daily_cap("x", client=client)
    assert state == {"limited": True, "per_day": 17, "used": 5,
                     "remaining": 12, "day": _today()}
    assert client.puts == []


# --- 3. fail-open ----------------------------------------------------------
@pytest.mark.anyio
async def test_a_kv_read_failure_allows_the_send_and_says_it_is_degraded():
    client = FakeClient(read_error=RuntimeError("KV unavailable"))
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is True, "a capacity limit must fail OPEN"
    assert v["degraded"] is True
    assert v["used"] is None


@pytest.mark.anyio
async def test_a_kv_write_failure_also_allows_the_send():
    client = FakeClient({f"rl:conn:x:{_today()}": "3"},
                        write_error=RuntimeError("KV write rejected"))
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is True
    assert v["degraded"] is True
    assert v["used"] is None


@pytest.mark.anyio
async def test_an_unconfigured_client_degrades_instead_of_blocking(monkeypatch):
    """No Cloudflare config ⇒ no counter ⇒ allow, with a warning — never a 429."""
    client = FakeClient(configured=False)
    v = await rl.consume_connector_daily_cap("x", client=client)
    assert v["allow"] is True
    assert v["degraded"] is True


# --- 4. the dispatch wiring ------------------------------------------------
@pytest.fixture
def wired(monkeypatch):
    """A connector that is connected, capped, and whose provider must not run."""
    called: list[str] = []

    async def _cred(_cid):
        return "fake-x-bearer-token"

    async def _never(*_a, **_k):  # pragma: no cover - guard
        called.append("provider")
        raise AssertionError("a capped send must not reach the provider")

    async def _should_not_run(*_a, **_k):  # pragma: no cover - guard
        raise AssertionError("the cap runs before the breaker and the decision gate")

    monkeypatch.setattr(connectors, "_credential", _cred)
    # `_post` is the seam every dispatch builds through (`_x` is captured in
    # `_DISPATCH` at import, so patching the name would not reach the call).
    monkeypatch.setattr(connectors, "_post", _never)
    monkeypatch.setattr(connectors, "check_outbound", _should_not_run)
    monkeypatch.setattr(connectors, "check_decision", _should_not_run)
    return called


@pytest.mark.anyio
async def test_call_connector_refuses_at_the_cap_before_any_provider_call(wired, monkeypatch):
    client = FakeClient({f"rl:conn:x:{_today()}": "17"})

    async def _consume(cid, **_kw):
        return await rl.consume_connector_daily_cap(cid, client=client)

    monkeypatch.setattr(connectors, "consume_connector_daily_cap", _consume)
    out = await connectors.call_connector("x", "eighteenth post")
    assert out["ok"] is False
    assert out["rate_limited"] is True
    assert out["per_day"] == 17
    assert out["used"] == 17
    assert out["error"] == "'x' daily cap reached (17/day)"
    assert out["resets_at"].endswith("T00:00:00.000Z")
    assert wired == [], "no provider call"
    assert client.puts == [], "the refusal must not spend a slot"


@pytest.mark.anyio
async def test_call_connector_under_the_cap_proceeds_and_debits_one_slot(wired, monkeypatch):
    client = FakeClient({f"rl:conn:x:{_today()}": "3"})
    ran: list[str] = []

    async def _post(url, **kwargs):
        ran.append(str(url))
        return {"status": 200, "ok": True, "body": {"data": {"id": "1"}}}

    async def _allow(*_a, **_k):
        return {"allow": True, "reason": None}

    async def _consume(cid, **_kw):
        return await rl.consume_connector_daily_cap(cid, client=client)

    monkeypatch.setattr(connectors, "_post", _post)
    monkeypatch.setattr(connectors, "check_outbound", _allow)
    monkeypatch.setattr(connectors, "check_decision", _allow)
    monkeypatch.setattr(connectors, "consume_connector_daily_cap", _consume)

    out = await connectors.call_connector("x", "fourth post")
    assert out["ok"] is True
    assert ran == ["https://api.x.com/2/tweets"], "the provider seam is reached under the cap"
    assert client.puts == [(f"rl:conn:x:{_today()}", "4", rl.CAP_TTL_SECONDS)]


def _forbid_real_httpx(monkeypatch):
    """Any transport that is not the dry recorder must explode."""
    import httpx

    class _Forbidden(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):  # pragma: no cover - guard
            raise AssertionError(f"dry run attempted a network call to {request.url}")

    real_init = httpx.AsyncClient.__init__

    def _init(self, *args, **kwargs):
        if not isinstance(kwargs.get("transport"), connectors._DryTransport):
            kwargs["transport"] = _Forbidden()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)


@pytest.mark.anyio
async def test_a_dry_run_reads_the_counter_and_consumes_nothing(monkeypatch):
    async def _cred(_cid):
        return "fake-x-bearer-token"

    monkeypatch.setattr(connectors, "_credential", _cred)
    client = FakeClient({f"rl:conn:x:{_today()}": "5"})

    async def _peek(cid, **_kw):
        return await rl.peek_connector_daily_cap(cid, client=client)

    async def _must_not_consume(*_a, **_k):  # pragma: no cover - guard
        raise AssertionError("a dry run must never consume the cap")

    monkeypatch.setattr(connectors, "peek_connector_daily_cap", _peek)
    monkeypatch.setattr(connectors, "consume_connector_daily_cap", _must_not_consume)
    _forbid_real_httpx(monkeypatch)

    report = await connectors.call_connector("x", "preview me", dry_run=True)
    assert report["supported"] is True
    assert report["rate_limit"]["per_day"] == 17
    assert report["rate_limit"]["enforced"] is True
    assert report["rate_limit"]["used"] == 5
    assert report["rate_limit"]["remaining"] == 12
    assert client.puts == [], "a preview must not spend capacity"
    assert client.map[f"rl:conn:x:{_today()}"] == "5"
