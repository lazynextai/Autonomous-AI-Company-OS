/**
 * Connector capability metadata — a plain data table, not a class hierarchy.
 *
 * Why this exists: the dispatch registry (`CONNECTOR_IDS`) told a caller
 * *which* connectors existed, but nothing told them how one authenticates,
 * whether a safe preview is possible, or what the provider's own ceiling is.
 * Every consumer had to read 1100 lines of `callConnector` to find out. This
 * table makes that machine-readable, so the dashboard, docs, and the dry-run
 * route can ask instead of assume.
 *
 * Deliberate choices:
 *
 *  - `configured` is NOT in this table. It is derived at request time from
 *    credential presence (`conn:<id>` in KV or the `CONN_<ID>` secret) by
 *    `capabilityReport()`. Hardcoding it here would be a second, lying source
 *    of truth that goes stale the moment someone connects a connector.
 *
 *  - `rate_limit.per_day` is DECLARED, not enforced — see `enforced: false`.
 *    The platform has no per-connector daily counter (`rl:` keys belong to the
 *    product worker's IP quotas; the platform's KV limiter is per API key per
 *    minute, a different axis). Inventing a counter store to make a number
 *    look enforced would be worse than reporting the truth, so the field is
 *    marked unenforced and enforcement stays a follow-up. `null` means the
 *    provider publishes no fixed daily ceiling we can state honestly.
 *
 *  - `supports_dry_run: false` is a safety statement, not laziness. Those
 *    connectors reach the network through a module-level helper or a
 *    non-HTTP transport (WebSocket relay, Brevo's dedicated sender), so the
 *    dispatch-level request capture cannot see — and therefore cannot
 *    honestly render — what would be sent. The dry-run route refuses them
 *    instead of returning a partial preview.
 */

export type AuthKind =
  | "oauth2_org" // OAuth2, org/brand owned (LinkedIn organization URN)
  | "oauth2_user" // OAuth2 as a user identity (X, Google)
  | "bearer" // static bearer token
  | "app_password" // provider-issued app password (Bluesky)
  | "api_key" // API key / PAT / integration token
  | "bot_token" // chat-bot token bound to a room/chat id
  | "basic" // username:password (HTTP Basic or form login)
  | "session" // browser session cookie material
  | "webhook" // a pre-authorized webhook URL is the credential
  | "relay" // signed event published to a relay network (Nostr)
  | "none"; // no credential exists — the provider has no post path

export interface ConnectorRateLimit {
  /** Declared provider ceiling per day, or null when there is no honest number. */
  per_day: number | null;
  /** False everywhere today — declared metadata, no counter is consulted. */
  enforced: boolean;
}

export interface ConnectorCapability {
  auth_kind: AuthKind;
  supports_dry_run: boolean;
  rate_limit: ConnectorRateLimit;
  /** Credential SHAPE only (`<token>:<id>`). Never a credential value. */
  credential_hint: string;
  /** Present when supports_dry_run is false — the reason, in plain words. */
  dry_run_note?: string;
}

const cap = (
  auth_kind: AuthKind,
  credential_hint: string,
  supports_dry_run = true,
  per_day: number | null = null,
  dry_run_note?: string,
): ConnectorCapability => ({
  auth_kind,
  supports_dry_run,
  rate_limit: { per_day, enforced: false },
  credential_hint,
  ...(dry_run_note ? { dry_run_note } : {}),
});

/**
 * One row per connector in the dispatch registry (`CONNECTOR_IDS`).
 * A parity test pins the key set in both directions, so adding a connector
 * without a capability row (or leaving a row behind) fails the suite.
 *
 * per_day notes: only values a provider actually publishes are stated.
 * X: 17 posts/24h/user (free tier) — the API's documented write ceiling.
 * LinkedIn: 100 Posts-API calls/day/app for organization posts.
 * Pinterest: 1000 calls/day/app. Reddit: 100 QPM is per-minute, not a day
 * ceiling, so null. Everything else null rather than a guessed number.
 */
