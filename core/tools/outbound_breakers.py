"""Outbound breaker gate for the local fleet — Python mirror of worker/src/breakers.ts.

The worker CLI/worker-side dispatch reads `outbound_breaker_config` (D1) and
counts `episodic_events` (scope='connector') to trip per-connector circuit
breakers. The fleet's `call_connector` path goes straight to provider APIs in
Python, so it never saw those stops. This module reads the SAME D1 state so a
trip reason recorded by either runtime covers both.

Semantics mirrored from breakers.ts `evaluatePolicy` (order matters):
  1. enabled=0  -> always allow
  2. volume     -> dispatch_total >= volume_limit, over volume_window_ms
  3. failures   -> dispatch_failed >= failure_limit, over failure_window_ms
  4. error rate -> total >= 5 AND failed/total >= error_rate_limit
  5. deliverability -> EMAIL connectors only, email_events degraded ratio
     over deliverability_window_ms (total >= 10)
A persisted `tripped_reason` on the config row (written by the worker's
`noteBreakerTrip` as "<connector>: <reason>") additionally fails closed for
THAT connector while it stands.

Mode is `observe` by default (logs the would-be reason, never blocks). Set
`CONN_BREAKER_MODE=active` to enforce. Reading state fails SOFT (post anyway)
so a control-plane outage can never stop company posting; evidence of a real
exceeded limit or tripped row fails closed per connector.
"""

import datetime as _dt
import math
import os
from typing import Any

import structlog

from core.cloudflare_client import CloudflareClient

logger = structlog.get_logger(__name__)

# Kept in lockstep with DEFAULT_POLICY in worker/src/breakers.ts.
DEFAULT_POLICY: dict[str, Any] = {
    "enabled": 1,
    "volume_limit": 100,
    "volume_window_ms": 3_600_000,
    "failure_limit": 5,
    "failure_window_ms": 600_000,
    "error_rate_limit": 0.5,
    "error_rate_window_ms": 600_000,
    "deliverability_limit": 0.2,
    "deliverability_window_ms": 86_400_000,
}

# Only these connectors' outbound is email — a bounce rate says nothing
# about a tweet. Mirrors EMAIL_CONNECTORS in breakers.ts.
EMAIL_CONNECTORS = frozenset({"brevo", "listmonk", "beehiiv"})

MIN_ERROR_SAMPLE = 5   # error rate is inconclusive below this many dispatches
MIN_EMAIL_SAMPLE = 10  # deliverability is inconclusive below this many events

# Mirrors DEGRADED_EVENTS in breakers.ts (compare the NORMALIZED event name).
_DEGRADED_EVENTS = frozenset(
    {"spam", "complaint", "hardbounce", "invalidemail", "invalid", "blocked"}
)

_CONFIG_SQL = "SELECT * FROM outbound_breaker_config WHERE id = 1"
_DISPATCH_SQL = (
    "SELECT COUNT(*) AS c FROM episodic_events "
    "WHERE scope = 'connector' AND datetime(created_at) >= datetime(?) "
    "AND json_extract(payload, '$.id') = ?"
)
_DISPATCH_FAILED_SQL = _DISPATCH_SQL + " AND json_extract(payload, '$.ok') = 0"
_EMAIL_SQL = (
    "SELECT event, COUNT(*) AS c FROM email_events "
    "WHERE datetime(created_at) >= datetime(?) GROUP BY event"
)


def _current_mode() -> str:
    """CONN_BREAKER_MODE=active arms enforcement; anything else observes."""
    return "active" if os.environ.get("CONN_BREAKER_MODE", "").strip().lower() == "active" else "observe"


def _int(value: Any, fallback: int, minimum: int = 1) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return fallback
    return n if n >= minimum else fallback


def _float(value: Any, fallback: float, minimum: float = 0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    return n if math.isfinite(n) and n >= minimum else fallback


def _normalize_event(name: Any) -> str:
    # Brevo payloads carry snake_case ('hard_bounce') while registrations use
    # camelCase ('hardBounce') — same normalization as breakers.ts.
    return str(name or "").lower().replace("_", "").replace("-", "")


def _window_minutes(window_ms: Any) -> int:
    return round(_int(window_ms, 86_400_000) / 60_000)


async def _load_policy(client: CloudflareClient) -> tuple[dict[str, Any], str | None]:
    """Read the worker's config row, merged over the defaults. Never raises."""
    try:
        rows = await client.aquery(_CONFIG_SQL)
    except Exception as e:  # noqa: BLE001 — infra outage fails soft
        return {}, f"breaker config read failed: {e}"
    policy = {**DEFAULT_POLICY}
    if rows:
        policy.update({k: rows[0].get(k) for k in DEFAULT_POLICY if rows[0].get(k) is not None})
    return policy, None


async def _dispatch_stats(
    client: CloudflareClient, policy: dict[str, Any], connector: str
) -> tuple[int, int, str | None]:
    """"Count scope='connector' dispatches (and failures) for one connector,
    exactly like breakers.ts dispatchStats()."""
    volume_cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(
        milliseconds=_int(policy.get("volume_window_ms"), 3_600_000)
    )).isoformat()
    failure_cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(
        milliseconds=_int(policy.get("failure_window_ms"), 600_000)
    )).isoformat()
    try:
        total_rows = await client.aquery(_DISPATCH_SQL, [volume_cutoff, connector])
        failed_rows = await client.aquery(_DISPATCH_FAILED_SQL, [failure_cutoff, connector])
    except Exception as e:  # noqa: BLE001
        return 0, 0, f"breaker dispatch stats read failed: {e}"
    return int((total_rows[0] or {}).get("c") or 0), int((failed_rows[0] or {}).get("c") or 0), None


