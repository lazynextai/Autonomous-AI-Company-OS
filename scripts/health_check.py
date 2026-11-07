#!/usr/bin/env python3
"""Health check for public endpoints; emails the founder on failure/recovery.

Run via launchd (com.lazynext.healthcheck.plist) every 15 min.
State kept in .health_state.json so we only alert on transitions.
"""
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

CHECKS = {
    "api": "https://ai-company.lazynext.com/health",
    "public-api": "https://ai-company.lazynext.com/api/v1/health",
    "dashboard": "https://dashboard.lazynext.com",
    "penpot": "https://penpot.lazynext.com",
    "a11y-checker-domain": "https://checker.lazynext.com/health",
    "a11y-api-domain": "https://api.lazynext.com/health",
}
# Warm Cloudflare containers (sleepAfter 30m) without treating a cold 503 as a
# health failure — WordPress HTML GET races a 20s warming page, so a fail
# here would spam the founder mailbox. Ping only; never add these to CHECKS.
KEEP_WARM = {
    "blog": "https://blog.lazynext.com/",
    "postiz": "https://postiz.lazynext.com/",
    "listmonk": "https://listmonk.lazynext.com/",
    "mattermost": "https://mattermost.lazynext.com/",
    # ghost was missing from the warm set — with sleepAfter 30m and a 15-min
    # poke gap that should have meant warm, but a cold boot takes 60-90s, the
    # 25s touch timed out before the first request completed, and the
    # container idled again -> persistent 503. Longer timeout completes the
    # wake so the sleep timer resets. Penpot is tunnel-served on the same
    # Mac (Docker + cloudflared), not a CF container, but poking it is free
    # and catches a down tunnel at the same cadence instead of relying on the
    # once-at-boot agent.
    "ghost": "https://ghost.lazynext.com/",
    "penpot": "https://penpot.lazynext.com/",
}
# The product deploys the same bundle to two scripts (accessibility-checker +
# accessibility-checker-api). deploy.mjs keeps them in sync, but nothing
# detects a manual single-script deploy — compare a deterministic surface
# (/rules, the 75-rule manifest) on both workers.dev origins and alert on
# any byte difference. Also covers script liveness: a fetch failure fails
# the pair.
DRIFT_PAIRS = {
    "a11y-mirror": (
        "https://accessibility-checker.dry-hall-6a50.workers.dev/rules",
        "https://accessibility-checker-api.dry-hall-6a50.workers.dev/rules",
    ),
}
# Internal liveness via platform KV — the surfaces above prove the worker is
# reachable, but a stopped cron or wedged sweep leaves them green. Values are
# ms epochs; mon:/billing: store JSON {"at": ms}, the others bare epochs.
# Budgets: cron runs */10 → 25 min; daily sweeps → 26 h.
KV_WATCH = {
    "cron-tick": ("cron:last_tick", 25 * 60_000),
    "maint-gate": ("maint:last_run", 26 * 3_600_000),
    "mon-sweep": ("mon:last_sweep", 26 * 3_600_000),
    "seq-sweep": ("seq:last_run", 26 * 3_600_000),
    "billing-reconcile": ("billing:last_reconcile", 26 * 3_600_000),
}
# ~80% of the LIMIT-10000 dead-corpus reads (worker/src/index.ts +
# cto_agent.py, parity pinned by test_dead_corpus_limit_matches_across_
# mirrors). The corpus evicting its oldest anchors is the silent precursor
# to a respawn flood — seen twice (500-row window 2026-09-27, near-miss at
# 2000). Counting ALL terminal rows is a deliberate superset of
# DEAD_CORPUS_WHERE: marker drift can't mute the alert, and ordinary
# failures grow too slowly to false-positive at this level.
CORPUS_WARN = 8_000
STATE_FILE = Path(".health_state.json")