export const CONNECTOR_CAPABILITIES: Record<string, ConnectorCapability> = {
  x: cap("oauth2_user", "<bearer> or <ck>|<cs>|<at>|<ats>", true, 17),
  linkedin: cap("oauth2_org", "<access_token>[:<numeric_org_id>]", true, 100),
  meta: cap("bearer", "<access_token>:<ad_account_id>"),
  facebook: cap("bearer", "<page_access_token>:<page_id>"),
  instagram: cap("bearer", "<access_token>:<ig_user_id>"),
  threads: cap("bearer", "<access_token>:<threads_user_id>"),
  bluesky: cap("app_password", "<handle.bsky.social>:<app_password>"),
  mastodon: cap("bearer", "<instance_host>:<access_token>"),
  reddit: cap("session", "<client_id>:<secret>:<user>:<pass>:<sub> or <session>:<loid>:<sub>"),
  pinterest: cap("bearer", "<access_token>:<board_id>", true, 1000),
  vk: cap("bearer", "<access_token>:<owner_id>"),
  youtube: cap("oauth2_user", "<access_token> or <refresh_token>:<client_id>:<client_secret>"),
  tiktok: cap("bearer", "<access_token>"),
  gmb: cap("oauth2_user", "<access_token>:<accounts/{a}/locations/{l}>"),
  snapchat: cap(
    "none",
    "(none — no organic post API)",
    false,
    null,
    "snapchat has no organic-post API; the Marketing API is ads-only — dispatch returns 400 without sending",
  ),
  discord: cap("webhook", "<channel_webhook_url>"),
  slack: cap("webhook", "<incoming_webhook_url>"),
  telegram: cap("bot_token", "<bot_token>:<chat_id>"),
  matrix: cap("bearer", "<homeserver>|<room_id>|<access_token>"),
  teams: cap("webhook", "<power_automate_workflow_url>"),
  mattermost: cap("webhook", "<incoming_webhook_url>"),
  zulip: cap("basic", "<base_url>|<bot_email>|<api_key>"),
  viber: cap("bearer", "<auth_token>"),
  line: cap("bearer", "<channel_access_token>"),
  devto: cap("api_key", "<api_key>"),
  hashnode: cap("api_key", "<token>:<publication_id>"),
  medium: cap("api_key", "<integration_token> or <session_cookies>"),
  wordpress: cap("basic", "<site_base>|<user>|<app_password>"),
  github: cap("api_key", "<personal_access_token>"),
  gitlab: cap("api_key", "<pat> or <host>:<pat>"),
  tumblr: cap("oauth2_user", "<token>:<blog_name>"),
  ghost: cap("api_key", "<site_base>|<key_id>:<secret_hex>"),
  beehiiv: cap("api_key", "<api_key>:<publication_id>"),
  lemmy: cap("basic", "<instance_base>|<username>|<password>"),
  listmonk: cap("basic", "<base_url>|<user>|<pass>|<list_id>"),
  nostr: cap(
    "relay",
    "<64-char_hex_privkey>[|wss://relay1,wss://relay2]",
    false,
    null,
    "nostr publishes a signed event over relay websockets — not an HTTP request, so there is no request to render",
  ),
  webhook: cap("webhook", "<https_url>[|<bearer>]"),
  ayrshare: cap("api_key", "<api_key>"),
  postiz: cap("api_key", "<api_key>|<integration_id>[|<base_url>]"),
  buffer: cap("api_key", "<api_key>:<channel_id>"),
  letmepost: cap("api_key", "<api_key>|<account_ids>[|<base_url>]"),
  twilio: cap("basic", "<account_sid>:<auth_token>:<from_number>"),
  whatsapp: cap("bearer", "<access_token>:<phone_number_id>"),
  brevo: cap(
    "api_key",
    "[<sender>:]<api_key>",
    false,
    null,
    "brevo sends through the dedicated brevoSend helper (its own transport), which the dispatch-level capture does not see",
  ),
  signwell: cap(
    "api_key",
    "[test:]<api_key>",
    false,
    null,
    "signing does not dispatch through this route — use POST /api/v1/signwell/send, which is human_only-gated",
  ),
};

export const CONNECTOR_CAPABILITY_IDS = Object.keys(CONNECTOR_CAPABILITIES);

/** Capability row for one connector, or null when it is not in the registry. */
export function capabilityOf(id: string): ConnectorCapability | null {
  return CONNECTOR_CAPABILITIES[id] ?? null;
}

/**
 * Merge the static table with live credential presence.
 *
 * `isConfigured` is supplied by the caller rather than resolved here so this
 * module stays a pure data table with no KV dependency (and no import cycle
 * with services.ts, which owns `connCred`).
 */
export function capabilityReport(
  isConfigured: (id: string) => boolean,
): Record<string, ConnectorCapability & { configured: boolean }> {
  const out: Record<string, ConnectorCapability & { configured: boolean }> = {};
  for (const [id, c] of Object.entries(CONNECTOR_CAPABILITIES)) {
    out[id] = { ...c, configured: isConfigured(id) };
  }
  return out;
}
