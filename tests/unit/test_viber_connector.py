from unittest.mock import AsyncMock

import pytest

from core.tools import connectors


@pytest.mark.asyncio
@pytest.mark.parametrize("broadcast", [False, True])
@pytest.mark.parametrize("body,success", [
    ({"status": 2, "status_message": "invalidAuthToken"}, False),
    ({"status": 6, "status_message": "receiverNotSubscribed"}, False),
    ({}, False),
    ({"status": False}, False),
    ({"status": 0, "message_token": 123}, True),
])
async def test_viber_uses_provider_verdict(monkeypatch, broadcast, body, success):
    post = AsyncMock(return_value={"status": 200, "ok": True, "body": body})
    monkeypatch.setattr(connectors, "_post", post)
    payload = {"text": "Example", "to": "subscriber"}
    if broadcast:
        payload["broadcast_list"] = ["subscriber"]
    result = await connectors._viber(payload, "test-token")
    assert result["ok"] is success
    assert result["status"] == 200
    assert result["body"] == body
    expected = "broadcast_message" if broadcast else "send_message"
    assert post.call_args.args[0].endswith(expected)
    if not success:
        assert "Viber API error" in result["error"]


@pytest.mark.asyncio
async def test_viber_preserves_http_failure(monkeypatch):
    failure = {"status": 503, "ok": False, "body": {"status": 0}}
    monkeypatch.setattr(connectors, "_post", AsyncMock(return_value=failure))
    assert await connectors._viber({"text": "Example"}, "test-token") == failure
