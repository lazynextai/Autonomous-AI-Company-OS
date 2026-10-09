from unittest.mock import AsyncMock

import pytest

from core.tools import connectors


@pytest.mark.asyncio
@pytest.mark.parametrize("body,success", [
    ({"error": {"error_code": 5, "error_msg": "User authorization failed"}}, False),
    ({"error": {}}, False),
    ({"response": {"post_id": 123}}, True),
])
async def test_vk_dispatch_uses_api_verdict(monkeypatch, body, success):
    post = AsyncMock(return_value={"status": 200, "ok": True, "body": body})
    monkeypatch.setattr(connectors, "_post", post)
    result = await connectors._vk({"text": "Example"}, "test-token:-123")
    assert result["ok"] is success
    assert result["status"] == 200
    if not success:
        assert "VK API error" in result["error"]
