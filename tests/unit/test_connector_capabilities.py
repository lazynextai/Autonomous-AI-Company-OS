"""Connector capability metadata + dry-run dispatch (LinkedIn plan A1/A2/A6).

Two things are pinned here:

1. PARITY. `core/tools/connector_capabilities.py` and
   `worker/src/capabilities.ts` are two tables because the fleet (Python) and
   the Worker (TypeScript) deploy separately. This suite parses the TypeScript
   table and asserts every field matches, so the two runtimes cannot disagree
   about how a connector authenticates or whether it can be previewed. It also
   asserts the Python table covers `_DISPATCH` exactly.

2. SAFETY. A dry run must produce the exact request a real dispatch would send
   and must never reach a provider. The tests execute every supported
   connector and assert at least one request was rendered, that credentials do
   not survive into the preview, and that the breaker/gate seams are untouched.
"""

import json
import re
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from core.tools import connector_capabilities as cc
from core.tools import connectors

TS_PATH = Path(__file__).resolve().parents[2] / "worker" / "src" / "capabilities.ts"


def _ts_table() -> dict[str, dict]:
    """Parse CONNECTOR_CAPABILITIES out of the shipped TypeScript source."""
    src = TS_PATH.read_text()
    block = src.split("export const CONNECTOR_CAPABILITIES", 1)[1]
    block = block.split("export const CONNECTOR_CAPABILITY_IDS", 1)[0]
    rows: dict[str, dict] = {}
    for chunk in re.split(r"\n  (?=[a-z0-9_]+: cap\()", block):
        m = re.match(
            r'\s*([a-z0-9_]+): cap\(\s*"([^"]+)",\s*"([^"]*)"'
            r'(?:,\s*(true|false))?(?:,\s*(\d+|null))?',
            chunk,
        )
        if not m:
            continue
        cid, auth, hint, dry, per_day = m.groups()
        rows[cid] = {
            "auth_kind": auth,
            "credential_hint": hint,
            "supports_dry_run": dry != "false",
            "per_day": None if per_day in (None, "null") else int(per_day),
        }
    return rows


# --- 1. parity -------------------------------------------------------------
def test_capability_table_covers_the_dispatch_registry():
    assert set(cc.CONNECTOR_CAPABILITIES) == set(connectors._DISPATCH)


def test_python_and_typescript_tables_agree():
    ts = _ts_table()
    assert set(ts) == set(cc.CONNECTOR_CAPABILITIES), (
        "the two capability tables must cover the same connectors - "
        f"TS-only={sorted(set(ts) - set(cc.CONNECTOR_CAPABILITIES))}, "
        f"py-only={sorted(set(cc.CONNECTOR_CAPABILITIES) - set(ts))}"
    )
    for cid, row in cc.CONNECTOR_CAPABILITIES.items():
        assert row["auth_kind"] == ts[cid]["auth_kind"], f"{cid}: auth_kind drifted"
        assert row["credential_hint"] == ts[cid]["credential_hint"], f"{cid}: credential_hint drifted"
        assert row["supports_dry_run"] == ts[cid]["supports_dry_run"], f"{cid}: supports_dry_run drifted"
        assert row["rate_limit"]["per_day"] == ts[cid]["per_day"], f"{cid}: per_day drifted"
        # `enforced` is DERIVED from per_day in both tables: a published ceiling
        # means both dispatch paths count it before any provider call. Pinning
        # the derivation (not a fixed value) is what keeps the flag from
        # claiming enforcement it does not have.
        assert row["rate_limit"]["enforced"] is (row["rate_limit"]["per_day"] is not None), (
            f"{cid}: enforced must be true exactly when a per_day ceiling exists"
        )


def test_capability_rows_are_well_formed():
    for cid, row in cc.CONNECTOR_CAPABILITIES.items():
        assert row["auth_kind"] in cc.AUTH_KINDS, cid
        assert isinstance(row["supports_dry_run"], bool), cid
        per_day = row["rate_limit"]["per_day"]
        assert per_day is None or (isinstance(per_day, int) and per_day > 0), cid
        assert row["credential_hint"], cid
        # A hint is a shape, never a value.
        assert not re.search(r"[A-Za-z0-9_-]{32,}", row["credential_hint"]), cid
        if not row["supports_dry_run"]:
            assert row.get("dry_run_note"), f"{cid}: unsupported connectors must say why"


