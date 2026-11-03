"""Fleet-side observer pass — Python mirror of `worker/src/observer.ts`.

The worker's P4 observer (`observeTaskDispatch`, registered with
`ctx.waitUntil` immediately before `executeTask` in `agentTick`) is wired
correctly but sees almost no production traffic: real task execution happens
fleet-side, and `get_tasks_by_status` has zero callers in the Python codebase,
so the worker's `pending` seam is structurally bypassed. This module mirrors
the SAME review onto the path that actually dispatches work.

Classification semantics are deliberately identical to the worker — same
verdict vocabulary (`safe | evidence_gap | policy_concern`), same gap codes,
same policy-flag codes, same SHA-256 plan digest (first 8 bytes, hex). The
point is that one `episodic_events` row shape exists regardless of which
runtime observed the dispatch.

Observe-only, additive, and fail-soft by construction:
- `CONN_OBSERVER_MODE=observe` (default) records a verdict; `off` writes
  nothing. Anything else (unknown/blank) observes — an unreadable switch must
  not silence the record.
- The mode resolves `os.environ` -> pydantic `Settings` -> `observe`, because
  `scripts/run_agents.py` never calls `load_dotenv` (same defect the breaker
  gate had: a bare `os.environ` read is a silent no-op under launchd).
- Every error is swallowed with a log line. This runs inline with real
  production work, so it must never delay, block, fail, or alter a task.
"""

import hashlib
import json
import os
import re
import time
from typing import Any

import structlog

from core.cloudflare_client import CloudflareClient

logger = structlog.get_logger(__name__)

# Kept in lockstep with OBSERVER_LIMITS in worker/src/observer.ts.
OBSERVER_LIMITS: dict[str, int] = {
    "plan_chars": 4000,
    "evidence_items": 25,
    "plan_steps": 50,
}

# Verdict vocabulary — mirrors ObserverRecommendation in observer.ts. Do not
# invent a different taxonomy: operators read both runtimes' rows together.
SAFE = "safe"
EVIDENCE_GAP = "evidence_gap"
POLICY_CONCERN = "policy_concern"
RECOMMENDATIONS = (SAFE, EVIDENCE_GAP, POLICY_CONCERN)

# The audit row's scope is the read contract (`episodic_events` scope='observer').
OBSERVER_SCOPE = "observer"
FLEET_SOURCE = "fleet_dispatch"

_INSERT_SQL = "INSERT INTO episodic_events (scope, payload) VALUES (?, ?)"

# --- Rule tables: byte-for-byte mirrors of the worker's regex tables ---------

