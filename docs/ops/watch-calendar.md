# Ops watch calendar

**Status:** authoritative future-action table. Every row is a date-driven watch item —
something that changes state on its own and will cost money, access, or standing if nobody
looks at it. Newest verification is recorded at the bottom.

Rules that apply to every row:

- A watch item is **read-only** until a row says otherwise. Checking an inbox, a dashboard, or
  a public page never authorizes a submission, sign-in, payment, or cancellation.
- Anything that needs a **sign-in code, personal ID, or a card** waits for an explicit founder
  decision. Do not loop an OTP flow to "just check" a page.
- When a provider asks for a decision, one founder sentence closes it. Record the sentence
  here instead of re-deriving the question next month.

## Future actions

| # | Item | Key date | What to do | Blocked on |
|---|---|---|---|---|
| 1 | **Microsoft Partner Center — seller `96466040`, verification attempt 3 of 3** | Decision due **2026-11-04**; recheck **2026-11-05**; **email follow-up PRE-AUTHORIZED 2026-11-04 by founder** for **2026-11-06 / 11-07** if still silent | Read `support@lazynext.com` for a review-result mail. Nothing new → no action. If still silent on 11-06/07, send the **email-only** follow-up automatically (founder pre-authorized) — a short, polite ask for status on TrackingID#2610070060003196 to the same vetting thread. Never a browser or code-flow retry; the MSA `prompt=login` + `acr_values=mfa` chain demands a fresh code at every hop and cannot be read unattended. | Founder pre-authorized the email-only follow-up |
| 2 | **Cloudflare monthly renewal** | ~**2026-12-01** (last invoice `IN-86694892`, **$5.53 Paid**) | Open the Stripe invoice link in the "Confirm your payment to Cloudflare" mail. A **Visa Secure bank-OTP popup** can time out on the first confirm, which leaves a scary "overdue balance" / "payment failed" alert — both are pre-settlement noise. Re-click **Pay** on the invoice page; that clears it. Treat the later "[Confirmation] Purchase confirmed" mail as authoritative. | Nothing — re-click is enough. Only escalate if a re-click also fails |
| 3 | **directree — owner-edit review** | ~**2026-12-06** (review scheduled 35 days from 2026-11-01) | Check `directree.io/tool/accessibility-checker` for approval. On approval the do-follow badge activates. Do **not** re-edit the listing and do **not** pay Fast Lane ($19) / Plus ($49) to skip the review. Badge is deliberately not embedded on our site (marketing CSP would block it). | Their review queue |
| 4 | **M365 Business Basic trial ends** | **2026-11-26** (confirmed in-thread by Microsoft's own expiry email during the full-body read 2026-11-04; earlier calendar said 27th — use 26th) | **No action.** Auto-renew was cancelled 2026-10-27, so the tenant (`lazynext.onmicrosoft.com`) simply lapses. Teams delivery is webhook-based via Power Automate, so confirm after the lapse that Teams dispatch still returns 202 if the tenant survives in read-only mode. | Nothing |
| 4b | **Meta One — auto-enable of business-portfolio delegation** | **2026-11-04 — REVIEWED, NO ACTION** | Full body read 2026-11-04: this is a **permission**, not a charge. It lets anyone who already has access to the `Lazynext` business portfolio *buy/manage a Meta One subscription* without full portfolio access. It does **not** subscribe or bill us. **Decision: no action** — only the founder has portfolio access, and Lazynext does not use Meta One (Facebook/Instagram/Threads go through Ayrshare). If a contractor/agency is ever given portfolio access, revisit and disable via Business info → Meta Business Suite. Do not sign into Meta with personal creds to "check". | None — reviewed |
| 5 | **Power Automate Premium trial auto-converts to paid** | ~**2027-01-28** (90-day trial started 2026-10-30). **Start watching 2027-01-01** | Decide cancel vs keep before conversion. The Request trigger is Premium, so cancelling removes the Teams webhook path — plan a replacement (tenant Teams Webhook V2 cannot be anonymous) before pulling it. Cancellation itself needs the founder's **email code** at the final step. | Founder decision + founder email code |
| 6 | **Dodo Payments — test mode** | **CLOSED 2026-11-04 — founder: "stay"** | Test mode is **permanent**. No KYC, no live flip, no live product/webhook/WELCOME20 rebuild, no re-proposing. This question is closed forever; do not reopen it. | Founder answered (one word) |
| 7 | **WHOIS privacy on `lazynext.com` — verify + confirm Private** | Immediately after the Microsoft verdict (row 1); regardless by ~2026-11-10 | Was **flipped to Public 2026-10-30** (founder-approved) so Microsoft's vetting could read the registrant block. **LIVE CHECK 2026-11-04: the registrant block is NOT currently visible** — registry RDAP + Verisign GRS WHOIS show only the registrar (Spaceship, Inc.), zero matches for UNITED GLOBAL/BALAJI/registrant. So privacy appears already restored (by whom is unrecorded) **or** registrar-gated. Action: open the Spaceship dashboard and CONFIRM the privacy toggle is Private; if it is Public, flip it back. Do not trust this table's history — trust the live lookup. | Microsoft verdict; else timeout ~2026-11-10. Spaceship login needed to inspect the toggle |
| 8 | **Cloudflare Observability volume pricing** | **2026-12-01** | Cloudflare moved observability to volume pricing; Workers Paid auto-gets a Paid Observability subscription (50 GB / 10 GB-mo included). **No email reply needed** — review usage before Dec 1 (found in inbox audit 2026-11-04). Decide whether the included allowance is enough; do not enable a paid tier without founder approval. | Founder awareness — included allowance likely enough |

## Secondary watches (no action unless the founder asks)

These are logged so they are not rediscovered from scratch; none of them is a decision sitting
on the founder's desk today.

| Item | Date | Note |
|---|---|---|
| Meta One auto-enable | 2026-11-04 | See row 4b — **founder decision due today** |
| Render PHP2Shell advisory | 2026-11-04 (inbox) | Render emailed: update to 22.23.4/24.22.1/26.12.1 — PHP2Shell RCE (passwords/tokens/API keys). **Lazynext has no Render service** (dashboard.render.com is sign-in-only, never deployed) — advisory logged, no instance to patch. Recheck only if a Render service is ever created. |
| Railway risk-assessment notice | 2026-11-04 (inbox) | "Workspace does not meet the criteria we used to identify higher-risk workspaces" — informational; **no Railway service exists** (login-only desk). No action. |
| Aikido Brotli CVE-2026-111497 | 2026-11-04 (inbox) | Remote-code-exec via Brotli. Aikido's own scan item; operational exposure low (no user-facing Brotli decode path). Confirm Aikido's next natural scan clears/snoozes it; do not blind-bump. |
| Internal report truthfulness | 2026-11-04 | Full-body read flagged an agent-written finance report (2026-10-26) that called the single Pro license a paid subscription — real state is **0 subscriptions**, that license is the **self-issued dogfood license** (`support@lazynext.com`), and Dodo is permanently in test mode (**$0 collectable revenue**). Same fabrication class as founder brief PR #112. **Fixed 2026-11-04** (`feat/final-two-fixes`): the generator (`agents/infrastructure/finance_agent.py`) now prepends a deterministic D1-quoted facts block and forbids paid/customer claims unless `subscriptions_active > 0`; wording corrected in `docs/ops/inbox-full-read-2026-11-04.md`. Never trust generated numbers — verify from D1. |
| NuGet `lazynext-ci-push` key expiry | ~2026-11-05 | **Let it expire.** Audited 2026-10-25: no `*.csproj`/`*.sln`/`*.nuspec`, no `dotnet nuget push` in any workflow, zero published packages — nothing consumes the key. Do not log in, do not mint a replacement. |
| mcp.so free listing — GitHub issue [#6529](https://github.com/chatmcp/mcpso/issues/6529) | Watch for comment/closure | Free community path for the remote MCP server. The web form only sells a $39 fast lane — do not pay it. |
| apis.io submission | Batched into their next catalog build | Submitted 2026-11-03, confirmation received, no listing URL yet. Do not resubmit; reply only if they email `support@`. |
| Aikido AGPL-3.0 finding on `postiz@1.0.0` | Snoozed until **2027-10-31** | Accepted risk on file (issue 54902341). Upstream image run unmodified, internal use only, not part of the proprietary product. Re-evaluate at expiry; do not delete `ops/postiz/package-lock.json`. |
| LinkedIn merge / company Page creation | **Closed permanently** | No company-document path exists — recovery is government ID + selfie only, and the founder's standing rule forbids personal ID. Do not re-file, do not loop the support chat. |

## Verification log

| Date (IST) | What was checked | Result |
|---|---|---|
| 2026-11-04 | Microsoft inbox sweep (`from:supportmail@techsupport.microsoft.com`, `subject:verification newer_than:2d`, seller / Partner Center / vetting `newer_than:3d`, SellerId `96466040`) | **No decision mail.** Newest message from that address is still the 2026-10-27 context email (TrackingID#2610070060003196) — the vetting-ops request that attempt 3 already answered. Nothing new since the 01:26 check; no action. |
| 2026-11-04 | Stale September draft campaign cleanup | `email_campaigns` id 8 (`sales-outreach-2026-09-29`, "Make Your Website Accessible to All", `draft`, `sent_count` 0, created 2026-09-28) deleted — 1 row. It duplicated subjects already fired by ids 5 and 7 to the same list, so it could never be safely sent. |
| 2026-11-04 05:20–05:40 | **Final completion sweep (A–D)** — Microsoft due-date, four directory listings, platform health + breakers + governance, fleet count | Full detail in the section below. Headline: **no Microsoft verdict**, no directory moved, everything green, one fleet process. Nothing sent, nothing signed in, no money moved, no config changed. |
| 2026-11-04 | **Two completion-sweep fixes (`feat/final-two-fixes`, no deploy)** | (a) **X readiness probe**: `worker/src/readiness.ts` sent `Bearer <cred>` for `conn:x`, but the stored credential is a durable **OAuth1 quad** (`ck|cs|at|ats`) — a guaranteed 401, so the matrix reported `x: probe-failed` while dispatch worked. Now a quad is recorded **`probe_supported = 0`** with a truthful `last_error` (dispatch verified separately); a bearer-shaped credential still gets a real `/2/users/me` probe, and unsupported rows clear stale verdicts. (b) **Finance-report fabrication**: the generator prompt labelled `licenses_pro=1` as users, so a report claimed a paid Pro subscription at $0 revenue. `core/operations/report_facts.py` now emits a D1-quoted VERIFIED FACTS block prepended to both the weekly finance report and the founder briefing, with hard no-fabrication rules. Wording corrected in `docs/ops/inbox-full-read-2026-11-04.md`. Verified: pytest `244 passed, 5 skipped`; worker `node --test` `267 passed`; `npx tsc --noEmit` clean. |

## 2026-11-04 evening verification

| Check | Result |
|---|---|
| Microsoft verdict | **Still none** — `from:supportmail@techsupport.microsoft.com newer_than:2d` → 0 threads; `from:msftpc@microsoft.com newer_than:5d` → 0. Follow-up stays gated to 11-06/07. |
| Unread mail | **0** — and the cause of repeated accumulation is fixed: the 4 archive filters (News/Vendor-Noise/OTP/CI) now `removeLabelIds: ["UNREAD","INBOX"]` so newsletters self-mark-read. Vendor-Watch untouched (keeps watch mail visible + unread). Verified: 5 filters present, 22 threads read in the last 24h. |
| Open PRs | 0 |
| Fleet | exactly 1 process |
| main | `dcaefbf` |

## 2026-11-04 final completion sweep

Read-only sweep run on the founder's instruction that everything completable today be finished.
Constraints honoured throughout: **no sends, no sign-ins, no payments, no deployments, no config
changes, no code edits** — this ledger entry is the only artifact.

### A. Microsoft Partner Center — verdict due today

**NO VERDICT as of 2026-11-04 05:35 IST.** Three queries against `support@lazynext.com`, all empty:

| Query | Threads |
|---|---|
| `from:supportmail@techsupport.microsoft.com newer_than:2d` | **0** |
| `from:msftpc@microsoft.com newer_than:5d` | **0** |
| `subject:(verification OR "Partner Center") newer_than:2d` | **0** |

Newest message from the vetting address is still 2026-10-27 16:44 UTC, `Swasthik b
<supportmail@techsupport.microsoft.com>`, *"Partner Center account verification rejected; email
OTP service fails with EmailToken_Verification_P…"* — the pre-attempt-3 context email that
attempt 3 already answered. The only Microsoft mail in the last 48 h is promotional (Azure
×2, Microsoft Advertising ×1).

**Actions deliberately not taken:** the follow-up email is pre-authorized for **2026-11-06 / 11-07
only** — sending today would be premature, so it was not sent. No sign-in was attempted; the
MSA `prompt=login` + `acr_values=mfa` chain needs a fresh code at every hop. Row 1 above still
owns the next step.

### B. Directory + listing watch

| Listing | Live result | Reading |
|---|---|---|
| **apis.io** | `/api/v1/search?q=lazynext` → `apis.total: 0`, `providers.total: 0`; `/api/v1/providers?q=lazynext` → `meta.total: 0`, `data: []` | Not in the catalog yet — expected; the 2026-11-03 submission is batched into their next build. Do not resubmit. |
| **mcp.so** ([#6529](https://github.com/chatmcp/mcpso/issues/6529)) | `state: open`, `comments: 0`, `created_at` **=** `updated_at` = `2026-11-01T03:22:32Z` | Untouched since filing — **no maintainer reply**. Keep watching the issue only. |
| **directree** | `directree.io/tool/accessibility-checker` → 308 → `www.directree.io/…` **200** (187 KB) | Public and healthy, **"Claimed by owner"**, "Founder-edited" provenance labels present, "Last updated: 1 November 2026". **Edits still pending:** primary category is still *Monitoring & Observability* (the Developer Tools change has not landed), and no gold Verified badge is rendered in the hero — "verified owner" appears only in the facts legend. Review window still ~**2026-12-06**. |
| **AlternativeTo** | Page itself is a 403 Cloudflare interstitial ("Just a moment…"); resolved instead through AlternativeTo's own catalog search: `q="Lazynext Accessibility Checker"` → **`total_count: 0`**; `q=lazynext` → `total_count: 2`, both unrelated (**LazyNotes**, **Lazy Nezumi Pro**) | **Still unlisted / pending review.** No owner-only view read, no account interaction. Free queue stays free — do not pay $5/$15. |

### C. Health, breakers, governance

| Check | Result |
|---|---|
| Platform `/health` (bearer) | `{"ok":true}`; bare GET → **401** as designed |
| `cron:last_tick` | `1793749815576` = **2026-11-03T23:50:15Z**, 7.4 min old at check — cron healthy |
| `config:decision_enforce` | **`approval`** (rank-based; `human_only` also covered, `auto` internal exempt) |
| `config:observer_mode` | absent → default **on** (logging only, enforces nothing) |
| `outbound_breaker_config` (D1 row 1) | `enabled: 1`, **`tripped_reason: null`**, `tripped_at: null` (updated 2026-11-02T20:01:36Z) |
| Breaker-denial events | **0.** Four `scope='connector'` rows in 48 h, all app-level: discord 204 ×2, youtube 400 (media-only), signwell 400 |
| `/api/v1/billing/funnel` | 200 — **scans_30d 137**, **scans_external_30d 7**, leads 1, waitlist 1, email_contacts 49, crm_leads 68, crm_engaged 15, trials_active 0, licenses_pro 1, licenses_free 0, subscriptions_active 0, monitors 1 |
| `/decision/packages` | 200 — 32 approved (all unexpired, `expiry_at` 2026-12-31), 2 executed, 2 failed, 2 voided |
| `/capability/matrix` | 200 — 45 connectors: 3 `probe-ok`, 2 `probe-failed`, 36 `configured-unprobed`, 4 `documented-only`, 0 absent. **`x` probe reads HTTP 401** from the worker-side probe while fleet-side X dispatch works — probe-scope only, not a dispatch failure |
| `/decision/blocks` | 200 — only the known **signwell `human_only`** rows (3 `decision_gate` rows in 7 d, all 2026-11-03 probes). Nothing new today; the boundary is holding |
| `scope='observer'` rows (48 h) | **8** — 7 `fleet_dispatch` + 1 `task_dispatch`, every recommendation `safe`, no gaps/flags. First real fleet-side observer evidence (the earlier runs were 0) |
| Public sites | `checker.lazynext.com/health` **200** `{"ok":true,"service":"accessibility-checker"}` · `lazynext.com` **200** · `dashboard.lazynext.com` **307** (auth gate, normal) · `penpot.lazynext.com` **200** · `marketing.lazynext.com` **200** |
| Fleet | **Exactly one** `run_agents.py` (pid 569, up 1 h 35 m), log active at 05:27 (`company_brain_updated`, `fetched_failed_workflows count=5`) |
| Workflow health | Latest 8 CI runs on `main` **all success** (newest 2026-11-03T23:53Z). The `count=5` above is the monitor's historic Sept failure list, not a new outage |

### D. Not due today (deliberately untouched)

- **Microsoft follow-up email** — pre-authorized window is **2026-11-06 / 11-07**; sending earlier is premature. Not sent.
- **Power Automate cancellation** — Premium trial converts ~**2027-01-28**; cancelling early kills the anonymous Teams webhook path. Not attempted.