def test_configured_is_derived_not_stored():
    for cid, row in cc.CONNECTOR_CAPABILITIES.items():
        assert "configured" not in row, cid
    report = cc.capability_report(lambda cid: cid == "x")
    assert report["x"]["configured"] is True
    assert report["linkedin"]["configured"] is False
    assert report["x"]["auth_kind"] == cc.CONNECTOR_CAPABILITIES["x"]["auth_kind"]


# --- 2. dry run ------------------------------------------------------------
CREDS = {
    "x": "fake-x-bearer-token",
    "linkedin": "fake-linkedin-token-1234:987654",
    "meta": "fake-meta-token:act_id",
    "facebook": "fake-page-token:page_id",
    "instagram": "fake-ig-token:ig_user",
    "threads": "fake-threads-token:threads_user",
    "bluesky": "handle.invalid:app-password-1234",
    "mastodon": "mastodon.invalid:fake-token",
    "reddit": "fake-session-cookie:loid1234:testsub",
    "pinterest": "fake-pinterest-token:board_id",
    "vk": "fake-vk-token:-123456",
    "youtube": "fake-youtube-token",
    "tiktok": "fake-tiktok-token",
    "gmb": "fake-gmb-token:accounts/1/locations/2",
    "discord": "https://discord.invalid/api/webhooks/1/fake-webhook-token",
    "slack": "https://hooks.slack.invalid/services/T000/B000/fake-webhook-token",
    "telegram": "123456:fake-bot-token:chat_id",
    "matrix": "https://matrix.invalid|!room:matrix.invalid|fake-token",
    "teams": "https://prod-1.westus.logic.azure.invalid/workflows/fake",
    "mattermost": "https://mattermost.invalid/hooks/fake-hook-token",
    "zulip": "https://zulip.invalid|bot@zulip.invalid|fake-zulip-key",
    "viber": "fake-viber-token",
    "line": "fake-line-channel-token",
    "devto": "fake-devto-key",
    "hashnode": "fake-hashnode-token:publication_id",
    "medium": "uid1234|session1234|xsrf1234",
    "wordpress": "https://wp.invalid|editor|fake-app-password",
    "github": "fake-github-pat",
    "gitlab": "fake-gitlab-pat",
    "tumblr": "fake-tumblr-token:blogname",
    "ghost": "https://ghost.invalid|keyid:abc123def456",
    "beehiiv": "fake-beehiiv-key:pub_id",
    "lemmy": "https://lemmy.invalid|user|fake-password",
    "listmonk": "https://listmonk.invalid|user|fake-pass|1",
    "webhook": "https://webhook.invalid/abc|fake-bearer",
    "ayrshare": "fake-ayrshare-key",
    "postiz": "fake-postiz-key|integration_id|https://postiz.invalid/api",
    "buffer": "fake-buffer-key:channel_id",
    "letmepost": "fake-letmepost-key|acct1234",
    "twilio": "ACfake:fake-twilio-token:+15550000000",
    "whatsapp": "fake-wa-token:phone_number_id",
    # brevo became previewable once its dispatch was confirmed to build through
    # `_post` → `_async_client()` (the recorded transport).
    "brevo": "support@fake.invalid:fake-brevo-api-key",
}

PAYLOAD = {
    "text": "A short preview payload",
    "to": "recipient@example.com",
    "subject": "Subject line",
    "image_url": "https://lazynext.com/og.png",
    "media_url": "https://lazynext.com/og.png",
}

SUPPORTED = [c for c, r in cc.CONNECTOR_CAPABILITIES.items() if r["supports_dry_run"]]

# Connectors whose payload fields mean something other than "text + recipient".
PAYLOAD_OVERRIDES = {
    "lemmy": {"to": 1},  # community_id, an integer
}


@pytest.fixture
def fake_creds(monkeypatch):
    """Resolve credentials from the fixture map - no KV, no network."""

    async def _cred(connector_id: str):
        return CREDS.get(connector_id)

    monkeypatch.setattr(connectors, "_credential", _cred)
    return CREDS


