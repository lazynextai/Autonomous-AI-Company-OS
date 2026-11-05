#!/usr/bin/env python3
"""Weekly readiness and health digest (C1) - one honest page a week.

Reads the LIVE internal endpoints and KV breadcrumbs, renders a compact
plain-text + HTML digest where every figure names the endpoint or key it was
read from, stores one `briefings` row (kind='digest') and emails it to the
founder through Brevo (tag `digest`).

Why this must run in the local fleet
------------------------------------
The cloud worker's codegen path has no D1/KV read access, so a
worker-executed digest would have to invent figures - that exact failure
shipped on 2026-11-03 (accessibility-checker PR #112 claimed $10,000 revenue
and 20 paid conversions against a test-mode account). Every number here comes
from a read performed by this process; an unreadable read renders
`unavailable`, never a number and never an estimate.

Cadence and the gate
--------------------
No new cron entry. The script gates itself on KV `digest:last_run`: it only
prompts a send when that key is absent or at least 6.5 days old, so it is safe
to invoke from any existing daily/hourly scheduler. A successful send writes
`digest:last_run` (durable, ttl 0). An unreadable `digest:last_run` SKIPS -
sending twice is worse than sending late.

Usage
-----
    python scripts/weekly_digest.py --dry-run   # prints everything, writes nothing
    python scripts/weekly_digest.py             # gated: persists + emails at most once/6.5d

Never prints secrets: the bearer token is only ever placed in a request header.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

# Imported at module level (after the path fix) so the send and persistence
# seams are patchable in tests — main() never re-imports them behind a stub.
from core.operations.briefings import post_briefing  # noqa: E402
from core.tools.email_tool import send_email  # noqa: E402

UA = "lazynext-weekly-digest/1.0"
READ_TIMEOUT = 30
READ_ATTEMPTS = 2

# 6.5 days - a 7-day cadence with half a day of slack so a scheduler that
# drifts by hours still lands once per week instead of skipping a week.
DIGEST_INTERVAL_MS = int(6.5 * 24 * 60 * 60 * 1000)  # 561_600_000

DIGEST_KV_KEY = "digest:last_run"
DIGEST_TO = "support@lazynext.com"
DIGEST_TAG = "digest"

# Breadcrumb budgets, kept in lockstep with BREADCRUMBS in worker/src/readiness.ts
# and KV_WATCH in scripts/health_check.py - a stale key is one that ran later
# than its documented window allows.
BREADCRUMBS: tuple[tuple[str, str, int], ...] = (
    ("cron:last_tick", "cron tick", 25 * 60_000),
    ("maint:last_run", "daily maintenance", 26 * 3_600_000),
    ("mon:last_sweep", "monitor sweep", 26 * 3_600_000),
    ("ledger:last_build", "ledger build", 26 * 3_600_000),
    ("cap:last_probe", "capability probe", 12 * 3_600_000),
)

# Fixed reading order for the funnel so the digest is comparable week to week.
# A key the endpoint does not return renders `unavailable`; nothing is derived.
FUNNEL_KEYS: tuple[str, ...] = (
    "scans_30d",
    "scans_external_30d",
    "leads",
    "waitlist",
    "email_contacts",
    "crm_leads",
    "crm_engaged",
    "trials_active",
    "licenses_pro",
    "licenses_free",
    "subscriptions_active",
    "monitors",
)

UNAVAILABLE = "unavailable"


# --------------------------------------------------------------------- model --


@dataclass(frozen=True)
class Figure:
    """One number (or one honest absence) plus the read that produced it."""

    label: str
    value: str
    source: str
    error: str | None = None
    stale: bool | None = None


@dataclass
class Section:
    title: str
    figures: list[Figure] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class Digest:
    generated_at: str
    sections: list[Section]
    gate_note: str = ""

    def figures(self) -> list[Figure]:
        return [f for s in self.sections for f in s.figures]


# ------------------------------------------------------------------- readers --


def _base() -> str:
    from core.config import get_settings

    return (get_settings().cloudflare_api_url or os.environ.get("CLOUDFLARE_API_URL", "")).rstrip("/")


def _token() -> str:
    from core.config import get_settings

    return get_settings().cloudflare_api_token or os.environ.get("CLOUDFLARE_API_TOKEN", "")


def get_json(path: str, token: str | None = None, base: str | None = None) -> tuple[dict | None, str | None]:
    """GET an internal route with the platform bearer. Returns (data, error).

    A non-200, a decode failure or a transport error all return None data -
    callers must render `unavailable` rather than a stand-in value.
    """
    root = (base or _base()).rstrip("/")
    if not root:
        return None, "CLOUDFLARE_API_URL is not configured"
    bearer = token if token is not None else _token()
    if not bearer:
        return None, "CLOUDFLARE_API_TOKEN is not configured"
    last_error = "read failed"
    retried = False
    for attempt in range(READ_ATTEMPTS):
        retried = retried or attempt > 0
        req = urllib.request.Request(
            f"{root}{path}",
            headers={
                "Authorization": f"Bearer {bearer}",
                "Accept": "application/json",
                # urllib's default UA is Cloudflare bot-banned (bare 403/1010).
                "User-Agent": UA,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=READ_TIMEOUT) as r:
                body = r.read()
            parsed = json.loads(body)
            if not isinstance(parsed, dict):
                return None, "unexpected response shape"
            return parsed, None
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}"
            if e.code < 500:
                break  # 4xx is a verdict, not a blip - do not retry
        except urllib.error.URLError as e:
            last_error = f"connection error ({type(e.reason).__name__})"
        except json.JSONDecodeError:
            last_error = "response was not JSON"
            break
        except Exception as e:  # noqa: BLE001 - a read must never crash the digest
            last_error = _err_text(e)
    if retried:
        last_error += " after retry"
    return None, last_error


def kv_read(key: str) -> tuple[str | None, str | None]:
    """Read one KV key via the internal /kv/get?key= route. Returns (raw, error).

    raw is None with error None means the key is genuinely absent.
    """
    data, err = get_json(f"/kv/get?key={urllib.parse.quote(key, safe='')}")
    if err or data is None:
        return None, err or "read failed"
    value = data.get("value")
    return (None if value is None else str(value)), None


def parse_ms(raw: str | None) -> float | None:
    """Breadcrumbs are either a bare ms epoch or JSON carrying `at`."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        parsed = raw
    candidate = parsed.get("at") if isinstance(parsed, dict) else parsed
    try:
        value = float(candidate)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _err_text(exc: object) -> str:
    """One line, bounded — an exception body must not break the render."""
    return f"{type(exc).__name__}: {exc}".splitlines()[0][:160]


