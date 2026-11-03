# Decision-Gate Staging — human_only ARMED, approval/all deferred

**Date:** 2026-11-03
**Status:** ARMED at `human_only` (worker `b0920079-63cc-4f2b-9809-f761ab4fa146`). `config:decision_enforce = "human_only"` is durable in KV; `approval` and `all` stay OFF.
**Why this is safe:** `human_only` covers only signwell/billing/payment/identity/legal actions — provably no autonomous fleet agent performs one, so enforcement is inert on normal work (verified live). Blocks are now visible as `episodic_events` scope `decision_gate`.
**Previous context:** staged during the production deploy of the roadmap batch (PR #13, worker version `6cbc0318-9761-4e46-a36f-c856bfa869a6`).
**Related:** [Governance decision package + outcome ledger](./2026-11-02-governance-decision-package-and-outcome-ledger.md) (PR #13 design).

## Summary

`decisionGate()` in `worker/src/decisions.ts` is the opt-in enforcement half of the governance
layer. It is **not** being enabled yet, for two independent reasons:

1. **The actions the company relies on are mostly `approval`-class**, so flipping the gate on a
   wired dispatch path would block live outbound work until approved packages are seeded.
2. **The gate currently has no production caller at all.** `decisionGate()` is referenced only by
   its own module and `worker/test/decisions.test.mjs`. Setting the flag today would change
   nothing — and would pre-arm a trap for the next commit that wires it in.

What *is* live and enforcing is the other half: `openDispatchDecision()`, which writes one
auditable decision record per dispatch and **fails closed** (dispatch returns 503 rather than run
without a record). That is verified working in production (see "Verification record").

## 1. What `classifyAuthority()` maps where

Source: `worker/src/decisions.ts:98-126`. Evaluated top-down; first match wins.

| # | Trigger (code) | Class | Rationale string |
|---|---|---|---|
| 1 | `action.human_only === true` | `human_only` | caller marked human-only |
| 2 | `type` starts with `billing` or `payment`, or `type === "identity.verify"` / `"legal.sign"` | `human_only` | money, identity or a legal instrument |
| 3 | `type ∈ {connector.dispatch, social.post, email.send}` **and** `connector === "signwell"` | `human_only` | signwell sends a legally binding document |
| 4 | same types, `connector ∈ {discord, slack, mattermost, teams, zulip, telegram, matrix, webhook}` | `auto` | posts into a workspace we own (reversible) |
| 5 | same types, any other connector | `approval` | external side effect on a company-owned surface |
| 6 | `type ∈ {manifest.activate, breaker.policy, campaign.send, ticket.reply}` | `approval` | changes operating policy or contacts a customer |
| 7 | `type === "task.execute"` | `approval` | task may mutate managed repositories |
| 8 | `type ∈ {evidence.record, ledger.append, scan.run, decision.draft}` | `auto` | reversible internal record |
| 9 | anything else | `approval` | unclassified action defaults to approval |

The two lookups are literal sets:

```ts
// decisions.ts:23-25
const INTERNAL_MESSAGING = new Set([
  "discord", "slack", "mattermost", "teams", "zulip", "telegram", "matrix", "webhook",
]);
// decisions.ts:29
const HUMAN_ONLY_CONNECTORS = new Set(["signwell"]);
```

**`human_only` today:** SignWell / native e-sign, billing and payment operations, identity
verification, legal signature. None of these are performed autonomously by the running fleet —
`config:signwell_template` (auto-sign on activation) is OFF, and no agent issues billing or legal
instruments.

**`approval` today:** every external connector dispatch on a surface we do not own — `x`,
`bluesky`, `buffer`, `postiz`, `ayrshare`, `brevo`, `facebook`, `instagram`, `pinterest`, `reddit`,
`threads`, `youtube`, `tumblr`, `wordpress`, `medium`, `devto`, `hashnode`, `ghost`, `listmonk`,
`beehiiv`, `mastodon`, `vk`, `line`, `lemmy`, `letmepost`, `gmb`, `meta`, `nostr`, `twilio`,
`whatsapp` — plus campaign sends, ticket replies, breaker policy changes, manifest activation, and
`task.execute`. Note that **any unclassified action also lands here**, so an unknown future action
is `approval` by default.

**`auto` today:** the internal-messaging connectors above (Discord, Slack, Mattermost, Teams,
Zulip, Telegram, Matrix, raw webhook) and the reversible internal records
(`evidence.record`, `ledger.append`, `scan.run`, `decision.draft`).

## 2. What the live fleet actually performs

| Behaviour | Path | Class if gated | Gate reaches it? |
|---|---|---|---|
| Growth-agent social posts | `agents/growth/marketing_agent.py:103` → `call_connector("x"\|"linkedin")` → `core/tools/connectors.py:1327` → **direct provider HTTP** | n/a | **No** — never touches the worker |
| Sales agent campaign drafts | writes `email_campaigns` only; a human presses Send | `approval` on send | only the human-fired send |
| Scheduled social posts | `schedule_connector_post()` (`connectors.py:1434`) → worker `/social/schedule` → `dispatchSocialPost` (`services.ts:2262`) | `approval` | **Yes** — but the fleet has **no caller** for it today |
| Worker-side email | `brevoSend` in cron/daily sweeps, sequence, product webhooks | n/a | **No** — direct provider call, not connector dispatch |
| Direct connector dispatch | `POST /api/v1/connectors/{id}` (`services.ts:266-313`) | `approval` (external) / `auto` (internal) | **Yes** |
| Dashboard / ops manual dispatch | same route | `approval` | **Yes** |

Evidence for "no caller": `schedule_connector_post` appears only in
`core/tools/connectors.py:1434` (definition) and `core/tools/__init__.py` (export); no `agents/`
or `scripts/` module calls it. No agent calls `/email/send` or `POST /api/v1/connectors` either.

**So the company's outbound posting and email do not currently pass a gated path** — the fleet
calls providers directly in Python. But the platform's *own* outbound surfaces (scheduled posts,
dashboard dispatch, campaign sends, ticket replies) all do, and those are `approval`-class.

## 3. Why the gate was not enabled

The rollout rule was: enable only if it cannot halt live operations.

- If gated tomorrow, `approval` would cover every external social connector and Brevo dispatch —
  i.e. the platform's entire outbound surface. With no approved packages seeded, those calls would
  return `no approved decision package for '<target>'` instead of sending.
- Because `decisionGate()` has **no production caller**, setting the flag now cannot *demonstrate*
  anything. It would only mean that the commit that wires the gate inherits an already-armed
  switch, so the first scheduled post after that deploy fails silently into `status='failed'`.

That combination — no proven blocking power today, guaranteed blocking power later — is the worst
of both. The flag stays off. `GET /kv/get?key=config:decision_enforce` → `{"value":null}`.

## 4. What must be true before enabling

1. **Approved packages seeded per target.** `decisionGate` matches on
   `target = action.target ?? action.connector`, so a package must exist with the *exact* target
   string (e.g. `x`, not `twitter`). Practically: one package per actively-dispatched connector,
   moved `draft → approved` via `POST /decision/packages/{id}/decide {"outcome":"approved"}`.
   Expiry must be `null` or far-future, or the approval silently lapses.
2. **A mode switch narrower than a boolean.** Today `decisionGate` enforces `approval` and
   `human_only` together. Enforcing only `human_only` is provably non-blocking (no agent performs
   a human-only action), so the flag should accept a scoped value such as `"human"` in addition to
   `"1"` before any approval-class rollout.
3. **A visible block signal.** A gated dispatch currently fails like any other dispatch error.
   It should emit `episodic_events` scope `decision_gate` (or trip the existing bus channel) so an
   operator sees "blocked, not broken".

## 5. Recommended staged path

1. **Now:** gate off (this document). Keep the unconditional decision-record write on — it is the
   audit trail and it is already proven.
2. **Next:** wire `decisionGate` into the dispatch paths that already call
   `openDispatchDecision` (`services.ts` direct dispatch + `dispatchSocialPost`), but enforce
   `human_only` only. No behaviour change expected; confirms wiring is inert.
3. **Then:** seed approved packages for the connectors the company actually dispatches, starting
   with one canary (`x`), and enable `approval` for that target only. Observe 24h of
   `status='failed'` / `decision_gate` rows before widening.
4. **Finally:** widen to all connectors, keeping `auto` short-circuits and the internal-messaging
   set untouched.

Do not skip to step 4. The failure mode is silent: a blocked post looks exactly like a failed
post, and the row is parked terminal (`status='failed'`) rather than retried.

## 7. Live verification of the armed state (2026-11-03, worker `b0920079`)

- `GET /health` (internal bearer) → `{"ok":true}`; bare (no bearer) → 401 as designed.
- `GET /kv/get?key=config:decision_enforce` → `{"value":"human_only"}` (durable — written hours earlier, re-read after the deploy).
- `/decision/packages`, `/ledger/summary`, `/capability/matrix` → 200; `/api/v1/openapi.json` → 200; `/api/v1/connectors` → 200.
- **Unapproved human-only dispatch** `POST /api/v1/connectors/signwell` (admin key) → **503**
  `blocked by decision gate — missing approval` / `no approved decision package for 'signwell' (authority human_only, scope human_only)`, provider never touched.
- **Block row visible**: `episodic_events` scope `decision_gate` carries
  `{event:"decision_gate_blocked", type, connector, target, authority, scope, reason, ts}` for each block.
- **Approved path**: created + approved a `signwell`-targeted package (internal `POST /decision/packages`, then `/decide {"outcome":"approved"}`) → the same dispatch passed the gate and reached the dispatcher, which short-circuits locally with `400 use /api/v1/signwell/send for signing` (`decision_id` recorded). **No external network call.** Package then voided → the same dispatch blocks again (503).
- **No collateral damage**: `cron:last_tick` fresh; `outbound_breaker_config` `enabled=1`, `tripped_reason` null; **0** new `episodic_events` scope `breaker` rows; that probe left 1 failed `connector` dispatch for `signwell` — below every limit (failure 1/5, error-rate inconclusive below 5 dispatches) and untouched by any agent path.
- Rollback: `wrangler rollback` to `6cbc0318` + `config:decision_enforce=off` (KV put, `ttl:0` numeric). Not needed.

## 8. Verification record (2026-11-03, worker `6cbc0318`)

- `GET /kv/get?key=config:decision_enforce` → `{"value":null}` (never written; gate off).
- `decisionGate` production callers: **0** (whole-repo grep: definition + tests only).
- Unconditional record path proven live: `POST /api/v1/connectors/discord` →
  `{"ok":true,"status":204,"decision_id":1}`; package 1 read back as
  `outcome=executed authority=auto target=discord`; `GET /ledger/summary` shows one
  `connector/discord/passed` row. Recording → dispatch → close → ledger all intact.
- Migration `011` applied before deploy, so the fail-closed record write could not break
  dispatch; `ensureDecisionSchema()` also self-heals a missing table.
