"""Monitoring must not disclose the platform bearer to other services."""
from unittest.mock import MagicMock
import urllib.request

import pytest

from scripts import health_check


@pytest.mark.parametrize("url,authenticated", [
    ("https://ai-company.lazynext.com/health", True),
    ("https://ai-company-os.dry-hall-6a50.workers.dev/health", True),
    ("https://checker.lazynext.com/health", False),
    ("https://api.lazynext.com/health", False),
    ("https://dashboard.lazynext.com", False),
    ("https://penpot.lazynext.com", False),
    ("https://ai-company.lazynext.com.attacker.example/health", False),
    ("https://ai-company.lazynext.com:444/health", False),
    ("http://ai-company.lazynext.com/health", False),
])
def test_probe_credentials_stay_on_platform(monkeypatch, url, authenticated):
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test-platform-token")
    monkeypatch.setenv("CLOUDFLARE_API_URL", "https://ai-company-os.dry-hall-6a50.workers.dev")
    response = MagicMock()
    response.__enter__.return_value.status = 200
    opened = MagicMock(return_value=response)
    monkeypatch.setattr(health_check, "_open", opened)
    assert health_check.check(url)
    request = opened.call_args.args[0]
    assert request.get_header("Authorization") == ("Bearer test-platform-token" if authenticated else None)


@pytest.mark.parametrize("destination,expected", [
    ("https://ai-company.lazynext.com/status", "Bearer test-platform-token"),
    ("https://ai-company.lazynext.com:443/status", "Bearer test-platform-token"),
    ("https://elsewhere.example/status", None),
    ("http://ai-company.lazynext.com/status", None),
    ("https://ai-company.lazynext.com:444/status", None),
])
def test_redirect_does_not_forward_credentials_to_another_origin(destination, expected):
    request = urllib.request.Request(
        "https://ai-company.lazynext.com/health",
        headers={"Authorization": "Bearer test-platform-token"},
    )
    redirect = health_check._ScopedRedirectHandler().redirect_request(
        request, None, 302, "Found", {}, destination,
    )
    assert redirect.get_header("Authorization") == expected