def _fmt_age(age_ms: float) -> str:
    minutes = age_ms / 60_000
    if minutes < 90:
        return f"{minutes:.0f} min"
    hours = minutes / 60
    if hours < 48:
        return f"{hours:.1f} h"
    return f"{hours / 24:.1f} d"


# ----------------------------------------------------------------- sections --


def connectors_section() -> Section:
    """Connector readiness from GET /capability/matrix."""
    source = "GET /capability/matrix"
    data, err = get_json("/capability/matrix")
    section = Section("Connectors")
    if err or data is None:
        section.figures.append(Figure("connector readiness", UNAVAILABLE, source, error=err))
        return section

    summary = data.get("summary") or {}
    for key in ("total", "probe-ok", "probe-failed", "stale", "configured-unprobed", "documented-only", "absent"):
        value = summary.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            section.figures.append(Figure(key, str(int(value)), source))
        else:
            section.figures.append(Figure(key, UNAVAILABLE, source, error="key missing from response"))

    connectors = data.get("connectors") or []
    failed = [c for c in connectors if isinstance(c, dict) and c.get("state") == "probe-failed"]
    for row in failed:
        reason = str(row.get("last_error") or "no error recorded")[:160]
        section.figures.append(Figure(f"probe failed: {row.get('capability')}", reason, source))

    not_configured = [
        str(c.get("capability")) for c in connectors if isinstance(c, dict) and not c.get("configured")
    ]
    if not_configured:
        section.notes.append(f"no credential: {', '.join(sorted(not_configured))} (source: {source})")
    unprobed = [
        str(c.get("capability"))
        for c in connectors
        if isinstance(c, dict) and c.get("state") == "configured-unprobed"
    ]
    if unprobed:
        section.notes.append(
            f"configured but never probe-verified ({len(unprobed)}): "
            f"{', '.join(sorted(unprobed))} (source: {source})"
        )
    return section