_INJECTION: list[tuple[str, str]] = [
    ("prompt_injection", r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions"),
    ("prompt_injection", r"disregard\s+(the\s+)?(policy|policies|rules|guardrails)"),
    ("prompt_injection", r"(reveal|print|output)\s+(the\s+)?system\s+prompt"),
    ("role_hijack", r"you\s+are\s+now\s+(a|an|the)\s+"),
]

# House non-goals from AGENTS.md — a plan that proposes them is out of scope.
_OUT_OF_SCOPE: list[tuple[str, str]] = [
    ("out_of_scope", r"\bblockchain\b|\busdc\b|\bsolana\b|\bcrypto\s+payment"),
    ("out_of_scope", r"linkedin\s+(automation|auto-?post)"),
    ("out_of_scope", r"\berpnext\b"),
    ("out_of_scope", r"desktop\s+(runtime|app|application)"),
    ("out_of_scope", r"second\s+(postgres|docker)\s+(control\s+plane|cluster)"),
    ("out_of_scope", r"new\s+(scheduler|framework)\b"),
]

_DESTRUCTIVE: list[tuple[str, str]] = [
    ("destructive_sql", r"\bdrop\s+table\b"),
    ("destructive_sql", r"\bdelete\s+from\s+[a-z_]+\s*(;|$)"),
    ("destructive_sql", r"\btruncate\s+table\b"),
    ("destructive_shell", r"\brm\s+-rf\b"),
]

_SECRET_HANDLING: list[tuple[str, str]] = [
    ("secret_exfiltration", r"(send|post|upload|email|exfiltrate).{0,40}\b(api[\s_-]?key|secret|password|token)\b"),
    ("secret_exfiltration", r"\bcat\s+\.env\b|\bprint\s+\.env\b"),
]

_PROTECTED_FILES: list[tuple[str, str]] = [
    ("protected_file", r"\bworker\.js\b"),
    ("protected_file", r"\bindex\.html\b"),
    ("protected_file", r"\bsrc/scanner\.js\b"),
    ("protected_file", r"\bpackage\.json\b"),
    ("protected_file", r"\btest/scanner\.test\.mjs\b"),
    ("protected_file", r"\.github/"),
]

_EXTERNAL_EFFECT = r"\b(post|publish|send|dispatch|deploy|email|tweet|reply)\b"

_CHECKS = [
    "prompt_injection",
    "house_non_goals",
    "destructive_ops",
    "secret_handling",
    "protected_files",
    "evidence_anchors",
    "size_bounds",
]


def _scan(text: str, table: list[tuple[str, str]]) -> list[dict[str, str]]:
    """First match per pattern, mirroring `scan()` in observer.ts."""
    out: list[dict[str, str]] = []
    for code, pattern in table:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            out.append({"code": code, "detail": f"matched '{m.group(0)[:80]}'"})
    return out


def _plan_text(plan: Any) -> str:
    """Mirror `planText()`: strings pass through, everything else JSON-encodes."""
    if plan is None:
        return ""
    if isinstance(plan, str):
        return plan
    try:
        # separators match JSON.stringify (no spaces) so digests line up.
        return json.dumps(plan, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
        return str(plan)


def _digest(text: str) -> str:
    """SHA-256, first 8 bytes hex — identical to `digest()` in observer.ts."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def review_plan(
    plan: Any,
    evidence: list[dict[str, Any]] | None = None,
    action: dict[str, Any] | None = None,
    authority: str | None = None,
) -> dict[str, Any]:
    """Pure, deterministic review — mirrors `reviewPlan()` exactly."""
    full = _plan_text(plan)
    truncated = len(full) > OBSERVER_LIMITS["plan_chars"]
    text = full[: OBSERVER_LIMITS["plan_chars"]] if truncated else full
    items = list(evidence or [])[: OBSERVER_LIMITS["evidence_items"]]

    policy_flags: list[dict[str, str]] = [
        *_scan(text, _INJECTION),
        *_scan(text, _OUT_OF_SCOPE),
        *_scan(text, _DESTRUCTIVE),
        *_scan(text, _SECRET_HANDLING),
        *_scan(text, _PROTECTED_FILES),
    ]

    gaps: list[dict[str, str]] = []
    for e in items:
        claim = str((e or {}).get("claim") or "").strip()[:200]
        disposition = str((e or {}).get("disposition") or "unknown")
        if not claim:
            continue
        if disposition == "unknown":
            gaps.append({"code": "unanchored_claim", "detail": claim})
        elif disposition == "inferred":
            gaps.append({"code": "inferred_claim", "detail": claim})
    has_effect = bool(re.search(_EXTERNAL_EFFECT, text, re.IGNORECASE))
    if has_effect and not items:
        gaps.append(
            {
                "code": "no_evidence",
                "detail": "the plan proposes an external side effect with no evidence attached",
            }
        )

    steps = 0
    if isinstance(plan, dict) and isinstance(plan.get("steps"), list):
        steps = len(plan["steps"])
    if steps > OBSERVER_LIMITS["plan_steps"]:
        gaps.append(
            {
                "code": "plan_too_large",
                "detail": f"plan has {steps} steps (limit {OBSERVER_LIMITS['plan_steps']})",
            }
        )

    recommendation = POLICY_CONCERN if policy_flags else (EVIDENCE_GAP if gaps else SAFE)

    return {
        "recommendation": recommendation,
        "gaps": gaps,
        "gaps_count": len(gaps),
        "gap_codes": [g["code"] for g in gaps],
        "policy_flags": policy_flags,
        "flags": [f["code"] for f in policy_flags],
        "checks": list(_CHECKS),
        "bounded": {
            "plan_chars": len(text),
            "evidence_items": len(items),
            "truncated": truncated,
            "steps_inspected": steps,
        },
        "digest": _digest(full),
        "action": action,
        "authority": authority,
    }


# --- Mode resolution: os.environ > .env (Settings) > observe -----------------


def _settings_mode() -> str | None:
    """The `.env` value of CONN_OBSERVER_MODE, via pydantic Settings.

    The fleet entrypoint (scripts/run_agents.py) never calls `load_dotenv`, so
    `.env` keys are NOT in `os.environ` — Settings is the only thing that parses
    the file. Never raises: an unreadable settings object degrades to "unset".
    """
    try:
        from core.config import get_settings  # local import: no import cycle

        value = getattr(get_settings(), "conn_observer_mode", None)
    except Exception as e:  # noqa: BLE001 — config trouble must not stop observing
        logger.warning("observer_mode_settings_unreadable", error=str(e))
        return None
    if value is None:
        return None
    text = str(value).strip()
    return text or None  # blank in .env is "unset", not a value


def _current_mode() -> str:
    """Resolve the observer posture: os.environ > .env (Settings) > observe.

    `off` is the only silencing value; unknown/blank values observe. An explicit
    (even blank) os.environ value wins outright so launchd/plist and ad-hoc runs
    can always override the checked-in file. Synchronous and cheap —
    `get_settings()` is lru_cached, no I/O or network.
    """
    raw = os.environ.get("CONN_OBSERVER_MODE")
    if raw is None:
        raw = _settings_mode()
    return "off" if str(raw or "").strip().lower() == "off" else "observe"


# --- The one write path ------------------------------------------------------


def _build_payload(review: dict[str, Any], task_id: str | None, agent_id: str | None, source: str) -> str:
    """The single `observer` row shape — mirrors recordObserverVerdict()."""
    try:
        payload = json.dumps(
            {
                "recommendation": review["recommendation"],
                "gaps": review["gaps_count"],
                "gap_codes": review["gap_codes"],
                "flags": review["flags"],
                "digest": review["digest"],
                "action": review.get("action"),
                "authority": review.get("authority"),
                "task_id": task_id,
                "agent_id": agent_id,
                "source": source,
                "at": int(time.time() * 1000),
            },
            separators=(",", ":"),
        )
    except Exception:  # noqa: BLE001 — a serialization edge must still write
        payload = json.dumps(
            {"recommendation": "unknown", "source": source, "task_id": task_id, "at": int(time.time() * 1000)}
        )
    return payload[:4000]


async def observe_task(
    task_id: str | None,
    agent_id: str | None,
    description: str | None,
) -> dict[str, Any] | None:
    """Review one fleet-side task dispatch and write ONE `observer` row.

    Returns the review dict when a verdict was recorded, `None` when the pass is
    off or anything failed. Never raises and never returns early on an internal
    error — the caller schedules this fire-and-forget, so a failure here must be
    invisible to the task that is actually running.

    The plan digest covers `{task_id, agent_id, description}` (never the body
    itself), matching the worker's task-dispatch input shape.
    """
    mode = "observe"
    try:
        mode = _current_mode()
        if mode == "off":
            return None

        tid = None if task_id is None else str(task_id)
        aid = None if agent_id is None else str(agent_id)
        plan = {"task_id": tid, "agent_id": aid, "description": "" if description is None else str(description)}
        review = review_plan(
            plan,
            action={"type": "task.execute", "connector": None, "target": tid or "task"},
            authority="approval",
        )
        payload = _build_payload(review, tid, aid, FLEET_SOURCE)

        client: CloudflareClient | None = None
        try:
            client = CloudflareClient()
            await client.aexecute(_INSERT_SQL, [OBSERVER_SCOPE, payload])
        finally:
            if client is not None:
                try:
                    await client.close()
                except Exception:  # noqa: BLE001 — closes are best-effort
                    pass
        logger.info(
            "observer_task_reviewed",
            task_id=tid,
            agent_id=aid,
            recommendation=review["recommendation"],
            gaps=review["gaps_count"],
            flags=len(review["flags"]),
        )
        return review
    except Exception as e:  # noqa: BLE001 — observation is never a failure mode
        logger.warning(
            "observer_task_review_swallowed",
            task_id=task_id,
            agent_id=agent_id,
            mode=mode,
            error=f"{type(e).__name__}: {e}",
        )
        return None
