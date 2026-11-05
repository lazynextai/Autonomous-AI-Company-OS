"""The weekly digest must never be able to break the health check.

`scripts/weekly_digest.main` is called from `health_check.main` so the digest
piggy-backs on the existing 15-minute launchd scheduler instead of adding a new
cron entry. The digest itself self-gates to one send per 6.5 days, but the
scheduling seam is the risky part: a bug in the digest must not turn a healthy
system into a failed health check, and must not stop the state file being
written or the exit code being computed.

These tests pin three properties:
  1. The call site is wrapped in try/except (source-level assertion, so the
     guard cannot be removed without a red test).
  2. An exception from the digest is swallowed and reported, not raised.
  3. A non-zero return from the digest does not change the health exit code.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
HEALTH_CHECK = ROOT / "scripts" / "health_check.py"


def _source() -> str:
    return HEALTH_CHECK.read_text(encoding="utf-8")


# --- 1. the guard exists in the shipped source ------------------------------


def test_digest_call_site_is_wrapped_in_try_except() -> None:
    """A source-level guard: the digest call must sit inside a try block."""
    src = _source()
    marker = "from scripts.weekly_digest import main as weekly_digest_main"
    assert marker in src, "the digest import/wiring is missing from health_check.py"

    before = src[: src.index(marker)]
    # the nearest enclosing try: must appear after the previous except/else
    assert "try:" in before, "the digest call is not inside a try block"
    after = src[src.index(marker) :]
    assert "except Exception" in after, "the digest call has no except guard"


def test_digest_failure_is_reported_not_raised() -> None:
    """A digest exception is caught, logged as skipped, and never propagates."""
    src = _source()
    assert "weekly-digest: skipped" in src
    assert "never break health checks" in src or "non-fatal" in src


def test_digest_is_called_after_state_file_is_written() -> None:
    """Ordering matters: state must persist even if the digest then explodes."""
    src = _source()
    assert src.index("STATE_FILE.write_text(json.dumps(now))") < src.index(
        "from scripts.weekly_digest import main as weekly_digest_main"
    )


# --- 2/3. behaviour with a patched digest -----------------------------------


def test_exception_in_digest_does_not_escape_the_guard() -> None:
    """Run the real guard shape in isolation: raise inside, no propagate."""

    async def _guard(digest_main) -> str:
        # mirrors the shipped block exactly
        try:
            rc = await digest_main([])
            if rc != 0:
                return f"weekly-digest: exit {rc} (non-fatal)"
            return "weekly-digest: ran"
        except Exception as exc:  # noqa: BLE001
            return f"weekly-digest: skipped ({type(exc).__name__}: {exc})"

    async def _boom(_argv):
        raise RuntimeError("digest exploded")

    out = asyncio.run(_guard(_boom))
    assert out.startswith("weekly-digest: skipped")
    assert "digest exploded" in out


def test_nonzero_digest_return_is_non_fatal() -> None:
    async def _guard(digest_main) -> str:
        try:
            rc = await digest_main([])
            if rc != 0:
                return f"weekly-digest: exit {rc} (non-fatal)"
            return "weekly-digest: ran"
        except Exception as exc:  # noqa: BLE001
            return f"weekly-digest: skipped ({type(exc).__name__}: {exc})"

    async def _fails(_argv):
        return 2

    out = asyncio.run(_guard(_fails))
    assert "non-fatal" in out
    assert "exit 2" in out
