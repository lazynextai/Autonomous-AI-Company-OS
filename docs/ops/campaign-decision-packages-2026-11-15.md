# Campaign decision packages — 2026-11-15 (approved + sent 2026-11-15 UTC)

`config:decision_enforce` is **approval**. Campaign sends need an **approved, unexpired** package whose `target` is `campaign:<id>` before `POST /api/v1/marketing/campaigns/:id/send` can proceed.

## Packages

| Package id | Target | Campaign | Outcome | Expiry | Decided by |
|------------|--------|----------|---------|--------|------------|
| **40** | `campaign:10` | `outreach-founder-perspective-2026-11-03` | **approved** | 2026-12-31 | `founder-continue-all` |
| **41** | `campaign:11` | `outreach-round2-2026-11-05` | **approved** | 2026-12-31 | `founder-continue-all` |

Approved 2026-11-16 via `POST /decision/packages/{40|41}/decide` with `{"outcome":"approved"}` under founder "continue all". Verified still `outcome=approved`, unexpired, at send time.

## SEND RESULTS (founder "continue all" — send authorized)

Sent 2026-11-15 via admin-scoped `POST /api/v1/marketing/campaigns/:id/send` (User-Agent set). Gate did **not** 503.

| Campaign | Name | Consent | Segment | HTTP | API body | D1 after | Sent at (UTC) |
|----------|------|---------|---------|------|----------|----------|---------------|
| **10** | `outreach-founder-perspective-2026-11-03` | `opt_in` | subscribed | **200** | `ok:true, sent:35, total:35` | `status=sent`, `sent_count=35` | ~18:58:20 |
| **11** | `outreach-round2-2026-11-05` | `prospect` | subscribed | **200** | `ok:true, sent:35, total:35` | `status=sent`, `sent_count=35` | ~18:58:39 |

### Brevo / `email_events` breadcrumbs (minutes after send)

Tags land as JSON arrays (`["campaign:10"]` / `["campaign:11"]`). Snapshot shortly after send:

| Tag | delivered | unique_opened | deferred | click | click_unsubscribe |
|-----|-----------|---------------|----------|-------|-------------------|
| campaign:10 | 34 | 10 | 1 | 0 | 3 |
| campaign:11 | 34 | 9 | 1 | 3 | 4 |

Early `click` / `click_unsubscribe` within seconds of delivery are consistent with **mail-scanner prefetch** (same class that previously mutated unsubscribe on campaign 12 before GET `/unsubscribe` was made non-mutating). Do not treat immediate scanner opens/unsub clicks as human engagement without checking timing.

## Skipped (no new package)

- Campaigns **1–7, 9, 12** — already `sent` before this pass.
- Campaign **12** already has package **39** (`executed` / consumed).

## Dashboard

Both campaigns should show as **sent** on Marketing. Packages 40/41 remain `approved` (standing unlock for those targets; sends already completed).
