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
    "rate_limit": { "per_day": 100, "enforced": false },
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

`supports_dry_run` in the capability table. **41 of 45** today. Four refuse,
and the refusal is a `501` naming the reason rather than a partial preview:

| Connector | Why |
|---|---|
| `brevo` | sends through the dedicated `brevoSend` helper (its own transport), which the dispatch-level capture cannot see |
| `signwell` | signing does not dispatch through this route at all — use `POST /api/v1/signwell/send`, which is `human_only`-gated |
| `nostr` | publishes a signed event over relay **websockets**, not an HTTP request — there is no request to render |
| `snapchat` | has no organic-post API; the real dispatch returns 400 without sending, so there is nothing to preview |

A connector that *does* support previews but has no credential yet returns the
same `503`-shaped "not connected" error a real send would — it does not
pretend to render a request it could not build.

Returning a half-built preview for these would be worse than refusing: a caller
would believe they had seen what would be sent.

## Rate limits

`rate_limit.per_day` is **declared metadata, not enforcement**. Every row
carries `enforced: false`.

The platform has no per-connector daily counter. The `rl:` KV keys belong to
the product worker's per-IP quotas, and the platform's own key limiter is
per-API-key-per-minute — a different axis entirely. Inventing a counter store
to make the number look enforced would be worse than reporting the truth, so
enforcement is an explicit follow-up, not a shipped half-limiter.

A preview reports the same declared ceiling a real send would, so a caller can
at least see the provider's published bound:

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
