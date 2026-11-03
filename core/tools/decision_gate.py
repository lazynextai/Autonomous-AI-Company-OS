"""Decision gate for the local fleet — Python mirror of worker/src/decisions.ts.

The worker's dispatch paths (`/api/v1/connectors/{id}`, `dispatchSocialPost`)
ask `decisionGate()` whether `config:decision_enforce` covers an action and,
when it does, require an approved `decision_packages` row for the target. The
fleet's `call_connector` path goes straight to provider APIs in Python, so it
never saw that gate. This module reads the SAME KV flag and the SAME D1 table
so a scope set for the worker also covers the fleet.

Mirrored from decisions.ts (keep in lockstep):

  * scope vocabulary — `off | human_only | approval | all`, legacy `"1"` ==
    `all`, unknown/blank == `off` (`parseDecisionScope`);
  * rank-based coverage — `rank(scope) >= rank(authority)` with
    scope {off:0, human_only:1, approval:2, all:3} and
    authority {human_only:1, approval:2, auto:3} (`scopeCovers`);
  * authority classification for a connector dispatch — signwell is
    `human_only`, the internal-messaging set is `auto`, everything else is
    `approval` (`classifyAuthority`);
  * the block audit row — ONE `episodic_events` row scope `decision_gate`
    with `{event, type, connector, target, authority, scope, reason, ts}`,
    which the dashboard "Gate blocks" panel renders (`recordGateBlock`).

Failure posture deliberately differs from the worker in ONE direction: the
worker fails CLOSED when the KV flag is unreadable (for non-auto actions).
Here, infrastructure failures fail SOFT — allow + log — for the same reason
the outbound breakers do: a control-plane outage must never stop the company
posting. Evidence that the scope is readable and covers the action, with no
approved package, still fails CLOSED.
"""

import datetime as _dt
import json
from typing import Any

import structlog

from core.cloudflare_client import CloudflareClient

logger = structlog.get_logger(__name__)

# Kept in lockstep with INTERNAL_MESSAGING in worker/src/decisions.ts:23-25.
# These connectors only post into a workspace we own — reversible, internal.
INTERNAL_MESSAGING = frozenset(
    {"discord", "slack", "mattermost", "teams", "zulip", "telegram", "matrix", "webhook"}
)

# Kept in lockstep with HUMAN_ONLY_CONNECTORS in decisions.ts:29. SignWell
# sends a legally binding document — a human signs off, never an agent.
HUMAN_ONLY_CONNECTORS = frozenset({"signwell"})

# Scope ranks mirror SCOPE_RANK / AUTHORITY_RANK in decisions.ts:430-431.
SCOPE_RANK: dict[str, int] = {"off": 0, "human_only": 1, "approval": 2, "all": 3}
AUTHORITY_RANK: dict[str, int] = {"human_only": 1, "approval": 2, "auto": 3}

_SCOPE_KEY = "config:decision_enforce"

# Same match as decisions.ts decisionGate(): an approved, unexpired package
# for the exact target string. `expiry_at` NULL means no expiry.
_PACKAGE_SQL = (
    "SELECT id FROM decision_packages "
    "WHERE outcome = 'approved' AND target = ? "
    "AND (expiry_at IS NULL OR datetime(expiry_at) >= datetime('now')) "
    "ORDER BY id DESC LIMIT 1"
)


def parse_decision_scope(value: Any) -> str:
    """Parse `config:decision_enforce` exactly like parseDecisionScope().

    `all`/`1` -> all (the legacy boolean stays all-enforcing), human spellings
    -> human_only, `approval` -> approval, anything else -> off.
    """
    s = str(value if value is not None else "").strip().lower()
    if s in ("all", "1"):
        return "all"
    if s in ("human_only", "human", "human-only"):
        return "human_only"
    if s == "approval":
        return "approval"
    return "off"


def scope_covers(scope: str, authority: str) -> bool:
    """A scope enforces its own class and anything narrower.

    human_only is the least powerful, auto the most autonomous:
    scope_covers("approval", "human_only") is True while
    scope_covers("approval", "auto") is False.
    """
    return SCOPE_RANK.get(scope, 0) >= AUTHORITY_RANK.get(authority, 2)


