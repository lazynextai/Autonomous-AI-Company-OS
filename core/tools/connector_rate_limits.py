"""Per-connector daily dispatch caps — the fleet mirror of the Worker counter.

`worker/src/services.ts` (`consumeConnectorDailyCap` / `peekConnectorDailyCap`)
owns the same contract:

  key shape   ``rl:conn:<connector_id>:<utc_day>``   — shared KV namespace
  utc_day     ``floor(unix_ms / 86_400_000)``         — UTC midnight boundary
  ttl         172_800 seconds = 2 x the one-day window

The key shape and TTL are taken verbatim from the counter the platform already
ships for the public waitlist limiter (``rl:waitlist:<ip>:<day>``,
``expirationTtl: 172_800`` in ``worker/src/public_api.ts``), not invented here.

Why the SAME key as the Worker: both runtimes write ``env.EPHEMERAL`` through
the platform's own ``/kv/*`` routes, so a fleet ``x`` post and a Worker ``x``
post debit one counter. Two counters would let the pair overshoot the
provider's published ceiling by 2x — the one outcome this guard exists to
prevent.

TTL trap this sidesteps: ``/kv/put`` floors a missing ttl at 60 seconds (see
``worker/src/index.ts``), and ``CloudflareClient.kv_put`` defaults to
``ttl=60``. A 60-second daily counter would reset every minute and enforce
nothing, so the ttl is ALWAYS passed explicitly.

FAIL-OPEN, deliberately — the same choice the Worker makes. A KV read/write
failure means the ceiling cannot be *measured*, not that it was reached;
refusing to post during a control-plane outage would convert an accounting gap
into an outage of its own. (The breaker is the opposite case: a governance
control that fails closed. Capacity vs governance is the distinction.)
"""

from __future__ import annotations

import datetime as _dt
import time
from typing import Any, Awaitable, Callable

import structlog

from core.cloudflare_client import CloudflareClient
from core.tools.connector_capabilities import capability_of

logger = structlog.get_logger(__name__)

DAY_MS = 86_400_000
# 2 x the one-day window — a counter must outlive its own day. Matches the
# `rl:waitlist` limiter; never rely on the kv_put default of 60s.
CAP_TTL_SECONDS = 172_800


def utc_day(now_ms: int | None = None) -> int:
    """UTC day index — the same bucketing the Worker uses."""
    ms = now_ms if now_ms is not None else int(time.time() * 1000)
    return ms // DAY_MS


def connector_cap_key(connector_id: str, day: int | None = None) -> str:
    """``rl:conn:<connector_id>:<utc_day>`` — one counter per connector per day."""
    return f"rl:conn:{connector_id}:{utc_day() if day is None else day}"


def cap_resets_at(now_ms: int | None = None) -> str:
    """ISO-8601 UTC timestamp of the next midnight — when the counter expires."""
    day = utc_day(now_ms)
    return _dt.datetime.fromtimestamp(
        (day + 1) * DAY_MS / 1000, tz=_dt.timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _per_day(connector_id: str) -> int | None:
    cap = capability_of(connector_id) or {}
    return (cap.get("rate_limit") or {}).get("per_day")


def _counter_value(raw: str | None) -> int:
    try:
        n = int(str(raw or "0").strip())
    except (TypeError, ValueError):
        return 0
    return n if n > 0 else 0


async def _run(
    fn: Callable[[CloudflareClient], Awaitable[Any]],
    client: CloudflareClient | None,
) -> Any:
    """Run `fn` against a client, closing only one this call created."""
    own = client is None
    c = client or CloudflareClient()
    try:
        capable = getattr(c, "is_configured", None)
        if capable is not None and not capable():
            raise RuntimeError("cloudflare client not configured — no KV counter store")
        return await fn(c)
    finally:
        if own:
            try:
                await c.close()
            except Exception:  # noqa: BLE001 — closes are best-effort
                pass


async def peek_connector_daily_cap(
    connector_id: str, *, client: CloudflareClient | None = None,
) -> dict[str, Any]:
    """Read the counter WITHOUT consuming a slot (what a dry run reports).

    A preview has no external effect, so it must never spend capacity.
    """
    per_day = _per_day(connector_id)
    day = utc_day()
    if per_day is None:
        return {"limited": False, "per_day": None, "used": None,
                "remaining": None, "day": day}
    try:
        raw = await _run(lambda c: c.kv_get(connector_cap_key(connector_id, day)), client)
        used = _counter_value(raw)
        return {"limited": True, "per_day": per_day, "used": used,
                "remaining": max(per_day - used, 0), "day": day}
    except Exception as e:  # noqa: BLE001 — capacity guard fails OPEN
        logger.warning("connector_cap_read_failed", connector=connector_id, error=str(e))
        return {"limited": True, "per_day": per_day, "used": None,
                "remaining": None, "day": day, "degraded": True}


async def consume_connector_daily_cap(
    connector_id: str, *, client: CloudflareClient | None = None,
) -> dict[str, Any]:
    """Consume one slot if the connector has a ceiling and the day is not full.

    KV has no atomic increment, so two racing dispatches can both read ``n`` and
    write ``n+1`` — the counter then under-counts by the number of in-flight
    calls. For a capacity ceiling that is the safe direction to be wrong in (it
    can over-admit by a handful; it never refuses a send the counter says is
    allowed), and the provider's own API remains the backstop.
    """
    state = await peek_connector_daily_cap(connector_id, client=client)
    if not state["limited"] or state.get("degraded"):
        return {**state, "allow": True}
    used = state["used"] or 0
    per_day = state["per_day"]
    if used >= per_day:
        return {
            **state,
            "allow": False,
            "remaining": 0,
            "error": f"'{connector_id}' daily cap reached ({per_day}/day)",
        }
    try:
        await _run(
            lambda c: c.kv_put(
                connector_cap_key(connector_id, state["day"]),
                str(used + 1),
                ttl=CAP_TTL_SECONDS,
            ),
            client,
        )
    except Exception as e:  # noqa: BLE001 — capacity guard fails OPEN
        logger.warning("connector_cap_write_failed", connector=connector_id, error=str(e))
        return {**state, "allow": True, "used": None, "remaining": None, "degraded": True}
    return {**state, "allow": True, "used": used + 1, "remaining": per_day - used - 1}
