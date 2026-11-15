# Campaign decision packages (draft) — 2026-11-15

`config:decision_enforce` is **approval**. Campaign sends need an **approved, unexpired** package whose `target` is `campaign:<id>` before `POST /api/v1/marketing/campaigns/:id/send` can proceed. Creating a draft does **not** unlock send.

## Packages created (DRAFT only — not approved)

| Package id | Target | Campaign | Outcome | Expiry |
|------------|--------|----------|---------|--------|
| **40** | `campaign:10` | `outreach-founder-perspective-2026-11-03` (draft, subscribed, opt_in) | **draft** | 2026-12-31 |
| **41** | `campaign:11` | `outreach-round2-2026-11-05` (draft, subscribed, **prospect**) | **draft** | 2026-12-31 |

## What the founder must do before send

1. Review copy + audience (esp. campaign 11 — `consent_basis=prospect`).
2. Approve the matching package: `POST /decision/packages/{40|41}/decide` with `{ "outcome": "approved" }` (or use dashboard Governance / Approvals once wired for decide).
3. Only then call send. The gate still runs on every send; a draft or expired package returns **503**.

## Skipped (no new package)

- Campaigns **1–7, 9, 12** — already `sent`.
- Campaign **12** already has package **39** (`executed` / consumed).
- No cancelled campaigns in the table.

## Dashboard

Draft packages appear on the Approvals governance inbox (`/approvals` filters `outcome=draft` from `/decision/packages`) and on Governance → Decisions. No approve or send was performed in this pass.