def _block_age_ms(block: dict, now_ms: float) -> float | None:
    created = block.get("created_at")
    if not isinstance(created, str):
        return None
    try:
        from datetime import datetime

        ts = datetime.fromisoformat(created.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return None
    return max(now_ms - ts, 0)


def _is_recent(block: dict, now_ms: float, window_ms: float) -> bool:
    age = _block_age_ms(block, now_ms)
    return age is not None and age < window_ms


def breaker_figures() -> list[Figure]:
    """Breaker posture from the SAME D1 row the worker and fleet gate read."""
    source = "D1 outbound_breaker_config (internal POST /query)"
    figures: list[Figure] = []
    mode_source = "CONN_BREAKER_MODE (fleet setting)"
    try:
        from core.tools import outbound_breakers as ob

        # The documented posture resolver (os.environ -> .env -> observe).
        figures.append(Figure("breaker mode", ob._current_mode(), mode_source))
    except Exception as e:  # noqa: BLE001
        figures.append(
            Figure("breaker mode", UNAVAILABLE, mode_source, error=_err_text(e))
        )

    try:
        from core.cloudflare_client import CloudflareClient
        from core.tools import outbound_breakers as ob

        client = CloudflareClient()
        if not client.is_configured():
            figures.append(Figure("breaker state", UNAVAILABLE, source, error="platform not configured"))
            return figures
        rows = client.query(ob._CONFIG_SQL)  # shared SQL - no copy to drift
    except Exception as e:  # noqa: BLE001
        figures.append(
            Figure("breaker state", UNAVAILABLE, source, error=_err_text(e))
        )
        return figures

    row = rows[0] if rows else {}
    figures.append(Figure("breaker enabled", "yes" if row.get("enabled") else "no", source))
    tripped = row.get("tripped_reason")
    figures.append(Figure("breaker tripped", str(tripped)[:160] if tripped else "no", source))
    volume_window = int((row.get("volume_window_ms") or 0) / 60_000)
    failure_window = int((row.get("failure_window_ms") or 0) / 60_000)
    figures.append(
        Figure(
            "breaker limits",
            f"volume {row.get('volume_limit')}/{volume_window}m, "
            f"failures {row.get('failure_limit')}/{failure_window}m",
            source,
        )
    )
    return figures


def governance_section(now_ms: float) -> Section:
    """Gate blocks, packages awaiting approval, and breaker state."""
    section = Section("Governance")

    blocks_source = "GET /decision/blocks?limit=20"
    data, err = get_json("/decision/blocks?limit=20")
    if err or data is None:
        section.figures.append(Figure("gate blocks (last 20 read)", UNAVAILABLE, blocks_source, error=err))
    else:
        blocks = data.get("blocks") or []
        week_ms = 7 * 24 * 3_600_000
        recent = [b for b in blocks if _is_recent(b, now_ms, week_ms)]
        section.figures.append(
            Figure("gate blocks this week (of last 20 read)", f"{len(recent)} of {len(blocks)}", blocks_source)
        )
        for block in recent[:5]:
            payload = block.get("payload")
            try:
                parsed = json.loads(payload) if isinstance(payload, str) else (payload or {})
            except json.JSONDecodeError:
                parsed = {}
            target = parsed.get("target") or parsed.get("connector") or "unknown"
            reason = str(parsed.get("reason") or "no reason recorded")[:120]
            section.figures.append(Figure(f"block ({target})", reason, blocks_source))

    packages_source = "GET /decision/packages?outcome=draft"
    data, err = get_json("/decision/packages?outcome=draft")
    if err or data is None:
        section.figures.append(Figure("packages awaiting approval", UNAVAILABLE, packages_source, error=err))
    else:
        packages = data.get("packages") or []
        section.figures.append(Figure("packages awaiting approval", str(len(packages)), packages_source))
        for pkg in packages[:5]:
            target = pkg.get("target") or pkg.get("id")
            title = str(pkg.get("title") or "")[:80]
            section.figures.append(Figure(f"awaiting: {target}", title or "(no title)", packages_source))

    section.figures.extend(breaker_figures())
    return section


def outcomes_section() -> Section:
    """Task outcomes from GET /ledger/summary (7-day window, verbatim)."""
    source = "GET /ledger/summary"
    section = Section("Task outcomes")
    data, err = get_json("/ledger/summary")
    if err or data is None:
        section.figures.append(Figure("ledger summary", UNAVAILABLE, source, error=err))
        return section
    totals = data.get("totals") or {}
    days = data.get("days")
    section.figures.append(Figure("window (days)", str(days) if days is not None else UNAVAILABLE, source))
    for key in ("total", "est_cost_cents"):
        value = totals.get(key)
        section.figures.append(
            Figure(f"ledger {key}", str(value) if isinstance(value, (int, float)) else UNAVAILABLE, source)
        )
    for group in data.get("groups") or []:
        label = f"{group.get('ref_type')}/{group.get('provider') or 'n/a'}"
        value = (
            f"{group.get('total')} rows, {group.get('passed')} passed, "
            f"{group.get('failed')} failed, {group.get('na')} n/a"
        )
        section.figures.append(Figure(label, value, source))
    return section


def automation_section(now_ms: float) -> Section:
    """Breadcrumb ages, each flagged against its documented window."""
    section = Section("Automation health")
    for key, label, budget_ms in BREADCRUMBS:
        source = f"GET /kv/get?key={key}"
        raw, err = kv_read(key)
        if err:
            section.figures.append(Figure(label, UNAVAILABLE, source, error=err))
            continue
        at = parse_ms(raw)
        if at is None:
            section.figures.append(Figure(label, "absent", source, stale=True))
            continue
        age = max(now_ms - at, 0)
        section.figures.append(Figure(label, f"{_fmt_age(age)} ago", source, stale=age > budget_ms))
    return section


def _settings_lzk() -> str:
    try:
        from core.config import get_settings

        return str(getattr(get_settings(), "lazynext_api_key", "") or "")
    except Exception:  # noqa: BLE001 - optional fallback only
        return ""


def funnel_section() -> Section:
    """Funnel counters verbatim, or `unavailable` - never a guess."""
    section = Section("Funnel")
    internal_source = "GET /api/v1/billing/funnel (internal bearer)"
    data, err = get_json("/api/v1/billing/funnel")
    source = internal_source
    if err or data is None:
        lzk = os.environ.get("LAZYNEXT_API_KEY", "") or _settings_lzk()
        if lzk:
            data, lzk_err = get_json(
                "/api/v1/billing/funnel", token=lzk, base="https://ai-company.lazynext.com"
            )
            source = "GET /api/v1/billing/funnel (lzk read key)"
            if lzk_err or data is None:
                data, err = None, f"{err}; lzk read failed: {lzk_err}"
    if err or data is None:
        section.figures.append(Figure("funnel", UNAVAILABLE, internal_source, error=err))
        return section
    for key in FUNNEL_KEYS:
        value = data.get(key)
        section.figures.append(
            Figure(key, str(value) if isinstance(value, (int, float)) else UNAVAILABLE, source)
        )
    return section


# ------------------------------------------------------------------ renderer --


def render_text(digest: Digest) -> str:
    lines = [
        f"Lazynext weekly readiness digest - {digest.generated_at}",
        "Every figure names the endpoint or key it was read from. An unreadable",
        f'read renders "{UNAVAILABLE}" - never a number, never an estimate.',
    ]
    if digest.gate_note:
        lines.append(f"Gate: {digest.gate_note}")
    for section in digest.sections:
        lines.append("")
        lines.append(f"== {section.title} ==")
        for figure in section.figures:
            line = f"  {figure.label}: {figure.value} - source: {figure.source}"
            if figure.error:
                line += f" [read failed: {figure.error}]"
            if figure.stale:
                line += "  ** STALE **"
            lines.append(line)
        for note in section.notes:
            lines.append(f"  * {note}")
    return "\n".join(lines)


def _esc(text: object) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_html(digest: Digest) -> str:
    parts = [
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0B;',
        'font-family:ui-sans-serif,system-ui,sans-serif">',
        '<div style="max-width:720px;margin:0 auto;padding:32px 16px">',
        '<div style="font-size:20px;font-weight:700;color:#FAFAFA;margin-bottom:8px">'
        'Lazynext - weekly readiness digest</div>',
        f'<div style="color:#9C9CAA;font-size:12px;margin-bottom:24px">{_esc(digest.generated_at)}</div>',
        '<div style="background:#141419;border:1px solid #26262E;border-radius:14px;padding:24px;',
        'color:#FAFAFA;font-size:14px;line-height:1.6">',
    ]
    if digest.gate_note:
        parts.append(
            '<div style="color:#A78BFA;font-size:12px;margin-bottom:12px">'
            f"Gate: {_esc(digest.gate_note)}</div>"
        )
    for section in digest.sections:
        parts.append(
            f'<h3 style="font-size:15px;margin:18px 0 8px;color:#FAFAFA">{_esc(section.title)}</h3>'
            '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        )
        for figure in section.figures:
            color = "#FCA5A5" if (figure.stale or figure.value == UNAVAILABLE) else "#FAFAFA"
            detail = f' <span style="color:#9C9CAA">[{_esc(figure.error)}]</span>' if figure.error else ""
            stale = ' <span style="color:#FCA5A5">STALE</span>' if figure.stale else ""
            parts.append(
                "<tr>"
                f'<td style="padding:4px 8px 4px 0;color:#C7C7D1;vertical-align:top">{_esc(figure.label)}</td>'
                f'<td style="padding:4px 0;color:{color};vertical-align:top">'
                f"{_esc(figure.value)}{detail}{stale}</td>"
                '<td style="padding:4px 0;color:#6B7280;font-size:11px;vertical-align:top">'
                f"{_esc(figure.source)}</td>"
                "</tr>"
            )
        parts.append("</table>")
        for note in section.notes:
            parts.append(f'<div style="color:#9C9CAA;font-size:12px;margin:6px 0">* {_esc(note)}</div>')
    parts.append("</div>")
    parts.append(
        '<div style="color:#9C9CAA;font-size:12px;margin-top:24px;text-align:center">'
        "Lazynext - The Autonomous AI Company OS - "
        '<a href="https://lazynext.com" style="color:#A78BFA">lazynext.com</a></div>'
    )
    parts.append("</div></body></html>")
    return "".join(parts)


# ---------------------------------------------------------------------- gate --


def gate_decision(
    now_ms: float, last_run_ms: float | None, read_error: str | None = None
) -> tuple[bool, str]:
    """Should this run send? Returns (should_run, human-readable reason).

    - unreadable `digest:last_run` -> skip (a duplicate mail is worse than a late one)
    - absent -> run (first digest)
    - age >= 6.5 days -> run
    """
    if read_error:
        return (
            False,
            f"skipped - {DIGEST_KV_KEY} unreadable ({read_error}); not risking a duplicate send",
        )
    if last_run_ms is None:
        return True, f"would run - {DIGEST_KV_KEY} absent (no digest sent yet)"
    age = max(now_ms - last_run_ms, 0)
    window = _fmt_age(DIGEST_INTERVAL_MS)
    if age >= DIGEST_INTERVAL_MS:
        return True, f"would run - {DIGEST_KV_KEY} is {_fmt_age(age)} old (window {window})"
    return False, f"skipped - {DIGEST_KV_KEY} was {_fmt_age(age)} ago (window {window})"


def build_digest(now_ms: float, gate_note: str = "") -> Digest:
    from datetime import datetime, timezone

    stamp = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return Digest(
        generated_at=stamp,
        sections=[
            connectors_section(),
            governance_section(now_ms),
            outcomes_section(),
            automation_section(now_ms),
            funnel_section(),
        ],
        gate_note=gate_note,
    )


# ---------------------------------------------------------------------- main --


def _write_last_run(now_ms: float) -> tuple[bool, str | None]:
    """Persist `digest:last_run` (ttl 0 - durable; the worker default is 60s)."""
    root = _base()
    token = _token()
    if not root or not token:
        return False, "platform not configured"
    req = urllib.request.Request(
        f"{root}/kv/put",
        data=json.dumps({"key": DIGEST_KV_KEY, "value": str(int(now_ms)), "ttl": 0}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=READ_TIMEOUT) as r:
            return r.status < 400, None
    except Exception as e:  # noqa: BLE001
        return False, _err_text(e)


async def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    now_ms = time.time() * 1000

    raw, read_err = kv_read(DIGEST_KV_KEY)
    last_run = parse_ms(raw)
    should_run, gate_note = gate_decision(now_ms, last_run, read_err)

    digest = build_digest(now_ms, gate_note=gate_note)
    text = render_text(digest)

    if dry_run:
        print(text)
        print("")
        print("[dry-run] rendered only - nothing written, nothing sent.")
        return 0

    if not should_run:
        print(text)
        print(f"\n{gate_note}")
        return 0

    subject = f"[AI Company] Weekly readiness digest - {digest.generated_at[:10]}"
    sent = await send_email(DIGEST_TO, subject, text, tag=DIGEST_TAG, html=render_html(digest))
    if not sent:
        print(text)
        print("\nsend failed - digest:last_run NOT written; next run will retry")
        return 1

    stored = await post_briefing(kind="digest", subject=subject, content=text)
    ok, write_err = _write_last_run(now_ms)
    print(text)
    print(f"\nsent to {DIGEST_TO} (tag {DIGEST_TAG}); briefing row {'written' if stored else 'FAILED'}")
    if not ok:
        print(f"warning: {DIGEST_KV_KEY} not written ({write_err}) - a duplicate send is possible")
    return 0


if __name__ == "__main__":
    import asyncio

    sys.exit(asyncio.run(main(sys.argv[1:])))

