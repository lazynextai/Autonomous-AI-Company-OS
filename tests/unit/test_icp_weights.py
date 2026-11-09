"""Configurable ICP weights — the last deferred candidate from the 35-repo
star triage (Row 11: enterprise-B2B-multimodal-agent). Two sides:

1. ``CloudflareClient.aget`` — the read-only internal GET the helper needs
   (mirrors ``_post``: retries connect-phase errors only, never a 4xx).
2. ``SalesAgent._get_active_icp`` — reads the active manifest's ``icp`` block;
   absent/empty/unreadable must read as ``None`` so the qualification prompt
   stays byte-identical to the pre-ICP behaviour.
"""

import importlib.util
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def client_mod():
    spec = importlib.util.spec_from_file_location(
        "_cf_client", ROOT / "core" / "cloudflare_client.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def sales_mod():
    spec = importlib.util.spec_from_file_location(
        "_sales", ROOT / "agents" / "growth" / "sales_agent.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --------------------------------------------------------------------------
# CloudflareClient.aget
# --------------------------------------------------------------------------

def test_aget_returns_json_and_uses_get(client_mod):
    client = client_mod.CloudflareClient()
    req = httpx.Request("GET", f"{client.url}/manifests/latest")
    fake = AsyncMock()
    fake.get = AsyncMock(return_value=httpx.Response(
        200, json={"manifest": {"icp": {"signals": {"intent": 0.6}}}}, request=req
    ))
    with patch.object(client, "_get_async", AsyncMock(return_value=fake)):
        out = None

        async def run():
            nonlocal out
            out = await client.aget("/manifests/latest")

        import asyncio
        asyncio.run(run())
    assert out == {"manifest": {"icp": {"signals": {"intent": 0.6}}}}
    fake.get.assert_awaited_once_with(f"{client.url}/manifests/latest")


def test_aget_does_not_retry_an_auth_failure(client_mod):
    client = client_mod.CloudflareClient()
    req = httpx.Request("GET", f"{client.url}/manifests/latest")
    fake = AsyncMock()
    fake.get = AsyncMock(return_value=httpx.Response(401, json={"error": "unauthorized"}, request=req))
    with patch.object(client, "_get_async", AsyncMock(return_value=fake)):
        import asyncio
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(client.aget("/manifests/latest"))
    assert fake.get.await_count == 1, "a 401 is an auth problem, never a blip"


# --------------------------------------------------------------------------
# SalesAgent._get_active_icp
# --------------------------------------------------------------------------

# The REAL shape of GET /manifests/latest, taken from the live route:
#   {"active": {id, name, version, body: "<manifest as a JSON string>", ...}}
# `body` is a string because that is how the manifest is stored in D1. The
# first version of this helper read {"manifest": ...} — an invented shape that
# its unit test also mocked, so the test passed while production returned None.
# These fixtures pin the real shape.
def _live_shape(icp_block, **active_extra):
    manifest = {"name": "lean-startup", "version": 1, "goals": ["g-one"]}
    if icp_block is not None:
        manifest["icp"] = icp_block
    return {
        "active": {
            "id": 5,
            "name": "lean-startup",
            "version": 1,
            "body": json.dumps(manifest),   # <- string, must be parsed again
            "valid": 1,
            "activated": 1,
            "created_at": "2026-11-09T00:00:00Z",
            **active_extra,
        }
    }


@pytest.mark.asyncio
async def test_get_active_icp_reads_the_live_manifest(sales_mod):
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    icp = {"firmographics": {"industry": ["saas"]}, "signals": {"fit": 0.9}}
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value=_live_shape(icp))
    out = await agent._get_active_icp()
    assert out == icp


@pytest.mark.asyncio
async def test_get_active_icp_absent_is_none(sales_mod):
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value=_live_shape(None))
    assert await agent._get_active_icp() is None


@pytest.mark.asyncio
async def test_get_active_icp_no_active_manifest_is_none(sales_mod):
    """The live route answers {"active": null} when nothing is activated."""
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value={"active": None})
    assert await agent._get_active_icp() is None


@pytest.mark.asyncio
async def test_get_active_icp_accepts_an_already_parsed_body(sales_mod):
    """Defensive: a route that returns an object instead of a string works too."""
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    icp = {"signals": {"intent": 0.3}}
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value={
        "active": {"name": "x", "version": 1, "body": {"name": "x", "icp": icp}},
    })
    assert await agent._get_active_icp() == icp


@pytest.mark.asyncio
async def test_get_active_icp_never_raises(sales_mod):
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(side_effect=RuntimeError("network down"))
    assert await agent._get_active_icp() is None


@pytest.mark.asyncio
async def test_get_active_icp_survives_corrupt_body(sales_mod):
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value={"active": {"body": "{not json"}})
    assert await agent._get_active_icp() is None


@pytest.mark.asyncio
async def test_get_active_icp_ignores_a_non_dict_block(sales_mod):
    agent = sales_mod.SalesAgent.__new__(sales_mod.SalesAgent)
    agent._cf = AsyncMock()
    agent._cf.aget = AsyncMock(return_value=_live_shape("not-a-dict"))
    assert await agent._get_active_icp() is None