from unittest.mock import AsyncMock

import pytest

from core.tools import connectors


@pytest.mark.asyncio
@pytest.mark.parametrize("body,success", [
    ({"errors": [{"message": "Publication does not have an active Pro plan"}], "data": {"publishPost": None}}, False),
    ({"data": {"publishPost": {"post": {"id": "123"}}}}, True),
])
async def test_hashnode_official_fallback(monkeypatch, body, success):
    post = AsyncMock(side_effect=[
        {"ok": False, "status": 401, "body": {}},
        {"ok": True, "status": 200, "body": body},
    ])
    monkeypatch.setattr(connectors, "_post", post)
    result = await connectors._hashnode({"text": "Example"}, "test-token:publication")
    assert result["ok"] is success
    call = post.call_args
    assert call.args[0] == "https://gql-beta.hashnode.com/"
    assert call.kwargs["headers"]["authorization"] == "Bearer test-token"
    if not success:
        assert "active Pro plan" in result["error"]