# --- Penpot self-heal (targeted, enabled by default) ------------------------
# 2026-11-07 05:57 IST: https://penpot.lazynext.com answered 502 because the
# Docker daemon was not running — the com.lazynext.docker-desktop LaunchAgent
# uses RunAtLoad + LaunchOnlyOnce and did not fire that login. The health
# check detected it but could only email, so the site stayed down until a
# human noticed. This narrow recovery closes that gap for Penpot ONLY:
# daemon down -> launch Docker Desktop -> wait for the daemon -> wait for the
# public URL -> `docker compose up -d` if the daemon is healthy but the stack
# is not. Every other check/alert path is untouched.
#
# Disable with PENPOT_AUTORECOVER=0 (also false/no/off). Cooldown state lives
# in /tmp because this script only READS KV breadcrumbs, never writes them.
PENPOT_URL = CHECKS["penpot"]
PENPOT_COMPOSE_DIR = Path("/Users/avaspatel/penpot")
PENPOT_RECOVER_STATE = Path("/tmp/lazynext-penpot-autorecover.json")
PENPOT_COOLDOWN_S = 30 * 60           # at most one attempt per ~30 minutes
PENPOT_FAILED_BACKOFF_S = 6 * 3_600   # after 2 consecutive failures: 6 h
PENPOT_DAEMON_WAIT_S = 90             # docker info poll after `open -a Docker`
PENPOT_SITE_WAIT_S = 120              # public URL poll after the daemon is up
PENPOT_POLL_INTERVAL_S = 5


def _origin(url: str) -> tuple[str, str | None, int | None]:
    parsed = urlsplit(url)
    return parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)


class _ScopedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and _origin(req.full_url) != _origin(newurl):
            redirected.remove_header("Authorization")
        return redirected


def _open(req: urllib.request.Request):
    # urllib otherwise forwards Authorization to a redirect's destination.
    return urllib.request.build_opener(_ScopedRedirectHandler()).open(req, timeout=15)


