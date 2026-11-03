"""E2E tests against the live Lazynext deployment.

These hit the real production worker — they verify the deployed system,
not a mock. Run: pytest tests/e2e -v

Every test in this module is genuinely network-dependent: CI has no local
worker to point at, so each request crosses the public internet to
`LAZYNEXT_API_URL` (production by default) and a transport-level hiccup on
that path — a reset connection, a read timeout — is not a product defect.
`_with_retry` therefore retries *only* transport failures. HTTP status codes
are never retried: a real 404/500 still fails the test on the first response.
"""
import os
import time

import httpx
import pytest

BASE = os.environ.get("LAZYNEXT_API_URL", "https://ai-company.lazynext.com")
KEY = os.environ.get("LAZYNEXT_API_KEY", "")

# Failures where no usable HTTP response came back: the connection never
# completed (ConnectError/ConnectTimeout) or died while the response was being
# read (ReadTimeout/RemoteProtocolError). Retrying an idempotent GET is safe.
TRANSIENT_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)
# Narrower set for the one non-GET assertion: these mean the request never
# reached the server, so replaying it cannot double-apply anything.
NEVER_REACHED_SERVER = (httpx.ConnectError, httpx.ConnectTimeout)

RETRY_ATTEMPTS = 3
RETRY_BACKOFF = 0.5  # seconds, doubled per retry: 0.5, 1.0


def _client():
    return httpx.Client(base_url=BASE, timeout=20)


def _with_retry(send, errors=TRANSIENT_ERRORS, attempts=RETRY_ATTEMPTS, backoff=RETRY_BACKOFF):
    """Run `send` (one request per call) until it produces a response.

    Only `errors` are retried. A returned response is handed straight back to
    the caller regardless of its status code, so assertions stay untouched —
    retrying must never turn a genuine 4xx/5xx into a pass.
    """
    for attempt in range(1, attempts + 1):
        try:
            return send()
        except errors:
            if attempt == attempts:
                raise
            time.sleep(backoff * 2 ** (attempt - 1))


def _get(path):
    return _with_retry(lambda: _client().get(path))


class TestPublicSurface:
    def test_health(self):
        r = _get("/api/v1/health")
        assert r.status_code == 200

    def test_openapi_spec(self):
        r = _get("/api/v1/openapi.json")
        assert r.status_code == 200
        paths = r.json()["paths"]
        for p in ["/api/v1/health", "/api/v1/waitlist", "/api/v1/status", "/api/v1/tasks"]:
            assert p in paths

    def test_a2a_agent_card(self):
        r = _get("/.well-known/agent.json")
        assert r.status_code == 200
        card = r.json()
        assert card["name"] and card["skills"]

    def test_widget_js(self):
        r = _get("/widget.js")
        assert r.status_code == 200
        assert "data-lazynext" in r.text

    def test_status_requires_key(self):
        r = _get("/api/v1/status")
        assert r.status_code in (401, 403)

    def test_oauth_rejects_bad_client(self):
        r = _with_retry(
            lambda: _client().post(
                "/oauth/token",
                data={"grant_type": "client_credentials", "client_secret": "bogus"},
            ),
            errors=NEVER_REACHED_SERVER,
        )
        assert r.status_code == 401


class TestAuthed:
    @pytest.mark.skipif(not KEY, reason="LAZYNEXT_API_KEY not set")
    def test_status_with_key(self):
        r = _with_retry(
            lambda: _client().get("/api/v1/status", headers={"authorization": f"Bearer {KEY}"})
        )
        assert r.status_code == 200

    @pytest.mark.skipif(not KEY, reason="LAZYNEXT_API_KEY not set")
    def test_agents_with_key(self):
        r = _with_retry(
            lambda: _client().get("/api/v1/agents", headers={"authorization": f"Bearer {KEY}"})
        )
        assert r.status_code == 200


class TestTransportRetry:
    """Pins `_with_retry` itself — no network, no live worker involved."""

    def test_connect_error_then_success_is_retried(self):
        sentinel = object()
        calls = {"n": 0}

        def send():
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ConnectError("connection reset by peer")
            return sentinel

        assert _with_retry(send, backoff=0) is sentinel
        assert calls["n"] == 2

    def test_gives_up_after_configurable_attempts(self):
        calls = {"n": 0}

        def send():
            calls["n"] += 1
            raise httpx.ReadTimeout("read timed out")

        with pytest.raises(httpx.ReadTimeout):
            _with_retry(send, attempts=3, backoff=0)
        assert calls["n"] == 3

    def test_http_error_response_is_not_retried(self):
        """A real 4xx/5xx must reach the assertion immediately."""
        calls = {"n": 0}
        response = httpx.Response(500, request=httpx.Request("GET", BASE))

        def send():
            calls["n"] += 1
            return response

        assert _with_retry(send, backoff=0).status_code == 500
        assert calls["n"] == 1

    def test_non_transport_exception_propagates_immediately(self):
        calls = {"n": 0}

        def send():
            calls["n"] += 1
            raise httpx.InvalidURL("bad base url")

        with pytest.raises(httpx.InvalidURL):
            _with_retry(send, backoff=0)
        assert calls["n"] == 1
