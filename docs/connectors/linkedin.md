# LinkedIn

> ## Status: NOT CONNECTED
>
> The dispatch code is shipped and tested. There is **no `conn:linkedin`
> credential**, no LinkedIn app, and no authorized organization. A dispatch
> attempt today returns `503 'linkedin' not connected`.
>
> Nothing on the marketing site, the connector library or the pricing page
> claims a LinkedIn integration. That is deliberate — see [A7](#a7--copy-honesty).

This document exists because the provider side is gated on a **verification
class**, not a bug, and the company-side work should be finished and reviewed
before the gate opens — not improvised after.

Background: [`docs/research/github-star-list-full-idea-triage-2026-11-05.md`](../research/github-star-list-full-idea-triage-2026-11-05.md) §6.

## What is built (and what it does today)

| Piece | Where | Behaviour with no credential |
|---|---|---|
| Dispatch branch | `callConnector` case `"linkedin"` in `worker/src/services.ts` (`_linkedin` in `core/tools/connectors.py`) | unreachable — the route 503s at credential resolution |
| Capability record | `worker/src/capabilities.ts` (`auth_kind: "oauth2_org"`, `supports_dry_run: true`, `rate_limit.per_day: 100`) | reports `configured: false` |
| OAuth scaffolding | `worker/src/connect_oauth.ts` | `GET /api/v1/connect/linkedin/start` → **409** (see below) |
| Audit | `episodic_events` scope `connector` | one row per attempt, including dry runs |

## Credential shape

`conn:linkedin` — the value is a flat string, exactly:

```
<access_token>[:<author>]
```

- **`<access_token>`** — an OAuth2 token from an organization admin grant.
- **`<author>`** *(optional)* — one of:
  - `urn:li:organization:<numeric_id>` — post as the company Page;
  - `urn:li:person:<member_id>` — post as a member (see the warning below);
  - a bare numeric id, e.g. `12345678` — shorthand for
    `urn:li:organization:12345678`.

  When omitted, the dispatcher falls back to `urn:li:organization:lazynext`,
  which is **not a valid URN** — it is a placeholder that guarantees a rejected
  call rather than a silent post to the wrong wall. Treat the suffix as
  required in practice.

Urns contain colons, so the dispatcher splits on the **first** colon only:
everything after it is the author.

**Posting as a member is not the company voice.** Member URNs are accepted by
the code because the OAuth flow can produce one, but the company dispatch path
should carry an organization URN. Do not record a member URN here as a
workaround.

### Request it sends

`POST https://api.linkedin.com/rest/posts` (the versioned Posts API — the
successor to `ugcPosts`), with headers `LinkedIn-Version: 202609`,
`X-Restli-Protocol-Version: 2.0.0`, `Authorization: Bearer <token>`, and body:

```json
{
  "author": "urn:li:organization:12345678",
  "commentary": "<the text>",
  "visibility": "PUBLIC",
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false,
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  }
}
```

You can see this render without sending anything:

```bash
curl -s -X POST https://ai-company.lazynext.com/api/v1/connectors/linkedin \
  -H "authorization: Bearer $LAZYNEXT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"text":"preview","dry_run":true}' | jq .
```

Today that returns the "not connected" error — a preview of a connector with no
credential does not pretend to know what the token would be. See
[dry-run.md](./dry-run.md).

## The OAuth app requirement

`conn:linkedin:app` — `client_id[:client_secret]`.

Registered exactly as the platform's other OAuth connectors
(`worker/src/connect_oauth.ts`), with these fixed values:

| Field | Value |
|---|---|
| Redirect URI | **`https://ai-company.lazynext.com/api/v1/connect/linkedin/callback`** |
| Authorization URL | `https://www.linkedin.com/oauth/v2/authorization` |
| Token URL | `https://www.linkedin.com/oauth/v2/accessToken` |
| Scopes | `openid profile email w_member_social w_organization_social rw_organization_admin` |
| Refresh | `refresh_token` grant |

The redirect URI is **pinned in code** — register it byte-for-byte in the
LinkedIn developer app, or the token exchange fails with a redirect mismatch
that looks like an auth failure. PKCE S256 is not used for this provider; X and
TikTok use it, LinkedIn did not require it in the shipped flow.

On callback the handler calls `GET https://api.linkedin.com/v2/userinfo`, takes
`sub`, and writes `conn:linkedin` as `<token>:urn:li:person:<sub>`. **That is a
member URN.** Turning it into an organization credential is a separate,
deliberate step: an org admin must grant `w_organization_social`, and the
credential suffix must be rewritten to the organization URN. Do not let the
OAuth-created value stand as the company credential without that decision.

## What the 409 means today

```
GET /api/v1/connect/linkedin/start
409 {"error":"set conn:linkedin:app = \"client_id[:client_secret]\" in Settings first"}
```

It means **the platform app registration is missing** — not that LinkedIn
blocked anything, not that the route is broken. The route fails cleanly before
any network call rather than crashing or half-starting a flow, which is exactly
the scaffolding behaviour item A3 asked for. Populating `conn:linkedin:app`
moves the next error to the LinkedIn side, where the provider decides.

There is no company-side fix for the 409 beyond registering an app — and app
registration is itself gated (see the sequencing note below).

## Organization / page mapping

`conn:linkedin:meta` — reserved for the mapping record, **documented only,
deliberately not written**. It stays empty until a real authorized organization
exists.

```jsonc
{
  "organization_urn": "urn:li:organization:<id>",   // posts as this Page
  "organization_id": "<numeric>",                    // matches the cred suffix
  "vanity_name": "<linkedin.com/company/… slug>",     // human cross-check
  "recorded_at": "<ISO-8601>",                        // when a human confirmed it
  "confirmed_by": "founder",                          // who confirmed the above
  "evidence": "<how it was confirmed — e.g. admin grant observation>"
}
```

Rules for this key:

- **No credential values.** It is a mapping record, not a secret store. The
  token lives in `conn:linkedin` alone.
- **Nothing is inferred.** If a value cannot be confirmed by a human who is an
  admin of that organization, leave the key empty rather than guessing from a
  company name.
- The dispatcher does not currently read this key — the author comes from
  `conn:linkedin`'s suffix. It exists so the org decision has one documented
  home instead of being rediscovered in a token string.

## Staged plan — item status

Status as of **2026-11-10**. "Done" means shipped and tested; it never means
"LinkedIn is connected".

| # | Item | Status | Evidence |
|---:|---|---|---|
| A1 | Capability metadata as data | **Done** | `worker/src/capabilities.ts` + `core/tools/connector_capabilities.py`; 45 rows, parity-tested across both runtimes; `configured` derived, never hardcoded |
| A2 | Organization / page mapping + documentation | **Partly done** — mapping key documented, key intentionally empty; this doc is the deliverable | this file; `conn:linkedin:meta` never written |
| A3 | OAuth callback scaffolding | **Done** (pre-existing) | `GET /api/v1/connect/linkedin/start` returns a clean 409, not a crash; redirect URI pinned to `https://ai-company.lazynext.com` |
| A4 | Content approval queue | **Done** (policy, pre-existing) | decision gate: `config:decision_enforce=approval` covers approval-class external dispatch (`worker/src/decisions.ts`) |
| A5 | Audit and event model | **Done**, now mode-aware | `episodic_events` scope `connector`; dry runs carry `mode:"dry_run"` + `gate:"skipped_dry_run"` |
| A6 | Rate limits + dry-run | **Done** | caps enforced: both runtimes count `rl:conn:<id>:<utcDay>` before any provider call and refuse at 100/day with a structured 429 (`worker/src/services.ts` + `core/tools/connector_rate_limits.py`); dry-run covers every capturable connector (42/45) — see `docs/connectors/dry-run.md` |
| A7 | Copy and honesty pass | **Holds** | no public page claims a LinkedIn integration; this doc says NOT CONNECTED in its first line |

Two honest gaps:

- **A4 protects the platform's dispatch path, not every path.** The gate covers
  `POST /api/v1/connectors/{id}`, scheduled posts and campaign sends. A caller
  that reaches a provider outside the platform is outside that guarantee.
  The daily cap landed with the same coverage seam as the gate: it is enforced
  in the same two worker paths plus the fleet's `call_connector` — it does not
  cover a hypothetical caller that bypasses the platform entirely.

## Sequencing risk — state it plainly

A verified company Page is usually a prerequisite for both app review *and*
organization posting, and Page creation has itself been the blocked step. So
(b) may be impossible until (c) resolves, in either direction. Do not assume
"the gate opens, then we register an app" is a sequence that exists.

## Permanent no-go list

These are not staged, not pending, and not negotiable. Each one converts a
verification problem into a fraud, terms, or enforcement problem — none of
which the company can audit its way out of.

| No-go | Why |
|---|---|
| **Personal-ID bypass** — borrowed ID, altered document, a third-party "verification service" | Fraudulent. Also violates the standing rule that the company does not submit personal identity documents or selfies for company accounts. |
| **Scraping LinkedIn** — profiles, connections, search results, "public" data | Violates their terms; risks the domain and the brand. |
| **Credential sharing** — a member's password, reused cookies/session, "just log in as me" | Credential sharing; destroys the audit story. |
| **Unofficial automation** — browser bots driving a member session, third-party growth tools on a member account | Exactly the pattern enforcement targets; unreviewable and unauditable. |
| **Purchased connections or engagement** | Reputation risk, no product value. |
| **Silent retries after a block** | Turns one failed attempt into an enforcement signal. A block is reported, not retried. |

Also excluded from any "unblocking" work: anything requiring a LinkedIn token,
app review, organization admin grant, or member data permission. A member-level
token must never be relabelled as the company voice.

## Gate state machine

```
CLOSED ──(A1–A7 done)──► READY (dry-run only, no provider call)
READY ──(founder authorises a supported route)──► AUTHORIZING
AUTHORIZING ──(org admin grant + app review)──► LIVE
```

Current state: **READY** for the company-side items (A1, A3–A7), with A2's
mapping key documented and empty. Nothing advances past `READY` without an
explicit founder authorization naming the supported route — and the standing
rule means that authorization can never be "use my personal ID."