def _assert_no_httpx_network(monkeypatch):
    """Any transport that is not the dry recorder must explode.

    `_async_client` installs `_DryTransport` while a sink is active; a real
    client would build an `httpx.HTTPTransport`, which we replace here so a
    leaked call fails loudly instead of hitting the internet.
    """

    class _Forbidden(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):  # pragma: no cover - guard
            raise AssertionError(f"dry run attempted a network call to {request.url}")

    real_init = httpx.AsyncClient.__init__

    def _init(self, *args, **kwargs):
        if not isinstance(kwargs.get("transport"), connectors._DryTransport):
            kwargs["transport"] = _Forbidden()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)


@pytest.mark.anyio
async def test_dry_run_renders_every_supported_connector_without_network(fake_creds, monkeypatch):
    _assert_no_httpx_network(monkeypatch)
    for cid in SUPPORTED:
        report = await connectors.call_connector(cid, dict(PAYLOAD), dry_run=True)
        assert report["supported"] is True, cid
        assert report["dry_run"] is True, cid
        assert report["gate"] == "skipped_dry_run", cid
        assert len(report["calls"]) >= 1, f"{cid}: rendered no request"
        assert report["warnings"] == [], f"{cid}: {report['warnings']}"
    # the sink must not leak past the call
    assert connectors._DRY_SINK.get() is None


@pytest.mark.anyio
async def test_previews_are_complete_for_text_only_connectors(fake_creds, monkeypatch):
    _assert_no_httpx_network(monkeypatch)
    media = {"instagram", "youtube", "tiktok", "pinterest"}
    incomplete = {}
    for cid in SUPPORTED:
        if cid in media:
            continue
        payload = {**PAYLOAD, **PAYLOAD_OVERRIDES.get(cid, {})}
        report = await connectors.call_connector(cid, payload, dry_run=True)
        if not report["preview_ok"]:
            incomplete[cid] = report.get("error")
    assert incomplete == {}


@pytest.mark.anyio
async def test_rendered_request_is_the_real_request(fake_creds):
    x = await connectors.call_connector("x", "hello world", dry_run=True)
    assert len(x["calls"]) == 1
    assert x["calls"][0]["method"] == "POST"
    assert x["calls"][0]["url"] == "https://api.x.com/2/tweets"
    assert json.loads(x["calls"][0]["body"]) == {"text": "hello world"}

    li = await connectors.call_connector("linkedin", {"text": "hi"}, dry_run=True)
    call = li["calls"][0]
    assert call["url"] == "https://api.linkedin.com/rest/posts"
    assert call["headers"]["linkedin-version"] == "202609"
    assert call["headers"]["x-restli-protocol-version"] == "2.0.0"
    body = json.loads(call["body"])
    assert body["author"] == "urn:li:organization:987654"
    assert body["commentary"] == "hi"
    assert body["visibility"] == "PUBLIC"


@pytest.mark.anyio
async def test_no_credential_survives_into_a_preview(fake_creds):
    report = await connectors.call_connector("linkedin", {"text": "hi"}, dry_run=True)
    serialized = json.dumps(report)
    # The fixture cred is what got used; make sure it is scrubbed.
    assert CREDS["linkedin"].split(":")[0] not in serialized
    assert report["calls"][0]["headers"]["authorization"] == "Bearer \u00abredacted\u00bb"
    # The author URN is not a secret and a reviewer needs it - it stays.
    assert "urn:li:organization:987654" in report["calls"][0]["body"]

    d = await connectors.call_connector("discord", {"text": "hi"}, dry_run=True)
    assert "fake-webhook-token" not in json.dumps(d)


@pytest.mark.anyio
async def test_unsupported_and_unconnected_report_honestly(fake_creds):
    for cid, row in cc.CONNECTOR_CAPABILITIES.items():
        if row["supports_dry_run"]:
            continue
        report = await connectors.call_connector(cid, dict(PAYLOAD), dry_run=True)
        assert report["supported"] is False, cid
        assert report["calls"] == [], cid
        assert report["error"], cid


@pytest.mark.anyio
async def test_unconnected_connector_preview_explains_itself(monkeypatch):
    async def _none(_cid):
        return None

    monkeypatch.setattr(connectors, "_credential", _none)
    report = await connectors.call_connector("linkedin", {"text": "hi"}, dry_run=True)
    assert report["supported"] is True
    assert report["calls"] == []
    assert "not connected" in report["error"]


