# Dry-run dispatch

**What it is:** a way to see the exact HTTP request a connector dispatch would
send, without sending it. Available on the Worker route
(`POST /api/v1/connectors/{id}` with `dry_run: true`) and in the fleet helper
(`call_connector(id, payload, dry_run=True)`).

**Why it exists:** before this, the only way to learn what a connector would
post was to post it. For a governed platform that is backwards — the action you
most want to review is the one that is currently blocked.

## What a dry run does

- Builds the request(s) through **the same code path** a real dispatch uses.
  It is not a second renderer, so it cannot drift from the real payload.
- Returns them, with credentials redacted:

  ```jsonc
  {
    "dry_run": true,
    "connector": "linkedin",
    "supported": true,
    "preview_ok": true,
    "gate": "skipped_dry_run",
    "rate_limit": { "per_day": 100, "enforced": true, "used": 3, "remaining": 97, "day": 20525 },
    "calls": [
      {
        "step": 1,
        "method": "POST",
        "url": "https://api.linkedin.com/rest/posts",
        "headers": {
          "authorization": "Bearer «redacted»",
          "content-type": "application/json",
          "linkedin-version": "202609",
          "x-restli-protocol-version": "2.0.0"
        },
        "body": "{\"author\":\"urn:li:organization:987654\",\"commentary\":\"…\",…}"
      }
    ],
    "warnings": []
  }
  ```

- Writes **exactly one** `episodic_events` row, scope `connector`, carrying
  `{ id, ok, status, source:"direct", mode:"dry_run", gate:"skipped_dry_run", calls:<n> }`.
- **Reads** the daily cap counter so `rate_limit.used`/`remaining` are the live
  numbers — a preview reports the same ceiling a real send would be held to,
  without spending a slot.

## What a dry run does not do

- **Zero provider calls.** The transport is replaced, not merely skipped, so a
  branch that forgot to check a flag still cannot reach a provider. Both test
  suites execute every supported connector with the network removed from the
  runtime and assert no call was attempted.
- **Zero D1 writes** other than the audit row — no `social_posts` row, no
  `outcome_ledger` row, no decision package.
- **No queue activity.** It does not enqueue, claim, or expire anything.
- **No decision package.** `openDispatchDecision` is not called, so a preview
  leaves no governance record that could be mistaken for an executed action.
- **It does not prove the provider accepts the payload.** `preview_ok` only
  means the dispatch path built a request without a local validation error.
  Nothing was sent, so no provider verdict exists.

## Why the decision gate is skipped (and why that is not a weakening)

The breaker and the decision gate are deliberately bypassed. Two reasons, in
order of importance:

1. **A preview has no external effect.** The gate exists to stop actions that
   reach other people. Rendering a request reaches nobody.
2. **Gating the preview would defeat its purpose.** The case a preview is most
   useful for is reviewing an action that is currently blocked — "show me what
   this would post, so I can decide whether to approve it." If the preview were
   gated too, it would be unavailable exactly then.

There is also a mechanical reason not to "just check" the gate: the gate's
block path **writes** a visible `decision_gate` row. Running it inside a
preview would manufacture a record of a blocked dispatch that never happened,
which is worse than not checking.

The skip is not silent — it appears in the response as `gate: "skipped_dry_run"`
and in the audit row. **Real sends are untouched:** the gate, the breaker, the
decision package, the lineage stamp and the ledger all still run in their
original order.

If you need to know whether an action *would* be blocked, that is a different
question with a different answer — check `/decision/packages` for an approved,
unexpired package, or `/decision/blocks`. A preview answers "what would be
sent", not "may I send it".

## Which connectors support it

`supports_dry_run` in the capability table. **42 of 45** today. Three refuse,
and the refusal is a `501` naming the exact call that cannot be previewed
rather than a partial (or invented) preview. `brevo` used to be the fourth
refusenik; its transport is now threaded through the recorder, so it renders
like the other 41 (see below).

| Connector | Why (verdict) |
|---|---|
| `brevo` | **Capture implemented.** The worker's `brevoSend` builds its own `fetch`; during a dry run the recording `fetch` is passed in as a transport override, so the preview shows the real `POST https://api.brevo.com/v3/smtp/email`. The fleet's `_brevo` already built through `_post` → `_async_client()`, so it was only ever a stale flag — now true in both tables |
| `signwell` | **Honest 501.** The worker route is a routing stub — `POST /api/v1/connectors/signwell` returns `400 "use /api/v1/signwell/send for signing"` before building any request, so there is nothing to render on the dispatch surface. Signature requests go through `POST /api/v1/signwell/send`, which is `human_only`-gated; review the document there |
| `nostr` | **Honest 501.** `nostrPublish` / `_nostr` sends a NIP-01 `["EVENT", ev]` frame over relay **WebSockets** (not an HTTP request), signed with BIP340 using your private key — there is no method/URL/body to render, and the frame cannot be shown without the key |
| `snapchat` | **Honest 501.** Not previewable because not dispatchable: the branch returns 400 before building any request — there is no organic-post endpoint (Marketing API is ads-only) and no credential to connect. Use `meta` for ads |