def keep_warm(url: str) -> None:
    """Touch a container origin so sleepAfter 30m does not idle it. Fail-open."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        # 45s: a cold CF container boots inline and the first request can take
        # 60-90s total, but a completed fetch (any status) resets the sleep
        # timer. 25s was too short -> the wake aborted and the container
        # idled again, which is exactly the ghost/mattermost 503 loop.
        urllib.request.urlopen(req, timeout=45).close()
    except Exception:
        return


def check(url: str) -> bool:
    try:
        headers = {"User-Agent": "healthcheck/1.0"}
        token = os.environ.get("CLOUDFLARE_API_TOKEN")
        platform = os.environ.get("CLOUDFLARE_API_URL", "")
        platform_origins = {_origin("https://ai-company.lazynext.com")}
        if platform:
            platform_origins.add(_origin(platform))
        if token and _origin(url) in platform_origins and urlsplit(url).scheme == "https":
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, headers=headers)
        with _open(req) as r:
            return r.status < 400
    except Exception:
        return False


def fetch_body(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck/1.0"})
        with _open(req) as r:
            return r.read() if r.status < 400 else None
    except Exception:
        return None


def kv_age_ms(key: str) -> float | None:
    """Read a KV timestamp via the platform worker; None when unreadable."""
    try:
        url = os.environ.get("CLOUDFLARE_API_URL", "")
        token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
        req = urllib.request.Request(
            f"{url}/kv/get",
            data=json.dumps({"key": key}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "healthcheck/1.0",
            },
            method="POST",
        )
        with _open(req) as r:
            v = json.loads(r.read()).get("value")
        if not v:
            return None
        try:
            ts = float(json.loads(v).get("at"))
        except (json.JSONDecodeError, AttributeError, TypeError):
            ts = float(v)
        return time.time() * 1000 - ts
    except Exception:
        return None


def corpus_size() -> int | None:
    """Terminal-row count via the platform worker; None when unreadable."""
    try:
        url = os.environ.get("CLOUDFLARE_API_URL", "")
        token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
        req = urllib.request.Request(
            f"{url}/query",
            data=json.dumps({
                "sql": "SELECT COUNT(*) n FROM task_log WHERE status IN ('failed','escalated')"
            }).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "healthcheck/1.0",
            },
            method="POST",
        )
        with _open(req) as r:
            return int(json.loads(r.read())["results"][0]["n"])
    except Exception:
        return None


def _penpot_recover_enabled() -> bool:
    """PENPOT_AUTORECOVER=0|false|no|off disables the self-heal."""
    return os.environ.get("PENPOT_AUTORECOVER", "1").strip().lower() not in {
        "0", "false", "no", "off",
    }


def _load_recover_state(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_recover_state(path: Path, state: dict) -> None:
    try:
        path.write_text(json.dumps(state))
    except Exception as exc:  # a state-write failure must never break recovery
        print(f"penpot-recover: state write failed ({type(exc).__name__}: {exc})")


def _run(cmd: list[str], timeout: float, cwd: str | None = None) -> tuple[int | None, str]:
    """Run a command without a shell; returns (rc, combined output).

    Never raises: a missing binary, timeout, or OS error becomes (None, text).
    """
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, errors="replace",
            timeout=timeout, cwd=cwd, check=False,
        )
        return proc.returncode, ((proc.stdout or "") + (proc.stderr or "")).strip()
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"


def _resolve_binary(name: str) -> str | None:
    """Resolve through bin_resolver — launchd PATH cannot see Homebrew."""
    try:
        from core.tools.bin_resolver import find_binary
    except Exception:  # pragma: no cover - import must never break health checks
        return None
    return find_binary(name)


def _docker_up() -> bool:
    docker = _resolve_binary("docker")
    if not docker:
        return False
    rc, _ = _run([docker, "info", "--format", "{{.ServerVersion}}"], timeout=15)
    return rc == 0


def _poll(predicate, timeout_s: float, interval_s: float) -> bool:
    """Poll predicate until true or timeout; never sleeps past the deadline."""
    deadline = time.monotonic() + timeout_s
    while True:
        if predicate():
            return True
        if time.monotonic() + interval_s > deadline:
            return False
        time.sleep(interval_s)


def _recover_cooldown_left(state: dict, cooldown_s: float) -> float:
    """Seconds still to wait before another attempt; 0 when allowed."""
    try:
        last = float(state.get("last_attempt") or 0)
        failures = int(state.get("consecutive_failures") or 0)
    except (TypeError, ValueError):
        return 0.0
    if not last:
        return 0.0
    window = PENPOT_FAILED_BACKOFF_S if failures >= 2 else cooldown_s
    return max(0.0, window - (time.time() - last))


def _record_recover_success(path: Path, state: dict) -> bool:
    state["consecutive_failures"] = 0
    state["last_success"] = time.time()
    _save_recover_state(path, state)
    print(f"penpot-recover: RECOVERED — {PENPOT_URL} is answering")
    return True


def _record_recover_failure(path: Path, state: dict) -> bool:
    failures = int(state.get("consecutive_failures") or 0) + 1
    state["consecutive_failures"] = failures
    _save_recover_state(path, state)
    backoff = (
        f" — backing off {PENPOT_FAILED_BACKOFF_S // 3600}h after 2 consecutive failures"
        if failures >= 2 else ""
    )
    print(f"penpot-recover: NOT recovered ({failures} consecutive failure(s)){backoff}")
    return False


def reset_penpot_recover_state(path: Path | None = None) -> None:
    """Clear the failure counter once Penpot is observable healthy again.

    A human (or a later recovery) may fix Penpot between ticks; without this,
    a stale counter from 2 failed attempts would keep the 6 h backoff armed
    for a NEW outage that has nothing to do with the old one.
    """
    try:
        path = path or PENPOT_RECOVER_STATE
        state = _load_recover_state(path)
        if int(state.get("consecutive_failures") or 0) > 0:
            state["consecutive_failures"] = 0
            state["last_healthy"] = time.time()
            _save_recover_state(path, state)
            print("penpot-recover: healthy again — failure counter reset")
    except Exception as exc:  # noqa: BLE001 — reset must never break the check
        print(f"penpot-recover: reset skipped ({type(exc).__name__}: {exc})")


def recover_penpot(
    state_path: Path | None = None, cooldown_s: float | None = None,
) -> bool:
    """Try to bring Penpot back. True only when the public URL answers.

    Called only after the penpot HTTP check failed. Returns False for every
    "cannot/should not recover" case so the caller's normal FAILED alert path
    runs unchanged.
    """
    if not _penpot_recover_enabled():
        print("penpot-recover: disabled (PENPOT_AUTORECOVER)")
        return False

    path = state_path or PENPOT_RECOVER_STATE
    cooldown = PENPOT_COOLDOWN_S if cooldown_s is None else cooldown_s
    state = _load_recover_state(path)
    wait = _recover_cooldown_left(state, cooldown)
    if wait > 0:
        print(
            "penpot-recover: skipping — cooldown "
            f"({int(wait)}s left, {int(state.get('consecutive_failures') or 0)} consecutive failures)"
        )
        return False

    docker = _resolve_binary("docker")
    if not docker:
        print("penpot-recover: docker binary not found — leaving this to the alert path")
        return False

    # Persist BEFORE the attempt: a crash/kill mid-recovery still starts the
    # cooldown, so the next 15-minute tick cannot retry immediately.
    state["last_attempt"] = time.time()
    state["attempts"] = int(state.get("attempts") or 0) + 1
    _save_recover_state(path, state)

    try:
        daemon_up = _docker_up()
        if daemon_up:
            print("penpot-recover: docker daemon is up — checking the stack")
        else:
            print("penpot-recover: docker daemon is down — launching Docker Desktop")
            # macOS app launcher; deliberately NOT sudo, never a login shell.
            rc, out = _run(["/usr/bin/open", "-a", "Docker"], timeout=30)
            detail = f" ({out[:200]})" if out else ""
            print(f"penpot-recover: open -a Docker exited {rc}{detail}")
            daemon_up = _poll(_docker_up, PENPOT_DAEMON_WAIT_S, 3)
            print(
                f"penpot-recover: daemon {'came up' if daemon_up else 'still down after 90s'}"
            )

        if not daemon_up:
            return _record_recover_failure(path, state)

        if _poll(lambda: check(PENPOT_URL), PENPOT_SITE_WAIT_S, PENPOT_POLL_INTERVAL_S):
            return _record_recover_success(path, state)

        # Daemon is healthy but the public URL is not: containers carry
        # restart:always, so this mostly covers a deliberately stopped stack.
        if PENPOT_COMPOSE_DIR.is_dir():
            print("penpot-recover: penpot still down with daemon up — docker compose up -d")
            rc, out = _run(
                [docker, "compose", "up", "-d"], timeout=180, cwd=str(PENPOT_COMPOSE_DIR)
            )
            detail = f" ({out[:300]})" if out else ""
            print(f"penpot-recover: docker compose exited {rc}{detail}")
        else:
            print(f"penpot-recover: compose dir missing ({PENPOT_COMPOSE_DIR}) — cannot restart the stack")

        if _poll(lambda: check(PENPOT_URL), PENPOT_SITE_WAIT_S, PENPOT_POLL_INTERVAL_S):
            return _record_recover_success(path, state)
        return _record_recover_failure(path, state)
    except Exception as exc:  # noqa: BLE001 — recovery must never break health checks
        print(f"penpot-recover: error ({type(exc).__name__}: {exc})")
        return _record_recover_failure(path, state)


async def main() -> int:
    for url in KEEP_WARM.values():
        keep_warm(url)
    now = {name: check(url) for name, url in CHECKS.items()}
    for name, (a, b) in DRIFT_PAIRS.items():
        body_a, body_b = fetch_body(a), fetch_body(b)
        now[name] = body_a is not None and body_a == body_b
    for name, (key, budget) in KV_WATCH.items():
        age = kv_age_ms(key)
        now[name] = age is not None and age < budget
    size = corpus_size()
    now["dead-corpus"] = size is not None and size < CORPUS_WARN

    # Targeted self-heal, Penpot only. Runs after every check has been read so
    # a slow recovery cannot delay the KV/drift probes. A recovered site is
    # marked healthy here, so no FAILED alert names it; every other failure
    # (and any non-recovery) still takes the existing alert path below.
    if not now.get("penpot"):
        try:
            now["penpot"] = recover_penpot()
        except Exception as exc:  # noqa: BLE001 — must never break the health check
            print(f"penpot-recover: skipped ({type(exc).__name__}: {exc})")
    else:
        # Healthy this tick: clear a stale failure counter from an earlier
        # outage that was fixed out-of-band, so it cannot mute a later one.
        reset_penpot_recover_state()

    prev = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    failed = [k for k, ok in now.items() if not ok]
    recovered = [k for k in prev if not prev.get(k) and now.get(k)]

    if failed != [k for k in prev if not prev.get(k)]:
        from core.tools.email_tool import send_email

        to = os.environ.get("FOUNDER_EMAIL", "support@lazynext.com")
        if failed:
            body = "FAILED checks: " + ", ".join(failed) + "\n\nAll results: " + json.dumps(now)
            await send_email(to, "[AI Company] Health check FAILED", body)
        if recovered and not failed:
            await send_email(to, "[AI Company] Recovered", "Back up: " + ", ".join(recovered))

    STATE_FILE.write_text(json.dumps(now))

    # Weekly readiness digest (C1). Self-gated to one send per 6.5 days by
    # `digest:last_run`, so piggy-backing on this 15-minute scheduler is safe.
    # Deliberately isolated: a digest failure is logged and swallowed so it can
    # never change the health check's result or exit code.
    try:
        from scripts.weekly_digest import main as weekly_digest_main

        rc = await weekly_digest_main([])
        if rc != 0:
            print(f"weekly-digest: exit {rc} (non-fatal)")
    except Exception as exc:  # noqa: BLE001 — a digest must never break health checks
        print(f"weekly-digest: skipped ({type(exc).__name__}: {exc})")

    print("OK" if not failed else "FAILED: " + ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
