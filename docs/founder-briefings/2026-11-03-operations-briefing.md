# Founder Operations Briefing — 2026-11-03

**Status:** REAL briefing — every figure below was read live from production D1 / KV /
internal endpoints on 2026-11-03 between 22:15 and 22:55 IST. This replaces the hallucinated
[lazynextai/accessibility-checker PR #112](https://github.com/lazynextai/accessibility-checker/pull/112) —
which was closed 2026-11-03T17:22:25Z because its figures ($10,000 revenue, 1,000 visitors,
20 paid conversions…) were codegen invention, not data.
**Provenance rule:** each figure carries its source inline. Where a query failed or a number
could not be verified, it is stated — nothing here is estimated, rounded, or invented.
**Author:** manual human-run pass on `main` (branch `feat/founder-briefing-real`).

---

## 1. Billing / funnel

**Bottom line: ZERO real revenue.** Dodo is deliberately in TEST MODE (founder decision,
2026-09-29, permanent until flipped). No live payment can be collected; `subs:active` is empty.
This is not "flat revenue" — it is "test mode, no live payments".

| Metric | Value | Source |
|---|---|---|
| Scans, last 30 days | **132** | `GET /api/v1/billing/funnel` → `scans_30d` (= count of KV `report:*` keys, 30d TTL) |
| Scan benchmark corpus | **38 rows / 27 distinct hosts** | D1 `scan_stats` (`SELECT COUNT(*), COUNT(DISTINCT host)`) — the excluded-operator-hosts corpus, live since 2026-09-28 |
| Leads (funnel) | **1** | `GET /api/v1/billing/funnel` → `leads` (KV `lead:*` excluding `:joined`/`:stage` suffixes) |
| — raw `lead:*` keys | 3 (one entity: `conn-sweep-probe@example.com` + its `:joined`/`:stage`) | KV `/kv/list?prefix=lead:` |
| Waitlist (D1) | **1** | D1 `waitlist` count |
| Email contacts | **49** (32 subscribed) | D1 `email_contacts`; `WHERE subscribed=1` |
| CRM leads (D1) | **68** (36 qualified · 15 engaged · 17 disqualified · 0 lead · 0 nurture) | D1 `crm_leads GROUP BY status` |
| Active trials | **0** | `GET /api/v1/billing/funnel` → `trials_active` (KV `trial:*` excl. `:reminded`) |
| Active subscriptions | **0** | `GET /api/v1/billing/funnel` → `subscriptions_active`; KV `subs:active` = `{}` (0 keys) |
| Pro licenses | **1** | Funnel `licenses_pro` |
| Monitors | **1** | Funnel `monitors`; KV `mon:support@lazynext.com:1w1fov0` (monitors = `mon:*` minus `mon:last_sweep`) |

**The single Pro license is the dogfood license, not a customer:** KV
`license:support@lazynext.com = pro` with `license_keep:support@lazynext.com = dogfood`
(source: KV `/kv/get`). It is exempted from Dodo reconciliation; it is not revenue.
`billing:last_reconcile` = `{"at": 1793665829849, "active": 0, "repaired": []}` (KV) confirms
0 active subscriptions at the last reconcile (2026-11-03 00:30 UTC). `plan` = `Founder`.

---

## 2. Connector status

- **41 of 45 library connectors are credential-present** (source: KV `/kv/list?prefix=conn:`
  → 41 base `conn:*` keys, vs `CONNECTOR_IDS` in `worker/src/services.ts` = 45).
  Note: `conn:pinterest:refresh` / `conn:tumblr:refresh` are refresh-token siblings, not
  new connectors (43 keys total minus 2 = 41).
- **Absent (4):** `linkedin`, `tiktok`, `snapchat`, `viber` — the four parked connectors
  (personal-ID gates or India ban; snapchat covered via Ayrshare). No others are missing.
- `brevo` is present as `conn:brevo` (and has the `BREVO_API_KEY` env/secret fallback —
  either satisfies `connCred`/`brevoCred`).
- **Could not report the live `/api/v1/connectors` status object:** that route needs an
  `lzk_` read-scope key, and minting one is a D1 write — forbidden under the read-only
  constraint for this pass. The KV route above is authoritative for credential presence;
  per-provider "responding" health is not re-verified here (see §5 risk: fleet Python
  posting bypasses worker-side gates).

---

## 3. Governance events

**Gate blocks — 3** (source: D1 `episodic_events WHERE scope='decision_gate'`). All three
are the same target: a `signwell` connector.dispatch with no approved package (Signwell
deliberately has NO standing approval).

| id | created_at (UTC) | gate scope | target |
|---|---|---|---|
| 416991 | 2026-11-03 02:05:43 | `human_only` | signwell |
| 417147 | 2026-11-03 02:18:50 | `human_only` | signwell |
| 425070 | 2026-11-03 16:42:05 | `approval` | signwell |

(The 16:42 row is the post-escalation probe — `config:decision_enforce` moved `human_only`
→ `approval` on 2026-11-03; AGENTS.md's earlier "2 blocks" is superseded by this read.)

**Breaker trips — 0** (source: D1 `episodic_events` has no `breaker`-scoped rows;
`outbound_breaker_config` = `enabled:1, tripped_reason:null, tripped_at:null`). The
outbound breaker config row exists and is armed; nothing has tripped it.

**Observer verdicts — 3** (source: D1 `episodic_events WHERE scope='observer'`), split by
`source` exactly as expected: **1 × `task_dispatch` + 2 × `fleet_dispatch`**.

| id | source | task_id | agent | recommendation |
|---|---|---|---|---|
| 425160 | `task_dispatch` | `founder-brief-20261103` | — | `safe`, 0 gaps |
| 424784 | `fleet_dispatch` | `fff3b87a` | sales_1 | `safe`, 0 gaps |
| 425342 | `fleet_dispatch` | `450159e4` | backend_1 | `safe`, 0 gaps |

Honest footnote: **row 425160 is the observer's verdict on the very task that produced the
hallucinated PR #112 briefing.** The observer model checks dispatch shape (gaps/flags/digest),
not the truthfulness of codegen content — "safe" here means structurally clean dispatch, and
must not be read as content verification.

**Decision packages — 38 total; 32 approved** (source: D1 `decision_packages`):
- **32 approved, ids 5–36** — one standing approval per configured external connector:
  x, meta, facebook, instagram, threads, bluesky, mastodon, reddit, pinterest, vk, youtube,
  gmb, line, devto, hashnode, medium, wordpress, github, gitlab, tumblr, ghost, beehiiv,
  lemmy, listmonk, nostr, ayrshare, postiz, buffer, letmepost, twilio, whatsapp, brevo;
  all `authority=approval`, `expiry_at 2026-12-31T23:59:59Z`.
- 2 `voided` (ids 2–3, signwell gate probes), 2 `failed` (id 4 signwell → "use
  /api/v1/signwell/send"; id 38 youtube → requires media_url), 2 `executed` (ids 1, 37
  discord, `authority=auto`).

**Gate config:** `config:decision_enforce = "approval"` (source: KV `/kv/get`). Rank-based
scope: `approval` covers `approval`-class external dispatch AND `human_only`
(signwell/billing/legal); `auto` internal messaging stays exempt. Signwell has no standing
approval by design.

---

## 4. Shipped this week (2026-10-27 → 2026-11-03)

Source: `git log main --since='7 days ago' --oneline --no-merges` — **46 commits on `main`**.
Real merged themes (no unmerged feature is listed):

1. **Governance layer shipped AND armed** (the bulk of the week): decision-gate scoped and
   wired into worker dispatch (`b677e5a`, `1e229e7`), observer pass on the task-dispatch seam
   + gate-blocks surface (`51adedc`, `477d83e`), fleet-side observer mirror (`f10ff4d`),
   fleet outbound-breaker gate (`446f736`, `6d254d1`), governance roadmap — decision
   packages, outcome ledger, readiness matrix, manifests (`fd536a5`, `84874b9`), dashboard
   read-only governance panels (`71c7a7a`), decision gate ARMED at `approval` with 32 seeded
   packages (`22ffcba` — current `main`), conftest guard so tests can never write observer
   rows to production D1 (`9ef0338`).
2. **Dashboard**: Next 15→16.4.3 + React 19 migration (`68b2e40`), lint debt cleaned 120→0
   (`f8ec1fa`).
3. **Security (Aikido sweeps)**: SQL-injection hardening on identifier interpolation +
   HSTS/CSP headers for marketing (`921ad18`), Go SDK 1.21→1.26 EOL bump (`556a6a7`), SSRF
   guard on sign `doc_url` fetch (`a7d775c`), Next 15.5.24→15.5.28 (`f79bac0`).
4. **Ops/connector stamps**: beehiiv + Teams LIVE, X API balance confirmed (`7b6f655`,
   `70e455d`, `03d55f7`), Partner Center vetting attempt 3 with WHOIS registrar PDF
   (`f1d0c2b`), Microsoft inbox watch 2026-11-03 — no decision email yet (`680296f`),
   directree/mcp.so/Cloudflare renewal records (`47ae371`, `0c3ae80`), LinkedIn
   gov-ID-only final finding (`ec39bd4`, `979f7fb`).
5. **Outreach**: shipped-stack + founder-perspective campaign drafts (`5cbc981` — see §6).

**Operational activity (context):** D1 `task_log` with `created_at >= 2026-10-27` =
68 completed / 7 failed / 1 escalated (source: D1 `task_log`). Generation is bursty,
3–13 tasks/day — consistent with the AGENTS.md observer notes.

---

## 5. Open risks / watch items

1. **Microsoft Partner Center decision due ~2026-11-04** — attempt 3 of 3 (official WHOIS
   registrar PDF + incorporation certificate) was submitted 2026-10-30 inside Microsoft's
   5-day window; the context email dated Oct 27 is already answered, NOT a new demand.
   **Last inbox watch 2026-11-03: no decision email yet** (source: AGENTS.md 2026-11-03
   watch entry; email re-checks are read-only through the gmail-filters MCP). If still
   silent by ~Nov 6–7, follow up by email only (never a browser/code-flow retry).
2. **M365 trial ends 2026-11-27** — auto-renew was already cancelled 2026-10-27; the Teams
   flow (Power Automate Request trigger) depends on the tenant. Watch alongside below.
3. **Power Automate Premium trial auto-converts to paid ~2027-01-28** if not cancelled —
   the anonymous-webhook Teams flow needs it; same cancel-before pattern as M365.
4. **Dodo deliberately test mode** — zero collectible revenue by design; the outreach copy
   (30-day trial + WELCOME20) is truthful about what checkout serves, but no payment can be
   collected while it stays test. Founder question (see §6).
5. **Approval gate covers worker-side dispatch only** — the live fleet's posting goes
   `marketing_agent.py → call_connector → connectors.py` straight to the provider in Python,
   bypassing `decisionGate()` and the `decision_packages`/ledger record layer. The local
   outbound-breaker mirror now gates that path (`446f736`; `enabled=1`, mode `observe|active`
   resolved from `.env`), but worker-recorded governance does not see Python posts.
6. **Worker observer seam is structurally quiet** — `get_tasks_by_status` has zero Python
   callers, so the 10-min `agentTick` observer mostly sees worker-generated/externally
   queued rows only. The fleet-side observer (f10ff4d) covers real dispatches — its 2 rows
   (424784, 425342) are the first real evidence. Wait for more `fleet_dispatch` rows before
   judging coverage; observe-only, enforces nothing.
7. **§2 caveat stands as a gap:** connector "present" ≠ "responding" — per-provider health
   re-check is not part of this read-only pass.

---

## 6. Founder decisions pending

Source: `docs/outreach/2026-11-03-outreach-drafts.md` (DRAFT ONLY — nothing sent) + D1.

1. **Outreach pre-flight (Variant A, "shipped-stack"):** 32 send-ready addresses
   (27 qualified + 5 engaged, after KV suppression of 14 and 1 test-artifact removal);
   `email_campaigns` row id 9 (`outreach-shipped-stack-2026-11-03`, `draft`, segment
   `subscribed` — matches the 32 subscribed `email_contacts` exactly). **Two flagged rows
   need a yes/remove call:** `careers@usablenet.com` (id 12, careers inbox, likely wrong
   desk) and `press@siteimprove.com` (id 37, press inbox at competitor Siteimprove —
   the qualifier rule says never nurture a rival).
2. **Variant B ("founder-perspective") has NO audience** — `nurture` bucket is empty
   (0 rows; `crm_leads` statuses show 0 lead, 0 nurture). Row id 10 stays draft until
   nurture rows exist or the founder authorizes a segment override.
3. **Dodo test-mode question:** invite trial signups (30-day trial + WELCOME20) while
   payments remain in test mode? The copy is truthful; the business question is whether
   trial signups without collectible payment are desirable.
4. **Nothing in this package has been sent** — no Brevo call, no connector dispatch, no
   email. Sending is a human action with founder sign-off only.

---

## What could NOT be verified (stated honestly)

- Live `/api/v1/connectors` per-provider status object — requires an `lzk_` read key;
  minting one is a D1 write, forbidden this pass. Connector section therefore reports
  credential-present (KV), not per-provider responding health.
- Microsoft Partner Center decision — no email exists yet as of the 2026-11-03 watch;
  the verdict itself is unverifiable until it arrives (~due 2026-11-04).
- Any "revenue" figure — there is none: Dodo test mode, `subs:active` empty, reconcile
  reports `active:0`. The honest statement is "test mode, no live payments", not $0.
- Historical (pre-2026-09-28) scan counts — `report:*` keys carry a 30-day TTL and decay
  by design; 132 is the current-window count, not cumulative.

_Every other number above was read live on 2026-11-03 from D1 (via internal `/query`),
KV (via internal `/kv/list`/`/kv/get`), the internal `/api/v1/billing/funnel` endpoint, or
`git log` on `main`. If a number needs re-verification, re-run the exact query listed beside
it._