def classify_connector_authority(connector_id: str) -> str:
    """Authority class for a connector dispatch — classifyAuthority() subset.

    The fleet only dispatches `connector.dispatch`, so the other trigger
    branches in decisions.ts (billing/payment/legal/task.execute/...) are not
    reachable here. Unknown connectors default to `approval`, matching the TS
    "unclassified action defaults to approval" rule.
    """
    cid = str(connector_id or "").strip().lower()
    if cid in HUMAN_ONLY_CONNECTORS:
        return "human_only"
    if cid in INTERNAL_MESSAGING:
        return "auto"
    return "approval"


async def _record_gate_block(
    client: CloudflareClient,
    connector_id: str,
    action_type: str,
    authority: str,
    scope: str,
    reason: str,
) -> None:
    """Write the visible "blocked, not broken" audit row. Never raises.

    The write must not change the gate result — same as recordGateBlock() in
    decisions.ts: a failing audit write is logged, the block still stands.
    """
    payload = {
        "event": "decision_gate_blocked",
        "type": str(action_type or ""),
        "connector": connector_id,
        "target": connector_id,
        "authority": authority,
        "scope": scope,
        "reason": reason[:500],
        "ts": _dt.datetime.now(_dt.timezone.utc).isoformat(),
    }
    try:
        await client.aexecute(
            "INSERT INTO episodic_events (scope, payload) VALUES ('decision_gate', ?)",
            [json.dumps(payload)],
        )
    except Exception as e:  # noqa: BLE001 — observability, not the decision
        logger.error("decision_gate_block_write_failed", connector=connector_id, error=str(e))


async def check_decision(connector_id: str, action_type: str = "connector.dispatch") -> dict[str, Any]:
    """Check the decision gate before the fleet dispatches to a connector.

    Returns `{"allow": bool, "mode": str, "reason": str|None, "package_id": int|None}`
    where `mode` is the resolved scope (`off|human_only|approval|all`) or
    `unavailable` when the control plane could not be read.

    - Scope off (or not covering this authority class) -> allow, not enforced.
    - Scope covers + an approved, unexpired package for the target -> allow.
    - Scope covers + no package -> BLOCK, one `decision_gate` audit row.
    - KV/D1 unreadable -> allow + log (fail SOFT: a control-plane outage must
      not stop company posting). Only evidence blocks.
    """
    authority = classify_connector_authority(connector_id)
    client: CloudflareClient | None = None
    try:
        client = CloudflareClient()
        try:
            flag = await client.kv_get(_SCOPE_KEY)
        except Exception as e:  # noqa: BLE001 — infra outage fails soft
            logger.error("decision_gate_read_failed", connector=connector_id,
                         error=f"scope read failed: {e}")
            return {"allow": True, "mode": "unavailable",
                    "reason": f"decision gate unavailable: scope read failed: {e}",
                    "package_id": None}

        scope = parse_decision_scope(flag)
        if scope == "off" or not scope_covers(scope, authority):
            return {"allow": True, "mode": scope, "reason": None, "package_id": None}

        try:
            rows = await client.aquery(_PACKAGE_SQL, [connector_id])
        except Exception as e:  # noqa: BLE001 — infra outage fails soft
            logger.error("decision_gate_read_failed", connector=connector_id,
                         error=f"package read failed: {e}")
            return {"allow": True, "mode": scope,
                    "reason": f"decision gate unavailable: package read failed: {e}",
                    "package_id": None}

        if rows:
            pid = (rows[0] or {}).get("id")
            return {"allow": True, "mode": scope, "reason": None,
                    "package_id": int(pid) if pid is not None else None}

        reason = (
            f"no approved decision package for '{connector_id}' "
            f"(authority {authority}, scope {scope})"
        )
        await _record_gate_block(client, connector_id, action_type, authority, scope, reason)
        return {"allow": False, "mode": scope, "reason": reason, "package_id": None}
    except Exception as e:  # noqa: BLE001 — constructor/close/helper escape hatch
        logger.error("decision_gate_read_failed", connector=connector_id,
                     error=f"gate error: {e}")
        return {"allow": True, "mode": "unavailable",
                "reason": f"decision gate error: {e}", "package_id": None}
    finally:
        if client is not None:
            try:
                await client.close()
            except Exception:  # noqa: BLE001 — closes are best-effort
                pass