async def _email_stats(client: CloudflareClient, policy: dict[str, Any]) -> tuple[int, int, str | None]:
    """Deliverability signal from email_events; a missing/legacy table must
    degrade to 'no signal', never to a permanent global stop (same as breakers.ts)."""
    cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(
        milliseconds=_int(policy.get("deliverability_window_ms"), 86_400_000)
    )).isoformat()
    try:
        rows = await client.aquery(_EMAIL_SQL, [cutoff])
    except Exception as e:  # noqa: BLE001
        return 0, 0, f"breaker email stats read failed: {e}"
    total = degraded = 0
    for row in rows:
        count = int((row or {}).get("c") or 0)
        total += count
        if _normalize_event(row.get("event")) in _DEGRADED_EVENTS:
            degraded += count
    return total, degraded, None


def _tripped_reason(policy: dict[str, Any], connector: str) -> str | None:
    """The config row's tripped_reason is '<connector>: <reason>' (written by
    the worker's noteBreakerTrip) — a trip blocks only the connector it names."""
    tripped = policy.get("tripped_reason")
    if not tripped:
        return None
    marker = f"{connector}: "
    return str(tripped)[len(marker):] if str(tripped).startswith(marker) else None


def _window_reason(policy: dict[str, Any], total: int, failed: int, connector: str) -> str | None:
    """Pure policy evaluation, ordered exactly like breakers.ts evaluatePolicy()."""
    if total >= _int(policy.get("volume_limit"), 100):
        window = _window_minutes(policy.get("volume_window_ms"))
        return f"volume: {total} dispatches in {window}m (limit {_int(policy.get('volume_limit'), 100)})"
    if failed >= _int(policy.get("failure_limit"), 5):
        window = _window_minutes(policy.get("failure_window_ms"))
        return f"provider failures: {failed} in {window}m (limit {_int(policy.get('failure_limit'), 5)})"
    if total >= MIN_ERROR_SAMPLE and failed / total >= _float(policy.get("error_rate_limit"), 0.5):
        rate = round(failed / total * 100)
        limit = round(_float(policy.get("error_rate_limit"), 0.5) * 100)
        return f"error rate: {rate}% (limit {limit}%)"
    # deliverability (5th policy) is evaluated separately from email_events
    # via _deliverability_reason, mirroring breakers.ts.
    return None


def _deliverability_reason(policy: dict[str, Any], email_total: int, email_degraded: int, connector: str) -> str | None:
    if connector not in EMAIL_CONNECTORS:
        return None
    if email_total < MIN_EMAIL_SAMPLE or email_total <= 0:
        return None
    limit = _float(policy.get("deliverability_limit"), 0.2)
    if email_degraded / email_total >= limit:
        window = _window_minutes(policy.get("deliverability_window_ms"))
        return (
            f"deliverability: {round(email_degraded / email_total * 100)}% degraded events "
            f"(limit {round(limit * 100)}%, {window}d)"
        )
    return None


async def check_outbound(connector_id: str) -> dict[str, Any]:
    """Check the breaker for this connector before the fleet dispatches.

    Returns {"allow": bool, "mode": "observe"|"active", "reason": str|None}.
    - observe (default): allow is always True; a would-be trip is logged as
      `outbound_breaker_observe` so operators see the reason without impact.
    - active: allow is False for this connector when the row is tripped for it
      or any window limit is exceeded.
    - Infrastructure read failures fail SOFT (allow=True, reason notes it) —
      the company must keep posting through a control-plane outage.
    """
    mode = _current_mode()
    client: CloudflareClient | None = None
    try:
        client = CloudflareClient()
        policy, config_err = await _load_policy(client)
        if config_err:
            logger.error("outbound_breaker_read_failed", connector=connector_id, error=config_err)
            return {"allow": True, "mode": mode, "reason": config_err}

        total, failed, stats_err = await _dispatch_stats(client, policy, connector_id)
        if stats_err:
            logger.error("outbound_breaker_read_failed", connector=connector_id, error=stats_err)
            return {"allow": True, "mode": mode, "reason": stats_err}

        email_total, email_degraded, email_err = await _email_stats(client, policy)
        if email_err:
            logger.error("outbound_breaker_read_failed", connector=connector_id, error=email_err)
            return {"allow": True, "mode": mode, "reason": email_err}
    except Exception as e:  # noqa: BLE001 — constructor/close/helper escape hatch
        logger.error("outbound_breaker_read_failed", connector=connector_id, error=f"gate error: {e}")
        return {"allow": True, "mode": mode, "reason": f"breaker gate error: {e}"}
    finally:
        if client is not None:
            try:
                await client.close()
            except Exception:  # noqa: BLE001 — closes are best-effort
                pass

    reason: str | None = None
    if _int(policy.get("enabled"), 1):
        reason = (
            _tripped_reason(policy, connector_id)
            or _window_reason(policy, total, failed, connector_id)
            or _deliverability_reason(policy, email_total, email_degraded, connector_id)
        )

    if mode == "observe" and reason:
        # Would-be trip — log it, keep posting (default posture).
        logger.info("outbound_breaker_observe", connector=connector_id, reason=reason)
        return {"allow": True, "mode": mode, "reason": reason}
    if reason:
        return {"allow": False, "mode": mode, "reason": reason}
    return {"allow": True, "mode": mode, "reason": None}