A connector that *does* support previews but has no credential yet returns the
same `503`-shaped "not connected" error a real send would — it does not
pretend to render a request it could not build.

Returning a half-built preview for these would be worse than refusing: a caller
would believe they had seen what would be sent.

## Rate limits

`rate_limit.per_day` is a **published provider ceiling**, and `rate_limit.enforced`
is now **true exactly when that ceiling exists** — both runtimes count every
real dispatch before any provider call and refuse at the ceiling.

The counter pattern is the one the platform already used for the public
waitlist limiter (`worker/src/public_api.ts`):

```
key:  rl:conn:<connector_id>:<utc_day>     prefix `rl:conn:` — waitlist uses `rl:waitlist:`
day:  floor(unix_ms / 86_400_000)          UTC midnight boundary
ttl:  172_800 seconds                      2 × the window; always explicit
```

Both runtimes write the SAME KV namespace (the platform's `env.EPHEMERAL`
through its own `/kv/*` routes), so a fleet `x` post and a Worker `x` post
debit one counter — two counters would let the pair double-spend the
provider's ceiling. KV has no atomic increment, so concurrent dispatches can
under-count by the number in flight; that over-admits by a handful and never
refuses a send the counter says is allowed — the provider's own API is the
backstop.

A send that hits the ceiling is refused **before** the breaker, the decision
gate and the decision package — it must not mint a governance record for an
action that never ran. The refusal is structured and idempotent-ish:

```jsonc
{
  "ok": false,
  "error": "'x' daily cap reached (17/day)",
  "rate_limited": true,
  "per_day": 17,
  "used": 17,
  "resets_at": "2026-11-11T00:00:00.000Z"
}
```

with `429` + `Retry-After`, and exactly one `episodic_events` row (scope
`connector`, `status: 429`, `rate_limited: true`). Scheduled posts go through
the same counter; a capped row is parked terminal `failed` with the reset time
in `last_error` rather than silently republished a day late.

**Fail-open by design.** A KV read/write failure means the ceiling cannot be
*measured*, not that it was reached; blocking sends on a control-plane outage
would turn an accounting gap into an outage. The breaker fails closed instead —
it exists to stop actions that must not happen. Capacity fails open; governance
fails closed; the difference is the point.

A preview reads the counter (never consumes it), so `rate_limit.used` in a
dry-run response is live:

| Connector | `per_day` | Basis |
|---|---|---|
| `x` | 17 | free-tier documented write ceiling per user per 24h |
| `linkedin` | 100 | Posts API, organization posts per app per day |
| `pinterest` | 1000 | documented app call ceiling |
| everything else | `null` | no published daily ceiling we can state honestly |

## Capturing the request without rewriting 45 branches

**Worker.** `callConnector` shadows `fetch` and its `connPost` helper with
recorders for the duration of a dry run. Every branch — including the handful
that call `fetch` directly (Medium, YouTube's resumable upload, Reddit's session
refresh) — resolves to the recorder, because the shadow is function-scoped.

**Fleet.** The ~45 dispatch functions each have their own `(payload, cred)`
signature; threading a sink through all of them would be 45 signature changes
for one feature. Instead `_async_client()` — the single client factory every
dispatch path now builds through — installs a recording `httpx` transport when a
sink is active. The sink travels in a `ContextVar`, so it is per-task: a
concurrent real dispatch outside the dry-run context still gets a real client.

Sequential branches read ids out of the previous response (Instagram
container→publish, Bluesky session→record, Lemmy login→post, Postiz
integrations→post, GitHub `/user`→file). The stub response therefore carries
those field names, so the preview continues to step two instead of stopping at
step one and reporting a shape the real send never produces.

## Redaction

Two passes, because a credential reaches a request two ways:

1. **Named** — every `authorization` / `cookie` / `x-api-key` header becomes
   `«redacted»`, keeping only the scheme (`Bearer`, `Basic`) since the scheme is
   not a secret and tells a reviewer which auth path was used. JSON bodies are
   walked so `access_token`, `password`, `secret`, `key`, `jwt`, … are replaced.
2. **Literal** — every component of the resolved credential (and the Ayrshare
   fan-out key, which is resolved inside the dispatch) is replaced wherever it
   appears in a URL, header or body. This is what covers the webhook
   connectors, whose entire URL is the credential.

Non-secret identifiers a reviewer needs — the LinkedIn author URN, a subreddit,
a board id, the chat id — are deliberately **kept**.

## Verifying one yourself

```bash
curl -s -X POST https://ai-company.lazynext.com/api/v1/connectors/x \
  -H "authorization: Bearer $LAZYNEXT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"text":"preview only","dry_run":true}' | jq .
```

The `dry_run: true` marker in the response is the guard against mistaking a
preview for a send — a caller that ignores it still cannot have posted anything.
