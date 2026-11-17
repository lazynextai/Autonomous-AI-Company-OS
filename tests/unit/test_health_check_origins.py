"""The monitor's declared origins must include the slop-checker product.

scripts/health_check.py alerts the founder mailbox on state transitions, so a
declared CHECKS entry is the only thing that keeps a live product watched.
This pins the slop-checker entry to the same shape as its sibling product
origins (a11y-checker-domain / a11y-api-domain): an https /health URL whose
``check()`` returns True on a 200-family status. CHECKS entries are
status-only by design — the body-compare mechanism lives in DRIFT_PAIRS, so
no body assertion is expected here.
"""
import pytest

from scripts import health_check


class _Resp:
    """Minimal context-manager response for ``check``."""

    def __init__(self, status: int = 200) -> None:
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


def test_slop_checker_origin_is_declared_with_https_health_url():
    assert (
        health_check.CHECKS["slop-checker"]
        == "https://slop-checker.lazynext.com/health"
    )


def test_slop_checker_health_passes_on_200(monkeypatch):
    monkeypatch.setattr(health_check, "_open", lambda req: _Resp(status=200))
    assert health_check.check(health_check.CHECKS["slop-checker"]) is True


def test_slop_checker_health_fails_on_5xx(monkeypatch):
    monkeypatch.setattr(health_check, "_open", lambda req: _Resp(status=503))
    assert health_check.check(health_check.CHECKS["slop-checker"]) is False