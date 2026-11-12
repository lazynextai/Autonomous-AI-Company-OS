"""Unit tests for the throttled Workers KV cache in `company_brain_cached`.

Workers KV allows roughly one write **or** delete per second per key, but the
fleet's agents touch the brain on every tick. Before coalescing, concurrent
agents invalidated `company_brain:cache` in bursts that the platform rejected
with HTTP 500 (measured: 159 failures in a day — 112 delete, 47 put — against
5,560 successful KV calls), and both call sites swallowed the error with a bare
`except: pass`, so the cache simply stopped refreshing with no trace.

The tests lock:
  - `get()` refills the cache at most once per `CACHE_TTL` window,
  - a fresh cache entry short-circuits D1 entirely,
  - `update_field()` deletes at most once per `DELETE_INTERVAL`,
  - a delete is allowed again once the interval has elapsed,
  - KV failures are swallowed (never break the brain read/write path).

No network and no D1: the cache client is a counting fake and the parent
`CompanyBrain.get`/`update_field` are replaced with async stubs.
"""

from unittest.mock import AsyncMock

import pytest

from core.memory.company_brain import CompanyBrain, CompanyBrainSchema
from core.memory import company_brain_cached as cached_mod
from core.memory.company_brain_cached import CACHE_KEY, CACHE_TTL, DELETE_INTERVAL


class FakeCacheClient:
    """Counting stand-in for CloudflareClient's KV surface."""

    def __init__(self) -> None:
        self.gets = 0
        self.puts = 0
        self.deletes = 0
        self.put_payloads: list[tuple[str, str, int | None]] = []
        self.kv_get = AsyncMock(side_effect=self._kv_get)
        self.kv_put = AsyncMock(side_effect=self._kv_put)
        self.kv_delete = AsyncMock(side_effect=self._kv_delete)
        self.stored: str | None = None
        self.raise_on_put = False
        self.raise_on_delete = False

    async def _kv_get(self, key: str) -> str | None:
        self.gets += 1
        return self.stored

    async def _kv_put(self, key: str, value: str, ttl: int | None = None) -> None:
        self.puts += 1
        self.put_payloads.append((key, value, ttl))
        if self.raise_on_put:
            raise RuntimeError("KV put throttled (HTTP 500)")
        self.stored = value

    async def _kv_delete(self, key: str) -> None:
        self.deletes += 1
        if self.raise_on_delete:
            raise RuntimeError("KV delete throttled (HTTP 500)")
        self.stored = None

    def expire(self) -> None:
        """Simulate the KV TTL elapsing (next get misses)."""
        self.stored = None


class FakeClock:
    """Deterministic `time.monotonic` replacement."""

    def __init__(self, start: float = 1_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, delta: float) -> None:
        self.now += delta


@pytest.fixture
def brain(monkeypatch):
    """CachedCompanyBrain with fake cache, fake clock and stubbed D1 parent."""

    async def _fake_get(self):
        return CompanyBrainSchema(id="1", product_name="Lazynext", mission="test")

    async def _fake_update_field(self, field, value):
        return None

    monkeypatch.setattr(CompanyBrain, "get", _fake_get)
    monkeypatch.setattr(CompanyBrain, "update_field", _fake_update_field)

    obj = cached_mod.CachedCompanyBrain()
    cache = FakeCacheClient()
    clock = FakeClock()
    monkeypatch.setattr(obj, "_get_cache", lambda: cache)
    monkeypatch.setattr(cached_mod.time, "monotonic", clock)
    return obj, cache, clock


async def test_two_rapid_gets_put_once(brain):
    """A second get inside the TTL window must not re-put the same key."""
    obj, cache, clock = brain

    first = await obj.get()
    clock.advance(1.0)  # well inside the 60s TTL window
    second = await obj.get()

    assert first.product_name == second.product_name == "Lazynext"
    assert cache.gets == 2
    assert cache.puts == 1, "second get must be coalesced into the TTL window"
    assert cache.kv_put.await_args.args[0] == CACHE_KEY
    assert cache.put_payloads[0][2] == CACHE_TTL


async def test_get_refills_after_ttl_window(brain):
    """Once the cache entry expires past the TTL window it is refilled again."""
    obj, cache, clock = brain

    await obj.get()
    cache.expire()
    clock.advance(CACHE_TTL)
    await obj.get()

    assert cache.gets == 2
    assert cache.puts == 2


async def test_get_serves_fresh_cache_without_d1(monkeypatch):
    """A valid cache entry short-circuits the parent D1 read."""
    parent_reads = 0

    async def _fake_get(self):
        nonlocal parent_reads
        parent_reads += 1
        return CompanyBrainSchema(product_name="Lazynext")

    monkeypatch.setattr(CompanyBrain, "get", _fake_get)
    obj = cached_mod.CachedCompanyBrain()
    cache = FakeCacheClient()
    cache.stored = CompanyBrainSchema(product_name="Cached Co").model_dump_json()
    monkeypatch.setattr(obj, "_get_cache", lambda: cache)

    result = await obj.get()

    assert result.product_name == "Cached Co"
    assert parent_reads == 0
    assert cache.puts == 0


async def test_two_rapid_update_field_deletes_once(brain):
    """Two same-instant invalidations collapse into one KV delete."""
    obj, cache, _clock = brain

    await obj.update_field("mission", "a")
    await obj.update_field("mission", "b")

    assert cache.deletes == 1


async def test_update_field_deletes_again_after_interval(brain):
    """A later write reverts the invalidation once >= DELETE_INTERVAL passed."""
    obj, cache, clock = brain

    await obj.update_field("mission", "a")
    clock.advance(DELETE_INTERVAL)
    await obj.update_field("mission", "b")

    assert cache.deletes == 2


async def test_update_field_still_coalesced_just_under_interval(brain):
    """Just under the interval the second delete stays suppressed."""
    obj, cache, clock = brain

    await obj.update_field("mission", "a")
    clock.advance(DELETE_INTERVAL - 0.001)
    await obj.update_field("mission", "b")

    assert cache.deletes == 1


async def test_kv_failures_never_break_get_or_update(brain):
    """Throttled KV errors are logged (not re-raised) by both call sites."""
    obj, cache, clock = brain
    cache.raise_on_put = True
    cache.raise_on_delete = True

    result = await obj.get()
    assert result.product_name == "Lazynext"
    assert cache.puts == 1

    # A failed put must not be retried within the same window: the throttle is
    # what the coalescing protects, so the timestamp is still consumed.
    await obj.get()
    assert cache.puts == 1

    await obj.update_field("mission", "changed")
    assert cache.deletes == 1
    await obj.update_field("mission", "again")
    assert cache.deletes == 1
