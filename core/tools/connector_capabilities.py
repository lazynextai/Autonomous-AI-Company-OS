"""Connector capability metadata — the fleet-side mirror of
`worker/src/capabilities.ts`.

Same contract as the worker table: a plain data table (no class hierarchy),
`configured` derived from credential presence at call time, `rate_limit`
DECLARED and not enforced, and `supports_dry_run: false` wherever the dispatch
path cannot be rendered honestly (a non-HTTP transport, or a dedicated sender
that bypasses the captured client).

Why two tables instead of one generated file: the worker and the fleet are
deployed separately (the Worker bundle cannot import Python and the fleet
cannot import TypeScript). The parity is pinned by
`tests/unit/test_connector_capabilities.py`, which parses the TypeScript table
and asserts every field matches — so drift fails the suite rather than
silently producing two different answers to "can I preview this?".
"""

from __future__ import annotations

from typing import Any, Callable

AUTH_KINDS = frozenset({
    "oauth2_org",      # OAuth2, org/brand owned (LinkedIn organization URN)
    "oauth2_user",     # OAuth2 as a user identity (X, Google)
    "bearer",          # static bearer token
    "app_password",    # provider-issued app password (Bluesky)
    "api_key",         # API key / PAT / integration token
    "bot_token",       # chat-bot token bound to a room/chat id
    "basic",           # username:password (HTTP Basic or form login)
    "session",         # browser session cookie material
    "webhook",         # a pre-authorized webhook URL is the credential
    "relay",           # signed event published to a relay network (Nostr)
    "none",            # no credential exists — the provider has no post path
})


def _cap(
    auth_kind: str,
    credential_hint: str,
    supports_dry_run: bool = True,
    per_day: int | None = None,
    dry_run_note: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "auth_kind": auth_kind,
        "credential_hint": credential_hint,
        "supports_dry_run": supports_dry_run,
        # Declared provider ceiling. `enforced` is False everywhere: the
        # platform has no per-connector daily counter, and inventing one to
        # make this number look real would be worse than reporting the truth.
        "rate_limit": {"per_day": per_day, "enforced": False},
    }
    if dry_run_note:
        row["dry_run_note"] = dry_run_note
    return row


CONNECTOR_CAPABILITIES: dict[str, dict[str, Any]] = {
    "x": _cap("oauth2_user", "<bearer> or <ck>|<cs>|<at>|<ats>", True, 17),
    "linkedin": _cap("oauth2_org", "<access_token>[:<numeric_org_id>]", True, 100),
    "meta": _cap("bearer", "<access_token>:<ad_account_id>"),
    "facebook": _cap("bearer", "<page_access_token>:<page_id>"),
    "instagram": _cap("bearer", "<access_token>:<ig_user_id>"),
    "threads": _cap("bearer", "<access_token>:<threads_user_id>"),
    "bluesky": _cap("app_password", "<handle.bsky.social>:<app_password>"),
    "mastodon": _cap("bearer", "<instance_host>:<access_token>"),
    "reddit": _cap("session", "<client_id>:<secret>:<user>:<pass>:<sub> or <session>:<loid>:<sub>"),
    "pinterest": _cap("bearer", "<access_token>:<board_id>", True, 1000),
    "vk": _cap("bearer", "<access_token>:<owner_id>"),
    "youtube": _cap("oauth2_user", "<access_token> or <refresh_token>:<client_id>:<client_secret>"),
    "tiktok": _cap("bearer", "<access_token>"),
    "gmb": _cap("oauth2_user", "<access_token>:<accounts/{a}/locations/{l}>"),
    "snapchat": _cap(
        "none",
        "(none — no organic post API)",
        False,
        None,
        "snapchat has no organic-post API; the Marketing API is ads-only — dispatch returns 400 without sending",
    ),
    "discord": _cap("webhook", "<channel_webhook_url>"),
    "slack": _cap("webhook", "<incoming_webhook_url>"),
    "telegram": _cap("bot_token", "<bot_token>:<chat_id>"),
    "matrix": _cap("bearer", "<homeserver>|<room_id>|<access_token>"),
    "teams": _cap("webhook", "<power_automate_workflow_url>"),
    "mattermost": _cap("webhook", "<incoming_webhook_url>"),
    "zulip": _cap("basic", "<base_url>|<bot_email>|<api_key>"),
    "viber": _cap("bearer", "<auth_token>"),
    "line": _cap("bearer", "<channel_access_token>"),
    "devto": _cap("api_key", "<api_key>"),
    "hashnode": _cap("api_key", "<token>:<publication_id>"),
    "medium": _cap("api_key", "<integration_token> or <session_cookies>"),
    "wordpress": _cap("basic", "<site_base>|<user>|<app_password>"),
    "github": _cap("api_key", "<personal_access_token>"),
    "gitlab": _cap("api_key", "<pat> or <host>:<pat>"),
    "tumblr": _cap("oauth2_user", "<token>:<blog_name>"),
    "ghost": _cap("api_key", "<site_base>|<key_id>:<secret_hex>"),
    "beehiiv": _cap("api_key", "<api_key>:<publication_id>"),
    "lemmy": _cap("basic", "<instance_base>|<username>|<password>"),
    "listmonk": _cap("basic", "<base_url>|<user>|<pass>|<list_id>"),
    "nostr": _cap(
        "relay",
        "<64-char_hex_privkey>[|wss://relay1,wss://relay2]",
        False,
        None,
        "nostr publishes a signed event over relay websockets — not an HTTP request, so there is no request to render",
    ),
    "webhook": _cap("webhook", "<https_url>[|<bearer>]"),
    "ayrshare": _cap("api_key", "<api_key>"),
    "postiz": _cap("api_key", "<api_key>|<integration_id>[|<base_url>]"),
    "buffer": _cap("api_key", "<api_key>:<channel_id>"),
    "letmepost": _cap("api_key", "<api_key>|<account_ids>[|<base_url>]"),
    "twilio": _cap("basic", "<account_sid>:<auth_token>:<from_number>"),
    "whatsapp": _cap("bearer", "<access_token>:<phone_number_id>"),
    "brevo": _cap(
        "api_key",
        "[<sender>:]<api_key>",
        False,
        None,
        "brevo sends through the dedicated brevoSend helper (its own transport), which the dispatch-level capture does not see",
    ),
    "signwell": _cap(
        "api_key",
        "[test:]<api_key>",
        False,
        None,
        "signing does not dispatch through this route — use POST /api/v1/signwell/send, which is human_only-gated",
    ),
}


def capability_of(connector_id: str) -> dict[str, Any] | None:
    """Capability row for one connector, or None when it is not in the registry."""
    return CONNECTOR_CAPABILITIES.get(connector_id)


def capability_report(
    is_configured: Callable[[str], bool],
) -> dict[str, dict[str, Any]]:
    """Merge the static table with live credential presence.

    `is_configured` is supplied by the caller so this module stays a pure data
    table — it must never guess configuration, and a hardcoded answer would go
    stale the moment someone connects a connector.
    """
    return {
        cid: {**row, "configured": bool(is_configured(cid))}
        for cid, row in CONNECTOR_CAPABILITIES.items()
    }