@pytest.mark.anyio
async def test_dry_run_skips_the_breaker_and_decision_gates(fake_creds, monkeypatch):
    breaker = AsyncMock(return_value={"allow": False, "reason": "tripped"})
    decision = AsyncMock(return_value={"allow": False, "reason": "no package"})
    monkeypatch.setattr(connectors, "check_outbound", breaker)
    monkeypatch.setattr(connectors, "check_decision", decision)

    report = await connectors.call_connector("x", "preview", dry_run=True)
    assert report["preview_ok"] is True
    assert report["gate"] == "skipped_dry_run"
    breaker.assert_not_awaited()
    decision.assert_not_awaited()

    # A real send still runs both, in order, and stops on a block.
    blocked = await connectors.call_connector("x", "ship it")
    assert blocked["ok"] is False
    assert "outbound breaker" in blocked["error"]
    breaker.assert_awaited_once()
    decision.assert_not_awaited()


@pytest.mark.anyio
async def test_dispatcher_still_calls_the_provider_on_a_real_send(fake_creds, monkeypatch):
    monkeypatch.setattr(connectors, "check_outbound", AsyncMock(return_value={"allow": True}))
    monkeypatch.setattr(connectors, "check_decision", AsyncMock(return_value={"allow": True}))
    sent = AsyncMock(return_value={"ok": True, "status": 200})

    async def _post(url, **kwargs):
        return await sent(url, **kwargs)

    monkeypatch.setattr(connectors, "_post", _post)
    out = await connectors.call_connector("x", "ship it")
    assert out["ok"] is True
    sent.assert_awaited_once()


@pytest.mark.anyio
async def test_connector_capabilities_derives_configured(monkeypatch):
    async def _only_x(cid):
        return "fake-x-bearer-token" if cid == "x" else None

    monkeypatch.setattr(connectors, "_credential", _only_x)
    report = await connectors.connector_capabilities()
    assert report["x"]["configured"] is True
    assert report["linkedin"]["configured"] is False
    assert report["brevo"]["configured"] is False
    assert set(report) == set(cc.CONNECTOR_CAPABILITIES)


@pytest.mark.anyio
async def test_brevo_preview_renders_the_real_smtp_request(fake_creds, monkeypatch):
    """brevo used to refuse: its dispatch was assumed uncapturable.

    It builds through `_post` -> `_async_client()`, so the recording transport
    already saw it — the refusal was a stale capability flag, not a transport
    limit.
    """
    _assert_no_httpx_network(monkeypatch)
    report = await connectors.call_connector("brevo", dict(PAYLOAD), dry_run=True)
    assert report["supported"] is True
    assert len(report["calls"]) == 1
    call = report["calls"][0]
    assert call["method"] == "POST"
    assert call["url"] == "https://api.brevo.com/v3/smtp/email"
    # Redacted BY NAME, not only by the literal pass (which needs ≥8 chars).
    assert call["headers"]["api-key"] == "\u00abredacted\u00bb"
    body = json.loads(call["body"])
    assert body["to"] == [{"email": "recipient@example.com"}]
    assert body["subject"] == "Subject line"


def test_the_four_previously_refusing_connectors_each_carry_a_real_verdict():
    # brevo: capture implemented in both runtimes.
    assert cc.CONNECTOR_CAPABILITIES["brevo"]["supports_dry_run"] is True
    assert "dry_run_note" not in cc.CONNECTOR_CAPABILITIES["brevo"]
    # The rest: honest 501s, each naming the exact call it cannot render.
    needles = {
        "signwell": "routing stub",
        "nostr": "WebSockets",
        "snapchat": "not dispatchable",
    }
    for cid, needle in needles.items():
        row = cc.CONNECTOR_CAPABILITIES[cid]
        assert row["supports_dry_run"] is False, cid
        assert needle in row["dry_run_note"], cid
        # Not the generic line this task replaced.
        assert row["dry_run_note"] != f"'{cid}' has no dry-run preview", cid
        assert len(row["dry_run_note"]) > 60, cid
